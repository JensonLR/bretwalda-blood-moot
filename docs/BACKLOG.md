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

The owner delivered ~40 items during the usage outage. Nine of them were
already raised elsewhere and were tagged `[ALREADY RAISED]` with where.

**THAT SENTENCE WENT STALE AND IS CORRECTED HERE RATHER THAN LEFT TO MISLEAD
(28 Aug 2026).** Eight of the nine have since been closed and their rows now
carry their verdicts, so the tag no longer means what the count says. What
actually survives in this file today is **one** `[ALREADY RAISED]` row — 6.4,
the exposed Neon password, which is the owner's to close at the provider — and
**three** `[PARTLY RAISED]` rows (5.1, 5.3, 5.7; 5.7's scope is superseded by
5.7b). Grep the tags rather than trusting a count in a preamble: a headline
number that drifts from its own body is how a reader concludes there are eight
hidden open items and goes looking for work that is already done.

Sequencing principle, from `WHAT-THIS-GAME-IS.md` §5: *the fight has to feel
heavy before a war fought with it means anything.* So broken-illusion defects
first, then feel, then balance and AI, then the war layer, then surface polish.

### WAVE 0 — in flight, merge first

| # | Item | State |
|---|---|---|
| 0.1 | Hair and beard were `wool`; there is now a `hair` substance with a real lay and sheen | DONE, `tools/hairmap.mjs` green 3/3 |
| 0.2 | Helm flank "bald spots": hairline drops 0.30 rad not 0.12 under open-faced rungs | DONE, `wearmeasure` 30/30 held |
| 0.3 | Beard shell under its own declared `cut.thick` on 8 of 16 style/class pairs | **DONE — verified 24 Aug 2026, the row was stale.** `tools/beardvolume.mjs` reads **16/16 rows PASS** including the fork column (worst notch 73.8 mm against a 40 bar). The tool's own header records the repair history: the 8-of-16 was measured against a flat 4 mm reading that compared the wrong quantity; the gate now reads realised crossings, and the rows hold. |
| 0.4 | Shadow Hood swallows the Long Mane and War-locks (`cosmetictest` 15/16) | **DONE 22 Aug** — the hood routes hair out under the drape and the Sutton Hoo trio under the closed curtain; `hoodfall` produced its first clean sheet, all 120 paid pairs distinct |
| 0.5 | Wyrm-Crest's deep cheek guard, spread 28.8 vs Spectacle's 4.2 | **CLOSED 31 Aug 2026 — on the instrument that raised it.** `facelook --cover`, the tool this row was raised with and the one the stale 24 Aug closure did not use: **4.6% / 22.4% / 24.3% of the lens-facing face taken at 0/-35/+35 deg, spread 19.7**, from 23.4/50.5/53.1 spread 29.7. Berserker 4.7/24.1/26.0. The cause is in 5.16 and it is not what the first attempt concluded: `cheekIn` normalised the hem's own ramp, so it deepened the plate as it narrowed it. Separated, the edge moves alone. |

### WAVE 1 — defects that break the illusion

These are the things that make a player think "this is unfinished" in the first
minute. They are cheap and they are all visible.

| # | Item | Note |
|---|---|---|
| 1.1 | **Hands/wrists on all four classes rotated ~180°** — look broken and twisted | **DONE** — `282eaeb` "Land the rig: hands, the axe's bit, the shield's finish" |
| 1.2 | **Axe needs 90° anticlockwise** | **DONE** — same commit |
| 1.3 | **Corpses float mid-air** when a round is still running | **DONE, VERIFIED ON SLOPE 24 Aug 2026** — the collapse-with-weight pass (`6f01941`) settles bodies, and the capture the LIKELY asked for exists: `gorehead --ground pict_moor` (`art/look/moorkill/`) shows the beheaded man grounded on the moor's uneven floor — knees, boots and torso in contact, the severed head resting IN a peat hollow, nothing hovering |
| 1.4 | **Long Mane + huscarl + helm** → two front strands only; other classes bald at the sides and nothing at the back | **DONE 22 Aug** — the bagged routes: coif, hood and closed curtain are one mechanism; see 0.4 |
| 1.5 | **Results table snubs equal players by alphabetical order** — same kills, more rounds won, still placed 2nd for coins and rank | **DONE** — `rankEntrants`: "Rounds, then kills, and NOTHING ELSE — no name, no id, no arrival"; ties share a place |
| 1.6 | **Rounds won must be recorded in the end-of-game table** and must feed ranking and payout | **DONE** — `roundsWon` on every ledger row, `data-rounds` in the table, place feeds the purse |
| 1.7 | **Eyes read as East Asian; chin too pointed; lips need work; moustache placement near the lips** | **DONE 24 Aug 2026 — three of the four were already fixed by the head rewrite and the row was never updated; the fourth is fixed today.** The record, per complaint: EYES — the canthal tilt went 8.3° → 4.2° (the European male mean; the East Asian range starts at 8) and the fissure is asymmetric with a blunt medial canthus, both ledgered at `eyeFrame`/`fissureHalf` in characters.ts; at judging zoom the eye reads almond with an arched lid, and the residual "slit" at fightcard scale is the 45 px the whole head gets there. CHIN — the mental pad replaced the cone (`C_W`'s own comment quotes the complaint; bimental breadth 100 mm on a 196 mm head, canon). MOUSTACHE — rides the top rows of the beard's face leg, above the lip, parted at the philtrum (`addBeard`'s block records the row fix). LIPS — the one still open: the vermilion was mostly a green/blue cut the arena's warm key cancelled, so the beardless fightcard showed NO mouth; factors deepened 0.10/0.36/0.44 → 0.14/0.42/0.50, A/B in `art/look/face17-lips/`. Gates after: headmeasure 0/15+0/8, eyeclip 0/12, faceseam clean. |
| 1.8 | **Huscarl shield colours should follow the armour finish** | **DONE** — `282eaeb` |
| 1.9 | **Emote option appears on the next-round screen** where no players are visible, and shows even when you lost | **DONE** — the round-break beat offers the flourish to the victor only, standing only, over the visible arena; the summary's row performs live on the tableau (the owner's "even if you don't win the round you see it" is quoted at the component) |
| 1.10 | Pupils overlap the upper eyelids | **DONE** — `tools/eyeclip.mjs`: 0 of 12 LID assertions failed |
| 1.11 | **"Flick screen to change foe" never leaves** — it retired on a switch that LANDS, and in an honour duel there is nobody to switch to, so it was permanent in the mode the owner plays | DONE 13 Aug — `src/game/tuition.mjs`, `tools/tuitiontest.mjs` 18/18, `docs/MOBILE-CONTROLS.md` round three |
| 1.12 | **The QUALITY pad is in the way on a phone** — the feature is wanted, the placement was argued from a dead-zone sweep rather than looked at, and it sat over the warrior at eye level | DONE 13 Aug — moved to the top-of-screen utility column; new `touchtest` assertion per handedness; frames in `art/ui/hud/` |

### WAVE 2 — weight, and being seen

`WHAT-THIS-GAME-IS.md` §5 items 2–4. This is what a Steam audience judges in
ninety seconds, and it is the foundation the war layer sits on.

| # | Item | Note |
|---|---|---|
| 2.1 | **Weight in animations and attacks** — readable wind-up, impact that moves both bodies, fluid and heavy | **DONE — the row was stale, verified 26 Aug 2026.** Built 12 Aug per `docs/WEIGHT.md` part two: `SWING_PHASES` telegraph (200–650 ms, gated against a 250 ms reaction floor), `KNOCKBACK` stated in metres the struck man covers (light 0.42 / heavy 0.95 / blocked 0.14, × `WEAPON_MASS`), striker takes a sixth backwards, `HITSTOP` both fighters, `SWING_TURN_RATE` commitment. Re-run today: `weightprobe` **24/24** in 0.6 s |
| 2.2 | **Shoving; being knocked over if caught off guard; a get-up** | **DONE — the row was stale, verified 26 Aug 2026.** Shove as guard-break, stagger off an open heavy, knockdown with a floored stride channel, and the get-up all exist and are measured in `weightprobe` (24/24 today); the shove is a gated combat control in `touchtest` |
| 2.3 | **Parry upgrade: animation you feel, plus a real riposte window** to capitalise with extra damage | **DONE — the row was stale, verified 26 Aug 2026.** The parry message carries its `window` on the wire, the riposte bonus lands, and three `weightprobe` claims gate WHO owns a window (a window owed to another man is not the parrier's to cash). 24/24 today |
| 2.4 | **Satisfying combat sound** that complements the fighting | **DONE — the row was stale, verified 26 Aug 2026.** `soundtest` **46/46** on the worst of 12 seeds: every hit kind pairwise distinct (worst 2.16 JND), a riposte audibly not a free blow, `death()` wired in GameCanvas, `levelUp`/`purchase` in the screen family, `matchWon`/`matchLost` as the two long pieces |
| 2.5 | **Death camera holds** — you stumble, spray, and the camera finds the best angle on the severing before it leaves | DONE — `src/game/deathcam.mjs`, `tools/deathcamtest.mjs` |
| 2.6 | **Round-end beat** — the victor emotes, the last man's death is seen, before the screen changes | **DONE, 20 Aug 2026** — the beat landed 13 Aug, the match-end hole closed and the slow-motion replay wired 20 Aug. See below |
| 2.7 | **More blood, over the top** — spray and splatter | **SUBSTANTIALLY DONE — verified 26 Aug 2026.** `goretest` **36/36**: spray, splatter, decals, severing, the lens-blood pass and the burning men all ship; `docs/GORE-DESIGN.md` and the gore ledger carry the record. Anything further is taste on top of a built system |
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
| 2b.3 | **The death camera only fires for the last man to die** — "everyone should see death camera for final death winner & all losers" | **DONE — the tail was closed by a later feature and this row is corrected 28 Aug 2026.** Two cameras off one shared geometry, `deathcamtest` 20/20 → 42/42; your own death outranks the round's, enforced in the module. The "STILL OPEN: no break before the victor's portrait" tail was superseded by THE KILL REPLAY (the owner's 19 Aug ruling: *"a slow-mo replay before the next round starts, and before a match ends too — skippable at end of match"*): `replay.mjs` records and rewinds the killing blow, `GameCanvas` explicitly holds the match tableau while a match-ending replay runs, and its summary comment states the design — the summary IS the round-end beat for the final round, staged after the replay's beat, not instead of one |
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

**THAT HOLE IS NOW CLOSED — 20 Aug 2026, see below.** It read: *"STILL OPEN, and
it rides the harness's verdict line rather than hiding here: the death that ends
the LAST round of a match. `endRound` sets `state = "finished"` and calls
`endMatch` in the same tick — there is no break — and `render/summary.ts` takes
the lens for the victor's portrait, with `page.tsx` laying the results panel over
it. Holding that back for two seconds is a change to the match-summary flow
(`page.tsx`, `summaryflow`), not to the camera, and it belongs to whoever owns
those files."* The summary flow is exactly where it was fixed: `GameCanvas`
withholds the tableau while a match-ending replay is running and `page.tsx`
withholds the results panel with it.

**20 Aug 2026 — and the owner asked for something better than a beat.** *"The
final kill camera would be better as a slow-mo replay before the next round
starts, and before a match ends too — skippable at end of match, just take them
to the lobby."* `src/game/replay.mjs` and `tools/replaytest.mjs` are the answer
and `docs/REPLAY.md` is the record: a ring of the fields `anim.ts` actually
reads, 57,600 bytes allocated once with no per-frame garbage, played back at
half speed from 0.92 s BEFORE the killing swing — which is the one thing the
live camera cannot do, because it arms a frame after the blow has landed.
Measured on the shipping build, the live round beat holds **0 frames** at match
end and the replay holds **240**, which is this row's hole.

**THE RENDER WIRING IS NOW LANDED, AND THE REASON GIVEN FOR NOT LANDING IT WAS
FALSE.** This paragraph used to say *"There is no browser on the machine it was
built on"*, and `docs/REPLAY.md` §5 said the same. There is one:
`/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`,
which launches and reports Chromium 141.0.7390.37. What is true is narrower and
was never the claim: the Playwright package resolves a browser directory by
version and asks for `chromium_headless_shell-1234`, so `chromium.launch()` with
no arguments fails and every harness in this repository that calls it that way
fails with it. An `executablePath` opens it. A refusal is only worth what its
reason is worth, and this one's reason did not survive being checked.

Wired 20 Aug 2026: the ring records one frame per snapshot off `wireEpoch`, the
clock is asked every frame above the summary branch so the match-end edge is
seen, playback replaces the posed bodies in the break, the animator alone takes
the slowed `dt`, `onSever` is withheld so the arena is not sprayed twice, and
the round camera now takes the lens at match end as well. `ROUND_HOLD_MS` is
`REPLAY.wall * 1000` and `deathcamtest` gates the derivation, the containment,
**and that `GameCanvas` imports the module at all** — that last check exists
because its absence is the whole of the previous round's failure.

### WAVE 3 — balance and the enemy

| # | Item | Note |
|---|---|---|
| 3.1 | **Four-class stat rework — two high stats each.** Runekeeper: skill is weak and sometimes does not move you, low damage, low health, hard to win with. Berserker: slow, high damage, very low defence, lowish health. Warden: balanced, possibly best after huscarl. Owner will take a recommendation after review | **DONE**, and the review is the matrix — `tools/classmatrix.mjs`. See the note below |
| 3.2 | **AI fighting quality and difficulty scaling** | **MEASURED, THEN MOVED — and the measurement came first.** `npm run bottest` is the ruler: the ladder as a win rate with a Wilson interval on every rung, plus what a difficulty is ALLOWED to touch (the brain; never the sheet) and whether a bot reads as a person. It found two live defects on the first run — the middle rung's guard rate was BELOW the bottom's (a phantom guard: `botThink` believed a block the server had refused mid-stroke, then stood there refusing to attack), and jarl-over-warrior was 55.8% [46.9-64.4], an interval straddling a coin toss. Fixed by believing the server, grading the recovery punish instead of switching it at a threshold, and giving each bot a temperament rolled once. Now 79.6% / 65.0% on the two upper rungs, guard monotone 0.4/2.3/5.1% *as §3 then measured it — see the repair to that measurement below*. **THE LAST UNPLACED RUNG IS NOW PLACED — 14 Aug 2026.** recruit→warrior was 54.6% [48.3-60.8], an interval straddling even. `BOT_REACTION_SKILL` — the only constant in the reaction window that carries a *difference* between two difficulties, and therefore the only one that can be a ladder — went 0.18 → 0.60, with `BOT_REACTION` set to 0.634 so that `0.634 - 0.7*0.60` is the **same IEEE double** as the old `0.34 - 0.7*0.18`. That anchors the `warrior` exactly, which is the difficulty `classmatrix` fights at, and the anchoring is **verified rather than asserted**: `classmatrix --bouts=60 --seed=4242` before and after the edit is **byte-identical output**, impossible if one `Math.random()` draw had landed differently. Result at 240 bouts a rung, seed 20260813: **jarl→recruit 89.6% [85.1-92.8], warrior→recruit 61.7% [55.4-67.6], jarl→warrior 68.3% [62.2-73.9]** — all three intervals clear even, ladder ordered, **11/11 PASS and no deferral** |
| 3.2b | **What the bot brain change did to the roster matrix** | `classmatrix --seed=4242`, 1000 bouts a cell, before and after. The verdict line is the SAME shape — 4 of 6 matchups decisively inside 30-70%, every class inside 40-60% of the field, 2 on the band edge — but the composition changed and the spread nearly doubled. Matchups: huscarl v warden **68.3% → 44.3%**, huscarl v berserker 65.5% → **70.7%**, huscarl v runekeeper 28.3% → 30.4%, warden v runekeeper 64.8% → 58.5%, warden v berserker 44.5% → 54.1%, runekeeper v berserker 52.8% → 47.7%. Against the field: huscarl 53.9 → 48.2, warden 46.6 → **55.7**, runekeeper 52.9 → 52.6, berserker 46.3 → **42.6**; SPREAD 7.5 pts [4.0-11.1] → **13.1 pts [9.6-16.7]**. **NOT ONE NUMBER ON THE SHEET MOVED.** The damage was real and it reproduces: re-measured 14 Aug on the committed sheet across three master seeds, spread **13.1 / 12.5 / 12.7**, with `huscarl v berserker` 70.7/70.3/69.0 and `huscarl v runekeeper` 30.4/31.3/31.3 — two matchups on the bar, one each side. **THE MECHANISM THIS ENTRY ASSERTED IS WRONG, AND IT IS RETRACTED HERE RATHER THAN QUIETLY EDITED.** It said bots "now punish recovery in proportion to skill" and that the long-stroke class pays for it. `classmatrix` fights at **`warrior`**, and a warrior's recovery punish went from **certain** (`aiSkill > 0.6`) to **0.32** — the opposite direction. Pulled, 400 bouts a cell, seed 4242, berserker against the field: shipping brain **44.0%**; graded punish reverted to the old boolean **37.9%** (he gets *worse*); temperament removed **42.3%**; phantom guard restored **43.2%**; all three reverted together **40.4%**. Not one of them raises him and all three together do not reach 46.3. **The cause is not among the three edits this entry names, and no replacement mechanism is asserted, because none was measured.** The useful half is the negative: do not tune against that story. Closed by 3.2c |
| 3.2c | **Re-level the roster under the bot brain that now ships** | **DONE, 14 Aug 2026 — and the debt 3.2b declared is paid.** Wave 3 balanced the roster against a `botThink` that Wave 4 replaced, so the balance was certified against an instrument that no longer exists. Re-measured first on the committed sheet (spread 13.1/12.5/12.7, two matchups on the bar), then re-levelled. **FOUR NUMBERS MOVED, ALL IN ONE COLUMN:** huscarl `maxHealth` 158→**162**, berserker 126→**134**, warden 114→**108**, runekeeper 96→**92**. Nothing else — no stroke, no damage, no reach, no arc, no guard, no stamina, no stride — so every ratio the weight pass and the class rework are documented on survives untouched, and the four-shape gate is unmoved by construction. Health was chosen because it is one of only **two** axes this ruler can read (see the inert-lever table above); re-levelling on `blockReduction` or `moveSpeed` would have been a balance claim with no measurement under it. **RESULT: six of six matchups DECISIVELY inside 30-70% with no EDGE cell and no deferral**, against four-of-six-plus-two-on-the-bar before. Median TTK still runs 8.7 s (runekeeper mirror) to 23.0 s (huscarl mirror), so the spread that is a feature is intact. **The one move to argue with is the runekeeper's four health**, which goes against the owner's own words about that class — it is called out in `engine.mjs` rather than buried, he keeps the best damage rate in the game untouched, and giving it back costs `huscarl v runekeeper` about three points, which the cell can now afford. **VERIFIED ON TEN MASTER SEEDS DECLARED BEFORE THE RUN** (20260813, 424242, 90210, 4242, 1, 7, 31337, 555555, 987654321, 20260814 — 160,000 duels), **and the WORST is quoted, not the best: every seed PASS, zero EDGE cells on all ten, lowest interval bound 35.7 against a 30 bar, highest 69.0 against a 70 bar, largest field spread 4.8 points, every class between 47.2% and 52.9% on every seed.** The hot cell is `huscarl v berserker` — 65.2-67.0 across the ten, worst upper bound 69.0, so inside on every seed but by one point on the worst draw. Costed next move if the band is ever tightened: berserker `maxHealth` 134 → 137, buying ~2 points at the top for ~2 at the bottom where `runekeeper v berserker` has 5 to give. Not taken: it trades a measured margin for a predicted one |
| 3.3 | **Weapon styles and looks as armoury purchases** | **DONE 24 Aug 2026 — Weapon Finish, the ninth slot.** Four treatments, not four new weapons: each class keeps its own blade and silhouette (no geometry reads the style table, so the four-shape gate holds by construction) and the style re-tempers the substances every builder names — Issued Steel (0), Pattern-Welded (90g, oiled watered steel — the first cut read ΔE 8.9 against issued and the colour ladder called it a dull rung, so the treatment deepened), Fire-Blued (130g, blue-black blade over silvered mounts), Gold-Wired Hilt (160g, gilt fittings and an oxblood grip). Swatches for the colour ladder are COMPUTED from the style table so they cannot drift. The slot rides every surface the shop already has (generic tabs, staging, purchase, the figure-lens mannequin which is the one crop that shows a carried weapon), and every harness that guards slot parity learned the word: shot/page, shoot, cosmetictest, factionread, vatprobe. factionread §3a re-aimed at its real quantity — the arity grew for a STYLE and the gate now asserts the signature names no people. Ladder: 16.3/28.8/89.4 ΔE, all DIFFERS. Captures: `art/look/weapons2/` (the berserker's axe wears all four legibly at fight distance). |
| 3.4 | **Mercy or Finish** — a downed-but-not-dead state and a decision window, with the pressure stated socially (seven men are watching) rather than as a meter, a window that DRAINS rather than counting down, and letting it run out counting as choosing mercy | **BUILT, PLAYED, REMOVED 20 Aug 2026.** It froze men upright mid-round and it is Roman arena procedure, not Anglo-Saxon. Full record and the two reasons: `docs/MERCY-REMOVED.md`. **Do not re-open this row without reading it** |

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

**A DECLARED DEBT IN THIS HARNESS, found on 14 Aug — PAID 28 Aug 2026.** The
band gate pools both orderings of a matchup — the whole argument above is that
`A>B` and `B>A` are one matchup measured twice — but **`AGAINST THE FIELD` did
not**. It summed only the row cells (`A>B`, `A>C`, `A>D`), so the field rate, and
therefore **the SPREAD, which is the single number this rework is quoted on**,
was computed from half the available sample: n=3,000 where n=6,000 existed. The
note left here read: *"Whoever picks this up: fix it, then re-quote 3.2c's
spreads, and expect the point estimates to move by noise and the intervals to
shrink."*

Done, and the prediction held exactly. `field` now pools both directions the way
the pair check always has (`fwd.wins + (rev.n - rev.wins)`), running not one
extra bout. Measured on the SAME bouts at `--bouts=60 --seed=4242`: n per class
180 → 360, field intervals ~14.5 points → ~10.3, SPREAD `[0.0-19.8]` →
`[0.0-13.8]`, and **every verdict line byte-identical** — a tightening, not a bar
move, as promised.

**AND IT KILLED A FALSE SIGNAL.** On the row alone the runekeeper read
**43.9% [36.8-51.2]** — an interval reaching under the 40% field floor, which is
precisely "the runekeeper's complaint" that gate exists to catch. Pooled over
bouts already run he is **48.3% [43.2-53.5]**, entirely inside. The roster had
not moved; half a sample had been mistaken for a class that loses to everybody.

**RE-QUOTED at the full default (1000 bouts a cell, seed 20260813):** huscarl
**52.2% [51.0-53.5]**, warden **49.3% [48.0-50.5]**, runekeeper **48.2%
[47.0-49.5]**, berserker **50.3% [49.0-51.5]**; **SPREAD 4.0 points [1.5-6.5]**
— and **6 of 6 matchups DECISIVELY inside 30-70%**, a clean sheet with no band
edges at all. The earlier double-digit spreads in 3.2b/3.2c were read through the
halved sample and should not be compared with these directly.

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

**Mercy or Finish was removed on 20 Aug 2026 and the reasoning is in
`docs/MERCY-REMOVED.md`.** It was on the server, it had no UI, and the owner
found it by playing: it fired on every player at 0 health rather than on a last
man standing, in the middle of live rounds, and it parked the floor clock so the
body was drawn standing upright for 2.5 s with no vote to make. It is also
Roman — *missio*, the editor and the crowd — where the Anglo-Saxon thing,
`grið` / `feorhgrið`, is quarter granted by a lord or asked by a man who yields.

The mechanic is gone. Three of its ideas are not, and they are worth keeping in
view when this row is next read: the pressure stated **socially** rather than as
a meter, a window that **drains** rather than counting down (the riposte already
does this), and **the absence of an act being an act the game names**. If a
yielding mechanic is ever wanted, build `grið`: the beaten man asks and a lord
grants. That is player-initiated, it needs no timer, and it freezes nobody.

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
| 4.3 | **Faction scope and plan** — how characters, weapons and colours differ per kingdom | **KIT HALF DONE 16 Aug 2026** — `characters.ts` IS in the diff this time. See the entry below. The history is kept: this was *"the biggest gap in Wave 4"*, it was **wrongly reported as shipped on 15 Aug** when that date's work was entirely MAP-side — your ground cut into the island, your rank, your last match, what moved while you were away — and `characters.ts` was not in its diff. 5.7b, the PLACE half, is still open. |
| 4.4 | **Clans pick a base kingdom** and inherit its variant characters | **DONE 24 Aug 2026 — the Hearths.** A Hearth takes its founder's sworn people at founding and may never choose its own colour (the DESIGN-SYSTEM heraldry law); only the sworn sit at one, only at their own kingdom's, one hearth per man, leaving free, the house surviving its founder. "Inherit its variant characters" holds by construction: membership requires the kingdom's own oath, and kit already keys off allegiance. The attribution is the row's own words — `war_ledger.hearth_id` beside `people`, both read off the profile at bank time, never the wire — so the HEARTHS OF THE SEASON standings sum the same ledger the men's roll reads, in the same order family. Schema rides `ensureSchema`'s idempotent DDL (no deploy step). UI on /factions: found/join/leave under the Standing, the season's houses below (`factionMap/Hearth.tsx`, capture `art/ui/hearth.png` — driven end-to-end through the real browser, route and database). Gated: warsay 44/44 including the three refusals that make it fair (the unsworn cannot found; a house is not divided between kingdoms; one name is one house whatever the capitalisation). Clan QUEUES stay 4.7's. |
| 4.5 | **Team colours override cosmetics in team modes** — red and blue across armour finish and cloaks; clan colours later | **DONE — verified 24 Aug 2026, the row was stale.** The precedence resolvers implement exactly this ("team colour beats clan colour beats faction colour beats bought cosmetic", `wornBy`/`kitFor`/`cloakFor` in characters.ts, each testing the team FIRST), gated twice over: `teamread` 6/6 (sides ΔE 74.2 apart on the board, red 0x8e2320 vs blue 0x24457e) and `factionread` §2.1/2.2 (four peoples on one side are ONE colour; the two sides stay ΔE 10+ apart with a livery declared). Clan colours remain 4.4's. |
| 4.6 | **Ranked: win/loss, a top-50 leaderboard, historically accurate titles by rating** | **DONE 24 Aug 2026 — the Roll of Honour.** `warRoll` serves the season's fifty in the crown's own tie-break order (a table that ordered two equal men differently from `endSeason` would lie about the one thing the season decides); each seat carries the period title its points earned on its OWN people's ladder — Ceorl→Geneat→Thegn→Ealdorman, Karl→Drengr→Hersir→Jarl, Taeog→Bonheddwr→Uchelwr→Arglwydd, Aithech→Fénnid→Toísech→Mormaer (sourcing and the §9.5 invention-licence note at `TITLE_LADDER` in db/war.ts; Bretwalda is deliberately NOT a rung — the crown cannot be bought with points). The rating IS season points: the war already runs on one number and a second rating would be a second truth. Rendered on /factions under the Standing (`factionMap/Roll.tsx`, capture `art/ui/roll.png`); the player's own title heads his Standing cell. Win/loss stays the profile's (wins/matches already persisted per player); the roll shows points and matches, which are the war's own units. Gated: warsay 38/38 including the ladder's shape and the roll's order. |
| 4.7 | **Matchmaking; clans queueing as 2–4** (4 is the right clan size — it matches the warband) | **MATCHMAKING DONE 24 Aug 2026 — FIND A FIGHT.** One press seats a stranger in the fullest open PUBLIC room of his mode or founds one (pools coalesce instead of fragmenting), he arrives ready, and the muster starts itself twelve seconds after the second free man lands — no host press, riding the lobby's own `phaseAt` exactly as a solo trial does. Only rooms quickplay itself raised are ever matched into: a room made with a code stays a room among friends, and `public` is stamped through a closure no crafted create message can reach. Public rooms are war rooms by construction, and the two-human anti-farm gate is satisfied by the muster's own floor. Gated: warsay 48/48 — strangers meet, the fight self-starts, a latecomer founds the next fire, the private lobby is never touched. UI: FIND A FIGHT leads the landing menu; CREATE/JOIN demoted to ghost. **Clans queueing as 2–4: DONE 26 Aug 2026 — WAR PARTY.** The private room IS the party (the code was always the invite, joining it the accept) and `war_party` is the third verb: the host takes every human member to the public war in one press — reseated together into the fullest open public moot with seats for the whole party, or a fresh public room, ready, muster armed, atomic against strangers by the engine's single thread. Two to four, refused outside it with its own sentences. warsay carries seven claims including landing WITH the waiting stranger and the abandoned party room dissolving. |
| 4.8 | **A campaign worth playing** that uses the kingdoms and good AI, not the same match repeatedly | **SUPERSEDED BY THE OWNER, 26 Aug 2026** — his words: *"do we really need a campaign? I feel like a cool starter tutorial for new arrivals would be better? we could maybe even have them pick their kingdom in this part while also showing how to play? could make it cinematic & cool?"* The campaign row is closed on that ruling; the replacement is **4.8b**, and `docs/CAMPAIGN.md` stands as history only. Do not re-open without the owner's word |
| 4.8b | **BUILT 29 Aug 2026 — this row was never updated and row 8.5 was.** `src/game/firstmoot.mjs` is four phases and ten beats (look, move, sprint, strike, aim, heavy, guard, dodge, shove, power), each behind a pause card that genuinely HOLDS the rite until the player does the thing, the foe walking in as a pell that cannot strike until the shield phase, ending in the war room with five ringed doors. `moottest` 41/41, `tourtest` 22/22. See 8.5. Original: | NEW — the design note lives in `docs/ARMOURY-REVIEW-PLAN.md`'s continuation list until it earns its own doc |
| 4.9 | **Other game modes** | **DONE — both modes shipped, and the name is ruled.** The TOURNAMENT MOOT (bracketed 1v1s for 4-8, winners advance, the hall watches the final) and the horde mode are both live: `tournament_moot` with a real staged bracket, TOURNEY_BREAK breathing room and a redesigned card (`tourneytest` 39/39, `tourneyseen` photographs it), and `the_burh` — hold the burh against the *here* — with the respite mend and a wave law that cannot invert with party size (`burhtest` 24/24). **The owner confirmed THE BURH as the shipped name (28 Aug 2026)**, closing the "put it to him with alternatives" condition this row was carrying. |
| 4.10 | **Historically accurate flags and colours** | **RULED 26 Aug 2026 — banners IN THE GROUNDS:** 3D standards planted in each ground (spawn ends; the causeway gate at the Dyke) carrying the `docs/FACTIONS.md` §6 devices, plus the same devices on lobby rows. |

### WAVE 5 — surface and platform

| # | Item | Note |
|---|---|---|
| 5.10b | **~~Three~~ four map territories cannot take a 44 px press** — Kent, Kernow, Sudreyjar, Gwynedd | **CLOSED 31 Aug 2026.** Each gets a real 44x44 DOM button on its own label anchor, projected through the svg's live `getScreenCTM` so it follows at any zoom and through a rotation; the paths they cover are demoted to `aria-hidden` with no role so nothing is announced twice and the fix is measurable. The sweep finds all four BY NAME and presses each, so the row cannot close by absence — and that claim failed correctly on its first run, on the sticky SWEAR bar, which is a target you scroll to rather than an unreachable one. **The reported line is empty at both widths.** Original: **NEW 29 Aug 2026, measured, reported on every `uishots` run.** The territory hit paths carry a 14 px transparent non-scaling stroke, which took the unreachable count from six to three; a corner, a peninsula and a scatter of islands cannot be rescued by a border stroke. Closing them wants a DOM overlay of 44x44 targets positioned at each territory's own label anchor — NOT the SVG circle trick, which Chromium hit-tests against unscaled geometry and which was tried and reverted (the CSS beside `.wm-hit` records it). Not urgent: the kingdom rows below the map are the primary selector and all of them clear the floor. Done means the three names stop appearing in the sweep's reported line. |
| 5.13 | **The huscarl's hair commas survive under a coif** — the 28 Aug cull is a no-op on him | **MOSTLY CLOSED 31 Aug 2026.** The ceiling's coif branch reached forward of the rim by a `- 0.16` fudge and computed from an ANALYTIC mail surface where the mesh draws none, so `room` was finite, the cull never fired, and he kept every comma. Fudge gone: **-6 coils per cell off his bare cheek on 84 cells**, and helmclash IMPROVED (PELT 74 -> 73, baseline tightened at the ratchet's own request). **REMAINDER CLOSED 31 Aug 2026 — and the tool for it already existed.** `coifRim` opens 1.46 -> 1.80 as it descends, so gating on `coifRim(0)` claimed mail from 1.46 back at EVERY height and over-claimed by up to 0.34 rad lower down. I had recorded that closing it "wants the ceiling to read the rim at the coil's own height, and those are not the same parameterisation" — which was wrong, and wrong in the direction that costs work: `coifRingAt(y)` was already in the file, already returns the descent `v`, and its own comment already says why it exists — it reads the rings "at the point's ACTUAL height, off the same table the coif is drawn from". It was written for the hanging mass and never applied to the rim. One line. `coifRim(0)` stays as the cheap early-out because the ramp is monotone in the descent. Measured: inert on helmclash §5 (red-row set byte-identical), all `wearmeasure` sections hold. Original: **NEW 31 Aug 2026, found by an adversarial audit and independently verified at the mesh.** The one-line cull that closed the loose cheek commas (`if (helmed && !Number.isFinite(room)) continue;`) never fires on the huscarl: `coifed` makes `hairCeil` take its coif branch, which returns a ceiling computed from an ANALYTIC mail surface that disagrees with the coif's real geometry by 0.16-0.50 rad, so `room` is finite over az 74.5-110 deg and the coil keeps near-full size. Measured gate-on vs gate-off, huscarl/ridge/short seed 13: **identical to the decimal** at az 90-113, detached-and-proud islands 9 -> 9 (warden 17 -> 2). It is this file's own named failure mode — a piece keeping its own copy of where another piece is. |
| 5.14 | **The 28 Aug comma cull took the NAPE FALL as well as the commas** | **CLOSED 31 Aug 2026.** Binned by ROOT bearing the culled coils are two populations with an empty bin between them: the forward ones are the commas (the fix), the rear ones at 135-180 deg are the nape fall, which is what long hair is for. `HAIR_NAPE_FREE` is that empty bin, 120 deg, read off the geometry. Head-pivot components 27609 before the cull, 22887 after it, **24282 now — 1395 falls restored** while the commas stay culled. helmclash exactly at baseline, wearmeasure 11 sections, wearsweep 54/54. A census baseline is recorded on the corrected tree (`docs/census-baseline.json`) so future changes are held to a tree that is right. My own earlier note read as though ALL the removed geometry was wrongly removed; that is corrected in the ledger. Original: **CONFIRMED 31 Aug 2026 by `tools/rungcensus.mjs`, recorded against `2451e75~1`: `167 identical, 167 gained, 306 LOST, 0 rungs gone — FAIL`.** Per cell across the shop, `head -11 / -880 triangles`, and on `hair=long` and `hair=braids` — **paid rungs** — `-15 / -1200`. This is the fourth time a round has closed a gate by deleting content and the first three are in that tool's own header; the tool was never run against the change. The coils removed ARE the reported defect, so the answer is not a revert but a re-route: `characters.ts` argues at length that a coil with no ceiling should be tucked, not culled. Original note: **flagged by an audit.** Hair vertices over the shaved build, before that commit vs now, warden seed 13: iron/short 3678 -> 378 (90% gone), nasal/short 3678 -> 378, spectacle/short 3018 -> 378, iron/long 3458 -> 1038 (70%), iron/braids 5460 -> 3040 (44%), ridge/short 3678 -> 2138 (42%), suttonhoo unchanged. Under the open bowl helms the crop's coil courses are almost entirely gone, and **hair_long and hair_braids are PAID rungs**. `characters.ts` argues at length against "a paid hairstyle being deleted to close a gate" and nobody ran `tools/rungcensus.mjs` against that change. Either the numbers are fine and the census says so, or a cosmetic ladder lost its rungs quietly. |
| 5.16 | **The Wyrm's cheek guard is a billboard, not a cheek piece** | **CLOSED 31 Aug 2026 at `cheekIn` 0.85, with NO gate moved anywhere.** `cheekHemAt` and `deepTop` normalised their ramp over `[cheekIn, cheekOut]`, the guard's OWN span, so `cheekIn` was never the edge control it reads as: narrowing the span lowers every azimuth's `t`, and a ramp that rises with `t` hangs the hem LOWER everywhere at once. Walking the guard in dropped the hem **0.117 rad at 1.12 rad**, straight onto the berserker's war-locks — the whole of the 19.7 mm that got the first attempt reverted as "plate and hair competing for the same arc". They were not competing; one constant was moving two things. The tell was there and unread: the sheet-like Long Mane measured **0.0 mm through the same change** while the ropes read 19.7, and a contention over an arc does not care what shape the hair in it is. Anchoring the ramp to the arc it was tuned on is a no-op on the shipped build by construction (the two numbers are equal there) and makes the edge a lever. **Face taken 23.4/50.5/53.1% -> 4.6/22.4/24.3%, spread 29.7 -> 19.7; berserker 4.7/24.1/26.0.** `art/look/wyrm-before.png` / `art/look/wyrm-after.png`. The edge is placed on the measurement, not on the best render: 0.90 gives a better face (20.3/22.1) and costs a helmclash §5 row; 0.75 and 0.80 leave a braid residual; **0.85 is the one value where hair reads 0.0 mm through on every helm x hair x class x seed AND §5's red-row set is byte-identical to shipped** — nothing added, nothing removed. One cost, stated: §10 goes 5 ungated windows to 7. The GATED quantity does not move (huscarl/wyrm inside 0.19% -> 0.19%, void 0.03% -> 0.02%) and the dumps show the same openings in the same places; the guard simply stops splitting one gap into two sub-threshold ones, so the flank width crosses a REPORTING line at 1.5%. |
| 5.15 | **The helmet flank gap is contested space, not a loose constant** | **CLOSED 1 Sep 2026 BY THE OWNER'S RULING, not by a fix — and the row's title was right.** Deriving the coif's rim from the guard shrinks the gap on all three helms (spectacle 4.2% -> 2.4%, boar 4.1% -> 2.4%, crowned 6.0% -> 4.3%) and costs **89% of the Braided War-locks' silhouette** under those helms — 7.04% to 0.80% on the Jarl's Crowned. There is no knee on the curve: at the gentlest reach measured the window improves 8% and the braids are already down to 1.40%. Buying 28% of the gap costs 89% of a 100g purchase. **Asked, and the answer is KEEP THE PAID HAIR VISIBLE.** The gap stays. If it is revisited it should be by re-rooting the braids off that arc so both can be had, not by trading one for the other. **What DID ship from this work:** the mail's top ring was 11 mm outside a low-passed form the skin stands 16 mm proud of, so across the crown the mail sat INSIDE the face and the ceiling floored at its 2 mm, leaving the hairline outside metal buried in the scalp. At 18 mm that is gone — helmclash PELT 73 -> 67, and MORE paid hair on screen than shipped. The instrument lesson is kept: helmclash §5 stayed green through the whole rim experiment because it measures hair OUTSIDE metal and cannot see hair DELETED. `cosmetictest`'s silhouette against a fixed reference is what catches that, as `wearmeasure` §4's own header says. |

| 5.15 (history) | **The helmet flank gap is contested space, not a loose constant** | **NEW 31 Aug 2026 — third attempt made, measured, reverted.** Deriving the coif's rim from the guard's rear edge through one definition CLOSES the owner's gap (five §10 windows -> three, Spectacle and Boar-Crest outright, Crowned 6.0% -> 3.3%, all eleven wearmeasure sections still PASS) and costs **WRAP 6 -> 13 and PELT 74 -> 91** on the hooded huscarl. The gap is where his hair comes out; filling it with mail displaces the hair, which is why the two earlier attempts were reverted from the plate's side. Done means the head-stack reshape, not another constant. The new helmclash baseline gate makes the next attempt cheap to judge. **THE STARTING POSITION MOVED 31 Aug 2026, so the numbers above are against a tree that no longer exists.** 5.16's guard now stops at 0.85 rather than 0.56, which widens two Wyrm flank windows past the 1.5% reporting line — §10's deferral count is **7, not 5** — and the third attempt's "five windows -> three" has to be re-measured before it means anything. Two things about the retry are now cheaper than they were: `coifRim`'s reader was over-claiming mail at every height below the band and no longer is (5.13's remainder, closed), so a rim derived from the guard will displace less hair than it did when this was tried; and helmclash's red-row SET can be diffed row by row (`--section 5`, compare the sorted class/helm/rung triples) instead of comparing counts, which is how the girth experiment was caught costing exactly one named row. **FOURTH ATTEMPT, 31 Aug 2026 — made, measured on the corrected reader, reverted, and it named the cause.** Deriving the rim from the guard (`min(1.46, cheekOut + 0.02)`, so a SHORT guard's 1.10 pulls the mail forward to meet it instead of leaving 0.36 rad of nothing) shrinks the owner's gap on all three helms — **spectacle 4.2% -> 2.2%, boar 4.1% -> 2.3%, crowned 6.0% -> 4.3%**, wearmeasure §4 still 30/30 — and costs **exactly twelve helmclash §5 rows, all on the Boar-Crest and the Jarl's Crowned**. Better than the third attempt's twenty-five, which is what the `coifRim` reader fix bought. **But the twelve are not a hair-styling fault and no constant will move them.** They fire on every rung including `beard=none` and `default`, they read `hair=shaved` at 0.00, and all twelve land on the same place: **az 88 deg, y 231 mm, 3.87% out by 4.4 mm.** That is the crown, where `coifLevels[0]` is `R.x * 1.00 + 0.011` — eleven millimetres outside the skull, on a low-passed form the skin stands up to 16 mm proud of. The mail is INSIDE the face up there, so the ceiling's `mail - surface - gap` goes negative, floors at its 2 mm, and leaves the hairline outside metal that is buried in the scalp. **Reaching the rim forward asks the mail to close a hole in the one place the garment has no room to close it.** Tried blending the reach in with the descent so the crown keeps its 1.46 — `smooth(0.00, 0.10)` gives the best window of anything measured (crowned 6.0% -> **4.1%**) and costs the SAME twelve rows; `smooth(0.00, 0.30)` gives 4.9%, `smooth(0.05, 0.55)` gives 6.2%, WORSE than shipped. The curve has no free point on it. **So the next step is named now and it is not this row's rim: it is the top ring.** The mail cannot cover the crown until it is outside the skin there, and the ring was deliberately sized DOWN (the comment over `coifLevels` records `R.x * 1.34 + 0.026` reading as "a dark bell with the head somewhere inside it"). Growing it enough to clear 16 mm of proudness without going back to the bell is the head-stack reshape this row has been asking for, and it is now a specific edit with a specific number rather than a direction. |
| 5.1 | **Every screen upgraded** — the armoury UI/UX is liked; make all of it more satisfying, engaging, ergonomic, in-your-face | **CLOSED 29 Aug 2026 as far as a harness can carry it.** Three sweeps stand behind it: 8.4's judged pass over every screen at both widths (27 Aug); today's **44 px floor gated across 36 rendered screens at both widths** (5.10), which found the only two breaches in the game and fixed one class of them; and today's ornament census (5.9), 32 of 36. The armoury's own shape — the liked one — is the pattern the rest already follow: `ScreenHead`, `card`, `label-overline`, the knot-band. **What is left is TASTE, and taste is the owner's**: the captures are in `art/ui/` (36 screens, both widths, refreshed every sweep) and a specific screen he wants louder is a new row with a name on it, not an open-ended one. |
| 5.2 | **Mobile visual quality is well below desktop** — close the gap as far as gameplay allows | **CLOSED AS FAR AS GAMEPLAY ALLOWS — 26 Aug 2026.** Three moves, each priced: (1) an earlier pass brought every SAMPLING knob to desktop numbers (anisotropy 8, envMap 256, sprite 128 — flat per-frame cost, and the env map is the only specular source on every blade and helm); (2) `dynamicLights` reached 3/3 parity when the village's torch ring was cut for perf; (3) today `propDensity` 0.8 → 1 — props are instanced vertex work, not fill, so the phone stands in the SAME arena. What remains is deliberate and priced where the owner's own handset measured the stutter: pixel ratio 1.5/2, shadow texels 1024/2048, DoF off, spark density 0.7 — all FILL. The tier comment in `quality.ts` carries the whole argument |
| 5.3 | **Ergonomics for both mobile and desktop, including a left-handed control flip** | **CLOSED 29 Aug 2026 — all three halves are built and every one of them is gated.** THE FLIP: a handedness store shared by `input.ts` and the HUD so the touch zones and the buttons mirror as ONE thing, with `touchtest` proving the cluster actually moves ("slash button centre moved from x=786 to x=58") and then re-running the whole movement/look/flick battery left-handed. MOBILE ERGONOMICS: the 44 px floor on every control and 56 px on every combat control, nothing irreversible inside the 132 px thumb band, no patch of the free-look half swallowed by a button (7254 sampled points), and — new on 29 Aug — **both rotations play**, the movement rail folding into two columns when there is no height for one. DESKTOP: the same 44 px floor now gated across 36 menu screens at both widths (5.10), plus full key rebinding with a live capture. Residue: 5.10b, three map territories. |
| 5.4 | **Symbols across the game — historically accurate, polished, on-vibe** | **DONE 28 Aug 2026 — the glyph set is complete at the design system's own 24.** It shipped at 11 (backlog 5.5's profile marks) and the remaining thirteen land here, every one sourced to a find and none to a fantasy: the bone comb and the spear (the two commonest things in any grave, and free because every man owned them), the Ing rune of the futhorc, the triskele off British hanging-bowl metalwork, the Borre ring-chain out of York, the Benty Grange boar, the Coppergate helm, the Sutton Hoo drinking horn and its sceptre stag, a Norse woman's keys, the Pictish beast and the double disc and Z-rod, and the Gotland longship. Drawn on the 24 px grid in one flat colour, stroke-only, and PHOTOGRAPHED as a contact sheet before being believed — which caught two: the thorn rune was the Raven Banner's own silhouette at that size (replaced by Ing, the set's only lozenge) and the stag read as a box on table legs. `marktest` 25/25 over the grown set; the nineteen paid rungs derive into the Steamworks sheet with no new code (`steamsheet` 5/5). |
| 5.9 | **Adopt the Trewhiddle thesis across every screen** — dark-on-metal ornament, compartmented never full-length, light plates in menus and niello-side-out in combat | **CLOSED 29 Aug 2026 — ADOPTED, and now COUNTED rather than asserted.** The ornament is built (`.knot-band`, `.ornament-line`), and what nobody could say was which screens actually wear it, because that is a question about RENDERED pages. `uishots` censuses it on every run: **32 of 36 rendered screens carry a band or a rule.** The four that do not are the two Testgrounds screens at both widths, and they are bare BY A RULE ALREADY IN THE CODE — `ScreenHead` shows the plait only under a CENTRED masthead, because "off to one side the plait has no axis to sit on and reads as a stray rule", which is §1's own compartmenting law applied. Nothing to change; the census names any screen that goes bare in future. |
| 5.10 | **CLOSED 29 Aug 2026 — the desktop half landed.** The row's own words are "every control including desktop"; `touchtest` held the phone's fight glass and the menus were never held at all — `uishots`'s only size audit ran on ONE screen and merely printed. It rides every capture now, 36 screens at both widths, and GATES. Two breaches found in the whole game, both on the war map, plus the discovery that a box rule is the wrong ruler for SVG (see `docs/OPEN-DEFECTS.md`). Residue tracked at 5.10b. Original row: **The thumb-zone law as a GATE** — 44 px floor on every control including desktop, 56 px for anything pressed mid-fight, a 132 px reach band that combat controls sit inside and confirmations deliberately do not. `tools/touchtest.mjs` currently gates layout and dead zones but has NO size floor at all | **DONE ON THE PHONE 24 Aug 2026, with one clause corrected against the shipped layout.** touchtest gates: 44 px on all 11 controls, 56 px on the 7 combat controls (each floor refuses a vacuous pass if the cluster is absent), and the band's good part — nothing IRREVERSIBLE within 132 px of the foot (nearest today: 624 px). The strip reading ("all combat inside one 132 px band") is deliberately NOT gated: the cluster is two tiers and MOBILE-CONTROLS.md itself calls the shove at 200 px up "inside the law" — a ruler that fails the layout its own law was written on measures the wrong question. 32/32. DESKTOP floor: **gated 24 Aug 2026** — `playtest` grew the one DOM claim it lacked, measured in the same fight it already drives: 44 px on every control on the desktop glass (4 controls, smallest exactly 44), 38/38. The row is whole. |
| 5.11 | **Body face: Alegreya Sans → Alegreya** (the serif sibling). One word in `layout.tsx:60`; both faces already load from Google Fonts, so nothing is imported | **DONE 24 Aug 2026** — the one word became three sites because the fonts moved to `next/font` since the row was written (the import, the loader call, the `globals.css` fallback stack, which goes to Georgia/serif). Same three weights, same variable. Landing capture: `art/look/font511/landing.png` — the tagline reads in the chronicle's own serif under Cinzel. |
| 5.12 | **Wire `WarStandings` to the coastline we already own** — `factionMap/britain.ts`, 1,655 baked points. The review shipped an honest empty map well not knowing the geometry exists | **DONE 24 Aug 2026** — the map well leads the Standing panel: real Britain (the same LAND path and land-clip the WarMap uses), all sixteen territories in their holders' fields with the player's own people at full strength and the rest faded, and the ground of his last fight ringed in gilt. Non-interactive by design — it is a standing, the control map is one screen up. Proof render against the compiled geometry; build + lint clean. |
| 5.13 | **The "while you slept" dispatch strip on the title screen** — **DONE 22 Aug 2026.** The landing fetches `/api/war` after paint and renders the same `Dispatch` the map uses, sharing one module-level watermark so both surfaces tell one consistent "since you were away" that retires on the NEXT visit; quiet war draws nothing. Captures: `art/ui/dispatch/`. The history below is kept: **PARTLY DONE 15 Aug 2026, and NOT struck.** The dispatch is built and gated (`factionMap/Dispatch.tsx`, `tools/warseen.mjs` 15/15) but it is on `/factions`, not on the title screen. The item says title screen and it means it: the whole point is that a man who has not opened the map still learns the map moved. A build report claimed this shipped; an adversary checked `src/app/page.tsx` against the diff and it is not in it — promote from decoration to requirement. It is the only visible surface of the game's whole retention thesis | NEW |
| 5.5 | **Unlockable profile symbols** earned by achievement or bought | **EARNED HALF DONE 26 Aug 2026.** Ten devices in `src/game/marks.mjs` on the design system's 24 px grid, each sourced to a real find or labelled an invention in a `source` line kept beside its path (the Stora Hammars valknut, a York Mjölnir, the Pictish crescent-and-V-rod, the raven banner taken at Cynwit — ASC 878; the Urnes wyrm is the one confessed invention). Unlocks are FACTS, not purchases — level, wins, matches, the oath — so there is no economy surface in this slice — and **RULED 26 Aug 2026: earned-only, permanently.** The row is complete. The mark rides `appearance.mark` (opaque wire, zero new transport), is narrowed by `earnedMark` on the wearer's own surfaces AND server-side against the row's real record (`sanitizeAppearance` + `factsOf`), and draws beside the name in the lobby roster, the results ledger, the landing level stat and the Saga masthead roundel; the picker with locked-state hints is on the Saga screen. Gate: `tools/marktest.mjs` 25/25 (grid bounds, exact unlock bars, hostile-fact narrowing, server wiring). Proof sheet: 4 visual rounds — the first draft's triquetra rendered as a plain circle and the hammer as a bucket; photographed, redrawn, re-photographed. **Fixed under the same stone: the 3.3 paid-finish revert** — the weapon slot was never in `SLOT_FIELD`, so a bought finish was charged, unlocked, and then dropped by `sanitizeAppearance` on every server write and read; it is a persisted slot now, gated in marktest. |
| 5.6 | **Taglines and grey helper text** updated to the current plan | **DONE 24 Aug 2026.** The owner's own report drove it mid-window ("the grey text doesn't really fit the game anymore & 'no downloads' can probably go"): the landing's hero copy went to the parchment voice, the "no downloads" marketing line went entirely, and the body face is now the chronicle's serif (5.11). A sweep for surviving stale copy finds ONE "nothing to install" — in the share-link panel, where it answers the inviter's real question about what their friend will need, which is function rather than tagline; kept on that reasoning. |
| 5.7 | **Creative, distinctive map locations** built to the standard | [PARTLY RAISED] `docs/MAPS.md`. **Superseded in scope by 5.7b, which is the same work with a reason attached.** |
| 5.7b | **A ground for the territory you were dealt** — the owner, 15 Aug 2026: *"wouldn't having a map for each territory also be cool?"* | **ALL FOUR PEOPLES GROUNDED, 24 Aug 2026.** `GROUND_BY_PEOPLE` deals the ground from the match's people: Saxons keep the village as theirs by right, Picts fight on `pict_moor`, Britons on `roman_fort` (flag court, ruined curtain walls as sim solids, the platform looking DOWN; `art/look/fort/`), and the Norse muster in `danelaw_camp` — a Repton-shape winter camp behind a D-shaped earthwork, a frozen fen running LEVEL to the horizon, and a beached longship as the one solid on the fighting floor (`art/look/camp/`). Four grounds, four horizons: a valley, a climb, a platform, a level. The archetype table below still governs per-territory grounds beyond the per-people deal — **and its first row LANDED 26 Aug 2026: OFFA'S DYKE (`offa_dyke`), the dyke-and-march archetype, dealt by TERRITORY to Mercia, Gwynedd and Dyfed through `GROUND_BY_TERRITORY`/`groundForTerritory`, which is the resolver every later archetype rides — the next ground is table rows and a renderer module, nothing else.** The openest floor in the game: sheep-cropped march turf, one mearc-stone solid, a march-warden's beacon tripod, and the west side of the world is the earthwork itself — a 2.1 m bank at x = −21 (every point r ≥ 21, off the floor by construction; warsay's flat-floor claim reads 0.099 m across the disc), its leaning timber revetment, the causeway gate with its wattle leaf, the ditch, and Wales rising behind. Boundary law: the dyke itself on the west, mearc-stakes with rags at r 18.4 on the open sides. warsay 49/49 including 16/16 territories drawable. |
| 5.8 | **Steam, then mobile, then console** — one account, two doors, from the first Steam build | **RULED 26 Aug 2026: scaffold NOW, mobile next** — "everything built or added after with this in mind so we can almost seamlessly be able to list / sell the game on either platform." Every new system from this ruling forward is designed dual-platform: no web-only assumption survives review. |

### WAVE 7 — the owner's rulings of 26 Aug 2026 (two question rounds, all answered)

The whole wave is dual-platform by the 5.8 ruling. Ordered by dependency, not
by glamour.

| # | Item | Ruling and note |
|---|---|---|
| 7.1 | **Attack controls review (mobile)** — **WHOLE 29 Aug 2026:** (a) and (b) shipped 26 Aug and (c) landed with the directional guard in 7.7 on 27 Aug, so the row's own three-part fix shape is complete. Original: | The owner's live report, in his own words: *"as part of the directional guard we should review the mobile controls to see if there's a more appropriate way to attack as I find myself currently spamming the heavy attack & very rarely using the red attack."* **MEASURED 26 Aug 2026 — it is a BALANCE fault wearing a legibility fault, not a layout one.** The red button IS the primary 84px SLASH; the owner ignores it for the smaller orange HEAVY because heavy is strictly dominant play: warden heavy = 27.3 DPS and 1.32 dmg/stamina vs light's 18.8 DPS and 1.23 dmg/stamina — heavy wins BOTH axes on the opener — plus a 0.30 s clean-hit stagger the light does not have, plus the sweep bisection zones. The light's real value (combo mult ×1.15→×1.6 within the 0.8 s window, i.e. a SUSTAINED chain reaching 30 DPS at ×2 the stamina efficiency) is invisible: no HUD surface shows the multiplier building, so the fast button reads as the weak button. Fix shape: (a) rebalance so heavy is the SPIKE not the default — higher stamina bite and/or light opener sped up; (b) SHOW the combo building on the slash button and the HUD; (c) then the directional-guard work of 7.7 lands on controls a player actually mixes. **SHIPPED 26 Aug 2026, (a)+(b):** heavy stamina 22→30 (engine gate, HUD threshold, bot heavy choice stamina-aware) — three heavies to a winded bar instead of five, the light chain the sustained game; the chain multiplier now DRAWS as it builds (×-badge on the slash button, CHAIN line at the desktop stamina bar, `comboLabel` mirroring the engine's own curve). Verdict under the full matrix: classmatrix 1000 bouts/cell, seed 20260813 — 6/6 matchups DECISIVELY inside 30-70 (hot cell huscarl v berserker 67.0 [64.9-69.0], unchanged), field spread 52.2/49.0/47.2/49.8, wartest 82/82. (c) stays with 7.7. |
| 7.2 | **Steam scaffold + mobile packaging shape (5.8)** | **SCAFFOLD LAID 27 Aug 2026** — `docs/PLATFORM-PATH.md` §8. The dual-platform LAWS are a mechanical gate now (`tools/platformcheck.mjs`, 6/6): headless sim (one named seam), storage in ten named seams, no pinned origins, no native-hostile dialogs, one server→renderer seam. The account doors are designed and half-landed: `steam_id` column + unique index ship NOW via ensureSchema (one Steam account, one hoard; the recovery words walk the account across platforms both ways); the ticket-verify route deliberately waits for a real Steam app id — a door that cannot check tickets must not open. The Tauri build itself deliberately did NOT land from this container (cannot be compiled or judged here — the 'asserted, never judged' trap); it is §7 step 6, on a machine that can run it, over a seam that is now gated so it stays done. profiletest 22/0, protocoltest 81/81 over the schema change. **AND THE BUILD IS JUDGED — 1 Sep 2026, on a Mac.** The row above named its own blocker (*"cannot be compiled or judged here — the 'asserted, never judged' trap"*) and a machine that can run it now has. `cargo` 1.98 via Homebrew, `tauri icon` from the same forged `public/icon-512.png` the PWA shell ships, `tauri build`: **release profile in 1m 48s, and BOTH bundles** — `Bretwalda Blood Moot.app` (5.3 MB, Mach-O arm64, `com.bretwalda.bloodmoot` 0.1.0) and a 2.3 MB `.dmg` whose checksum `hdiutil verify` calls VALID. **And it RUNS**: launched from the bundle it held a window for ten seconds at 91 MB RSS with nothing on stderr, which is the half of the judgment a compile does not make. One trap for CI: the first `tauri build` FAILED in `bundle_dmg.sh` and the second succeeded — the failure leaves a `rw.*.dmg` scratch image in `bundle/macos/` and the retry works once it is deleted, so a red DMG step is worth one retry before it is worth a diagnosis. Windows and Linux are still only provable in `.github/workflows/desktop.yml`, which **has never fired — there are no tags in this repo**; it runs on a `desktop-v*` tag or by hand from the Actions tab, and naming a release is the owner's call, not a fixer's. The generated icons, `desktop/dist` and `target/` are gitignored: the mark is forged from one source and a committed copy is free to go stale behind it. |
| 7.3 | **The Tournament Moot (4.9a)** | **LANDED 27 Aug 2026.** Bracketed 1v1s for 4-8 (bots may fill; `start` refuses fewer than four): single elimination in `src/game/bracket.mjs` — a pure module the engine and `tourneytest` both import, the whole tree built with fixed slots so any snapshot draws it. Each duel is one fall; everyone not in it sits the MEAD-BENCH, so the hall watching the final IS 7.9b's machinery. Byes/walkovers/voids settle and cascade (a finalist who leaves crowns his opponent without a bell — startRound's own door); a drawn duel is re-dealt, though the engine taught the ruler two present men cannot draw (round end checks per death). The champion is the BRACKET's, never the tally's — a first-round bye can leave duels-won level and every tally tiebreak would crown the beaten finalist; `buildLedger`'s `crowned` seats him first, `winnerBy: "bracket"`. Break card draws the tree with NEXT marked; bench line knows a waiting duellist from a beaten one. `tourneytest` 35/35, `tourneyseen` 7/7 (real moot in a real browser), wartest 82/82, protocoltest 81/81, benchtest 23/23, burhtest 19/19, playtest 38/38, touchtest 32/32. Was sequenced after spectate by the owner's own ruling ("Both, clips first... spectate lands with the Tournament Moot which needs it anyway") — building the bracket before the waiting men can watch would ship a tournament of men staring at a lobby. |
| 7.4 | **The Burh — horde mode (4.9b)** | **LANDED 27 Aug 2026.** 1-4 defenders hold the ground against waves of the *here* — recruits first, jarls by the fifth wave, each wave one larger, the fallen rising at 62% between waves, the stand ending when the whole party is down at once. The engine's mode-string is finally VALIDATED (any string used to land in the room), the burh forces one stand, opens on two heartbeats of empty ring (the First Moot's staging law), and its waves spawn through the shared `dealLateSpawn`. `wave`/`wave_cleared` on the wire, WAVE N beside the HUD clock, THE HERE COMES over the respite, THE BURH HELD N WAVES on the verdict. `tools/burhtest.mjs` 19/19; wartest 82/82, warsay 52/52, protocoltest 81/81, browser pair clean over the change. **The name is the owner's to confirm** — the id `the_burh` is stable either way. |
| 7.5 | **Banners in the grounds (4.10)** | **LANDED 27 Aug 2026.** `banners.ts`: planted standards (pole, crossbar, wool gonfalon) carrying the §9-sourced devices — Alfred's cross-and-lozenge coinage, the 878 raven, the triskele (labelled invention), the crescent-and-V-rod — on the four dye-vat fields. Two per ground on moor/fort/camp (holder's device when held, the home people's by right); the Dyke flies BOTH sides (Mercia's cross east, the triskele at the causeway gate, and no holder ever plants the Welsh side); the village's four existing palisade banners carry the holder's device painted into their cloth. Photographed on all five grounds; warsay/solidtest/playtest green. The lobby-row device chip rides with 7.6's roster surfaces. |
| 7.6 | **War seasons + leaderboards** | **LANDED 27 Aug 2026 — and half of it was already true:** seasons were whole before the ruling (35 days, the race-hardened rollover, one Bretwalda crowned, the map reset with the victor's advantage — `warrace`-gated). What 7.6 owed was NAMES and AXES. `seasonName()` names the twelve-season cycle ("the Season of the Long Frost") deterministically off the index — the war map leads with the name, the index rides small; warsay 52/52 holds the cycle. The Roll of Honour grew its chips: DEEDS in the crown's own order, filterable to one banner and to THIS WEEK, plus the lifetime WINS/KILLS/HONOUR boards off the players table (tie-break: fewest matches among equals, then id — total order, the crown's own law). Junk requests fall back to deeds; an empty filter answers "Nobody yet, by this reckoning" and keeps its controls. |
| 7.7 | **Fight depth: executions, weapon choice per class, directional guard** | **EXECUTIONS LANDED 27 Aug 2026 (7.7a):** a committed heavy over a DOWNED man at ≤0.35 health takes ALL of him — helplessness is the licence, the low gate keeps knockdown from being a death sentence; `deathCause: "execution"` rides corpse/kill/feed ("executed"), +50 score, FINISH HIM rides the lock's mark, renderers take the blow's own path, replay vocabulary appended not inserted. NOT the mercy window returned. fighttest 9/9; protocoltest's solo fixture found the feature honestly (an idle man beaten to the floor by seven jarls IS executed). **ARMS ENGINE HALF LANDED (7.7b):** `ARMS` table — sword & board/dane axe, gar/sword & seax, twin seaxes/hand axes, great axe/twin beards, sourced or labelled per §9 — priced on six axes through ONE resolver; defaults are the shipped sheet with empty deltas (proven by claim); `arms` on the wire (55-field lock), table rides the join. fighttest 20/20 (reach 0-vs-28 at 3 m, guard 4-vs-14 through). **ARMS CLIENT HALF LANDED 27 Aug 2026 — 7.7b whole.** The rig reads `player.arms` off the wire: `buildWeaponForClass` takes the loadout over the class assumption, `buildOffhandFor` is the one off-hand rule, a dane-axe huscarl carries no board, `buildAxe` grew a hand form (dane branch byte-identical), `gripsFor` fits the fists, `signatureOf` keys the cache on arms, armouryStage's comparator learned arms on day one. Lobby: two arms cards under the class grid reading the SERVER's choice; the mannequin holds the chosen weapon. `armshot` photographs the swap (pictures LOOKED AT: board present, then gone, the long haft in its place). **`armsprobe` 16/16 INSIDE after one retune** — its first sheet caught both blind-axis upgrades (dane axe 85% over warden, sword-seax +25% DPS over the gar) exactly as built to; measured packages now parity, the trade lives in the axes only humans price. Its flicker also surfaced and fixed a REAL hang: a duellist leaving during his round's own countdown stranded the survivor — checkRoundEnd admits countdown now, both leave paths call it, tourneytest 38/38 ×3 with both doors pinned deterministically. cosmetictest PASS, fighttest 20/20, wartest 82/82, protocoltest 81/81, playtest 38/38, touchtest 32/32. **DIRECTIONAL GUARD LANDED 27 Aug 2026 — 7.7 WHOLE.** The held block reads `blockDir` — the flick's own value, so ONE gesture aims both the cut and the cover on every platform, which is the owner's mobile-attack review answered in the grain of the scheme he already has (7.1's stamina rebalance was its other half). Matched guard keeps full worth; wrong-facing keeps half (`GUARD.mismatch` — a mistake, not an absence: the wrong-way board still beats a matched seax). The PARRY stays a pure timing read (held as law by claim) and SHIELD WALL covers every line. Bots READ: a jarl answers the stroke he sees, a recruit covers his own favoured line — temperament made legible from both sides. The foe's guard is a bone bar on the lock's own mark: strike where it is not. fighttest 23/23 (matched 4 through / wrong-way 12 / wall 1), weightprobe 24/24, classmatrix 6/6 DECISIVE in band, armsprobe 16/16, tourneytest 38/38 ×6 (two flickers ran down on the way: a REAL hang — a duellist leaving during his round's own countdown stranded the survivor, checkRoundEnd admits countdown now on every leave path — and a ruler reading the verdict off a witness who had left the building), playtest 38/38, touchtest 32/32. REDONE once after a container rollback — the third — from context, edit for edit. |
| 7.8 | **Forged dynamic score** | **LANDED 27 Aug 2026.** `score.ts`: an open-fifth drone, the war-drum (four pattern rungs of one grammar, each adding strokes to the last), and a Karplus lyre speaking pentatonic-dorian phrases that always resolve to the root or fifth — every note of an hour inside one mode against the drone. Scenes: the hall gets the drone alone, the lobby the heartbeat, the muster firms it, the fight leans in with a heat the canvas computes per frame (nearest living foe, low health, the last stand), victory rises an octave and defeat falls into the drone. The pure plan half is gated by `tools/scoretest.mjs` (16/16: monotone intensity, mode membership over 200 seeded phrases, sting shapes); the binding rides its own gain into master — deliberately NOT through the combat duck — honours the small-speaker law an octave up, and runs its oscillators ONLY while audible (four silent-by-gain saws were still four live source nodes; soundtest's node-budget audit caught it, 46/46 after). |
| 7.9 | **Clips first, then spectate** | **CLIPS HALF LANDED 27 Aug 2026.** Every kill replay records itself to WebM through the deathcam's own tuned lens — which IS the owner's bar ("camera angles are perfect"): the replay lens was built and owner-approved for exactly these frames. Feature-detected; never armed on the low tier (policy, one readable line) with the `__forceClip` harness door so the machinery stays judgeable on a GPU-less box; blobs under 16KB discarded rather than offered. SAVE THE CLIP stands on the summary only when a real clip exists; a new fight stales the old one. `tools/clipseen.mjs` PASS (36,829 bytes of vp9 through a real bot moot); playtest 38/38, touchtest 32/32 over the change. **SPECTATE SEATS LANDED 27 Aug 2026 — THE MEAD-BENCH.** A man joining a running fight by code is seated instead of refused: outside `room.players` entirely, where no simulation loop can reach him (benchtest parks him at the bonfire's own coordinates to prove no blow can land), watching live through the already-landed spectate lens, dealt onto the floor when the room lobbies — bots yield their places, and a watcher can inherit an abandoned room. `benchtest` 23/23 (its first run caught the silent bench and the disconnect back door before they shipped); `benchseen` browser probe 4/4 (real second browser, live clock, verdict on his glass, FIGHT AGAIN onto the roster); playtest 38/38, touchtest 32/32. **7.3 is unblocked.** |
| 7.10 | **Marks stay earned-only (5.5 closed)** | Ruled: no bought half. The 5.5 row is complete as shipped. |

### WAVE 8 — the owner's screenshot round of 26 Aug 2026 (defects first, then the sweeps)

His directive, verbatim where it rules: *"Make sure we don't leave any aspects
of the game left behind & also that it runs as smooth as a AAA game no jittery
or staggered mess & 100% passage via react doctor etc."*

| # | Item | Note |
|---|---|---|
| 8.1 | **Armour rework, all classes — floating fitting photographed** | **CLOSED 29 Aug 2026 — the sweep done and the defect found, on the berserker's arm-rings.** They were cut at the SHOULDER's radius and worn 140 and 200 mm down a tapering arm, and they were circles on an ellipse, so each stood proud at the flanks and broke the limb's silhouette. Fixed to ride the arm's own stations — the correction the bracer's buckles twenty lines below already used, whose comment names the exact fault. The half that matters: they were added with a bare `p.add` and so were **never fittings** to `wearmeasure` §5 — 148 pieces measured, all seated, the defect in none of them. Registered now (148 → 168), plus a new `gripMm` (a band must sit at one depth all the way round; §5's closest-point question cannot see this and read 0.9 mm on the defect) and a **gated floor** on tag count and the limb bands by name, shown red by un-registering them. See `docs/OPEN-DEFECTS.md`. |
| ~~8.1 (original note)~~ | His screenshot: huscarl, SHOULDERS lens, crowned helm + gold kit — a gold disc floating clear of the upper arm, ringed in red. *"Armour design needs rework on all class types as some have defects shown in SS."* One reproducible defect in hand plus a standing order: sweep every class in every lens for detached fittings, then the design-quality pass. |
| 8.2 | **Mobile victory screen: volume button over the text** | **CLOSED 29 Aug 2026 — AND IT IS GATED NOW, WHICH IT WAS NOT.** The toggle was moved to the corner the day he reported it, and then nothing held it there: `summaryflow` stands a real summary up at 390x844 and had no claim about what covers what, so the fix was a comment and a hope. It now measures every control against every painted text on that screen — **6 controls against 15 texts, none overlapping.** The claim was shown red first, and by its own bug: the emote row is a bare flex div holding three buttons, so a leaf test that only excluded nested TEXT read it as a text node saying "RAISE BOSS TAUNT" and reported all three of its own buttons for sitting on it. An element whose text comes FROM buttons is not text a button can cover. summaryflow 17/17. |
| 8.3 | **First oath: the colours don't show** | **CLOSED 29 Aug 2026 — the row is stale, and it is photographed now so it cannot go stale quietly again.** The mirror does dress the man: `art/ui/oath-first-*.png` against `oath-second-*.png` is plainly two different warriors — gold boots, wraps and shield rim under the Anglo-Saxons, garnet under the Norse — with the caption matching each. What was actually missing was the CAPTURE: the factions page is its own route and `uishots` only ever walked the screens reachable from the landing hall, so the one surface in the game whose whole job is to show a colour had never been in the sweep. It is now, two frames and the mirror's own caption printed. (The first cut of that capture photographed the MAP twice and filed it as the mirror — by role and name the map's territories answer before the kingdom rows; it targets `.war-people-row` and scrolls to `.war-oath`.) |
| 8.4 | **Every-menu layout review** | **SWEPT 27 Aug 2026** — 48 uishots captures, both widths, every screen judged: landing, training, armoury, saga, lobby, join/deeplink all sound. Two convictions, both the fixed sound toggle's corner: the armoury's STICKY panel label sat under it while stuck on phones (row now insets `pr-11` below lg) and the lobby invite line's tail passed beneath it (paragraph narrowed to a centred measure). Two capture-timing artifacts identified and recorded so nobody chases them again: armoury thumbs land 10/10 by ~15 s on the GPU-less box (uishots shoots faster), and heavy suites run concurrently flicker paint captures. Transient scroll-under of a fixed control is accepted by design; only REST-state collisions are defects. playtest 38/38, touchtest 32/32 over the fixes. |
| 8.5 | **Tutorial staged** | **CLOSED 29 Aug 2026, by the owner's own second ruling** — *"a full phased cinematic journey, with pause points, teaching all the controls, and they must complete each task before advancing. We don't want them just dying constantly while trying to figure it out."* Four phases, ten beats (look, move, sprint, strike, aim, heavy, guard, dodge, shove, power — five of which were untaught), a pause card at the head of each that genuinely HOLDS the rite, the foe walking in as a **pell** that cannot strike until the shield phase, an ending in the war room, then five ringed doors round the hall. `moottest` 41/41 from 25/25, `tourtest` 22/22 new. See `docs/OPEN-DEFECTS.md`. |
| 8.6 | **Map boundaries & design upgrades** | *"Map boundaries & design could do with upgrades / improvements."* The r=18 stake/boundary law re-examined per ground — **AUDITED 27 Aug 2026: the edge is already diegetic on all five grounds**, each in its own voice: the village's palisade, the moor's broken drystone dyke at 18.5, the fort's robbed outer-wall footing course at 18.35, the camp's bank TOE rising at the clamp on the land arcs plus its waterfront stake line on the open river arc, and the Dyke itself west with mearc-stakes on the open sides. The 24 Aug owner report ("invisible wall") drove the first four; the audit confirms no gap remains. Design upgrades landed under other rows this window (standards on every ground, the shield's rim boards, the cape's gathered rear); further ground-design lifts proceed by photograph and conviction, not by list. |
| 8.7 | **AAA smoothness** | **AUDITED AND ACTED ON 27 Aug 2026.** The instruments' verdicts: janktest — server pacing CLEAN (snapshot p99 54.4 ms on a 50 ms target), wire epoch counts packets, the draw-on stalls this GPU-less box's own; framecost — JS p50 comfortably inside the 60 Hz frame (p95 3.4 ms), the cost in 569 draw calls with the stage-6 shadow-light lever named and deliberately NOT reached for. THE STRIP'S EYES FOUND THE REAL DEFECT: f009 photographed the follow camera inside a palisade post. Fixed with `boom.mjs` — the spectate.mjs arrangement — marching the boom against the ground's own obstacle table AND its play bound in resolveSolids' own order (the first claim-run taught the second half: the palisade IS the bound, not an obstacle row); films over the woodpile, skips passables, spring-arm asymmetry. solidtest 16/16 with four boom claims. All four react-doctor advisories fixed (hearth label, war-map role=group, water compensation moved to the honest envMapIntensity knob, structuredClone). cameratest 13/13, deathcamtest green, playtest 38/38, touchtest 32/32. Declared instrument gaps stand on their own verdict lines: input latency measured by nothing, BUGGY needs eyes on strips. |
| 8.8 | **react-doctor 100%** | **ENFORCED GATE AT ZERO, 26 Aug 2026.** `npm run lint` (the react-doctor eslint rules, the gate CI can hold): 13 problems → **0 errors, 0 warnings**, every mirror unwound honestly (`useSyncExternalStore` for browser stores, event-time resets, post-commit ref writes, module-load stamps) and re-measured — the save survives boot, the mirror dresses, moottest 25/25. The STANDALONE CLI sweep was run too and triaged per its own instruction ("ignore theoretical issues"): its two ✖ are verified false positives (page.tsx `t.on` is closed by the documented unmount effect at ~1078; GameCanvas's staged forge returns its disposer chain), and chasing them found one REAL leak the CLI itself never named — `mouseup` added on `window`, removed from `canvas`, one leaked listener per match — fixed. Ten stale workflow worktrees that inflated its count were removed. The CLI's remaining advisory tier (will-change, render-time rebuilds, response-status checks, large-component counsel, unused-file flags mostly on tools/) is folded into 8.7's measured perf pass and WAVE 6 hygiene, not silenced. |
| 8.9 | **The nothing-left-behind sweep** | **SWEPT 27 Aug 2026.** RECONNECT MID-FIGHT: a dropped link's body stands for AWOL_GRACE (12 s) under a private reconnectKey (never on any snapshot — rejointest holds it); a fresh session walks back into the SAME body via `rejoin`; a pressed LEAVE is a surrender, pronounced at once; the transport's retry is real now (three laps then SSE, a synthetic `relink`), where "reopening..." used to be a lie. rejointest 12/12. THE FEEL: look sensitivity + camera-shake toggle in the GraphicsPanel, the handedness store's idiom (colour-blind palettes DEFERRED to an owner design conversation, deliberately). THE PWA SHELL: manifest + forged icons (tools/mkicon.mjs, pure-node PNG, looked at and iterated) + a worker that caches NOTHING by design. Error strings in-world. Bot curve: bottest 11/11 after its name claim learned to assert pool membership instead of one pinned realisation. THE LIVE ROUND: signatureOf omitted `people` while the pool stores material with geometry — two identically-kitted freemen of different kingdoms shared one dyed body; fixed, factionread 3a′ holds it. factionread itself restored to knowledge: not hung but SILENT (node block-buffers to pipes; two healthy hour-runs were killed on that evidence — ledgered); its 27/34 matches the clocked rose baseline with slight improvements everywhere, and the rose settlement continues as its own unit. playtest 38/38, touchtest 32/32, cameratest 13/13. |

### WAVE 6 — engineering hygiene and tooling

| # | Item | Note |
|---|---|---|
| 6.1 | **Redundant code sweep**, when deemed necessary and verified | **SWEPT 29 Aug 2026 — measured first, then cut.** 145 exports are named nowhere outside their own file; only **8** are defined and never named again anywhere, and those are gone (41 lines), three of them "test seams" with no test using them. The other 137 are types carrying a module's public shape or functions used internally — cutting those is churn, not a sweep. See the note below the table. |
| 6.2 | **Agent graph architecture** — build the agents properly with graphs and loops, documented, reusable across projects | NEW |
| 6.3 | **Orchestrator stays under 50% context** | NEW — now `docs/PROCESS.md` E2 |
| 6.4 | Rotate the exposed Neon password; delete the old Render Postgres | **PASSWORD ROTATED 1 Sep 2026 by the owner — the credential half is CLOSED. What is left is deleting the old Render Postgres, which waits on the move being made.** Original: **OWNER-ONLY, STILL OPEN — and the repo's own half is now done (28 Aug 2026).** The tree was audited for committed credentials: `drizzle.config.json` and `docs/JUDGEMENT-2026-08-06.md` both hold `127.0.0.1` PLACEHOLDERS and are fine (`db/README.md`'s claim about the former verified rather than trusted). The one real exposure was `docs/HANDOVER.md`, which printed the live Neon password verbatim *inside the instruction telling the reader to rotate it* — so the security note was handing the secret to every reader, clone and fork. Redacted; no `npg_` token remains anywhere in the tracked tree. **Redaction is not the remedy and does not close this row**: git history still carries the value, which is precisely why rotation at the provider is the only fix. Only the owner can do it (Neon console, then delete the old Render Postgres). |

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

**A1. THE BODY — the default kit reads Roman.** **MOSTLY DONE, and this row
was stale for three of its four faults — corrected 1 Sep 2026.** It said NOT
STARTED and "still exactly as the audit found them" for all four. Verified
against the tree, fault by fault:

1. **DONE, and long since.** There is no `lamellar` constant; it is `wallman`,
   and the warden wears a mail byrnie swept from `wardenByrnieStations` — his
   own station list, hoisted so `shoulderOut` and the shell read one table. No
   banded courses, no shin plate.
2. **DONE by halves, and the other half landed today.** The leg wraps stand
   14 mm proud in five wound turns with the knee break the brief asked for. The
   hem WAS already slit front and back into two panels — but at `gap = 0.115`
   rad, about 35 mm at the hem, which at kit distance still read as one
   unbroken horizontal, *which is the audit's actual complaint*. **0.22 opens a
   notch that survives the card**; `art/shots/a1-slit` and `a1-slitback` show
   two panels parting where `a1-front` shows a kilt line.
3. **DONE.** The cloak is cut asymmetric — `a0: -0.56π, a1: 0.32π` — and every
   cut now stops at `a1 <= 0.40π`.
4. **THE OLIVE IS OFF, and the way it came off is the finding.** See below.

**FAULT 4, AND WHY THE OBVIOUS FIX GOES BACKWARDS.** `tunicDye` pulls hue only
a FIFTH of the way from the finish's lot toward the class accent, so the accent
is not the hue lever it looks like: swapping the warden's `0x5a6630` for a cool
teal moved the tunic from 42 deg to **56 deg — further into yellow-green**.
What the accent does reach is SATURATION, and the warden was sitting on the
function's own clamp at 0.60, which is most of what makes the olive read Roman.
An undyed-fleece accent (`0x565a55`) drops it to about three quarters of the
lot's saturation and the tunic reads as natural wool over mail — the finish the
file already calls "what a man is issued". `art/shots/a1-undyed`.

**FAULT 4 IS CLOSED — asked and ruled 1 Sep 2026: the cloak STAYS RED.** The
audit prescribes brown, but the objection was to red-over-yellow-green as a
PAIR, and that pair no longer exists now the tunic is undyed wool. Madder red is
a documented Anglo-Saxon dye and it is the warden's strongest silhouette cue at
fight distance. The prescription is superseded rather than skipped, and this
line is why. One measured caveat survives for whoever
touches `tunicDye`: moving a tunic off a hue rather than a saturation cannot be
done from the class accent at all — the accent is a fifth of a hue lever over the
finish's lot — so it needs the lot or `tunicDye`'s 0.2 weight, and both move all
four classes in every finish.

**Also fixed in passing:** `CLASS_TUNIC` was mirrored in `render/anim.ts` and
`armouryStage.ts` — the same four constants twice, this file's own named
failure mode. `armouryStage` imports it now.

The audit's original text, kept:

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

**A2. The instrument, before A4 can be judged.** **THE WEAPON LENS IS BUILT —
1 Sep 2026. A4 is unblocked.** The other two items stand.
- ~~The face card's aim is only correct near −35°.~~ **DONE 1 Sep 2026, with the
  owner's ruling on what it exposed.** Measured off `--guides` (a 50 mm grid at
  1.221 px/mm): at turn 0 the head's midline sat **119 mm right of where the card
  aimed**. `CARD_AIM.head.right` is **+0.051**, not -0.068; `art/shots/aim0/` is
  the miss and `art/shots/aim0b/` is the head centred on the aim line. At -90 the
  residual is 41 mm and `fwd` did not need moving. The mirroring is gone too —
  `CARD_AIM` in `characters.ts` is the one definition and all three readers take
  it.
  **WHAT IT EXPOSED, AND WHY THAT MATTERED MORE.** A correctly-aimed lens moves
  every silhouette in `cosmetictest`'s companion table down about 11%, and one
  pair crossed a bar doing it: **Braided War-locks (100g) under the Shadow Hood
  had been passing at EXACTLY 1.00% against a 1.00% bar, and read 0.87%
  corrected.** So the shop's visibility gate had been measured through a
  mis-aimed lens and the one item it passed by a rounding error was a
  hood-and-hair pair — the case `cosmetictest` §3 says is a design call, not a
  harness's. **Moving the bar was refused; the owner was asked instead**, ruled
  that the hood should show more of the braids, and the hood's hem went
  `R.y * 2.95` -> `R.y * 2.75`. The pair now reads **1.17% honestly**, and the
  hem is the largest raise that holds helmclash WRAP at its baseline of 6 — at
  2.55 the braids reach 1.38% and a bare nape appears under a covered throat.
- The `menu (DOM + preview)` capture yields zero frames, so the armoury screen
  has no measured cost. *Still open.*

**AND THE FIRST PHOTOGRAPH ALREADY PAYS FOR THE LENS.** `art/shots/weapons/weapon-cards.png`
is the six finishes side by side, which has never existed. Across **0g to 190g**
they differ mainly in the colour of the grip wire and a faint tint on the guard;
the pommel and the blade read nearly the same at every rung. That is A4's
question and it now has a picture instead of an argument. One limitation, named:
the card frames the GRIP, which is where three of the four classes carry their
fittings — the berserker's axe head is over his shoulder and out of frame, so
that rung needs its own bearing.

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

> **CORRECTED 29 Aug 2026 — the sentence below is no longer true, and it is
> corrected here rather than deleted.** `src/db/index.ts` DOES mention Neon: it
> handles the `&channel_binding=require` suffix Neon appends to its connection
> strings, and `docs/PLATFORM-PATH.md` §3 carries the move as a decided step.
> **The code half is done; the CLOCK half is the owner's** — provisioning the
> Neon database and pointing `DATABASE_URL` at it happens on a dashboard this
> container cannot reach, and so does reading the real Render provisioning date
> that this row wants written down. What remains here is one environment
> variable and a dump/restore, by the owner, and it is still the only item on
> this list with a date attached.

*NOT STARTED.* `src/db/index.ts:20` reads `process.env.DATABASE_URL` and
nothing in the repo mentions Neon.

**THE CODE HALF AUDITED AGAINST NEON'S OWN SKILLS — 1 Sep 2026.** The owner
installed `neon` and `neon-postgres` (`.claude/skills/`), which carry the
vendor's checklist, so the "code half is done" claim was checked against it
rather than trusted. Three of five items were already right and two were not.

Right: the driver is `node-postgres` via `drizzle-orm/node-postgres`, which is
what the skill prescribes for a long-running server (the `@neondatabase/serverless`
driver is for edge and serverless, and Render is neither). `channel_binding` is
handled, and handled sharply — node-postgres silently ignores the connection
string's `channel_binding` and reads `enableChannelBinding` instead, which the
file sets and explains. And the idempotent-DDL-instead-of-drizzle-kit choice is
a deliberate deviation with its reason written down.

**FIXED 1: schema work was running down the POOLED connection.** The skill's
rule is app pooled, migrations DIRECT — transaction pooling carries no session
state. `ensureSchema` is this project's migration step and it used whatever
`DATABASE_URL` was, which on Render is direct and on Neon is pooled the moment
somebody pastes the string the console shows first. It now derives the direct
host and runs the DDL down a pool of one, closed after. Derived through `URL` so
only the hostname changes: a naive `replace("-pooler.", ".")` eats a password
containing that string AND leaves the host pooled, which `profiletest` now
asserts as a case (27/27, up from 22).

**FIXED 2: scale to zero would have looked like the game forgetting your gold.**
`connectionTimeoutMillis` was 5 s, which was generous against Render's
always-awake Postgres. A Neon compute SUSPENDS after five idle minutes and the
next connection is a cold start — and a connect that times out here trips the
30-second breaker, which drops the whole game to device-local gold. On Render
that only happened when the database was genuinely down; on Neon it would happen
after any quiet spell, read to a player as a lost hoard, and show nothing to
whoever went looking, because by then the compute is awake. 10 s.

**FIXED 3: the TLS mode was on a timer.** `pg` 8.20 warns at runtime that it
treats `prefer`, `require` and `verify-ca` as aliases for `verify-full` TODAY,
and that pg 9 gives them libpq's weaker meaning — encrypt, do not verify the
certificate. Neon's strings end `?sslmode=require`, so this was one major version
from silently trusting any certificate on the far end. Same shape as the
`channel_binding` bug already documented in that file; the difference is it flips
on a dependency bump rather than on day one. Pinned to what is in force now, so
it is a no-op today and a guard tomorrow. An explicit `disable` or `verify-full`
is left alone.

**THE PROJECT IS CONNECTED AND THE PER-PR BRANCH IS NOW A GATE — 1 Sep 2026.**
The owner linked the repo to Neon, which put `NEON_API_KEY` in repository secrets
and `NEON_PROJECT_ID` in variables. `.github/workflows/neon_workflow.yml` uses
them, and it does NOT do what the integration's template does — that creates a
branch, leaves a commented-out migrate step, and deletes it, which would be a
moving part with no gate behind it, and there is no migrate script here to
uncomment. Instead the branch runs **`profiletest`**, whose database half has
never once run against real Postgres in CI for want of a database to point at.
A fresh Neon branch is EMPTY, which is exactly the case the boot path has to
survive. It is handed the POOLED string on purpose, so the direct-host
derivation above is proven in CI. Fork PRs get no secrets and the branch jobs
skip rather than fail.

**WHAT IS LEFT, AND IT IS THE OWNER'S — a runbook, since the specifics are now
known:**
1. **Rotate the password.** `npg_mfd8e2OJkSnR` has now been exposed in chat
   twice and is still live. Neon console -> the project -> Roles -> reset.
   Everything below uses the new one.
2. Take the **pooled** string (the one with `-pooler`) as Render's
   `DATABASE_URL`. The app wants pooled; the code derives direct for its own
   schema work, so only one variable is needed.
3. `pg_dump` the Render database and `pg_restore` into Neon on the **direct**
   string, not the pooled one — transaction pooling carries no session state.
4. Delete the Render Postgres once a fight has been played against Neon and a
   profile survives a reload. That is what stops the ninety-day clock.

Provisioning still cannot be done from THIS container: every Neon host —
`console.neon.tech`, `api.neon.tech`, `mcp.neon.tech`, `neon.com`, `neon.new`,
`claimable.neon.tech` — is refused by the environment's egress policy with a 403
to CONNECT, and the Postgres endpoint on 5432 times out with no route. Tested,
not assumed. An API key does not change it and neither does the MCP server; a
network policy that allows those hosts would, and GitHub's runners already do,
which is why the gate above lives there.

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

**THE FIRST SENTENCE IS STALE AND THE SECOND FAULT IS WORSE — 1 Sep 2026.**

`ablationRows` is **not** empty. All eleven ablations run, every patch lands in
the served bundle, and both recorded causes are fixed in `fpstest.mjs` — the
`route.fulfill` rejection that took the process down mid-run, and the patches
missing the bundle. Verified by running it.

**What replaced the empty table is a table that looks like an answer.** Eleven
rows, sorted by cost, computed off **two to eleven frames** on a box with no
GPU. Measured on this run: the most NEGATIVE cost is **-4660 ms** against a best
positive of **1727 ms** — removing particles apparently made the frame four and
a half seconds slower, which is a direct read of the noise floor in the
ranking's own units. Wave D is a performance wave that was going to be planned
off that ordering.

So the tool now decides whether it has an ordering or a list, on two properties
of the run rather than an opinion: a **frame floor** (a p50 over four frames is
the second-fastest of four) and a **sign test** (removing work cannot make a
frame slower, so every negative row is noise measured in the ranking's units).
Failing either, the rows still print — the draw and FBO columns are exact counts
and worth reading — but they print as a LIST, `out.ablation` is left null so
nothing downstream can quietly sort it, and the run says what would fix it.

**AND THE MATRIX WAS REPORTING A SCENE AS FREE.** `deaths x7` read **0.00 ms on
all three tiers**, which wave D would have read as "seven deaths cost nothing".
It had never run: `reset()` empties the frame buffer but the kill feed is the
whole session's on purpose, so the seven kills were all from the brawl and fire
scenes BEFORE the reset, every window closed before the first held frame opened,
and `reduce` returned a row of zeroes over an empty array. The dump carries its
own `markT` now, only kills after it are used, and a reduce that catches no
frames is reported as UNMEASURED rather than as zero. Same shape as a gate that
passes because its case is absent.

What remains of this wave is the part no edit here can do: getting the matrix
onto hardware with a real GPU. The instrument is now honest about being on the
wrong one.

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

> **STALE HEADING — CORRECTED 1 Sep 2026. READ THE POSTSCRIPT AT THE BOTTOM OF
> THIS WAVE BEFORE THE TOP OF IT.** This wave is DONE and has been since 24 Aug;
> its own postscript says so and the heading was never updated, so two successive
> handovers have carried "the second ground, NOT STARTED, the biggest visible
> change per hour" as the next thing to build. **FIVE grounds ship** —
> `saxon_village`, `pict_moor` (which IS this wave's "cold, open, sky-lit"),
> `roman_fort`, `danelaw_camp` and `offa_dyke` — and all three "outside the
> renderer" bugs below were fixed on the way. Everything under this line is kept
> as the design record.
>
> **EXCEPT ONE PIECE, WHICH IS THE PIECE THIS WAVE ARGUED FOR.** The case below
> is for a cold KEY LIGHT — *"changes every material in the game without touching
> one of them"* — and no ground has one. `render/moor.ts` records why: *"the
> arena's rig is a low sun and it multiplies a warm albedo twice over"*, and its
> first cut *"read as ORANGE SAND, not moor"*, so the moor was made cold by
> pulling **every material** cold and dark instead. `render/camp.ts` inherits it
> verbatim. All five grounds share one warm dusk rig, and the cheapest lever this
> wave named has never been pulled. It is still available, and it is now also the
> change most likely to disturb the colour grade — a cold key moves the
> illuminant, which moves the axis the chroma stage expands across.
> `tools/gradesplit.mjs --gate` is the instrument for that question.

~~*NOT STARTED, but NOT BLOCKED.*~~ The seam exists (see §0). `MAPS.md` designed
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

**POSTSCRIPT, 24 Aug 2026 — both maps exist and the block above was routed
around, not broken.** Map two is the Pict moor (`pict_moor`, merged earlier);
map three is the Roman fort (`roman_fort`, merged today). The fort got its
vertical read WITHOUT sim height: the fighting floor stays flat (flags ±5 cm),
the five curtain-wall lengths are plan-view `RaisedStone` solids the 2-D sim
already collides, and everything that actually drops — platform edge, ditch,
low country — is outside the 18 m play disc where no body ever stands. The
three "outside the renderer" bugs listed above were all fixed on the way:
`heightAt` lives on the `GroundSpec`, the engine reads `ground.play.radius`,
and the harness takes `--ground`. `tools/solidtest.mjs` runs its bot-routing
claims per ground, 12/12 with the fort in the list.

---

### Wave F — RETENTION (several waves)

- **Rating.** ~~*NOT STARTED*~~ **STALE ROW — CORRECTED 1 Sep 2026. This was
  ANSWERED by 4.6 on 24 Aug and the answer was deliberate:** *"The rating IS
  season points — the war already runs on one number and a second rating would
  be a second truth."* The Roll of Honour ships, with the period title each
  seat's points earned on its own people's ladder. The literal claim below is
  still true — there is no `rating` column — and that is the POINT of the
  decision, not evidence against it. Adding one now would undo a recorded
  ruling. What is genuinely open is only what Matchmaking below is waiting on.
  Original text: *no `rating`/`elo` column in `schema.ts`, no reference anywhere
  in `src/`.*
- **Matchmaking.** **REJECTED for now**, and the reason is arithmetic rather
  than effort: a queue is only as good as its population. Every match today
  starts from a dropped link and has a 100% match rate; a queue at this player
  count has a match rate near zero and teaches the first organic visitor that
  the game is dead. Revisit when concurrent strangers exist. The rating is what
  it will eventually sort on, which is why the rating is not deferred with it.
- **Hearths** (clans — `heorðwerod`, the hearth-troop). ~~*NOT STARTED*~~
  **STALE ROW — CORRECTED 1 Sep 2026: DONE, and this file says so eleven hundred
  lines above.** Row 4.4, 24 Aug: found/join/leave on /factions, the season's
  houses, `war_ledger.hearth_id`, warsay 44/44 including the three refusals that
  make it fair. `src/db/hearths.ts` is in the tree. The claim below — "no table,
  no reference" — was false when it was written down here.
- **Flags.** *NOT STARTED* — no flag column, no flag geometry; every `Flag` hit
  in `src/` is a `lucide-react` icon or an unrelated boolean. Constrained
  presets, not free-drawn — that is a moderation decision as much as an art
  one. Depends on profiles, which are built.
- **PWA.** ~~*NOT STARTED*~~ **STALE ROW — CORRECTED 1 Sep 2026: two thirds
  DONE.** Row 8.9 shipped the PWA shell on 27 Aug and the tree carries all of
  it: `src/app/manifest.ts` (standalone display, `orientation: "any"` after
  touchtest found the landscape faults the old portrait pin was hiding),
  `public/manifest.webmanifest`, forged icons via `tools/mkicon.mjs`, and
  `public/sw.js` — a worker that caches NOTHING by design, registered from
  `src/app/page.tsx`. **What is actually left is the EARNED install prompt** —
  `grep -rn beforeinstallprompt src/` is empty, so the browser's own banner is
  all there is and it fires whenever the browser feels like it. The row's own
  rule is unbuilt: never at first load, after a won match.

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

### 0. Make the two flaky gates deterministic. **DONE 31 Aug 2026 — 10/10 each.**

> **CLOSED BY ITS OWN BAR.** `touchtest` **10/10 green**, `playtest` **10/10
> green**, consecutively, on this box. Three causes, every one the harness and
> none of them the game: a mouse-look that sampled a stopwatch instead of the
> rotation arriving; a lock claim that WAITED for its own case instead of making
> it (measured — a committed man is damped under 2 u/s and collision stops you at
> 1.3 m, so the strafe can only ask for 1.36 rad/s against a 1.8 cap, and the
> claim only ever went green when the recruit happened to move); and an
> acceptance case that asked readiness before a 400 ms run-up rather than after
> it. Plus one measurement too thin to hold its own tolerance — the turn rate was
> taken over 100 ms where one bunched packet moves it 40%, against a 30%
> tolerance. `docs/OPEN-DEFECTS.md` carries the full account.

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

> **DONE, 21 Aug 2026 — the instrument is fixed and `ablationRows` is no longer
> empty.** Three faults, none of them in the game: an uncaught `route.fulfill`
> rejection that killed the process mid-run, a missing `bretwalda_name` so no
> scene could ever raise a room, and a `hits` check read before the renderer's
> lazy chunk had even been fetched — measured at thirteen `.js` responses and
> 1,033,173 bytes with the flag in none of them. Eleven rows now, no misses.
> **The wave this earns has a target: shadows are 240 of 624 draw calls, and
> `framecost` agrees independently — "352 of 410 visible meshes drawn twice for
> one shadow-casting light".** The milliseconds are still not quotable from this
> box; see `docs/OPEN-DEFECTS.md` for why the ms column reads −423 for bloom.

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

## 4.3 — THE FACTION KIT, AS BUILT (16 Aug 2026)

The owner: *"it doesn't feel like much of an impact currently when you do swear
to a kingdom & win a game."* The map half of that shipped 15 Aug. This is the
arena half, and it is `characters.ts`.

### What a people takes, and what it leaves

`docs/FACTIONS.md` §8's table already scoped this rung and left it unbuilt. It
is built exactly as scoped, one rung below the team colour:

| | takes | leaves |
|---|---|---|
| **a people, in a non-team mode** | the cloak and the shield board, flat, in the people's field; the board's PAINT and the mark on it; the worn cloth — tunic, trousers, wraps, harness and strap leather, linen, pelt, hood cloth and the mail — through a per-people vat | the cast fittings, the helm's own metal, skin, hair, beard, war paint, and **every shape on the man** |

**The four hues are DERIVED, not typed.** `FACTION_FIELD` is `--gilt`,
`--garnet`, `--moss` and `--woad` out of `globals.css` — the only place those
four colours exist and what `factionMap` paints the island in — and every hue in
the livery table is `hueOf()` of one of them. What IS typed is chroma and VALUE
per surface, and every row is an entry in `FACTIONS.md` §2's Kit column: the
Norse ceiling on cloth sits below the British floor because his wools are darker
and their kit is lighter; the Pict's wraps come out of the vat almost as they
went in because his limbs are bare; his metal goes dark and colourless because
he has the least armour and none of it may be taken away, since some of it was
bought.

**Two hue shifts, both making the dye more accurate rather than less.** `--gilt`
is a METAL — the CSS comment says so, it is the map's chrome — and a Saxon wore
WELD, a clear yellow further round the circle. `--garnet` is a STONE, and a
garnet is a deeper, bluer red than the orange it was borrowing from gilt. They
were 32° apart and 32° is not two peoples at 230 pixels: `factionread` read
ΔC 8.75 before the shifts and 14.18 after. `TEAM_FIELDS` already does the same
thing and says so.

**The mark is on the SHIELD, which is the only geometry a people adds.** A
roundel of the board's own field with the device painted on it, set clear of the
boss: ~230 mm on a 760 mm board, which is ~29 px at the fight lens. The board's
paint pattern is per people too — quarters for Wessex, the Gokstad ship's
alternating staves for the Danelaw, a chequer for the Britons' "checked weave",
a rim band for the Picts. `FACTIONS.md` §9's tiers are carried into the code:
the seax, the York Mjölnir and the Pictish crescent-and-V-rod are FINDs, the
triskele is a find used as a device we composed, and §9.2's AVOID list is
respected in full.

### The unsworn is a look

`people: "none"` returns by identity at every resolver, so an unsworn man is the
issued kit — undyed wool, oiled harness leather, cast bronze, a plain limewood
board with no mark on it — which is what every shot in `art/` has shown since
the game existed. Most players are unsworn on first load and a default that read
as "the faction failed to load" would be worse than no feature.

### The gate, and it went red on the build it was written for

`node tools/factionread.mjs`. `--off` is the permanent control and must fail: it
reads ΔC 0.00 and its sheet is five copies of one man. First run against the
real build was 12/15, and the three failures split into two build defects and
one ruler defect, written up in `GATES.md` and in the file itself.

### AND THEN IT PASSED 15/15 WITH THREE DEFECTS LIVE IN IT — 16 Aug 2026

Worth its own heading, because the lesson is the one this project keeps paying
for. Every assertion the file had asked whether the four peoples were far enough
APART. None asked whether the shop was still a ladder INSIDE one of them, and
none of them had any light in it at all. The whole "after" set was five front-on
turn-0 huscarl cards: one bearing, one class, one pose, and all three defects
lived outside that frame.

1. **SWEARING FLATTENED THE PAID ARMOUR FINISH LADDER.** Measured through the
   shipped resolvers, kit-averaged CIELAB ΔE over the six dyed surfaces: **21 of
   21 finish pairs under `LADDER_DE` on every one of the four peoples, minimum
   0.00**, against 0 of 21 and minimum 11.85 unsworn. Rough Iron at 0 gold and
   Blackened Steel at 110 returned the identical hex on every dyed surface under
   a Saxon or Briton livery — `mail #7c7a6f vs #7c7a6f | tunic #b0a554 vs
   #b0a554`. A man who paid 110 gold watched it become the free one the moment
   he swore.

   `rungcensus` could not see it — it counts components and triangles and
   **nothing was deleted**, the colour was flattened. `cosmetictest` §2 gates
   this exact ladder on this exact constant, against the RAW STORED HEX, which
   is the same seven numbers whatever a man swore to. Three instruments green,
   all answering the question next to the one that mattered.

2. **THE SAXON BLEW OUT.** `--gilt` is a map token — the CSS calls it a metal
   and "the brightest thing on the map" — and `cloakFor` put it flat on a cloak.
   Through the real renderer: **1.93% of the man at a fully clipped channel at
   the front, against 0.11% for the 400 gold Gilded War Cloak.**

3. **THE DANELAW WAS STILL PINK** at the two bearings nobody photographed. The
   round that "fixed" it removed the Norse hue shift and shot the front; the
   pink was never in the hue shift, it was in the same clamp — every pale
   surface, which is the linen sleeves and the leg wraps, onto one light rose.

**Closed 16 Aug 2026, all three by one correction, and both new gates were
written first and went red before the fix.** `factionread` §5 gates the paid
ladder through `kitFor(finishKit(value), team, people)`, and §6 boots the app
and counts clipped pixels under the fire against the shop's own dearest gold.
The full write-up is `FACTIONS.md` §10.1; what it could not buy, and the number,
is there too and is printed on every run.

### What is still open here

* **Per-faction class variants** (`FACTIONS.md` §6). Same four classes, same
  numbers, different KIT — a Pictish runekeeper's shape, not his colour. This
  pass is colour plus one device; shape is untouched by design and is the next
  item.
* **The other three classes have no shield**, so their read is colour only.
  `render/anim.ts` gives a shield to the huscarl alone.
* **The oath screen does not show you the kit.** `/factions` still asks a man to
  swear without showing him what he will look like.
* **5.7b, the PLACE half**, below.

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
| fen and causeway | East Anglia | flat water, reed, a raised timber road that funnels a fight |
| downland | Wessex, Kent | chalk, sheep-cropped turf, a long open sightline |
| dyke and march | Mercia, Gwynedd, Dyfed | Offa's earthwork — a bank and ditch is a shield wall in landscape form |
| moor and dale | Deira, Bernicia, the Five Boroughs | heather, gritstone, a beck cutting the floor |
| sea-cliff | Kernow, Cait, Ystrad Clud | turf to a drop, standing crosses, wind |
| firth and broch | Fib, Circinn, Fortriu | drystone tower, birch scrub, a tidal edge |
| isles | Sudreyjar | machair, a beached keel, salt grass |

Six archetypes cover the sixteen territories. **The table named LINDSEY and
MANN until 28 Aug 2026 and neither is a territory this game has** — `war.mjs`
carries exactly sixteen ids (mierce, wessex, deira, bernicia, five_boroughs,
east_anglia, kent, ystrad_clud, dyfed, gwynedd, kernow, fib, circinn, fortriu,
cait, sudreyjar) and those two were never among them. Rows cut against a name
that does not exist are rows that cannot be built, so they are removed rather
than left to be discovered by whoever tries. `tools/warsay.mjs` now refuses a
`GROUND_BY_TERRITORY` row naming a territory the war does not have, so the code
half of this mistake can no longer be made silently.

Each territory then earns ONE authored
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

### ~~The cloak's envelope has to know the arms exist~~ — CLOSED 29 Aug 2026

**Closed by a different diagnosis than this row assumed.** The owner sent the
picture with the spot circled and it was not the arm at all: the cloak's
LEADING EDGE was reaching round the front of his chest, and the fix is
`cloakLead()` compressing that reach — no envelope, no per-azimuth clearance,
and §8 untouched by construction. `docs/OPEN-DEFECTS.md` carries the whole
account, including the two fixes that this row's diagnosis led to and that both
turned §8 red. The row is kept because the reasoning in it is still the right
reasoning for the OTHER half — `wearmeasure` §11's PROUD figure still reports
up to 85 mm on the berserker's Gilded cloak, and that half is still ungated for
the reason below.

### The original row, kept for the ungated PROUD half

`docs/OPEN-DEFECTS.md`, 29 Aug 2026. The owner photographed cloth standing out
of the front of a shoulder; `wearmeasure` §11 now measures it and reports
37.7 mm on huscarl/red, 80.1 on berserker/brown, 49.3 on berserker/gold.

Two fixes were tried and both turned §8 red, and they failed the same way:
the cloak's radius is the torso's plus the wear stack with **no slack**, so
taking width away anywhere puts the mantle or the ruff through the lining.

What a real fix needs, both at once:

1. A per-azimuth radius profile that dips through the quadrant the arm hangs
   in — the cloth passing inboard of the limb rather than outboard of it —
   while still clearing whatever is worn under it at that height. The clearance
   is `stackAt(y)`, which today is a function of HEIGHT only; it wants to be a
   function of height and azimuth, read off the same `wear()` stack §8 reads.
2. §11's bar, which cannot be set until (1) exists: measure proud of the arm
   PLUS whatever is worn over the shoulder at that height, using `_wornSpy` —
   the spy already exists and §8 already reads it. Then 12 mm is a real bar
   rather than a number that condemns the berserker for owning a coat.

Done means: §11 gates instead of reporting, §8 and §9 stay green, and the
wedge in `art/shots/cloakfront/` is gone from a fresh capture.

### 6.1, as swept — 29 Aug 2026

The row said *"redundant code sweep, when deemed necessary and verified"*, and
the honest way to deem it is to measure it. Every exported symbol in `src/`
was checked for a reference outside its own file, across `src/` and `tools/`.

**145 exports are named nowhere else** — but that is not the same as dead, and
lumping them together is how a sweep becomes churn:

* Most are TYPES exported for a module's public shape (`LightingOptions`,
  `WorldOptions`, `RailGeometry`). They cost nothing at runtime and removing
  the keyword would be noise.
* 29 are FUNCTIONS, and 21 of those are used inside their own file — merely
  over-exported, which is a wider surface than needed but not dead weight.
* **8 are defined and never named again anywhere.** Those are the sweep.

Deleted: `groundIds`, `cachedThumb`, `factionLivery`, `isDatabaseConfigured`,
`resetDbBreaker`, `optionById`, `ledgerInstalled`, `resetLedger` — 41 lines.

**Three of them called themselves TEST SEAMS with no test using them**
(`resetDbBreaker`: *"forget the breaker so a probe can retry immediately"*;
`resetLedger`: *"drop everything witnessed so far"*). An unused seam is worse
than dead code, because it reads as coverage that does not exist. If a probe
wants one back it is one line.

The ninth candidate, `generateMetadata`, is Next's own convention and is called
by the framework — kept, and named here so the next sweep does not "find" it.

Gates after: tsc, lint, build, wartest 82/82, protocoltest 81/81, fighttest
23/23, burhtest 24/24, storeclaims 25/25, marktest 38/38, scoretest 16/16,
solidtest 16/16, wearmeasure 11/11 sections.

**Not done, deliberately:** narrowing the 21 over-exported functions to module
scope. It is a real tidy and it is pure churn against a working tree; it wants
doing alongside a change that touches those files anyway.
