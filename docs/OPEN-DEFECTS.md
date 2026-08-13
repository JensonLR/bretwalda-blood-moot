# Open defects

Findings that are diagnosed but not yet fixed, carried here so they survive
between iterations. Delete an entry when a capture proves it gone — not when a
change is made.

Judged against `docs/VISUAL-BAR.md`. Captures live in `art/shots/`.

---

## OPEN — the death that ends a MATCH is still played to the summary, not to the room

13 Aug 2026. The owner: *"death camera only shows when you die last, everyone
should see death camera for final death winner & all losers."*

The round-end beat landed (`createRoundCamera` in `src/game/deathcam.mjs`,
`tools/deathcamtest.mjs` 41/41, `docs/BACKLOG.md` 2.6): when the last man falls
in a round, **everybody watches the blow** — winner and losers — for 2.20 s
inside the 5 s break the server already takes, so nothing waits on it.

**What is not covered is the round that ENDS THE MATCH**, which in a best-of-3
is one round in three and in a single-round match is the only one. `endRound`
sets `state = "finished"` and calls `endMatch` on the same tick — there is no
break to play the beat in — and `render/summary.ts` takes the lens for the
victor's portrait while `page.tsx` lays the results panel over it.

**Why it was not fixed here, said plainly rather than left implied.** Holding
the summary back for two seconds is a change to the match-summary FLOW —
`src/app/page.tsx` gates `MatchSummary` on `matchResults`, and
`tools/summaryflow.mjs` gates that flow — and neither file belongs to the unit
that built the camera. A camera unit that reached into the summary screen to buy
itself two seconds would be exactly the kind of unscoped edit `docs/PROCESS.md`
E6 exists to prevent.

**What it costs today:** the last round of a match ends on the victor's portrait
rather than on the killing blow. That is *a* beat and not *the* beat, and the
deferral rides `deathcamtest`'s own verdict line so it cannot go quiet.

**What would close it:** the beat is already skippable, already bounded, and
already refuses to arm for a man inside his own death hold. Whoever owns
`page.tsx` needs to delay `setMatchResults` — or gate the panel on a "the beat
has finished" flag `GameCanvas` already knows — by `ROUND_HOLD.total`, and
`summaryflow` needs to expect it.

---

## CLOSED — a corpse was shown three buttons that did nothing

The entry this replaces called it "an intermittent gate". The intermittency was
real and so was the cause named there — two sources of truth for one question —
but it was not only a harness problem. It was a live UX defect.

**What happened.** `MatchSummary` mounted the flourish row off the WIRE's
`players[me].state`. That panel stays mounted through the server's ten-second
rollback into the lobby, and the rollback resets every man to idle — so a man
the stage had laid down got his row back the moment the room reset, three
buttons that `render/summary.ts` then refused on every press. To the player
holding the phone, a vetoed press and a broken game look identical.

It read as intermittent because whether the local man was standing depended on
which side won, which varies run to run.

**The fix is that the button now asks what the stage answers.** `GameCanvas`
already held `summaryRef.current.canPerform` — the function that decides whether
a flourish is honoured — and now pushes that answer up on change; `page.tsx`
gates the row on it as well as on the wire's state. One source of truth.

```
before: NOTE war band: after the rollback the row is OFFERED to a man the stage left DEAD
after:  NOTE war band: after the rollback the row is gone   to a man the stage left DEAD
        PASS war band: a man lying dead does not perform — the row was not offered at all
```

**And a test had to change with it, which is worth recording.** `vetoCheck`
asserted `pressed && refused`: it PRESSED the row as a corpse and required the
stage's refusal counter to move. That was right while the button was always
there. It became wrong the moment the button correctly went away — the check
failed with `pressed=false` on the build that had just fixed the defect, because
it was measuring the old implementation rather than the rule. The rule is "no
corpse performs", and it now accepts either route: not offered (stronger) or
pressed-and-refused. What was not relaxed is the part that matters — no corpse
may be performing, on either route.

---


## OPEN — the beards are flat sheets, and the hood swallows a mane

Reported 2026-08-08 with four screenshots: *"all beards have a similar defect &
issue where it looks to be really sharp & thin / folded in areas, overlapping
into the neck or just a hole in it ... the design & display of the beards is
really broken & poor, the hair & helmets also have similar issues"*, and
*"across the 4 fighting types the hair designs break with helmets on ... long
hair dissappears fully even if it should be visible at the below the helmet ...
the sides of helmets are missing too with leaves bald spots or ears exposed"*.

### 1. The hood swallowed a mane, and the gate was told to allow it

`cosmetictest` §3 carried an explicit CARVE-OUT for the Shadow Hood, with this
reasoning:

> *"a hood is a bag for a head, and swallowing what is under it is what its 120
> gold buys ... whether a draped cowl should hide a mane or let it spill out the
> front is a design call, and a harness that decided it by fiat would be
> inventing a defect."*

That was the right instinct and it is why the harness read green while the owner
read broken: it declined to rule, and reported instead. **The ruling has now been
made** — a cowl covers the crown, it does not swallow a mane that hangs past the
shoulder — so the exemption is gone and the numbers are an assertion:

```
SWALLOWED  Long Mane (40g)          under Shadow Hood — 0.97% (helm covers 37% of the face)
SWALLOWED  Braided War-locks (100g) under Shadow Hood — 0.97%
           Warrior Crop  reads 0.37% under the Shadow Hood
[cos] 15/16
```

A 40-gold and a 100-gold item, both under 1% under a 120-gold helm. `art/look/rep1.png`
shows why: the mane is entirely INSIDE the cowl, with a few millimetres of
hairline showing at the brow and nothing at all below the shoulder.

### 2. The beard is a SHEET, not a mass — MEASURED

`npm run beardvolume` fires rays through the beard and reports the gap where
each crosses it. Measured on the HANGING FALL only, because hair lying on a
cheek is legitimately thin — `BeardCut.skin` is literally "how thickly the hair
lies on the face at the jaw" — while the fall hangs in air with nothing behind
it and has to have body:

```
class        beard       rays     p10      med      p90   under 4mm
huscarl      short        398     1.3      3.8      7.8       55%
huscarl      full         366     1.4      6.0     12.1       32%
huscarl      forked       250     0.9      4.4      9.9       43%
huscarl      braided      304     0.2      3.1      6.8       68%
```

```
class        beard       rays     p10      med      p90
huscarl      short        398     1.3      3.8      7.8
huscarl      full         366     1.4      6.0     12.1
huscarl      forked       250     0.9      4.4      9.9
huscarl      braided      304     0.2      3.1      6.8
```

**Read the MEDIAN, not the tenth percentile, and the first version of this entry
had that wrong.** p10 looked like the right statistic — "a tenth of the beard is
paper-thin" describes what the owner is looking at — and it is INERT. Doubling
`cut.thick` on all four styles moved every median as expected (3.8→6.9, 6.0→8.3,
4.4→6.5, 3.1→5.4) and left p10 almost exactly where it was (1.3→1.9, 1.4→1.8,
braided did not move off 0.2 at all).

A statistic that does not respond to the only lever controlling it is not
measuring that lever. **The thin tenth is the hem and the edges**, where the
section wraps from the outer wall to the inner one and the two meet by
construction. That is legitimate taper — a beard IS thin where it ends — and
gating on it would demand a beard with a blunt cut edge.

**So what is actually true:** the mesh is built to its own specification. The
median tracks `cut.thick` (declared 4.0 to 6.8 mm) almost exactly. The question
the owner's screenshots raise is therefore not "is the mesh wrong" but **"is a
4-7 mm shell on a 150 mm head enough to read as a mass"** — and that is a look
question wanting an eye on a render, not a threshold picked in a harness. Two of
the four styles do not even reach the thickness they declare.

**Why nothing caught it.** `beardcount` welds triangles and counts islands — a
sheet is one island. `beardseat` measures how deep the beard sits inside the
neck and the collar — a sheet intersects nothing. `wearmeasure` §5 folds in the
same two questions. All three are about POSITION and none about VOLUME.

**The fix** is in `beardShell`'s section: the fall's outer and inner walls run
too close together. `prof` is the section and `thick` the wall gap; giving the
fall real depth is the change, and `beardvolume` confirms it in about fifteen
seconds a style.

### 3. A stray flat tab on the hood

`art/look/rep1.png` panel 3 shows a hard-edged rectangular quad projecting from
the back of the hood at ear height, unattached to the silhouette. Not yet
diagnosed.

### 4. Helm sides: seven ungated windows, and the harness knew

`wearmeasure` §10 measures these and **deliberately does not gate them**:

```
huscarl/spectacle:  a window 5.2% of the flank sits  65 mm off the ear — the ear is not inside it
huscarl/boar:       a window 4.6% of the flank sits  63 mm off the ear — the ear is not inside it
huscarl/crowned:    a window 6.5% of the flank sits  38 mm off the ear — the ear is not inside it
huscarl/wyrm:       a window 2.0% of the flank sits 120 mm off the ear — the ear is not inside it
berserker/spectacle: 1.5% of the flank, 163 mm off the ear
berserker/crowned:   2.5% of the flank, 107 mm off the ear
berserker/wyrm:      2.2% of the flank,  89 mm off the ear
```

A hole in the side of the helmet that **frames nothing** — the ear is not in it.
That is the owner's *"the sides of helmets are missing too with leaves bald
spots or ears exposed & looks wrong"*, measured, in a harness that was calling
itself green.

Its own comment gives the reason and the reason is good: *"an opening in the
flank is shaped by the guard's rear edge, the fall's leading edge AND the
hairline ... a bar here is a bar on three owners at once, and the one thing
worse than a hole is a bar that gets tuned instead of met ... that is the next
pass."* Declining to rule was right; **printing `PASS: the openings` with the
count in a note above it was not.** The verdict line now carries the count, so a
green run reads "with 7 ungated windows" rather than as a clean sheet. The bar
is still not invented, because inventing it here is the failure the comment
warns about.

## THE PATTERN ACROSS ALL FOUR REPORTS

Every one of the owner's 2026-08-08 complaints was a thing the gate already knew
about and had chosen not to fail on:

| report | harness | why it was green |
|---|---|---|
| long hair vanishes under the hood | cosmetictest §3 | explicit carve-out; the hood was exempt by name |
| helm sides leave bald spots | wearmeasure §10 | measured, reported as a note, deliberately not gated |
| beards are sharp and thin | beardcount / beardseat | neither asks about VOLUME — a sheet is one island and intersects nothing |
| the face seam | facelook / cosmetictest | coverage measured, but never "what is in front of the face" |

Two deliberate deferrals, one unmeasured property, one unasked question. **None
was a bad measurement.** The lesson is not "measure harder" — it is that a
harness written by whoever is fixing the defect encodes THAT PERSON'S idea of
done, and every deferral it makes is invisible to the person who actually
decides. Deferrals now ride on the verdict line in both places they were found.

---

## OPEN — the Wyrm's DEEP cheek guard takes half the face at three-quarter

`npm run facecover` measures, per bearing, how much lens-facing face skin the
helm takes — the head rendered twice, bare and helmed, differenced. Face means
below the brow and within 70 degrees of facing the lens, so the side of the
skull leaves the sample as the man turns instead of entering it.

```
helm         0deg   -35deg    35deg
iron         0.2%    1.7%     2.1%
nasal        6.4%    5.3%     5.6%
spectacle   25.2%   29.4%    29.4%      <- short cheek guard
wyrm        24.3%   50.9%    53.1%      <- DEEP cheek guard
suttonhoo   89.3%   94.7%    94.8%      <- a mask, and that is the product
hood         3.1%   31.4%    34.2%
```

**Confirmed by swapping the flag, not by argument:** set the Wyrm's `cheek` to
`"short"` and it reads **25.2 / 29.4** — spectacle's numbers exactly. Set its
`bowl` to `"round"` and nothing changes. The deep guard is the whole of the
difference, and it costs 21 points of face at the bearing the shop uses.

The id buffer names the surface directly: **95% of the loss is
`rig:head · 6e767f`**, the helm's iron. The Hood's is 100% `· 2a2521`, its cloth.

### Every lever tried, and what it moved

Measured at 0 / -35 / 35 deg. Baseline `24.3 / 50.9 / 53.1`, spread 28.8.
Spectacle, the shape to aim at, is `25.2 / 29.4 / 29.4`, spread 4.2.

| change | reading | spread |
|---|---|---|
| `cheek: "short"` (whole style) | 25.2 / 29.4 / 29.4 | **4.2** |
| `bowl: "round"` | 24.3 / 50.9 / — | 26.6 |
| `nape: "flange"` | 24.3 / 50.9 / — | 26.6 |
| `cheekIn` 0.56 → 0.88 | 12.3 / 32.2 / 35.1 | 22.8 |
| `cheekOut` 1.45 → 1.10 | 30.6 / 52.1 / 55.3 | 24.7 |
| `deepHem` addend 0.34 → 0.12 | 24.3 / 50.9 / 53.3 | 29.0 |
| `deepHem` base `Y_CHIN+0.05` → `Y_LIP+0.02` | 23.2 / 43.7 / 45.6 | 22.4 |

**No single constant is the fix.** The bowl, the nape and the hem's addend do
nothing at all. Moving the inner edge back drops the FRONT and leaves the side.
Widening or narrowing the outer edge makes it slightly worse. Raising the hem to
the short guard's height buys seven points and costs the guard its depth, which
is the thing the rung is sold on.

Only replacing the whole style fixes it — which says the coverage is distributed
across coupled terms rather than sitting in one. **So this is a reshape, not a
retune**, and the file's own audit already named the shape of the answer: *"a
rectangle in parameter space is not a cheek guard; it is a billboard."* The
guard has to be cut to the jaw it covers — deep at the front beside the mouth,
sweeping up to clear the mandible's angle, finishing short at the back — while
sitting BEHIND the jawline rather than out on the cheek.

### The trap that cost three of those sweeps

`cheekIn`, `cheekOut` and `cheekHemAt` at the top of the file look like the
guard's geometry. `cheekHemAt` is a DUPLICATE of `deepHem` inside the builder,
and it was the copy I swept first — which is why the hem appeared to do nothing
twice. The file records having made this mirrored-definition mistake three times
before; this is the fourth. Anyone editing the guard must edit `deepHem` at the
builder, and keep `cheekHemAt` in step because the hair reads it to know where
the metal stops.

**The Hood is not yet judged.** 3.1% to 34.2% is the same signature, but a hood
draping round a face at three-quarter may simply be what a hood does. It needs a
look before it is called a fault.

---

---|
| by PART — "no body kit inside the face bounds" | reported 0.00%: a coif rides the head, so `rig:head` carries skin, mask, mail and gold alike |
| by COLOUR — match pixels to the `--ids` legend | reported 0.00%: the colour buffer holds material colour TIMES THE LIGHT, so the flat legend colour never appears in it |
| by AMOUNT, whole head | every helm 44-95%: a helm is entitled to the scalp, so a bar fails a helmet for being a helmet |
| **by SPREAD, face only** | **works** — masks are flat-high, bowls flat-low, only a fall changes with bearing |

Two things made it possible: `render()` keeping a per-pixel **`idbuf`** so which
part owns a pixel is a fact rather than an inference, and cutting the count at
the brow so the scalp stops drowning the signal.

**Still unexplained from the same screenshots:** a dark blade hanging from the
jaw on a warrior whose beard slot reads Clean Shaven, and the helm standing off
the skull in profile.

---

---|
| `art/look/slab-ids.png` (`--ids`) | the falls carry ONE torso material, so they are swept into the body mesh rather than the helm |
| `art/look/nocloak2.png` (`cloak: "none"`) | the cloak is genuinely off — its brown edge is gone from the rear panel — and **the falls remain** |
| `art/look/boar.png` | the same falls under a crested helm, so they are not that helm's nape flange either |

They also survive `hairStyle: "shaved"`, so they are not hair.

**Careful with `--dress`:** it takes appearance FIELD names and FIELD values, not
shop slot ids. `{"cloak":"cloak_none"}` is silently a no-op and the first attempt
at the control render was worthless because of it; the value is `"none"`. The
tell that it worked is the cloak's brown edge disappearing from panel 4.

**Ruled out earlier and recorded so nobody repeats it:** inverted normals
(`tools/faceseam.mjs` — the backlit triangles are symmetric scatter, x-sd/y-sd
0.89, not a band) and a mirrored transform (no negative-determinant world
matrix).

**The fix has two halves, and the second is HARDER THAN IT LOOKS.**

*The geometry:* the falls are too broad and hang too far forward. A real aventail
hangs BEHIND the jaw rather than beside the cheekbone.

*The assertion:* nothing asks "does any kit cross the face at the bearing the
shop photographs the warrior from". The obvious version of that check was written
and **thrown away, because it could not see the defect** — recorded here so it is
not written a second time:

> Rule attempted: *within the face's own on-screen bounds, no `rig:torso`
> surface may win the depth test.* A helm covering a face is legitimate (that is
> what a mask IS); body kit covering it never is, so draw the line on the part.
>
> It reported **0.00% and PASS** on the very warrior whose cheek is covered. The
> reason is in the ID legend: **the aventail is `rig:head`.** A coif rides the
> head, so it is parented to it, and every helm material is on `rig:head` too —
> `rig:head · 6e767f`, `· b6bfca`, `· bfa25c` are all steel and gold. There is no
> part boundary between "the mask that may cover your face" and "the mail that
> may not".

**So the discriminator has to be something other than the part**, and the easy
candidates each fail on a real garment:

- *No metal over skin inside the face bounds* — fails every masked helm, correctly.
- *Skin, then metal, then skin across a scanline* — fails the NASAL, which is
  exactly that pattern and is right.
- *Left/right asymmetry of skin coverage* — a three-quarter bearing is
  legitimately asymmetric, so the signal is buried in perspective.

**BUILT, AND THE HYPOTHESIS IS DISPROVEN.** `facelook --cover` renders the same
head twice at each bearing, bare-headed and helmed, and counts the skin that
went. It needed a real per-pixel id buffer to work at all — see below — and with
one, it measures:

```
helm         0deg   -35deg    35deg     spread
nasal       44.0%    42.8%    42.9%       1.2%
boar        63.0%    60.2%    60.2%       2.9%
suttonhoo   95.0%    97.3%    97.4%       2.3%
```

The design predicted a fall would spike at three-quarter and stay low from the
front, so that SPREAD would be the discriminator. **Every helm is flat.** The
falls take their share from every bearing, not only from the shop's, so spread
separates nothing and that idea is dead.

The table also shows why these numbers cannot be gated as they stand: they count
skin on the whole HEAD — scalp, ears, occiput — and a helm is entitled to all of
those. A bar here would fail a helmet for being a helmet.

**The next move, and it is now small:** restrict the count to the face proper —
below the brow and facing the lens — and the same differential becomes a gate.
The instrument is done; only the region is wrong.

**THE INSTRUMENT IS THE REAL DELIVERABLE.** Two attempts at this assertion
returned 0.00% on the defect and both failed for one reason: the rasteriser's
colour buffer holds the material colour TIMES THE LIGHT, so even under `--ids`
the flat legend colour never appears in it and matching pixels against the
legend finds nothing. `render()` now keeps an `idbuf` written where the depth
test is won, so which part owns a pixel is a fact rather than an inference. Any
future per-pixel assertion about who covers what depends on that and could not
have been written without it.

**Still unexplained from the same screenshots:** a dark blade hanging from the
jaw on a warrior whose beard slot reads Clean Shaven, and the helm standing off
the skull in profile.

---



## CLOSED — the Sutton Hoo's hair, and it was never the cloak

`npm run cosmetictest -- --no-render` is **16/16**. Long Mane reads **1.42%** and
Braided War-locks **1.31%** under the Sutton Hoo against a 1.00% bar, with
`wearmeasure` §10 still PASS at 0.27% (bar 0.35%) and `hairFitProbe` reading
**0.0 mm** of hair outside the metal on every Sutton Hoo row. `cheekIn` was not
touched.

**The entry this replaces named the wrong garment, and one measurement settles
it.** It said the gather was "buried in the cloak", quoted the cloak collar's
top edge at y 1.514 against the mail hem at 1.505, and concluded "the work is on
the cloak collar, not the hair". The check that was never run is what the gate
actually stages:

```
[cos] audit dress, read from /shot's own DRESS_IDS: ... cloak=cloak_none ...
```

`src/app/shot/page.tsx` says so in its own comment — *"Bare-headed and cloakless
on purpose"*. §3 builds a man with **no cloak on**. Sweeping the whole slot
through the gate's own rasteriser and lens:

```
[cloakprobe] cloak    hair      SIL%   (bar 1.00%)  — helm suttonhoo, huscarl s13, portrait -35
[cloakprobe] none     long       0.62
[cloakprobe] red      long       0.61
[cloakprobe] gold     long       0.61
```

Deleting or changing the cloak moves the failing number by **0.01 points**. The
cloak collar could not have fixed this and nothing on it was changed. The 9 mm
was read off a *render*, which is shot with a cloak; the gate is not.

### What was actually eating it, in two layers of the man's own mail

**1. The gather fell inside the hauberk.** `coifSquash` stops at the aventail's
lowest ring on the reasoning *"below the lowest ring there is no mail at all"*.
True of the aventail, false of the man — below it is the bishop's mantle. Every
one of Long Mane's below-hem vertices sat a mean **100 mm** and a worst **137 mm**
inside the torso's outer mail wall, and at the shop's lens **all 2804** of its
below-hem pixels were occluded by `rig:torso`. The route was described as going
"round the bottom of" the metal. It went round the bottom of the aventail and
straight into the hauberk.

**2. The aventail's "free hem" is not free.** `coifLevels` cuts the mail against
multiples of the SKULL's radii and it lands on a BODY. Per-azimuth, at the
bearings the masked fall occupies:

```
[prof] y=1.505 (the hem)   az -173  -158  -143  -128  -113
[prof]  aventail             169   174   183   191   194
[prof]  torso mail           177   184   197   212   222
[prof]  aventail - torso      -9    -9   -14   -21   -28
```

The hem the whole rung was built on is 9 to 28 mm **inside** the mantle. Mail
buried in mail looks exactly like mail, so nothing showed it.

### What changed

- `spine`, `at`, `layer`, `collar`, `ramp` and the two mail station lists are
  **hoisted out of the `emit("torso")` closure** so the head stack can read what
  the man is wearing below his collar. Outside the closure and not inside it,
  because `emit` caches merged geometry once materials are present — a second
  huscarl never runs the closure, so anything read from inside it would be right
  in every probe and absent in the game.
- The aventail's lower rings clear the mantle **rearward only** (`hd` deepened,
  `z` walked back by the same amount), so the arc the hair comes out of gets a
  real free edge and nothing in front of the ears moves.
- `MASK_SWING`: under a mask the fall's **section** swings out as it descends,
  so the gather lies on the mail instead of inside it.
- `shoulderRide`: the last few millimetres onto the stack's own superellipse,
  faded in over the 35 mm below the hem. **The gather rides; the ropes hang** —
  applied to the plaits it measured 84.7 mm of braids outside the helm.

**The lesson is the one the file keeps re-learning, and this time it cost the
route.** The travel was first written into `fit`, which moves finished points.
The profile has ten stations and only two fall below the hem, so an 85 mm
correction landed on a single quad and the gather came out as a fan of blades
standing through the mail — `art/look/hairfall-diag.png`. Fixing the curve it was
projected onto (`shell` sweeps a superellipse, not an ellipse) was a real bug
and changed the picture not at all (`-diag2.png`). Putting the same travel in the
SECTION, where the sweep interpolates it across every row, is what made one
curtain instead of ten fragments.

### What is honestly still weak, and it is the same bearing as before

**At the shop's own lens the gain is not the gather.** Of the 956 visible hair
pixels on the fixed build, every one is at y 1.55–1.83; **none** is below the
mail hem at 1.505. The three-quarter portrait looks at the man's front-left and
his own shoulder and arm stand in front of the nape, so the below-hem gather —
which is real, is now outside the mail, and reads as a curtain at −90° and 180°
— pays nothing at −35°. What the extra silhouette is, is hair filling the gap
where the aventail's rim opens past the cheek guard's rear edge as it descends.
That is a genuine opening and it costs 0.0 mm through metal, but it is the same
"hair in the helmet's own side slot" the previous entry flagged as weak.

Anyone raising this bar again should know that the below-hem route cannot pay at
−35° for a reason no amount of cloak, mantle or hem work will change: at that
bearing the gather is behind the man.

---

## CLOSED — the head stack's hair regression: ten rungs of ten

Supersedes the entry at the bottom of this file. `npm run cosmetictest --
--no-render` went from **8 swallowed to 2** and then to **0**; the last two were
both cells of the Sutton Hoo and they are written up under their own heading
below. The gate is green.

Silhouette against Shaved, huscarl, portrait lens at -35 deg — which is the
number the shop is judged on:

| helm | Warrior Crop 0g | Long Mane 40g | Braided War-locks 100g |
|---|---|---|---|
| Bare Head | 13.00 -> 13.00 | 21.00 -> 21.00 | 23.04 -> 22.76 |
| Iron Spangen 30g | 1.10 -> 1.10 | **2.26 -> 10.22** | **2.26 -> 9.18** |
| Nasal 110g | 1.07 -> 1.07 | **2.20 -> 9.91** | **2.20 -> 8.90** |
| Shadow Hood 120g | 0.38 -> 0.38 | 1.00 -> 1.00 | 1.00 -> 1.00 |
| Ridge 190g | 1.05 -> 1.05 | **1.98 -> 9.71** | **1.98 -> 8.70** |
| Spectacle 280g | 0.56 -> 0.60 | **1.19 -> 7.70** | **1.19 -> 7.31** |
| Boar-Crest 380g | 0.53 -> 0.57 | **0.95 -> 7.36** | **0.95 -> 7.04** |
| Jarl's Crowned 570g | 0.53 -> 0.57 | **0.95 -> 7.36** | **0.95 -> 7.05** |
| Wyrm-Crest 950g | 0.21 -> 0.21 | **0.31 -> 3.43** | **0.31 -> 4.48** |
| **Sutton Hoo 2400g** | 0.00 -> 0.00 | **0.05 -> 1.56** | **0.05 -> 1.44** |

The two paid styles are no longer identical to each other on any rung. The bar
is 1%, and "not identical to each other" is now an ASSERTION rather than an
observation — see the note on it below.

### What moved, and it is three constants that were all facing the wrong way

Every one of the three rules that deleted the hair was a CONSTANT standing where
the metal is a curve, so each of them culled a region much larger than the piece
it was written for.

- **`hairCeil`'s cheek-guard clamp** flattened hair to a 5 mm liner in a fixed
  0.45-1.60 rad box, down to `v > -0.95`. That is half a radian past the
  Spectacle's rear edge and a long way below every plate in the shop. It now ends
  at `cheekHem` — the plate's own free lower edge, hoisted to the stack beside
  `coifLevels` for the reason those were. Hair is compressed UNDER a guard and
  keeps its volume BELOW one.
- **`hairFall`'s coif ramp** ran from 0.34 rad IN FRONT of the aventail's opening
  to the opening itself, so the fall was already at zero everywhere a man could
  see it. The mane's window now sits IN the opening: a mailed man wears his hair
  pulled through the mail's face opening, which is the only place on him hair can
  be seen at all.
- **`if (style.cheek !== "none") continue;`** deleted both war-locks on the six
  rungs with cheek guards. They are ROUTED now — taken from under the plate's own
  hem, with the forward swing traded for outboard travel where a plate hangs
  beside them, and shortened by however far down the plate made them start.

`hangingMass` also gains `fit`, the ceiling `hairCeil` gives the scalp shell and
a falling mass never had. Without it a garment's only lever over a fall was
`mass`, and the only thing `mass` can do to a fall is delete it. That is the
general shape of the whole defect.

### CLOSED — the Sutton Hoo, and the opening was the bottom of its own mail

`cosmetictest` is GREEN. 16/16, and the two cells that were red read **1.56%**
(Long Mane) and **1.44%** (Braided War-locks) against a 1.00% bar, with
`hairFitProbe` at **0.0 mm and 0.00%** on the huscarl and the berserker at both
seeds. Nothing was relaxed and nothing was marked closed.

The entry below this one was right about the measurements and wrong about the
conclusion, and the reason is worth keeping. Four constructions were built and
every one of them put hair through metal:

| where the hair was put | cosmetictest | `hairFitProbe` |
|---|---|---|
| under the deep guard's hem, hanging | 0.05 / 0.20% | 46-107 mm of hair outside the rings |
| under the mask's own lower edge, at the throat | 1.35 / 0.63% | 19-77 mm out, and the frames show brown patches standing through the chest mail |
| plaits rooted at the throat, swung forward | 0.11% | into the mantle, invisible |
| plaits rooted at 0.30 rad | 0.12% | inside the body |

**All four looked for an opening ABOVE the collar, where the helmet genuinely
has none.** The aventail ENDS. `coifLevels`' bottom ring lies on the shoulder at
`skullY - R.y * 2.60`, and below that line there is no metal anywhere behind the
man's collarbones. `cheekHem` — the cheek plate's own free lower edge — is what
lifted the other nine rungs from 0.95-2.26% to 7-10%; the mail has exactly the
same thing and nobody had read it. It is `coifHemY` now, and a man with long
hair and a mail collar does not tuck it inside the rings anyway.

So the hair is gathered inside the aventail from the scalp down, squashed there
by `coifSquash` where no bearing can see it, and comes out under the hem onto
the shoulder. **The route never crosses metal because it goes round the bottom
of it.**

Three things had to be true for that to work, and each of them was a bug of its
own:

- **`hairCeil` did not know how far down the point it was fitting was.** A
  direction and a height are the same thing for a shell on a skull and are not
  the same thing for a mass that falls 400 mm, so the nape guard's `-5 mm` and
  the aventail's ring lookup were both being applied to hair hundreds of
  millimetres below the metal that owns them — which is what crushed every
  previous attempt back onto the neck. `atY` stops each at its own hem
  (`napeHemY`, `coifHemY`). Omitting it is exactly the old behaviour.
- **`coifSquash` exempted the mail's face opening on a helm that has none.** The
  rim opens from 1.46 to 1.80 rad as it descends, so a fall at 1.5 rad was
  squashed at the temple and released at the shoulder: **83.2 mm of mane
  standing outside the metal at 91 deg**, which is where the deep guard is.
- **The throat ventail is a second curtain and it sweeps to 2.45 rad.** Between
  it and the aventail there is a nested gap a fall can sit in and a radial ruler
  cannot read. The fall and the plaits are both held behind 2.26 rad, which is
  the one arc where the aventail is the only metal there is. Every value in
  front of that line was measured and every one of them reads 27-126 mm through.

The war-locks needed one thing more. Two ropes under a full mask measured
**0.89%** — four of them measured the same, because at the shop's own
three-quarter lens the inner pair is behind the head — and every honest lever
left (longer, fatter, further outboard, swung sideways once free of the hem)
either stopped paying or put the rope through the ventail. A plait is an ACCENT
on a head of hair everywhere else in the shop; under a mask there is no hairline,
crown or nape left for it to be an accent ON. So the rung now shows the same
gather the mane does — shorter, with `hank` doubled so the surface reads as rope
— with the plaits hanging past it. The two paid rungs separate at **0.73%**
under this helm and 6-13% under every other.

**What is honestly still weak:** most of what a player sees at the shop lens is
hair filling the helmet's own side slot (the gap between the guard's rear edge
and the aventail's front edge — `art/look/sh-long.png` panel 1 shows it plainly,
and the brief was right that it was already there). The gather below the hem is
real, measured and mostly buried in the cloak, whose top edge is at y 1.514
against the mail's hem at 1.505. A forward `lean` of 0.24 was tried to carry it
onto the shoulder in front of the cloak and moved the number by -0.02%. ~~**The
next honest move on this rung is the cloak's collar, not the hair.**~~

> **CORRECTED — that last sentence was wrong, and it sent a whole pass at the
> wrong garment.** The 9 mm was read off a render, and a render is shot with a
> cloak on. `cosmetictest` §3 stages the audit dress, which is `cloak=cloak_none`
> — sweeping the entire cloak slot through the gate moves the failing number by
> 0.01 points. What the gather was buried in was the man's own hauberk. See the
> CLOSED entry at the top of this file.

A mask on a class with no aventail — berserker, warden, runekeeper — still shows
nothing, and that is stated rather than hidden: what closes their throat is the
ventail, whose hem lands ON the hauberk collar, so there is no free edge between
the two for hair to come out of. Only the huscarl's mail creates the hem this
rung's hair uses.

### The ruler — what was built, what it measures, and what it does not

`wearmeasure` section 4 passed the shipped geometry because `SHOW_FLOOR` is a
fraction of THE HAIR THAT STILL EXISTS: delete nine tenths of a hairstyle and the
remaining tenth still sits in a direction no garment covers, so the ratio holds.
A ratio whose denominator moves with its numerator measures nothing.

`hairFitProbe` now also returns **KEPT** — of the directions the hairstyle
occupies ON A BARE HEAD, the share the helmed build still occupies and can be
seen in. The denominator is a build no helmet can reach. It reads 18-44% on the
shipped geometry and 21-62% here, so it moves the right way on every rung.

**It is REPORTED and not asserted, and that is a negative result worth having.**
Three weightings were measured against both trees:

```
bins occupied            main 17-44%    this tree 21-62%    <- published
bins weighted by extent  main  6-9%     this tree  6-11%
share of extent kept     main  6-8%     this tree  6-8%
```

The two weighted forms collapse because a helmet legitimately flattens 20 mm of
crown to a 5 mm liner and legitimately hides most of what is left — they punish
the correct behaviour as hard as the wrong one. The bin count moves but not far
enough to carry a bar that fails the shipped geometry without also failing this
one. Separating "thinned" from "compressed" on the CPU is still open.

**The lesson is not about that column.** The instrument that catches this
regression already existed and was already red: `cosmetictest`'s "every paid
hairstyle still reads under every helm that is not a hood" measures the
SILHOUETTE against Shaved through a camera — a fixed reference and a projection,
which is what a player actually has. The head stack shipped anyway because the
wave was judged on `wearmeasure`. **A gate nobody runs measures as little as a
gate that measures the wrong thing.**

### THE NEW ASSERTION — the ladder is measured against ITSELF, not only Shaved

Every rung in the table above is compared to a bare scalp, and that question
asked on its own has a hole straight through the middle of it: **two paid rungs
can each clear the bar against Shaved and be the same object as each other.**
That is not a hypothetical, it is the owner's exact wording — "a 40-gold Long
Mane and a 100-gold Braided War-locks are pixel-identical" — and the table
printed 0.05% and 0.05% under the Sutton Hoo and passed both.

`cosmetictest` §3 now also asserts **"no two PAID hairstyles are the same shape
as each other under any helm that is not a hood"**, at the file's existing
`IDENTICAL_PCT` (0.05%). No new threshold, and the hood keeps the one exemption
it already has, in the same place, for the same reason.

**Proof it bites, and proof it is not a duplicate of the check beside it.** The
war-locks' masked build was made identical to the mane's — same gather, plaits
stood down — and the run is unambiguous about which assertion sees it:

```
  PASS  every paid hairstyle still reads under every helm that is not a hood — all clear
  FAIL  no two PAID hairstyles are the same shape as each other under any helm that is not a hood — 1 merged
        MERGED  Long Mane (40g) and Braided War-locks (100g) are the same shape under The Sutton Hoo Helm — 0.00%
        the closest paid pair anywhere is Long Mane vs Braided War-locks under The Sutton Hoo Helm at 0.00% (bar 0.05%)
[cos] 15/16 checks passed
```

The old check passes on a shop that sells one shape twice. The new one does not.
On the shipped tree the closest asserted pair is 0.73%, under the Sutton Hoo.

### Proof both rulers still bite

`hairCeil`'s helm branch put back to a 25 mm standoff — hair through the bowl.
Re-run on this tip, because `hairCeil` gained a third argument and a ruler that
was proven to bite before a change is not proven to bite after one:

```
[wear] iron         long        6.8     50.00      77.0      51   -106/24 deg   <-- FAIL
[wear] iron         braids      6.8     50.00      85.5      61   -106/24 deg   <-- FAIL
[wear] crowned      long        5.4      1.05      67.9      30   -54/24 deg    <-- FAIL
[wear] suttonhoo    short       8.7      3.85      53.7      20   54/6 deg      <-- FAIL
[wear] FAIL: 14/30 hair-and-helm pairs keep to the stack
```

And the probe's own rim rule gained its missing half. The table is star-shaped
about the skull's centre, so a point BELOW a garment's free lower edge is at a
bigger radius than the edge and lands in the edge's own bin — hair hanging out
from under a cheek plate read as hair standing through it. The probe already
refused to make that mistake sideways and applied the reasoning to one bin of
AZIMUTH only; a hem 110 mm below the head's centre spans a dozen bins of
elevation. `coverLo` is that fix.

---

## THE ARMOURY JUDGEMENT — 7 Aug 2026 — SHIPPED on `main`

The owner's five complaints, judged from frames on this tip. **Four of the five
moved. One did not, and one fix bought its win with a cost nobody measured.**

`art/shots/` is gitignored, so the paths below are regenerable, not committed:
`npm run shots -- finishroster` (28 panels, ~45 s each, ~21 min).

### CLOSED — "Warden permanently has a green lower half no matter the finish"

This was the sharpest complaint and it is the cleanest fix. Live, the warden's
tunic was `CLASS_TUNIC.warden = 0x5a6630`, **hue 78° olive, in all seven
finishes** — `ap.armorColor` fed only `M.armour(...)`, which tints mail. It is
now `tunicDye(kit.tunic, accents)`, and the hue by finish is:

| finish | live | branch |
|---|---|---|
| Rough Iron | 78° | 42° |
| Polished Steel | 78° | 193° |
| Blackened Steel | 78° | 42° |
| Bronze Scales | 78° | 37° |
| Crimson Warplate | 78° | 18° |
| Sea Queen's Gift | 78° | 188° |
| Bretwalda Gold | 78° | 44° |

Proven in frames, not only in arithmetic:
`art/shots/cards/finishroster-1._Rough_Iron_0g_warden.png` is an olive-khaki
skirt over tan leg wraps; `…-6._Sea_Queen_s_Gift_130g_warden.png` is a **teal
skirt, navy mail and white wraps**. The whole man moves, not the shirt.

**Residual:** at Rough Iron — the free default, which is what a player who has
bought nothing sees — the tunic is still a yellow-olive (42°). It is browner
than live and it is no longer *permanent*, but the first impression of the
warden is unchanged until the player spends. That is the honest limit of this
fix.

### OPEN, NEW, AND CAUSED BY THE FIX — the four classes now wear one tunic

`tunicDye`'s comment claims the class "shifts hue a fifth of the way … so four
tunics stay four tunics." **The frames and the arithmetic both say otherwise.**
Mean pairwise RGB separation across the four class tunics, against live's fixed
constants (27.8):

```
LIVE  (class tunic fixed, same in every finish)          27.8
BRANCH  Rough Iron          8.8   (32% of live)   <-- the free default
BRANCH  Polished Steel      4.6   (17%)
BRANCH  Blackened Steel     2.5   ( 9%)   <-- all four classes are one colour
BRANCH  Bronze Scales       9.1   (33%)
BRANCH  Crimson Warplate   10.0   (36%)
BRANCH  Sea Queen's Gift   14.3   (52%)
BRANCH  Bretwalda Gold     12.0   (43%)
```

The cause is one line: `s = min(0.6, a.s * (0.72 + b.s))`. Saturation is
*multiplicative* in the dye lot's own saturation, so when the lot is near-neutral
(Blackened Steel's `0x3a3733`) every class lands on the same grey and the 0.2 hue
shift has no chroma to be visible in. Class lightness cannot rescue it either —
all four accents sit at L 0.29–0.31, so they were never separating on value.

This is a **regression in class readability against live**, and it applies at the
free default, not only to players who buy. It ships because the classes still
read apart by silhouette, weapon, helm and cloak (`art/shots/lineup.png`), and
because reverting it would restore the owner's own complaint. It is the
predictable next complaint — *"all my characters look the same now"* — and it
should be the first thing the next wave fixes.

**The fix is known and measured, not guessed.** An additive class-chroma term
plus a stronger hue weight roughly doubles separation for ~13% of finish travel:

```
hue 0.20  satAdd 0     mean class sep  9.0   finish travel 24.2   (shipped)
hue 0.34  satAdd 0.18  mean class sep 14.3   finish travel 23.5
hue 0.40  satAdd 0.22  mean class sep 18.3   finish travel 21.1
```

Not applied this wave: it is a look change to all four classes in all seven
finishes, and the 28-panel sheet that would prove it costs 21 minutes of the
capture channel. Do it with the sheet, not without.

### CLOSED — "no cloak option"

`cloak_none` has existed since the initial commit. The defect was that
`.tab-strip` cut the eight tabs at **"CLO…"** on a 1440 desktop, so CLOAKS,
ARMOUR FINISH and WAR PAINT were unreachable with a mouse — worse on desktop
than on phone, which can swipe. The strip now wraps above 700 px.
**A/B: `art/ui/live-helmets-desktop.png` (cut) vs `art/ui/wave-helm-desktop.png`
(two rows, all eight reachable).** Phone keeps the strip and is untouched
(`art/ui/wave-helm-phone.png`).

### CLOSED — the Roman banded plate is off the warden

`lorica segmentata` — six rigid courses, plate yoke, iron shin plate — is gone;
he wears a hip-length mail byrnie, a shoulder doubling and cross-gartering. The
`lamellar` boolean is renamed `wallman` so the flag stops naming armour that is
no longer on the model. Visible in `art/shots/lineup.png`.

### OPEN — the head is a lateral move, and the shop's light is the reason

The beard no longer swallows the mouth: live's default Close Crop ran to
`Y_LIP + 0.045` and buried an `addMouth` nothing could see. On this tip the mouth
is the gap between two masses. **But at portrait size the beard now reads as
scattered dark flecks on a pale, washed-out cheek rather than as hair** — see
`art/ui/wave-helm-phone.png`, where the mannequin is largest. Live's solid dark
beard read *worse anatomically and better as a character*.

The largest single cause is not geometry: it is `armouryStage.ts` exposure. The
same head reads well under the arena's dusk key (`art/shots/final/`) and pale and
blotchy in `art/ui/wave-helm-*.png`. **The owner is looking at the shop.** Fix
the shop's key light before touching the head again.

### The gate this shipped on — every final line, on this tip

```
npm run build                        exit 0 — 14 routes, all ƒ (Dynamic)
npx tsc --noEmit                     TSC EXIT 0
npm run lint                         ✖ 11 problems (9 errors, 2 warnings)   [bar 12]
npm run playtest                     [playtest] 34/34 controls working              EXIT=0
npm run touchtest                    [touchtest] 27/27 touch assertions passing     EXIT=0  (2nd run)
node tools/firetest.mjs              [firetest] 7/7 claims proven                   EXIT=0
npm run profiletest  (with DB)       [profiletest] 68/68 checks passing             EXIT=0
npm run profiletest  (no DB)         [profiletest] 22/22 checks passing             EXIT=0
npm run soundtest                    [soundtest] 22/22 claims proven                EXIT=0
node tools/phonesound.mjs            [phonesound] 7/7 claims proven                 EXIT=0
node tools/bindsynctest.mjs (DB)     [bindsync] 8/8 checks passing                  EXIT=0
node tools/cameratest.mjs            [cameratest] 13/13 passed                      EXIT=0
npm run summaryflow                  [flow] 14/14 passed                            EXIT=0
npm run cheattest (fresh postgres)   [cheattest] 40/40 checks passing               EXIT=0
node tools/latencytest.mjs judder    JUDDER VERDICT: 17/17 checks pass — PASS       EXIT=0
node tools/headmeasure.mjs           3 ratios outside tolerance · 0 of 15 SILHOUETTE FAILED
node tools/wearmeasure.mjs           [wear] PASS: 10/10 helmets seated              EXIT=0
npm run cosmetictest                 [cos] 18/18 checks passed
                                     [cos] 19 rendered captures, 744.1 s wall clock
                                     [cos] PASS                                    EXIT=0
npm run perf                         low 743 draw calls · medium 3785 · high 4280  EXIT=0
```

`perf`'s frame times on this box are swiftshader, not a device, and mean nothing.
**Draw calls are the comparable number and they are identical to the pre-judgement
run** — 743 / 3785 / 4280 — so nothing in this wave costs a frame.

**touchtest took two runs, and the flake is now diagnosed rather than shrugged
at.** The failing term is not the facing error — that was **1.3°**, well inside
the 0.5 rad bar. It is `yawTravel > 0.15` in `tools/touchtest.mjs:521`, a guard
that requires the camera to have turned at least 8.6° so the assertion cannot
pass on a target that never moved. The bot happened to walk almost radially, the
camera only needed 4°, and the guard could not confirm tracking. The lock was
working perfectly in the run that failed. **Do not "fix" this by loosening the
bar** — the guard is correct and the retry policy is the right answer.

`bindsynctest` also exits 1 with no database; it needs `PROFILE_TEST_DB` and
says so. That is not a flake and not a defect.

**The repricing is economically safe, and this is the run that proves it** —
20–60 g became 60–160 g in `cced17b`. Ownership is a set of **ids**
(`src/db/catalogue.ts:144` `if (ownedSet.has(id)) continue`), and no id or stored
hex moved, so nothing already bought is re-billed and no profile is orphaned.
`cheattest` 40/40 on a fresh postgres is the outside check on that.
**It is still a price rise, and a price rise is the owner's call, not ours.**

### PARTLY CLOSED — ten helms, and you *can* tell them apart

`art/shots/helm-cards.png`, captured on this tip (10 panels, one huscarl, one
mark, one camera). The owner's "pointed dark shapes with wing-like flares" is
**not what this lens shows** — at portrait they are bright polished steel, and
six of the ten are unmistakable:

| distinct | Bare Head · **Shadow Hood** (now black wool, not a red balaclava) · Boar-Crest (gold boar) · Jarl's Crowned (circlet + spikes) · **Sutton Hoo** (full mask, intact — no regression) · Ridge Helm |
|---|---|
| **too alike** | **Iron Spangenhelm / Nasal Helm / Spectacle Helm** — three near-identical domes separated only by a nasal bar and a small apex spike |
| **also alike** | Ridge Helm vs Wyrm-Crest — both a dome under one big curved arch |

So the helm complaint is **half real**: the ladder is not ten dark cones, but
30 g, 110 g and 280 g buy three shapes a player cannot tell apart. That is the
rung to fix, and it is a narrower job than "rebuild the helmets".

### OPEN, AND THE LOUDEST THING IN THE FRAME — the face is speckled

The beard fix worked: the mouth is no longer buried. **But at ~400 px of head
the face carries scattered dark brown flecks across cheek, forehead and jaw that
read as dirt or scabbing rather than as stubble** — plainest on
`art/shots/helm-cards.png` panel 1 (Bare Head) and on `art/ui/wave-helm-phone.png`,
where the mannequin is largest.

**This is not scored as a regression**, and the reason matters: the same cheek
speckle is present in the live capture `art/ui/live-helmets-desktop.png`, so it
predates this wave. What the wave changed is that the beard no longer *hides* it.
Thinning the beard revealed a skin defect that was always there.

Both causes are already named and neither is geometry on the beard:
`armouryStage.ts` exposure (the same head reads fine under the arena key in
`art/shots/final/`), and the complexion stamp. **Fix the shop's light first** —
it is one number and it is what the owner is looking through.

### OPEN — the helmets were diagnosed and deliberately not touched

"Pointed dark shapes with wing-like flares" localises to two numbers: the `cone`
bowl at taper `1.15` is a near-linear rise (a straight-sided cone with a sharp
apex), and the nape fall starts at `skullY + R.y * 0.47` — above the head's
centre — and flares to `R.x * 1.38`, which reads from the front as two wings
behind the face on ridge/boar/crowned/wyrm. Not changed without a before-shot to
A/B against; the risk was regressing the Boar-Crest and Sutton Hoo, and
`docs/SUTTON-HOO.md` is about exactly that failure. Sutton Hoo is captured
intact at `art/shots/final/facecard-helmhelm_suttonhoo-…png`.

---

Current reference: **`art/shots/v12/`**. A/B against `v11/`.
The head's own turntable: **`art/shots/judge9c/`** (portrait) and
`art/shots/judge9b/head-turn-fight.png` (fight range). A/B against
`art/shots/judge/`, which is the capture the owner's three notes came off.

**The A/B against what is LIVE**, taken for the land judgement below and the
only capture set in this file shot from two trees with one instrument:

```
art/shots/judgeA-high/  art/shots/judgeA-med/  art/shots/judgeA-low/   origin/main cfb49fc  (LIVE)
art/shots/judgeB-high/  art/shots/judgeB-med/  art/shots/judgeB-low/   this branch 60fbeae
```

Regenerate with `node tools/shoot.mjs headturn headturnfight --quality
{low,medium,high} --out <dir>`, one tier at a time, from a production build.
`--quality` is what makes a two-viewport judgement possible at all: sheets use
the card's own fixed lens so `--w/--h` never reaches them, and `detectTier()` on
a headless box always answers the same thing. **desktop = `high`, mainstream
phone = `medium`, weak phone = `low`** (`render/quality.ts:204`).

---

## THE LAND JUDGEMENT — 6 Aug 2026 — SHIPPED, and what shipped broken

76 commits went to `main` at this tip. The test applied was **not** "does the
head reach 8" — two judgements have already held this branch on that bar and
between them kept the reticle, the helm seating, the cosmetic harness, the sweep
table and the platform correction off the live game for two days. The test
applied was **is anything here a regression against what live players have
today**, measured from frames of both trees.

**Nothing was.** Everything below is a fault that SHIPPED. It is here so the next
wave inherits a list instead of rediscovering it.

### What the head A/B actually shows, by tier

| bearing | live `cfb49fc` | branch `60fbeae` | verdict |
|---|---|---|---|
| profile, desktop | no nose — a pug bump on an egg; ear is a **torus with daylight through the middle**; chin runs straight from lip into the throat | nasal bridge and dorsum, a mental fold, a gonial corner, an ear that is a closed shell with helix, concha and lobe | branch |
| three-quarter, desktop | a hard faceted **plane break** creasing inner brow to jaw | no crease | branch |
| back 180°, desktop | one unbroken egg | inion, nuchal hollow, lambdoid flattening, temporal plane | branch |
| front, desktop | painted slash brows and two dark slots on a smooth ball | brow that casts, orbits, nose with a tip, vermilion, chin | branch |
| **skin, every bearing, every tier** | a ruled square lattice of identical stamps — the woven cross-hatch. Forehead patch, band-passed 3–12 px: lattice peak **18.20x** the band mean | soft incommensurate mottle: **7.91x** at `high`, **11.84x** at `low` | branch |
| **fight distance, every tier** | ~35 px of pale blob | ~35 px of pale blob | **no difference either way** |

The fight-distance row is the one that decides "regression": the lens a player
spends the match behind cannot tell these two heads apart, so nothing a live
player does today got worse. The shop lens is where the branch's gain is, and it
is the lens 2400 gold is spent through.

### The gate this shipped on — every final line, on this tip

```
npm run build              ✓ Compiled successfully · 5/5 static pages            exit=0
npx tsc --noEmit           (no output)                                           exit=0
npm run lint               ✖ 11 problems (9 errors, 2 warnings)  — IDENTICAL on cfb49fc, pre-existing in src/
npm run playtest           [playtest] 34/34 controls working                     exit=0
npm run touchtest          [touchtest] 27/27 touch assertions passing            exit=0
node tools/firetest.mjs    [firetest] 7/7 claims proven                          exit=0
npm run profiletest        [profiletest] 22/22 checks passing                    exit=0
    with a database        [profiletest] 68/68 checks passing                    exit=0
npm run soundtest          [soundtest] 22/22 claims proven                       exit=0
node tools/phonesound.mjs  [phonesound] 7/7 claims proven                        exit=0
node tools/bindsynctest    [bindsync] 8/8 checks passing                         exit=0
node tools/cameratest.mjs  [cameratest] 13/13 passed                             exit=0
npm run summaryflow        [flow] 11/11 passed                                   exit=0
npm run cheattest          [cheattest] 40/40 checks passing   (fresh postgres)   exit=0
node tools/latencytest     JUDDER VERDICT: 17/17 checks pass — PASS              exit=0
node tools/headmeasure     3 ratios outside tolerance · 0 of 15 SILHOUETTE assertions FAILED
node tools/wearmeasure     [wear] PASS: 10/10 helmets seated                     exit=0
npm run cosmetictest       [cos] 18/18 checks passed · 47 options, 55 pairs      exit=0
```

`playtest` and `touchtest` both came back green **first run** this time. That is
not evidence the flake is fixed — see FAULT 5. It is one sample of a gate that
has been measured at one failure in three, and it is exactly the kind of run that
would have been believed.

`cosmetictest` regenerated `docs/COSMETICS-SWEEP.md` byte-identical to the
committed table apart from the date and the wall clock (1091 s → 929 s). A
harness that reproduces its own published output is worth more than the assertion
count beside it.

### What it costs, measured on one instrument against both builds

`tools/perf.mjs` copied into a worktree at `cfb49fc` and run against main's own
production build, so the counter is identical on both sides. The fps figures are
SwiftShader's and mean nothing; the draws and triangles are the same numbers a
player's phone renders.

| tier | draws `cfb49fc` | draws `60fbeae` | Δ | tris `cfb49fc` | tris `60fbeae` | Δ |
|---|---|---|---|---|---|---|
| **low** (weak phone) | 739 | **739** | 0 | 307,889 | **341,183** | **+10.8%** |
| **medium** (the phone) | 3801 | **3737** | **−64** | 1,731,422 | **1,820,952** | +5.2% |
| **high** (desktop) | 4304 | **4234** | **−70** | 2,400,620 | **2,431,854** | +1.3% |

**Draw calls fall or hold on every tier.** Triangles rise, and all of the rise is
the head: `LOD.low` went 14×10 → 30×30 and `LOD.medium` 30×30 → 40×44, bought
partly back out of `body` and `limb`. That is a real cost paid on the tier phones
get, for a head that still does not pass — **it must not rise again before the
head reads.** These are the recorded baselines now.

### FAULT 1 — the phone floor under-samples a face that now has content

**Ships. Measured. Worst thing on this list.**

`art/shots/judgeB-low/cards/headturn-front_0_.png` against
`art/shots/judgeA-low/cards/headturn-front_0_.png`. At `low` the branch's nose,
philtrum and chin read front-on as **one continuous keel** from brow to below the
jaw, with the mandible closing to a V. Live's front-on at the same tier is a
featureless egg with painted brows. Both fail axis 5; the branch fails it
differently, and a keel is a louder failure than a blank.

The cause is arithmetic and it is in the file already. `LOD.low` is
`headU: 30, headV: 30` (`characters.ts:1655`) — raised from live's **14×10**, so
this branch is a large improvement at this tier and still under Nyquist for the
tightest creases, which the comment above the table admits in as many words. The
mesh can see the brow, the socket and the dorsum; it cannot see the alar crease
or the columella undercut that give the nose sides, so the sides vanish and what
is left is the midline.

**Do not fix this by flattening the nose.** The two honest fixes are (a) take
`low` to the same 40×44 the other two tiers carry — the head is one merged
geometry per warrior and the note at `characters.ts:1630` already argues this is
a correctness number, not a quality one — and measure the cost at the tier, or
(b) widen the alar and columella terms at `low` only, the same way the philtrum
was widened to clear its own sampling limit. (a) first; it is one number.

**It is not a regression:** a `low` device is a weak phone (`cores <= 4 ||
memoryGb <= 4 || minDimension <= 320`), a mainstream phone gets `medium`, and
`medium` on this branch carries the full 40×44 head where live gives it 30×30.

### FAULT 2 — the mass relation is still open, and it is still unmeasured

Unchanged from the entry below: front-on is the weakest bearing at every tier and
the read is "a small face on a large smooth dome". Four proportions have now been
measured and all four are at or better than life (`facePanel` 0.795 against 0.72,
`craniumShare` 0.342, `breadthOverHeight` 0.703, `lengthOverHeight` 0.843), so
**stop reaching for the proportions**. The two candidates in order are the
features' share of the face and the complexion narrowing what geometry made
broad. Neither is measured.

### FAULT 3 — three ratios still outside tolerance, and two of them measure a covered throat

`node tools/headmeasure.mjs` → `3 ratios outside tolerance · 0 of 15 SILHOUETTE
assertions FAILED` (was 6 and 0 of 12 at the last judgement).

```
jawOverCheek     0.774 0.788 0.807   0.860±0.080   OUT by 0.006
neckOverHead     0.824 0.843 0.866   0.750±0.090   OUT by 0.026
neckOverJaw      1.039 1.087 1.123   1.000±0.120   OUT by 0.003
```

`neckOverHead` and `neckOverJaw` are asserted on a huscarl whose `CLASS.gorget`
is `1.0` — the throat is a leather collar from jaw to yoke and no skin neck is
visible on the class every head sheet is shot on. **Retire them or re-site them
on a `gorget: 0.0` class** (runekeeper or berserker). `jawOverCheek` is rounding
against a bizygomatic that is 22% over life by art direction; rewrite the
tolerance or delete it. Nothing here is worth sculpting for.

> **CORRECTION — do not act on the paragraph above.** `CLASS.gorget` IS READ BY
> NOTHING. `grep -rn gorget src/` returns the field declaration, the four class
> rows and these two notes, and no consumer anywhere in the build. The huscarl's
> `1.0` has never covered a throat: there is no leather collar, and the neck he
> is measured on is bare skin from the jaw to the tunic collar, exactly like the
> berserker's. So `neckOverHead` and `neckOverJaw` measure what they say they
> measure, and both are load-bearing — retiring them on the strength of a number
> that does nothing would have thrown away the only two instruments watching the
> shape the owner went on to complain about. The error came from taking a table
> at its word instead of grepping for its reader, which is the same mistake as
> trusting a comment over the neck's own material: see the note over
> `emit("neck", …)` in `characters.ts`.

### FAULT 4 — the phone lost the flick chevrons with the gunsight

The old lock reticle drew a pair of chevrons on mobile only, saying which way the
thumb goes to take the next man. The quiet mark that replaced it does not
(`GameHud.tsx`, the `isMobile.current && (...)` block is gone). The gesture still
works and `touchtest` still proves it; what went is the affordance that told a
new player it exists. Small, real, and cheapest to fix in the tutorial line
rather than by putting ink back on the glass.

### FAULT 5 — two gates are not deterministic, and one of them was believed

Carried forward and **still open** — see the entry further down. `touchtest` fails
about one run in three at 160° of facing error; `playtest` fails about one run in
three on a mouse sweep its own harness did not register. Two runs agreeing is what
a person uses to decide something is real, and here two runs agreed on a false
positive. Both need their input synthesis to wait on the client having *received*
the pointer delta rather than on a wall clock. **This is the top item of the next
wave** and it is the only thing on this list that makes a verdict untrustworthy
rather than a picture ugly.

### FAULT 6 — the shop still sells four cloaks that are one mesh, at portrait

`npm run cosmetictest` is **18/18** and the three 0.00% shop pairs are closed at
fight distance. What is not closed is the price ladder itself: the geometry now
differs, but `COSMETICS-AUDIT.md §5`'s cut/reprice list has still not been acted
on, and all four war paints remain byte-identical under the Sutton Hoo mask (a
110g paint invisible under a 2400g helm). Correct behaviour from the mask; a shop
problem at the till.

### FAULT 7 — two unexplained console errors on the phone armoury load

`net::ERR_CONNECTION_RESET` and a `404`, reproduced on both `armourycard.mjs` and
a bare probe at 390×844. Named twice now and diagnosed never.

---

## The head, pass eight: the ear, the crease and the grid are closed; the mass is not

**Read this before touching the face.** Eight passes now. The method that finally
holds is from the seventh and must not be lost: the profile is AUTHORED as an
outline (`SAGITTAL`) and the midline is PINNED to it, and the gate asserts on the
SILHOUETTE rather than on ratios between landmarks. Do not go back to tuning
gaussians against a list of adjectives.

This pass took the owner's three notes off `art/shots/judge/cards/`. Two are
closed with a frame behind them, one is half closed, and the honest verdict on
the remaining half is at the bottom.

### 1. CLOSED — the ear was a torus with daylight through it

The build was `ball + torus + ball + torus + ball`. A sum of primitives has no
outline, which is the identical failure this file already diagnosed and fixed for
the head itself, and two things followed from it: the ring's hole is only covered
from the one bearing it was checked at, and every primitive was seated at a
single half-breadth taken at ONE latitude while the skull it lands on tapers — so
the bottom of the rim stood outside the head and the sky came through under it.

Now ONE closed radial shell per ear (`EAR_OUTLINE`, `EAR_SECTION`, `earPoint`,
`auricle`), 58 x 33 mm, with a helix crest, an antihelix, a tragus and a concha
floor that is closed at the back — and with the rim's depth **measured** per angle
off the skin it lands on rather than authored, then buried by `EAR_SEAT`.

**S6 was the other half of this defect and is the more important fix.** It was one
number, `earStandoff`, and it passed at 12.7 mm on the torus — because a standoff
is a property of one curve and cannot tell a shell from a curtain ring nailed to a
head. It is now four numbers, and the one that bites is `earSeat`: the worst point
of the rim against the skin under it, which must be NEGATIVE. Proof that it bites
rather than merely being present — re-seating the rim on a plane, as the five
primitives did, and running the gate:

```
  earSeat                 13.364    14.699    16.254  -9.000..-0.500   FAIL
[head] FINAL: 6 ratios outside tolerance · 1 of 15 SILHOUETTE assertions FAILED
```

### 2. CLOSED — the mid-face plane break, and it was an envelope

"A hard-edged plane break creasing from inner brow to jaw at three-quarter, and
the nose reads as an upturned pug with the subnasal mass pushed forward as one
block."

Both halves are one line. The pin splits its residual into a broad half (the
facial skeleton coming forward off the braincase) and a narrow half (the tip over
the subnasale, the vermilion over the fissure), and **both were being delivered
through `massEnvelope`** — a plateau with a shoulder. That is correct for the
plate, because a maxilla is genuinely flat across the front of a face. On the
narrow half it puts a flat panel down the middle of the face out to 0.16 rad and
then a shoulder, and since `PIN_W` widens as it descends (0.35 at the nose, 0.58
at the lip, 0.62 at the chin) the shoulder sweeps outward as it falls. Inner brow
to jaw. The flat top is the pug.

`ridgeEnvelope` — a raised cosine, zero derivative at the midline and zero again
at the edge — replaces it on the narrow half only. The midline profile is
untouched (the envelope is 1 at bearing zero), so every S1/S2/S3 assertion holds.

Two more things the frame said were missing and the arithmetic agreed with:
- **the philtrum was below Nyquist ACROSS.** 0.035 of sigma in x against 40
  columns, which is 0.157 rad — four and a half times under. There was nothing
  there to see. 0.085 now, which is half the column spacing and also a 14 mm
  philtrum, with its two crests.
- **no mental fold.** Three rows straight from pogonion to gnathion is an arc.
  `SAGITTAL` gains a row at −0.820 holding the chin's front face out, so the drop
  to gnathion is a corner. `gonialOverArc` 4.77 -> 6.42.

### 3. HALF CLOSED — the cranial vault

"An unbroken egg. Enormous, smooth, featureless at 180 degrees, with a small face
crammed into its lower front quarter."

What the vault now has, and the 180° and 90° panels of `art/shots/judge9/` show
all three: an **occipital curve** (the inion as a distinct mass with the nuchal
plane hollowed under it, and a lambdoid flattening above, so the back reads as two
planes meeting at a landmark instead of one arc), a **temporal fossa** — a broad
6 mm plane from the lateral orbit back to the ear with a superior temporal line
above it, where what was there before was a 2.5 mm thumbprint — and a **brow that
casts**.

The brow is worth a paragraph because the obvious fix is wrong and costs an hour.
Raising the ridge's crest to steepen its underside takes the shop from 10/10
helmets seated to **2/10**: every helm in the game seats its bowl on that exact
band and `wearmeasure` puts the clearance under a millimetre. The overhang is the
same angle whether you lift the ridge or drop the skin under it, and only one of
those grows the head into the bowl sitting on it. So the crest keeps its 9 mm and
the orbital margin below now cuts 9 mm instead of 4.

**What is NOT closed: the mass relationship.** Front-on
(`art/shots/judge9c/cards/headturn-front_0_.png`) is still the weakest bearing by
a distance and the read is unchanged: a small face on a large smooth dome. This
is the same item the seventh pass logged and could not measure.

**A new measurement, and it DISPROVES the standing theory.** `facePanel` asks how
much of the head's breadth the face occupies at the eye line — swept from outside
the nose at bearing 0.30 out to where the surface has fallen 15 mm behind the
cheek, which is where a viewer stops reading "face" and starts reading "side of
head". The theory for three passes has been that the face is narrow. **It is
not:** 139–164 mm of panel on a 176–206 mm head, 0.76–0.83 against a life 0.72.
The face is if anything slightly broader than life.

So the read is real and it is not breadth, and it is not `craniumShare` (0.338
against a canon 0.35), `breadthOverHeight` (0.703 against a life 0.67) or
`lengthOverHeight` (0.843 against 0.845) either. All four now measured, all four
at or better than life. Whatever carries this read is something else, and the next
pass should stop reaching for the proportions.

*(A warning for whoever writes the next probe: the first cut of `facePanel` took
its datum at the midline and reported 0.116 — a face a ninth of the head's
breadth — which would have sent this straight back to widening a face that is not
narrow. At the eye line the MIDLINE IS THE NOSE, so a fall measured from bearing
zero is the nose's own falloff. `headSilhouette`'s S7 note says exactly this and
it got made anyway.)*

**The two candidates left, in order.** Neither is measured:
1. **The features' share of the face, rather than the face's share of the head.**
   The eyes, nose and mouth occupy a vertical band from `Y_EYE` to `Y_LIP` — about
   a fifth of the head's height — with large unbroken cheek, temple and forehead
   around it. Larger, fewer, more certain features is the stylised answer and it
   costs nothing in geometry.
2. **The complexion is narrowing what the geometry made broad.** The panel is
   151 mm and the LIT part of it front-on is far less than that. This file has
   already caught the same field painting the face narrow once ("the silhouette
   measures 190 mm at the cheekbone against 163 at the jaw, which is a broad face.
   It was being *painted* narrow") and halved the buccal terms for it. Measure the
   luma across the face at the eye line on the front card before touching any
   geometry.

**What the next pass should do about it.** Take the owner's explicit offer and
commit to the stylised head rather than to realism: the face's job is the armoury
portrait at 300–400 px where a player spends 2400 gold, and at fight distance the
judge already found "no defect, no character" in a 30 px blob. The vault work
above is that choice being made — confident planes with landmarks between them —
and the next lever is the same one applied to the face: fewer, larger, more
certain features. **Do not** do a parameter sweep, and do not reach for the nose.

### What it costs

Same instrument, low tier, `dd7821f` against this tip:

```
was   739 draw calls  337,615 triangles      (this branch, before this pass)
now   739 draw calls  341,189 triangles
```

Draw calls unchanged. The ear itself is *cheaper* than the five primitives it
replaces — 28 x 9 quads is 504 triangles a side against 406 for the ball, torus,
ball, torus, ball, but the shell carries two materials into the head's merge where
the primitives carried three, so the material count came down as the triangle
count went up. The rest of the +3,574 is the cloak and beard work landing in the
same window, not the head.

### Two new defects on the ear, logged rather than chased

Both are on the shell this pass built and both are visible in
`art/shots/judge9c/cards/headturn-profile_90_.png` at 7x.

1. **A violet rim down the inner wall of the helix.** 69 pixels, mean RGB
   (153, 85, 100) against skin at (202, 113, 68) nearby — much more blue at
   similar red, which is the night sky. The inner wall of the rim is the one
   steeply up-and-outward-facing surface on the head, so it takes the arena's cool
   hemisphere and environment square on over a warm albedo. It is not the shade
   tone (0x9b7456 is brown) and it is not the complexion's flush (which removes
   blue). Left alone deliberately: it is an interaction with the arena rig and the
   environment intensity, not with the head, and this wave owns the head.
2. **The bowl is faintly faceted.** Fixed once already this pass — seven radial
   rings put the helix crest at 0.78 between samples at 0.714 and 0.857, so the
   rim was a chord across its own peak and the facets read as a spider of radial
   creases. Nine rings land on 0.222 / 0.444 / 0.778 against control points at
   0.20 / 0.44 / 0.78. What is left is mild and is the angular count (28), not the
   radial one.

### The tape measure itself was wrong twice, and both are fixed

Worth its own heading because two of the six out-of-tolerance ratios were the
INSTRUMENT and no amount of sculpting would ever have closed them.

- **`noseProjection` (+0.43) and `chinBeyondNasion` (+0.93) were measured against
  the middle of the man's forehead.** The nasion is found by sweeping for the
  deepest point of the nasal root, and the band ran to `Y_BROW + 0.10` — a tenth
  of the field ABOVE the glabella. A nasion is by definition below it. On a
  forehead that correctly rakes back 12°, the deepest point in that band is the
  frontal bone at y = 0.319, where `SAGITTAL` reads −10.7 mm against the nasion
  row's −5. Bounded at the glabella, and `nasionFromCrown` is now published beside
  it so a probe that wanders onto the forehead says so.
- **`tipBreadth` (+4.05, 15–31 mm across seeds) was `F.asym` doubled.** The owner
  called it an unpinned parameter and was right that it was not a tuning error,
  but the parameter is not on the nose. `tipHalf` swept ONE side and doubled
  `|p.x|`, on a face whose midline is deliberately drifted up to 2.2 mm sideways
  ("a symmetric face is a mask") — so 2 x 2 x 2.2 = 8.8 mm of the 12 mm spread was
  the drift. Bisecting every trait confirms it: forcing `span(seed, 18, …)` alone
  to zero drops the spread from 11.9 mm to 3.9, and no other trait moves it by
  more than 1.4. A nose displaced sideways is not a wider nose. Measured between
  the two sides, and with the ridge narrowed now that the plateau no longer has to
  be hidden: **18.6–23.2 mm**, a bulb.

Ratios outside tolerance: **6 -> 3**. The three that remain are `jawOverCheek`
(0.006), `neckOverJaw` (0.003) and `neckOverHead` (0.026), and the last two
measure a throat the huscarl's `gorget: 1.0` covers completely on the class every
sheet is shot on. They are not worth chasing; they are worth **deleting or
re-siting**, and that is the next honest change to this file.

### The skin was a woven cross-hatch, and it was the tile repeat

`FACE_TILE` was 8.5 mm, chosen by reading the recipe: the ridge field's base
octave lands at 1.1 mm, under a pixel, therefore grain. The frame disagreed. An
FFT of an 80x80 patch of the vault returns ONE sharp peak at 5.7 px with almost no
y component — a ruled square lattice, 4.7 mm at that card's 1.22 px/mm. Nothing in
the recipe is 4.7 mm. 8.5 / 4.7 is 1.8, and that is the tell: a 256-texel map at a
8.5 mm tile is 25 texels to a pixel, mip 4.6, an effective 10x10 map — every
octave the recipe was reasoned about is filtered away and all that is left is one
blob per tile, stamped every 8.5 mm.

**Pushing content under a pixel does not delete it, it hands it to the tile
repeat.** This file had already found the same thing twice on the ground (`grit`
in textures.ts: "sub-texel content there is not dither, it is crawl"). 2.2 mm puts
the stamp at 1.2 mm, 1.5 px at portrait. The variation it cost is bought back in
`faceComplexion` as three cosines on incommensurate periods in the skull's own
direction space — no lattice, wavelengths 16–40 mm. Measured on the new card, the
5.7 px peak is gone and the strongest remaining periodic content is at 26.7 px
with 5.5x less magnitude, which is the mottle.

---

## The domino mask was the complexion sum, and all three hypotheses are now closed

Kept as a record because it cost three passes.

- **Hypothesis 1, the shadow field.** Marked disproven by an earlier pass. It was
  *correct* and the pass that raised it only half-acted on it.
- **Hypothesis 2, the face block's lateral falloff.** Genuinely disproven — the
  frame moved 3.4% of its pixels and the mask stayed.
- **Hypothesis 3, the arena night rig's brow terminator.** Now also disproven,
  and by a stronger argument than a capture: this pass DELETED the face block,
  including the `smooth(Y_BROW - 0.05, ...)` step that put a hard edge exactly
  along the brow, and the mask did not move. A light does not survive its own
  geometry being replaced.

The cause is the sum in `faceComplexion`. The orbit term alone ran 0.22 of
direction space in x — ±42 mm — so two of them, one per eye, overlapped across
the midline and reached both temples: a domino mask drawn by one line, before the
paranasal, the under-brow crease and the buccal hollow were summed on top. The
knee capping the sum sat at 0.7, making the darkest tone reachable over an *area*
0.7 of a 30/37/42% cut. Orbit tightened to 0.150 and dropped to 0.72, paranasal
to 0.42, knee to 0.52. `art/shots/fix5/head-turn.png` front panel: the bat is
gone. **What is left** is a soft band under the brow that reads as form, and the
entry stays open only until a critic panel confirms that from a fresh capture.

---

## The hair and beard shop still sells differences that do not exist

Diagnosed this pass; only the first is fixed.

1. **FIXED — the long mane was two detached slabs from behind.** Arithmetic, not
   rendering: each half sat `R.x · 0.44` off the midline with a half-width of
   `R.x · 0.40` at its lowest station, so the two spans were [0.04, 0.84] and
   [−0.84, −0.04] — about 8 mm of daylight down the back of the head, widening as
   the hair fell, with only 11 mm of overlap at the crown (inside the wall
   thickness). Offset now 0.30 with every station widened; the halves overlap by
   40 mm at the fall. **Verified** in `art/shots/fix5/hair.png`, back row: no
   daylight through the mass, one volume with a crease down it.
   **Still wrong, and it is a different fault:** the mane reads as a boxy
   rectangular curtain with a hard vertical seam and a flat bottom edge. The
   audit's original complaint — "a flat curtain with a hard edge and no volume" —
   is only half answered. The six locks that were meant to break the edge are
   inside `lod.trim` and are not doing it. Hair needs a broken lower edge and a
   silhouette that is not a box before this slot is worth 40 gold.
2. **OPEN — all four hairstyles are pixel-identical under the Sutton Hoo mask.**
   Narrowed this pass: the same four styles are plainly *distinct* from behind in
   `art/shots/fix5/hair.png`, so the fault is specific to the masked row and not
   to the styles. NOT yet explained. Read the code and the four branches *are* distinct under a
   helm: `helmed` only flattens the scalp shell's lift, and the `long` fall and
   the `braids` plaits are added with no `helmed` guard at all. So either the
   mask's own geometry occludes them at the capture bearing, or the facecard's
   dress is not passing `hairStyle` through when `helm_suttonhoo` is set. Check
   the second first — it is a one-line bug and it would explain the war paints
   too.
3. **OPEN — beards 3/4/5 (40/80/120 gold) read as one crescent.** Also not
   explained by the code, which builds three genuinely different masses (a belly
   plus an offset copy; two tines parting at 64 mm; a three-strand plait with two
   brass rings). Every one of them shares the same chin mass from
   `skullY − 0.126` to `−0.20` and differs only *below* that. The neck was
   widened 10% this pass, so check first whether the throat now occludes the
   hanging part at the capture bearing — that would make all three read as the
   shared crescent and nothing else.

Both open items are worth more to a player than anything left on the head: a man
is being charged 120 gold for a beard he cannot tell from the 40-gold one.

---

## Two of the gates are not deterministic, and one of them was believed

`dd7821f` recorded touchtest failing once in three runs at 160 deg of facing
error and called it "a gate that fails a third of the time is not a gate". The
same is now recorded for **playtest**, which is the larger of the two and had not
been suspected.

On this wave's final tree, unchanged between runs:

```
run 1   [playtest] 33/34 controls working
        BROKEN: turning is reduced to the stated cap while committed
run 2   [playtest] 33/34 controls working      (reproduced)
run 3   [playtest] 34/34 controls working
```

The failing assertion reports `the client asked for 0.00 rad of turn and the body
delivered 0.00 rad` — the harness's own mouse sweep did not register during the
swing, not a turn cap that failed to apply. Nothing in the input path changed this
wave (`git diff --stat 39cbad3..HEAD` is characters.ts, headmeasure.mjs, docs and
.gitignore), so it cannot be geometry.

**Why this matters more than the flake.** Two runs agreeing is what a person uses
to decide something is real, and here two runs agreed on a false positive. Any
verdict on this branch that rests on a single playtest or touchtest run is worth
less than it looks. Both harnesses need their input synthesis made deterministic —
wait on the client having *received* the pointer delta before sampling, rather
than on a wall-clock timer — before either is trusted to gate a release.

---

## The mute on the war rolls has never met a database

**What is proven.** The mute is remembered on the device — `phonesound` taps the
toggle at 390x844 and reads `bretwalda.audio.muted=1` back out of localStorage
with the destination measuring 0.0001 — and the column, the view, the write and
the sync are all in place: `players.muted`, `ProfileView.muted`,
`setPresentation`, `POST /api/profile/equip { muted }`, `syncMuted()` in
`profileLink.ts`, hydrated at boot beside the key bindings.

**What is not proven.** `npm run profiletest` skips its whole database half
without `PROFILE_TEST_DB` — it prints `no PROFILE_TEST_DB set — skipping the
database half` and then runs the eleven no-database checks — so on this box the
22/22 says nothing about the new column. No `soundtest`/`phonesound` assertion
covers it either; both are client-side.

*Land judgement, 6 Aug:* the database half **was** run against a real postgres
on this branch's tip — `PROFILE_TEST_DB=... npm run profiletest` → **68/68**
against the 22/22 the bare run reports. That proves the database path works; it
still does not prove the *mute* specifically, because no assertion in that 68
equips `{ muted: true }` and reads it back. The check named below is still the
work. What has changed is that "the harness cannot see the database on this box"
is no longer the excuse — start postgres, and the other 46 checks come with it.

**To close it**, run `PROFILE_TEST_DB=... npm run profiletest` and add a check
beside the bindings ones at `tools/profiletest.mjs:207-232`: equip with
`{ muted: true }`, read it back off `/api/profile/me`, recover onto a second
device by the four words and confirm the game is still silent there. The risk if
it is wrong is small and one-directional — a mute that does not follow the
player, never a mute that will not lift — but the boot rule is the part worth
testing: a device that is muted pushes its answer up rather than being un-muted
by the column default, and nothing has exercised that path against real rows.

---

## Nobody has heard any of this

Not a defect so much as the limit of the whole approach, recorded because the
next iteration should not mistake green harnesses for a verdict.

`soundtest` proves 21 claims about the samples — peak, envelope, spectral
ordering, voice budgets, silence before unlock — and `phonesound` proves 7 more
against a real suspended context on a phone viewport. Between them they prove
the audio is **not broken**. They cannot prove a single note of it is good. The
nine screen sounds are one instrument by measurement (2.47x brightest/darkest)
and the four materials are ordered as designed, and both of those facts are
consistent with a set that is measurably correct and unpleasant to listen to.

**The owner is the final ear.** The specific things a person should judge, in
the order they will grate first: the `refusal` (a flat second, deliberately
ugly — it may be too ugly to hear twenty times), the `tap` at 101 ms on every
button in the game (frequency is what makes a UI sound hateful, and this one
fires most), and whether `matchWon` at 1.03 s earns its length.

---

## Shield planks share one phase — the woven cell is gone, the repeat is not

**The mat read is fixed and a capture proves it.** `v8/portrait.png`'s shield is
unmistakable basketry: a grid of identical "П" glyphs, three per plank, with a
mirror axis down every tile. `v9/portrait.png` is painted boards with lengthwise
grain, and the same change shows on the ground litter, which was the loudest
waffle in the set — the plank at the hero's feet in `v8/closeup.png` is a diagonal
cross-hatch and in `v9/closeup.png` it is parallel grain with knots in it.
Measured on the portrait crop: sigma/mu over a pale board 0.438 -> 0.254, over a
crimson board 0.572 -> 0.315, and the row spectrum across the board drops ~40% at
every cycle from 1 to 12. The cause was not the tile size — it was that `wood()`'s
radial term is even in u, so every tile carried a mirror and a cathedral crown.
An integer `cath` term slides the crown off the tile without touching the wrap.

**What survives is the phase.** Every board still carries identical grain at
identical heights, because all seven planks are `BoxGeometry` merged into one
geometry with one material (`characters.ts:705`) and every front face has the same
0..1 UVs. No texture content can differentiate them; this has to be fixed where
the UVs are made. Two ways, and the second is strictly better:

- offset each plank's `uv` attribute by a per-index amount in the loop at
  `characters.ts:2608–2620`; or
- the per-call `tile?: number` on `TintOptions` this entry has wanted since v7.
  `materials.ts`'s `projectFromObjectSpace` derives UVs from `vSubstancePos` and
  `Part.merge()` bakes each plank's `xf(cx, …)` into its positions, so a world
  tile delivers the phase *for free* and gives the shield, the hut wall and the
  floor plank one grain. `WORLD_TILE` cannot take oak globally — world.ts's
  per-mesh repeats would all be overridden.

The paint quarters are a second density error on the same object:
`characters.ts:2619` builds them as `box(halfW*1.94, edge, 0.004)` with their own
0..1 v, so at `M.timber`'s repeat 3 the paint's grain is exactly 2x finer in v
than the board 2 mm under it. Same fix.

## The arena floor reads as cobbles — dry ones now, not wet ones

**Half of this is fixed and it is the half that mattered.** The water read is
gone: `v7/stance.png`'s blue-green pebbled sheet with cool sub-pixel glints is a
matte trodden floor in `v8/stance.png`, the white specular specks around the
boots in `v7/closeup.png` are gone, and the ground's fine-scale energy (3–12 px
band, row spectrum) is down 14.9 → 12.0% in `arena`, 23.0 → 14.6% in `closeup`
and 15.8 → 11.1% in `duel`. Splitting `wet` into standing water and `churn`, and
driving roughness up rather than clamping it down, did what it was built to do.

What survives is the *shape* of the relief, not its gloss. The floor still
carries a regular lozenge cell at 2–4 px that reads as pebbles or scales rather
than as churned earth — clearest across the whole foreground of
`v9/laststand.png` and in the mid-ground of `v9/arena.png`. It is not the
metre-scale rut waves `world.ts` added (those are 1.1–2.4 m and invisible at this
pitch); it is `buildGroundDetail`'s own normal map, which was always there and
which the sheen used to hide. Now that the surface is matte, its relief is what
the eye reads, and that relief is too regular and too isotropic to be mud.

The `held` term in `groundDetail` (`print*0.95 + well*0.5`, depth 0.46) is the
first thing to look at: `world.ts`'s world-scale film now covers part of the same
job.

**This is now the binding constraint on the shadow work, and it is unowned.**
The v9 lighting pass took the warrior shadow from below the surface's own noise
to about 2:1 above it, and it did that entirely by adding contrast — the mottle
underneath is untouched, measured at sigma/mu 0.373 on open lineup floor in `v9`
against 0.375 in `v8`. `lighting.ts`'s own note says a rig cannot subtract more
of the ground than it puts on it; the next real gain on axis 3 is either this
amplitude or a screen-space AO pass in `postfx.ts`.

**v10 attacked the amplitude from `world.ts` and the capture says it did not
reach the pixel.** The vertex-albedo field was re-banded away from the shadow's
wavelength (`fine` 1.18 m -> 3.8 m, `grit` 0.39 m -> 4.2 m, `blade`'s green swing
4.25:1 -> 1.78:1, `rut` slope 0.24 -> 0.14), and the field measured in isolation
improved by 25% in the shadow band. On the frame, band-passed floor sigma at
2–5 px is **flat to slightly worse in six of seven presets** (`arena` 10.76 ->
11.08 code values, `closeup` 10.89 -> 11.56, `brawl` 11.31 -> 11.86, `lineup`
6.85 -> 6.98, `laststand` 6.03 -> 6.13, `duel` 8.59 -> 8.49) and improves in
exactly one — `stance`, 6.35 -> 5.60, −12%, which is the preset whose camera is
lowest and closest and therefore the one where a world-scale term subtends the
most screen. That is the shape of a real but tiny win being swamped, and it
confirms rather than refutes the diagnosis in this entry: the relief the eye is
reading is `buildGroundDetail`'s, at 33 mm–11 cm, and it was not touched.
`world.ts`'s own note now records that the sub-2 m octaves of `mid`/`churn`/
`drainage` were tested and are *not* the culprit, so the next pass should not
re-derive that.

The specific term to cut is named and still unowned: in `buildGroundDetail`,
`height` takes `peb` from `sampleCell(bank.micro, u*2, v*2)` — ~33 mm on the
1.6 m tile — at `+0.16` into a `bump: 1.9` normal. That, not the `held`
roughness term this entry used to point at, is the 2–4 px cell. `dome` at 11 cm
is worth keeping.

## The bonfire's coal bed is pale peach lumps, and it is now the loudest thing in the crib

The flame above it has colour (see the v10 entry below) and that is exactly what
exposed this: with the tongues no longer welded to white, what the eye lands on
in `v10/closeup.png` at 2x is a ring of pale, waxy lumps sitting in the log crib
that read as marshmallows, not as embers. Measured over the crib base
(`closeup`, x 1230–1420, y 495–545), lumps above 170 luma are **[254, 203, 165]**
in v10 against [245, 207, 174] in v9 — the material never changed; only its
surroundings got out of its way, and the count halved (988 -> 536) because the
flame is no longer over-brightening its neighbours.

The cause is named and unowned: `materials.ts:169`,
`bonfireFlame: { emissive: 0xff5500, emissiveIntensity: 5.6 }`, on the
`IcosahedronGeometry` coal instances `world.ts:3027` places. 5.6 linear in R
clips before the other two channels do, so the grade's crosstalk drags G and B up
to ~205/165 and the lump arrives desaturated and pink. It wants roughly
`0xff8a28` at 2.2–2.4. The comment above the entry reasons from a bloom threshold
that, per the next entry, the chain cannot reach without clipping first.

## Bloom is unreachable — the threshold sits above where the grade already clips

Not visible as an artifact; visible as an absence, and it is why every emissive
in the game has been tuned by pushing intensity until something goes white.
Running postfx's own chain (exposure -> white balance -> contrast power ->
crosstalk -> filmic) on the CPU, the frame reaches code 255 at **4.07 scene units
in dusk and 2.48 in `laststand`**. `bloomThreshold` is **5.0 and 6.0**. There is
no radiance at which a source both blooms and keeps its chroma: it clips first,
every time. v10 worked around it for the bonfire with an authored halo, but
"let bloom carry the heat" cannot literally happen until the threshold drops to
~3.2–3.6 or `crosstalk` comes down from 0.3. Unowned, and it constrains axis 9
for anything else that wants to glow.

## Faces at lineup distance are lit now, and still the coolest skin in the frame

**Mostly fixed.** The diagnosis in the v8 entry was wrong about the mechanism and
the right fix landed anyway. It was never the level: every directional in the rig
except `bounce` sits *behind* the subject, so the only light reaching a face
turned to the lens was `bounce`, which is `0x93a084` because it is turf — olive
light on warm skin, which reads as a muddy patch rather than as an underlit face.
`lighting.ts`'s `faceFill` is a warm near-level front fill, 33° off the camera
axis at elevation −0.13 so an up-facing normal clamps to zero and it cannot spend
any of the contact darkening.

Measured on the lineup crop, v8 -> v9: huscarl 34.7 -> 45.1 luma with R:G going
1.87 -> 2.08, warden 55.3 -> 66.9, berserker 57.7 -> 62.8. In `v9/lineup.png` the
huscarl's eyes, mouth, nose and cheek modelling all read where `v8` had a flat
olive oval. The predicted cost — a directional cannot be height-selective, so it
lands on every camera-facing vertical — **did not appear**: the far palisade is
61.7 in both and the `closeup` hut wall went 72.7 -> 69.0, because the ambient and
hemisphere were drained to pay for the AO by more than the fill puts back.

What is left is that skin is still the coolest-lit material in a warm frame, and
the runekeeper's face under a deep hood is still the darkest of the four. That
wants a hue, not a level.

## Edges are anti-aliased now, and it is a smaller win than the diagnosis implied

The root cause was right and is fixed: the game shipped with **no geometric
anti-aliasing at all**, because `GameCanvas` correctly refuses context MSAA when
a composer is in play and `EffectComposer` correctly defaults its own buffers to
`samples: 0`, leaving SMAA — a morphological filter that never has more than the
one sample the rasteriser took — as the whole of the chain. The composer's colour
buffers carry samples now.

The gain measured on the capture is real and modest. Fraction of strong
silhouette transitions carrying an intermediate sample, `v7` → `v8`: rune stone
41.3 → 45.4%, palisade 57.7 → 60.3%, `duel`'s stake tops 46.1 → 53.1%, `arena`'s
hut roofline 57.3 → 60.5%. Violet-rimmed pixels on the rune stone, 137 → 61.
Better everywhere, clean nowhere — the stake tips in `v8/duel.png` are still
visibly stepped.

Two reasons to expect the rest to be hard, both already traced: **grain and
dither sit ahead of the AA pass** because they share the grade's pass, which caps
how far SMAA's threshold can come down (grain at 0.052 puts up to 0.026 between
two neighbouring sky pixels, so anything under ~0.07 detects grain as an edge);
and **nobody has positive evidence SMAA is blending at all** — its area/search
LUTs decode asynchronously from data URIs and the weights are zero until they
land. If a capture still shows staircases after MSAA, that is where to look.

## Smaller, confirmed

- **Pauldron lames read as square blocks** on the huscarl and warden at lineup
  distance, and the berserker's arm-fur caps are bulky slabs with flat tops.
- **The moustache halves** are soft leaves rather than hair at portrait distance.
  They want strands, which is a different primitive.
- **The runekeeper's hood opening** renders as a hard-edged polygon frame — the
  `dark` shadow gore's rim.
- **The baldric's five segments** show faceting between them at close range.
- **The tunic-through-cloak hole is back, and bigger than the speck it was.**
  Unchanged in `v9/duel.png` — still a ~65 × 35 px olive wedge of tunic standing
  in a hole in the hero's cloak, in the same place the 3 px speck was in `v7`, and
  now more legible because the wool around it carries fibre. The mechanism is
  new: the drape rig's `GATHER` rotates each wing inward about the yoke, and with
  no collision the only thing stopping it is the ~60 mm the cloak was cut clear of
  the tunic's flared hem. At the 0.17 rad/ring it landed at, the wedge was
  ~120 × 70 px; 0.07 more than halved it and did not close it, because the middle
  of a wing still travels ~30 mm inward and the clearance is not uniform round the
  ellipse. Two real fixes, and they want doing together: cut the cloak wider
  (`topX`/`topZ` in `characters.ts`, +15–20 mm) so there is somewhere to gather
  *into*, then put the gather back up. Dropping `GATHER` further just returns the
  cloak to the traffic cone it was.
- **`torchFlame` in the materials catalog is dead** — nothing calls `get()` on
  it. Either wire it or delete the entry.
- **`buildWool`'s `lay` is finer than the nap it steers.** The fibre-direction
  chooser runs at 12 cycles/tile against a mid nap at 5, so it flips direction
  every 1.5 cycles of the thing it is choosing for and chops the streaks. Costs
  nothing on the 51 mm cloak tile; it is the mush on the 300 mm back pelt.
  Coarsening to 4–8 is a one-token change that wanted an A/B it did not get.
- **`buildWool`'s `dye` still spends ±17% of albedo range at 12 cycles/tile**,
  which is 0.9 px at `closeup` framing — below anything a garment can resolve.
  Left alone deliberately: re-banding that field is what produced the flat-paint
  cloak in the first place, so it wants a capture behind it, not an argument.
- **`DEEPEST_WATER` is a normaliser with nothing clamping to it.** A puddle
  deeper than 30 mm takes its colour and opacity out of range. Documented at the
  constant, not enforced.
- **The palisade-foot drip lines are ~20 m from every camera** and cost ~220
  verts to draw a dark line. If nothing in a capture shows there, cut them.
- **Object-space projection ignores the instance matrix.** If `world.ts` ever
  scales an InstancedMesh instance carrying `iron`/`steel`/`bone`/`bronze`/
  `leather`/`skin`, that instance gets proportionally scaled texels.
- **A sub-tile phase discontinuity** survives on two of the four meridians of any
  cylindrical part — the 1-tap object-space projection's hard axis select, biased
  out to 0.83 r. Faintly visible on a mail sleeve at portrait distance; killing
  it needs biplanar and chunk rewrites.

## Not defects, but load-bearing and unowned

- **There is no prop collision and no cloth collision.** Nothing world.ts places
  intersects a warrior *in these eight presets*, which is a checked fact and not
  a guarantee — in play warriors move anywhere. `SWING_FWD = 0.24` in `anim.ts`
  is a stand-in for the wearer's own body, and a deep lunge under-drapes because
  the gravity solve gets clamped against it.
- **The cloak has no collision, which is now the binding constraint rather than
  a theoretical one.** The rig can gather and can move its two wings
  independently — `v8/duel.png` and `v8/stance.png` show a cloak that hangs and
  falls in rather than standing at its cut radius, so the old "cannot gather /
  halves move as one" entry is gone. What replaces it is that the gather is
  bounded by a hand-tuned constant instead of by the body, and the tunic wedge
  above is what that costs.
- **Nothing with a time constant over ~1.4 s can appear in a capture.**
  `GameCanvas.tsx:297` clamps `rawDt` to 0.05 and `shot/page.tsx:264` sets
  `__shotReady` after 26 rAF ticks, so **every capture is taken 1.35 s into the
  simulation** whatever the wall clock does. An ember lives 1.5–3.6 s and has to
  climb; a smoke puff needs ~4 s to become a plume. v10 works around it with a
  `warmUp(9)` that steps the particle system forward through the real frame path
  at construction, which is why embers exist in v10 at all — but the workaround
  is per-system, and anything else that accumulates (smoke, decal drying, fire
  flicker phase) needs its own. This is a sharper statement of "events never
  arrive": it is not only events, it is anything slow.
- **`FrameContext` in `quality.ts` carries no per-warrior data** — only `focus`
  and `localState` — so `vfx.ts` cannot make any warrior but the local one dust,
  bleed or react. A `pressure` (health fraction) field would also let ground
  marks key off actual health rather than off `lastStandTriggered`. Related:
  `GameCanvas.tsx:419` only emits dust for `state === "sprinting"`, and no preset
  is ever sprinting; walking and running over churned mud kick dust too.
- **The de-overlap solver in `hud3d.ts` has never been photographed doing work.**
  No preset puts two plates close enough to trigger `compact`.
- **The tally notches never render in `brawl`.** Bars are ~10 px there, so
  `lodDetail` is 0 and the metaphor the bar is built on only appears in
  `duel`/`closeup`.
- **Dusk's tonal split is shallow.** `v7/duel.png` B/R by luma band barely ramps
  and is non-monotone at the bottom. `laststand` got the `tintLow`/`tintHigh`
  treatment and it worked; dusk is 7 of the 8 presets and was deliberately left
  alone. The hook is there for whoever takes it.
- **`brawl` cannot present a frame in 30 s on the capture box**, and at 4 MSAA
  samples it could not present one in 46 minutes. Eight warriors now render into
  the fire beam's shadow map as well as the key's, on a software rasteriser, with
  coverage sampling on top. `MSAA_SAMPLES.high` is 2 because of it and
  `shoot.mjs`'s screenshot budget is explicit because of it. Neither is a
  measurement of what a GPU does — nobody has profiled this scene on one, and §5
  wants 60 fps at 1080p and a 30 fps phone floor. That number is unowned.

---

## Root causes worth remembering

Recorded because each took real effort to find and each was something other
than what it looked like:

- **A shadow needs a receiver, and half of ours was a mirror.** Eight captures of
  warriors casting nothing while the palisade beside them threw six-metre stripes
  looked like a light problem, and one pass was spent on the light. It was half
  the answer. The other half is that IBL specular is not modulated by a shadow
  map, so on a receiver returning ~49% of its pixel as environment — which is what
  `wet = max(basinWet, churn*0.4)` made of the floor every warrior stands on —
  a shadow map can only ever darken the other half. The palisade's stripe landed
  outside that mask, on rough grass, which is why the control was in the frame the
  whole time. Measured on the capture: the palisade's stripe contrast on the
  churned floor goes **2.07 → 3.48** between `v7/laststand.png` and
  `v8/laststand.png` while the dry-grass control in the same frame moves 3.08 →
  3.26. **When one object casts and another does not, suspect the ground under
  them before the light above them.**
- **Changing the substance is not changing the tile.** The shield's painted
  quarters were wool at a fixed five repeats, which is a real defect and was
  really fixed — they are timber now, the same boards they lie on. The basket in
  `v8/portrait.png` is the same size it was, because `M.timber` is also a fixed
  repeat and three repeats across a 105 mm plank is a 35 mm tile with two knots in
  it. Both materials were wrong for the same reason and swapping one for the other
  carried the reason across intact.
- **A gather with no collision is bounded by the pattern the cloth was cut on.**
  The drape rig gained the one thing it had never had — the ability to narrow a
  hem — and immediately spent it putting the wing inside the tunic. There was
  nothing to gather into: the cloak is cut ~60 mm clear of the garment under it,
  and the previous entry in this file about outward-only folds says exactly that
  about the opposite sign of the same number. **A cloth term that moves the shell
  toward the body needs the clearance budgeted first.**

- **The floating orange square was an opaque emissive quad, not a HUD element.**
  `bonfireFlame` — no surface, no alpha, `emissiveIntensity: 7` — on a bare
  `PlaneGeometry` standing in the hall doorway. At ~12 px it drew a hard uniform
  orange rectangle, and two independent panels read it as a UI bug; one traced it
  to `hud3d.ts`, where a fix would have done nothing. It took a radial alpha
  falloff and additive blending (`Spec.glow`), not a colour change. **Any bare
  emissive quad small enough that its edge is most of it will do this again.**
- **A shield's hide facing was a single-sided `CircleGeometry`.** Invisible for
  as long as the shield was mounted face-out; the moment `anim.ts` started
  carrying it bladed at rest, the outer planks — which are chords, only 100 mm
  tall at the rim — left two see-through crescents inside the binding. A
  regression in one file surfaced by a correct change in another.
- **A cloak fold cannot be a cosine about zero.** Half its amplitude cuts *inside*
  the base ellipse, and the base ellipse is only ~60 mm clear of the tunic's
  flared hem — so raising the fold depth from 30 mm to 52 mm put the cloak inside
  the garment under it and the tunic came through as an olive wedge — caught on an intermediate capture
  taken mid-pass, between the drape landing and v7. Cloth draped
  over a body is displaced away from it; there is nothing for a fold to displace
  into.
- **The metals went matte from roughness drift, not from a missing PMREM.**
  `specularAA` bakes the sub-texel slope it band-limits into the roughness
  channel, asymmetrically — it barely moves a rough substance and swamps a smooth
  one, so steel's recipe still *declared* 0.18 while its shipped map *meant*
  0.316. Reconciling against the declared number, then clamping, collapsed every
  `blade()` request above 0.36 onto one grey. Reconcile against the measured
  channel means, not against the recipe.
- **A texel density is not a UV repeat.** Every geometry here parameterises u and
  v over 0..1 whatever size it is, so a fixed repeat makes texel size scale with
  1/size and no two surfaces on one warrior agree. Leather at `repeat: 4` covered
  280 mm on a torso and 20 mm on a bracer — wickerwork and crocodile from one
  material.
- **A backlight cannot rim a silhouette.** A silhouette edge is where the normal
  is perpendicular to the view ray, so a light on the view axis meets it at
  N·L ≈ 0. Every unit the bonfire spent on a warrior between it and the lens
  landed on the half the camera cannot see; raising candela could never fix it.
  The steer had to move the *frame* the kick hangs in, not the light.
- **A tint crossover placed on the picture destroys the contrast it exists to
  create.** `mix(shadowTint, highlightTint, s)` passes through the average of the
  two tints at s = 0.5, and the average of a cool tint and a warm one is a
  desaturated near-neutral — which is what `laststand`'s modal 42% of pixels were
  getting. The tonal anchor must sit *on* the picture and the tint crossover
  *above* it; they are two jobs and they wanted opposite placements.
- **Standing water read as a hole in the world** because a near-black dielectric
  at `metalness 0.02` returns F0 ≈ 0.04, so from the near-vertical angle a
  gameplay camera actually uses, ~96% of the pixel is the black diffuse term. The
  PMREM only pays out at grazing incidence. The follow-up defect was the same
  material read as *flooding*, and that was placement, not material: one 2.5 m
  disc sat 1.14 m from where three presets stand their subject.
- **Every "mid-swing" capture was a rest pose.** `readSwing` only set `swingLive`
  when it saw `attackTimer` decrease across two frames, and a capture holds it
  constant — so animation was reviewed for weeks against poses that were never
  the ones requested.
- **The "long neck" was never the face.** The face-placement table that used to
  head this file (eye line 60%, mouth 39%, nose 56%) described a layout two
  rewrites stale; the built mesh measures 50.0 / 28.0 / 44.8, canon on the first
  and within a per cent on the others. The real error was 183 mm of neck against
  a life value of 0.39 head-heights, which the eye reads as a small head on a
  long body. The skeleton computed 7.5 heads because the skeleton never measured
  the neck.
- **A field named for a role outlived the role, and four panels read past it.**
  `LightingOptions` had a `key` and a `warm`; `GameCanvas` passed the moon as
  `key` because a night rig wants a moon key, and only `key` cast. The sky then
  became a sunset and nobody re-checked, so every shadow in the game ran at the
  brightest thing in it — at `sunIntensity 22` against `moonIntensity 0.1`, which
  is not a close call. Three review passes celebrated those stripes as the
  lighting win. The fields are `moon`/`sun` now and which one casts is
  `casterShare`'s per-frame decision. **Name an interface field for the thing it
  carries, not for the job you currently do with it** — a role can be re-derived,
  a mis-labelled body cannot be noticed.
- **A texture fix cannot show on a surface with no light gradient across it.**
  Wool gained a real nap and it is plainly visible in `stance`, `duel`,
  `laststand` and `portrait` — and it went measurably *flatter* in `closeup`, the
  one shot the "cloak is untextured" defect was raised on, because that garment
  faces away from every directional and sits at 15/255. Most of what a cloth
  recipe adds is relief, and relief is N·L. **Before scoring a material defect,
  check the light on it** — otherwise the fix lands and the frame that raised the
  bug is the one frame that cannot show it.
- **The mirror that made the shield a basket was also what made its tile wrap.**
  `wood()`'s radial term `sqrt(x² + pith²)` is even in u about the tile centre, so
  every tile carried an axis and a cathedral crown, three per plank, and that read
  as woven cells. Leaning `x` to break the symmetry puts a hard vertical seam at
  every repeat — worse than the arch. The way through was a linear term with an
  **integer** ring count (`+ cath * u`): it slides the stationary point off the
  tile entirely while leaving `frac(rr)` at u = 1 exactly what it was at u = 0.
  **When a periodic artifact is load-bearing for the wrap, translate it out of
  frame rather than destroying it.**
- **The ground "glitter" was specular, not albedo.** The wet/puddle mask was
  gated on the full height field, which carries fine noise at ×5 and ×9, so
  wetness bled onto dry ground at texel frequency. The give-away: specks took the
  *sky's* colour on cool ground and the *fire's* on warm ground, sat on the
  crowns of the relief, and carried chroma fringing.

---

## Process defect — overlapping captures corrupt the A/B reference

Two workflows ran concurrently and both wrote to `art/shots/`. One re-captured
into `v4` *with newer code*, destroying the reference the other was scoring
against. Any A/B taken across that window compares two different builds while
claiming to compare one change.

Captures are a shared, mutable resource. Only one capture may run at a time, and
a directory that has been scored must be treated as immutable — write a new
version rather than refreshing an old one.

**`git stash` is the same class of hazard and bit us again before v10.** An agent
wanting a lint baseline ran `git stash`, which is repo-global: it reverted a file
a concurrent workflow was mid-edit on, and `git stash pop` then refused because
that workflow had written to the file again. Nothing was ultimately lost — the
v10 verify pass confirmed the working tree was strictly ahead of `stash@{0}` on
both files — but the recovery cost a pass of anxiety and the stash entry had to
be carried between sessions. **Never run a repo-global git command to answer a
question about one file.** A lint baseline for your own file is `npm run lint`
filtered to your own path; a diff baseline is `git show HEAD:<path>`.

---

## v9 verify pass — what the capture proves, and what it does not

Four blockers went in; three reached the frame. Every number below is measured on
`art/shots/v9/` against `art/shots/v8/`.

**Shadows point away from the sun. Proven, and the v8 entry is deleted.** The
cleanest evidence is `v9/lineup.png`: four warriors on one floor, and a column
profile across the foreground band (y 735–775) shows four dark troughs at
x≈160–320, 640–800, 1040–1160 and 1480–1560, each one starting at its own
caster's boots and running to the RIGHT, with 65–81 luma peaks between them. The
sun glare is at frame-LEFT. Four of four, no exceptions. The same reversal is
visible as an absence: `v8/laststand.png`'s palisade threw six-metre stripes
toward the camera across the whole right of the frame, and in `v9` that ground is
clean, because the fence's shadows now fall behind the fence where they belong.

**Contact darkening exists and is attached to the sole. Proven.** In `v8` the
region immediately camera-right of the warden's boots measured 78.1 luma against
open-floor controls of 67.4 and 71.6 — the boot sat in a *brighter* patch, which
is what the v8 entry recorded. In `v9` the same region is 42.0 against 62.4, a
1.49:1 darkening, and at 2x the blob is visibly welded to both soles rather than
starting a boot-length downstream. On `arena` the hero's cast shadow beyond the
feet goes ~56 -> ~35 luma against unchanged open floor: 1.10:1 -> 1.77:1. Trough
to adjacent peak on `lineup` is about 2.0:1, against ground noise of
sigma/mu = 0.37 — the shadow is finally above the variance of its receiver, and
it is the *coherence* of a half-metre body-shaped blob that carries it, not the
per-pixel contrast.

**The cloak reads as cloth in five presets and as paint in the one the defect was
raised on.** `v9/stance.png` at 4x is fulled wool: lengthwise fibre striation, a
nap sheen, tonal drape. `v8` at the same crop is flat brown under a uniform
pinprick dither. `duel`, `laststand`, `portrait` and `lineup` all carry it.
**`closeup` does not** — measured on the cloak interior, sigma/mu went 0.358 ->
0.236 and 5-px band energy 0.166 -> 0.115, i.e. *down*, while mean luma went 13.3
-> 14.6. The recipe is not the problem; that garment faces away from every
directional in the rig and sits at 15/255, and relief with no N·L gradient across
it cannot show. This is a **lighting** defect wearing a texture defect's clothes,
and it is the one blocker of the four that did not reach its own frame.

**The `laststand` back panel is unchanged.** Still a hard-edged rectangular patch
of streaky pelt over a flat cloak body with a razor boundary — one garment, two
substances. `characters.ts:2862–2872` puts a 51 mm tile on the cloak
(`clothRepeat`) and a 300 mm one on the pelt (`PELT_TILE`, `round(0.3/0.25) = 1`).
6:1 on adjacent surfaces of one warrior is the whole defect and no texture recipe
can close it; the pelt wants 2–3 repeats, or `PELT_TILE` wants to be ~0.12.

**No sparks, no dust, no blood anywhere in eight captures** — including
`laststand`, where the hero is at ~15% health. *Superseded by the v10 entry: all
three now exist, and two of the three are below the threshold of being seen.*

**Regression: `stance` lost tonal range.** meanLuma 60.7 -> 58.5 (−3.7%), maxLuma
235 -> 218, `tonalBuckets` **11 -> 9** — one above the FAIL line. `arena` 12 -> 11
and `closeup` 13 -> 11 moved the same way; the other five held or improved
(`duel` 14 -> 15, `lineup` 16). The histogram says where it went: `stance`'s
16-bucket occupancy gains 5 points in the 16–32 luma band and loses the 128–176
tail. That is `lighting.ts` draining ambient and hemisphere to pay for
`AO_SHADOW_INTENSITY 0.85`, and `stance` is the preset with the least sky in it
and so the least headroom to give. The lever named at the constant is 0.78; the
retreat is that, not `AO_TILT`.

**Credit, re-measured on v9:** no banding (the `duel` sky carries 240/161/104
unique per-channel values, against 238/159/107 in v8); no `PointsMaterial`
squares; no floating orange quad; no untextured surface in any frame; violet
fringing flat within 5%. Whole-frame exposure held within ~1% on six of eight
presets while the shadow contrast roughly doubled, which was the hard part of the
lighting change and it landed.

**`right click blocks` in `npm run playtest` is flaky — 1 failure in 4 runs.** It
failed with `state=idle` and passed on three consecutive re-runs with identical
stamina numbers everywhere else, so the sim is deterministic and the read is not.
The check presses right mouse, waits a fixed 450 ms and reads one snapshot; the
dodge 600 ms earlier lasts 0.35 s and the block can land inside its recovery.
This is the same class of bug as the one `bf0b58a` fixed for the dodge assertion
by reading three packets after the press. **Do not relax the assertion to make it
green** — either read a sequence the way the dodge check does, or give the dodge
room to finish. Recorded here rather than fixed because a flaky test is a finding
and this pass did not own `tools/`.

---

## v10 verify pass — one blocker fell, one moved without arriving, and the fire cost the frame its top end

Gates: `npx tsc --noEmit` clean, `npm run lint` 12 problems (unchanged, all in
`GameCanvas.tsx` / `shot/page.tsx` / `CharacterPreview.tsx`), `npm run playtest`
**9/9** with no assertion touched, and all eight presets `ready: true`,
`blank: false`, `errors: []`, `tonalBuckets >= 9`. Every number below is measured
on `art/shots/v10/` against `art/shots/v9/`, and the two sets are **pixel-aligned
on world geometry** — the palisade strip in `lineup` cross-correlates at 0.997
with a best shift of (0, 0), so ground, fire and shadow comparisons are sound.

**The bonfire core has colour, and the entry that said it never would is
deleted.** This is the one number OPEN-DEFECTS had recorded as immovable across
v7, v8 and v9: mean saturation of the hottest 2% of the flame box, 0.054 in all
three. In v10 it is **0.286 in `arena` (5.2x), 0.314 in `closeup`, 0.276 in
`duel`**, and the clipping that caused it is gone with it — pixels at or above
250 luma inside the flame box go **608 -> 64** in `arena`, **800 -> 1** in
`closeup`, **104 -> 0** in `duel`. At 2x, `v9/closeup.png` is a white blowtorch
whose glare eats the log crib; `v10/closeup.png` is an amber flame with graded,
individually readable tongues and a fully legible crib behind them. The cause was
not the tone curve alone: the ramp's top band was authored `vec3(1.0, 0.93, 0.72)`,
which measures 0.02 saturation after white balance and crosstalk *at any
level* — an achromatic source, which is why raising or lowering radiance never
moved the metric. Re-authoring it to `(1.0, 0.46, 0.105)` is what fixed it.

**Blood, embers and ambient dust all exist now. Only blood reads.**
- *Blood is real and visible at 1:1.* `v10/laststand.png` carries **60 distinct
  regions on the floor band that darkened by more than 14 luma** against v9,
  13 790 px in total, and those pixels are redder in v10 than the turf they
  replaced (R:G **1.495 -> 1.601**) — a multiply decal over grass. Two spot
  checks: (490, 660) goes 74.0 -> 42.4 against an unchanged 64/66 control, and
  (810, 712) goes 64.4 -> 33.4 against an unchanged 92/93 control. The clustering
  around `ctx.focus` reads as a place a fight happened.
- *Embers exist and are sub-visible.* The air column above the `arena` fire
  carries **117 new warm specks** against v9, peaking at +73 luma, scattered from
  y≈122 up out of a flame that tops at y≈350 — a genuine rising column. At 1:1
  they are 1–2 px and read as sensor speckle against a bright dusk sky. They are
  in the file; they are not in the picture.
- *Dust exists as a veil, not as grains.* In `closeup` the frame carries a
  monotone near-field lift — **+4.4 luma at the bottom row, +3.1 at y 780, +1.6
  at y 650, −0.7 at the horizon** — which is exactly what a camera-centred dust
  ring at `alpha 0.11` does. `vfx.ts`'s own note flagged this as the parameter it
  was least sure of without a frame, and the frame agrees: it is haze. It wants
  fewer, larger, brighter motes rather than more opacity.

**The shadow does not read any better against the ground, and `world.ts` is not
to blame for that.** Measured per-frame so the warrior jitter below cannot
invalidate it — depth of the darkest coherent (>= 25 px) floor feature divided by
the receiver's own fine-scale sigma — v9 -> v10: `arena` 1.23 -> 1.20, `lineup`
1.33 -> 1.30, `duel` 1.53 -> 1.45, `laststand` 1.78 -> 1.80, `brawl` 1.25 ->
1.24, `closeup` 1.70 -> 1.78, `stance` 2.36 -> 2.53. Mean 1.60 -> 1.61: unchanged
within the spread. On the canonical `lineup` band (y 735–775) the four troughs
sit at the same x windows and the contrast is **2.30:1 -> 2.29:1**, while the
open-floor receiver's sigma/mu went the wrong way, **0.3235 -> 0.3547**. See the
cobbles entry above for why.

**Regression: the fire fix cost the frame its top end.** `uIntensity` went from
`2.6 + moodHeat*1.2` to `2.3 * (1 - moodHeat*0.37)`, the inner tongue ring was
dimmed to pay for its own stacking, and the duplicate-emitter fix halved the
tongue count — three cuts in the same direction at once. maxLuma falls in five
presets (`arena` 250 -> 221, `closeup` 250 -> 213, `lineup` 250 -> 239, `brawl`
250 -> 242, `portrait` 247 -> 242) and **`tonalBuckets` falls in three: `duel`
15 -> 13, `brawl` 15 -> 12, `lineup` 16 -> 13.** All still pass, none is near the
line, and whole-frame meanLuma holds within 1.3% on eight of eight — but the
brightest object in the scene is now dimmer than the sky behind it, and in
`lineup` the warriors visibly lost the warm fill the fire was giving them. The
cut was three levers where one would have done; `RING_LEVEL[0]` and the
dedup are the ones worth keeping, and `uIntensity` is the one to give back.

**No regression in the three things v9 won.** Shadow direction: `v10/lineup.png`
still shows four troughs running frame-RIGHT from four casters with the sun glare
at frame-LEFT, at x≈180, 640–690, 1040–1150 and 1480–1560. Boot contact: the
warden's sole region measures 47.6 against 78.0 on the same row, **1.64:1**,
against v9's 1.59:1 on the same crop — welded, and marginally better. Cloth
grain: `v10/stance.png` at 2x still carries lengthwise fibre and nap sheen on the
cloak, and `v10/portrait.png` still shows lengthwise plank grain on the shield.

**New, and it invalidates a measurement this file already published:
`lineup` does not pose its warriors deterministically across captures.** The
world is pixel-exact (palisade correlates 0.997 at zero shift) while every
warrior in the frame has moved: v9 -> v10 best-match offsets are huscarl +10 px,
warden −44, runekeeper +45, berserker −53, and the best-match correlations are
only 0.58–0.82, so they changed pose as well as position. **This predates v10** —
v8 -> v9 shows huscarl −44 px at correlation 0.54 and warden +14 at 0.61. The
consequence is that the v9 entry above reporting face luma on lineup crops
(huscarl 34.7 -> 45.1, warden 55.3 -> 66.9, berserker 57.7 -> 62.8) compared
crops that were not on the same pixels of the same thing, and those numbers
should not be relied on. The `faceFill` change may still have been right — the
qualitative read of `v9/lineup.png` stands — but it is not measured. Any future
per-warrior A/B must use `stance`, `duel` or `portrait`, which are stable, or
must register the crop first.

---

## Fifth panel (on v10) — and one harness defect that invalidates old comparisons

**`lineup` does not pose its warriors deterministically across captures.** World
geometry is pixel-exact between runs — the palisade strip cross-correlates at
**0.997 at zero shift** — but the warriors move **−53 to +45 px** between v9 and
v10 at correlations of only 0.58–0.82. This predates v10: v8→v9 shows the
huscarl at −44 px, r = 0.54.

That means any per-warrior A/B taken on `lineup` compared crops that were not the
same crop of the same thing. The v9 entry's face-luma numbers are among them.
Per-warrior comparison needs `stance`, `duel` or `portrait`, or a registered
crop, until the preset is made deterministic.

**The bonfire core was authored grey, not merely clipping.** `vec3(1.0, 0.93,
0.72)` measures 0.02 saturation after the grade *at any radiance*, so three
passes spent pushing emissive intensity up and down were adjusting a parameter
that could not move the metric being measured. Same failure class as the
`key`/`warm` misnaming: the thing everyone was tuning was not the thing that was
wrong. Now fixed — hottest-2% saturation 0.054 → 0.286 in `arena`, clipped
pixels in the flame box 608 → 64.

**The fire fix over-corrected.** Three cuts pulled the same way at once
(`uIntensity` 2.6 → 2.3×(1−0.37·moodHeat), the inner ring dimmed, and the
emitter dedup halving tongue count). maxLuma fell in five presets, tonalBuckets
in three, and in `lineup` the warriors visibly lost the warm fill the fire had
been giving them. The dedup and `RING_LEVEL` are right; `uIntensity` is the one
to give back.

**The ground pass did not reach the pixel, and its negative results are worth
keeping.** Receiver sigma/mu went the wrong way, 0.3235 → 0.3547; band-passed
floor sigma at 2–5 px is flat-to-worse in six of seven presets and improves only
in `stance` (−12%, the closest camera). The sub-2 m octaves of `mid`, `churn` and
`drainage` are confirmed *not* the culprit. The binding constraint is
`buildGroundDetail`'s `peb` term plus a screen-space AO pass — and the AO pass is
unowned.

**Everything past ~10 m is one colour.** In `v10/duel.png` the background band
has a hue circular-std of **6.2 degrees** at saturation 0.71 — palisade oak, hut
daub, thatch, tree canopy and soil all arrive as the same orange (arena 8.7,
brawl 13.3, laststand 13.7).

**The pale coal bed is now the loudest thing in the crib** — `materials.ts:169`
at `emissiveIntensity 5.6`, measuring [254, 203, 165]. Unchanged material; the
fixed flame simply stopped hiding it.

**Bloom is unreachable**: its threshold of 5.0/6.0 sits above the 4.07/2.48
points where the grade already clips.

### Process: `git stash` is not safe here

An agent used `git stash` mid-pass while another owner had uncommitted work in
the tree. Nothing was lost — the working tree was verified strictly ahead of the
stash on both files — but with two owners writing under a 2-agent cap, a stash
can silently bank someone else's half-finished work. Commit instead.

---

## v12 verify pass — the hand closes on the shaft, and the frame proves it

Gates: `npx tsc --noEmit` clean, `npm run lint` **12 problems** (unchanged, all in
`GameCanvas.tsx` / `shot/page.tsx` / `CharacterPreview.tsx`), `npm run playtest`
**9/9** with no assertion touched, and all eight presets `ready: true`,
`blank: false`, `errors: []`, `tonalBuckets` 9–14 (`duel` 14, `arena` 11,
`closeup` 11, `brawl` 14, `laststand` 12, `portrait` 11, `stance` 9,
`lineup` 13).

**Read the span before trusting a number below.** `art/shots/v11/` was written at
10:05 against `5b2b3a0`; `24207e2`, `90115d9`, `bb4dda3`, `c8ea1d1` and `cd7e992`
all land after it. So v11 → v12 is **five commits**, not one, and the frame shows
the finger rebuild, the plumb carry and the wrist bone together. Where the
mechanism separates them it is said so below.

**The owner's report is fixed, and `stance` is the shot that proves it.**
`stance` is the one preset whose warrior is pixel-stable across the two captures
— the fence correlates 0.990 at zero shift and *the warrior himself* correlates
0.979 at zero shift — so the same crop is the same thing in both. At 8× on the
axe grip (x 780–980, y 330–450): in `v11` the four fingers run **across** the
haft and their tips hang off its lower edge with turf visible behind them, a
hand laid over a stick. In `v12` the fingers run **along** the haft, stacked down
its length, each one crossing the wood and reappearing under it. The same
reversal is on the huscarl's sword in `portrait` (registered at −77 px): `v11` is
a smooth mitten with one fused C of knuckle standing clear of the grip, `v12` is
four separate fingers lying on the cord wraps. And on the warden's spear in
`lineup`, four distinct pale fingertips now show on the far side of the shaft
where `v11` had a single crescent beside it.

**Which half did what.** The finger *shape* is `24207e2`'s; the finger
*orientation* is `cd7e992`'s, and the second is what the report was about. Held
constant on one build and rendered offline through a scratch rasteriser — the
same rig, the wrist bone forced back to the builder's bind pitch — the fingers
curl on empty air beside the haft, and released they close on it. Measured on
the built rig across idle / walking / blocking / overhead / thrust on all four
classes, the angle between the circle the digits close on and the weapon's own
axis goes **48–75° → 0.0° in every pose**, and hand vertices sitting inside the
shaft go **8–34 → 0–5**.

**The v11 visibility win survives and the plumb term improved it.** In
`v11/lineup.png` the axe head's lower half lies over the berserker's shoulder cap
and arm; in `v12/lineup.png` it stands entirely over open ground and palisade,
socket and blade both legible. That is `90115d9` arriving on the frame — the
carry that was leaning 215 mm inboard of the fist now hangs plumb.

**No regression in the four things that were asked about.**
- *Shadow direction.* `lineup`'s canonical floor band (y 735–775) carries four
  dark troughs in both captures at the same x windows, each starting at its
  caster's boots and running frame-**right** with the sun glare at frame-left.
  Band mean is 57.4 in both; trough depth 57.4:33–35 in v11 against 57.4:33–34
  in v12.
- *Contact darkening.* Same measurement: the blob is welded to the soles in both
  and its depth is flat to marginally better.
- *Fire colour.* Hottest-2% saturation inside the flame box — `arena` 0.335 →
  0.327, `closeup` 0.258 → **0.397**, `duel` 0.209 → 0.178 — all an order above
  the 0.054 the v10 entry recorded as the failure, and clipping stays at 0–58 px
  of a 100 k box.
- *Cloth grain.* `stance`'s cloak, registered at zero shift: sigma/mu 0.326 →
  0.312, 2–14 cycle band energy 186.6 → 182.4. `portrait`'s shield planks,
  registered at −77 px: sigma/mu 0.504 → **0.507**, band 1094.8 → 1094.1. Both
  flat. (Unregistered, the shield reads 0.504 → 0.345, which is a crop error and
  not a defect — see below.)

### New, and it corrects an instruction this file already gives

**`portrait` is not pose-stable either.** The v10 entry tells future passes to
take per-warrior A/Bs on `stance`, `duel` or `portrait`. Measured across v11 →
v12: the `portrait` background hut correlates **0.996 at zero shift** while the
huscarl in front of it correlates 0.902 at **−77 px**. `stance` is stable (0.979
at zero); `lineup` moved its warriors −18, +24 and +1 px. Until the presets are
made deterministic, **`stance` is the only per-warrior A/B in the set**, and any
crop taken on `portrait` must be registered first.

**The plumb carry pushes the axe head into the right frame edge in `lineup`.**
The head's own pixels run to x = 1599 in `v12` against 1450–1555 in `v11`, so the
beard is cut off by the frame. It is the cost of the 242 mm the head gained
outboard and it is a composition defect (§7), not a rig one: the fix is the
preset's camera or the berserker's mark, not the carry.

### Measured and rejected: choking up the axe

The rig owner asked for the bound hand-hold to move up the haft to y ≈ 0.55–0.65
so a one-handed rest grips near the head. **Measured on the built rig at rest,
the geometry cannot take it.** The fist sits at 974 mm with 573 mm of haft below
it, which leaves the butt at 401 mm: move the hold 550 mm up the haft and the
butt lands at **−149 mm**, and at 0.65 it is −249 mm.
The butt goes through the turf. The suggestion was written against a haft that
still leaned outboard, where the butt swings up; hanging plumb it goes straight
down. Grounding the butt instead needs 360 mm more haft — a 1.86 m axe that
ploughs the turf on every overhead — and shortening the haft below the grip makes
it a different weapon. The grip is at 37% from the butt and staying there; if
this is taken up again it is a weapon-design change with its own capture, not a
defect fix.

### Still weak, carried forward

- **The huscarl's off fist does not align to its shield bar.** Measured at rest,
  the circle the off fingers close on sits **28.6°** off the grip bar's own long
  axis. The bar is behind the boards and the fist with it, so nothing in eight
  presets can see it — but the weapon hand's fix does not reach it, because the
  shield hangs off `elbowL` and not off the hand mount, and `applyPose` has no
  term that would carry the hand with it.
- **`HAND_GRIP.off` in `characters.ts` duplicates what `anim.ts` mounts.** A class
  gaining or losing an off-hand item is a second edit in a second file and
  nothing enforces it.
- **The thumb's standoff is a fixed offset outside the wrap circle.** Past ~30 mm
  of grip radius it stops reaching across the fingers; only the fingers have a
  sweep cap. The berserker's grip is 21 mm, so this is headroom rather than a
  live defect.
- **The overhead's cocked load puts 38 of 556 axe vertices through the shoulder
  at swing 0.35.** Pre-existing, transient, and no preset catches it — `stance`
  sits at 0.45 where it is 7 and all fist.
- **Low tier's open hand is still a mitten with a thumb** — the fingers are one
  swept collar there and always were.
- **Both weapon butts float** — axe 401 mm, spear 286 mm — and neither can be
  grounded from the builder's grip station.
- **The wrist bone costs a bigger bone texture.** Seventeen bones is four texels
  past the 8×8 target, so a warrior now gets a 16×16 float texture: 4 kB each,
  32 kB for a full lobby. Cheap, but it is no longer the "one 8×8 per man" the
  file used to claim.

## The first load has no loading screen, and the first attempt at one hung

The owner reported it plainly: *"training sometimes takes a while to load on the
first time."* He is right, and the diagnosis holds — **there is no loading state
anywhere in the app.** No spinner, no progress, no ready signal. `GameCanvas`
mounts and the browser then generates every texture in the game procedurally and
builds the world, synchronously on the main thread, with nothing on screen.
Second load is fast because the textures are cached in module scope, which is
exactly the "first time" pattern he describes. It is the first impression of
every player who opens an invite link and it currently looks like a hang.

**An attempt at this shipped as `dbb21aa` and was reverted as `2d3ad51`.** It
split the build into eight named stages with a paint between each, and a gilt
`ForgeScreen` drawing real progress. Its author measured 16.8 s of unbroken
block becoming ~3.0 s staged, and reported all four suites green.

That claim did not survive the harness. `npm run playtest` hangs: the forge
screen sits at **"waking the forge, 0 per cent"** — sampled six times over seven
minutes, never advancing — with its `fixed inset-0 z-50` overlay correctly
intercepting every click behind it. Stage zero's *work* never completes.

Three wrong diagnoses were spent on it before the evidence was read, and they
are worth recording so they are not spent again:

1. **Not a blocked click.** The overlay intercepting pointer events is it doing
   its job, not the fault.
2. **Not a stale build.** Rebuilding from clean changed nothing.
3. **Not the paint yield.** `paint()` waits on `requestAnimationFrame`, which is
   throttled to nothing in a backgrounded tab — a real hazard, since a player
   opens a link, flicks to the group chat and comes back. Racing rAF against a
   250 ms floor was written and **made no difference**, which is what proves the
   yield is not the stuck part.

So the fault is in the async restructuring of the build itself, not in the
progress screen or the yield. The idea is right and should be rebuilt; start
from stage zero's body and prove it completes before wiring any screen to it.

**And whatever is built next must be run against `npm run playtest` before it is
believed.** This is the third time on this project that a confident report has
been contradicted by the harness it claimed to have run.

### The rebuild landed, and this time the harness says so

The second attempt (`de6d19b`) completes. Driven headlessly through the real
landing -> training -> fight flow, all **8/8 stages land in 717 ms** and the
list stops growing only because there is nothing left to build:

```
+  58ms WAKING THE FORGE (48)   +  71ms GRINDING PIGMENT AND DYE (11)
+ 122ms SETTING THE GRADE (46)  + 365ms RAISING THE SKY (240)
+ 369ms LIGHTING THE TORCHES(2) + 680ms RAISING THE MOOT (308)
+ 714ms KINDLING THE FIRES (32) + 717ms HANGING THE BANNERS (1)
```

No repeated stage label (a restart would show one), the screen is down by the
time the fight is live, and a second forge after a reload lands 8/8 too. What
makes it checkable is that `window.__forgeStages` is appended to **only by a
stage that has finished** — the thing the first attempt could not show.

**Caveat for the next harness: `window.__forgeProgress` is dead whenever a
React parent is mounted.** `GameCanvas` resolves `onForgeRef.current ?? hook`,
and `src/app/page.tsx` always passes `onForge`, so a harness watching the
window hook through the real app records **zero** progress events while the
build runs perfectly. Read `__forgeStages` instead. This cost a verify pass a
false FAIL.

## Resolved — bindings reached the profile after all

This entry read "the profile column was never added". It was added. Corrected
here rather than deleted, because it was carried as open long enough to be
planned around, and the next reader should know why it is gone.

The column is `players.bindings`, `jsonb`, in `src/db/schema.ts` — nullable on
purpose, and the comment beside it is worth reading: the null means "this
player has never saved bindings", which is what tells the client to carry the
ones already on his device *up* to the server rather than be handed defaults
and lose a remap made before the column existed. The write is `syncBindings()`
at `src/app/profileLink.ts:328`, POSTing to `/api/profile/equip`; the
validation is `bad_bindings` at `src/db/api.ts:30` ("Those key bindings were
not written by this game"); the boot hydration sits beside the mute's.

**What is still unproven is the same thing that is unproven about the mute**,
and for the same reason: `npm run profiletest` skips its whole database half
without `PROFILE_TEST_DB`. The column exists and the path is wired; no test has
watched a remap survive a recovery onto a second device. Close that with the
same run that closes the mute.

## A server-rendered binding cap is a hydration mismatch waiting to happen

Fixed where it bit, recorded because the shape recurs. `src/app/page.tsx`
called `useSyncExternalStore(subscribeBindings, getBindings, getServerBindings)`
for its subscription and then computed the caps from `bindingsFor()` — a direct
store read behind the hook's back. `getServerBindings` returns defaults, and
React replays the *server* snapshot during hydration, so any player with a
custom bind hydrated `T A S D` against server HTML holding `W A S D` and took
**React #418** on every landing, visible in `playtest`'s page-error log. The
fix is to render the snapshot the hook returns.

The same hazard is live in `labelForAction`, which reads `getBindings()`
directly and feeds the training control reference. It is safe **only** because
that screen is never in the server-rendered HTML. Move any binding cap onto a
server-rendered surface and #418 comes back.

## The screen sounds are nine instruments, not one — and the report said otherwise

`npm run soundtest` on `main` (`0e560b0`) is **20/21**, failing:

```
FAIL  the screen sounds are one instrument, not nine
      brightest/darkest = 4.45x across the nine (need <= 3x)
      tap 666, confirm 823, back 388, purchase 1730, refusal 519,
      countdown 1085, roundWon 809, roundLost 494, matchWon 577
```

`purchase` is the outlier at 1730 Hz — its third note is an octave up and left
to ring — against `back` at 388. `countdown` at 1085 is the next brightest, also
an octave degree (`V8`). So the spread comes from the octave notes, not from the
mode: the composition is coherent, the *timbre* is not.

**The shipping report claimed `[soundtest] 21/21` and a family spread of 2.47x.**
The harness, run against the merged code, measures 4.45x and fails. That is the
fourth time on this project a confident report has not survived the harness it
claimed to have run, and the second where the agent's own number contradicted
the tool's.

Not fixed here deliberately. Brightness is a spectral-centroid measurement of an
aesthetic property, the owner is the final ear on the whole sound set, and
retuning a parameter nobody in this container can hear is how the Sutton Hoo
helm acquired a beak. The fix is small — bring `purchase` and `countdown` down,
or lift `back` and `roundLost` — but it should be made by someone listening.

Note for whoever picks this up: **the rest of the suite is green**, so a red
`soundtest` here is this one claim and not a regression elsewhere.

---

## `cameratest`'s mirror check is flaky, and it was flaky before this pass

**What happens.** `tools/cameratest.mjs:241` — "the mirror is a true mirror, not
a second offset" — fails on roughly one run in three. Three consecutive runs on
the same build:

```
[cameratest] 13/13 passed
  FAIL  the mirror is a true mirror, not a second offset — shoulder 1.00 vs -1.00; blade -0.282 vs 0.405
[cameratest] 12/13 passed
[cameratest] 13/13 passed
```

**Why.** It compares the blade's body-space X taken from two *independent*
browser sessions and asserts `|L + R| < 0.1`. The two sessions are sampled at
unrelated phases of the idle, and the reading across runs spans 0.199 to 0.405 m
— a 0.2 m drift against a 0.1 m tolerance. The comment above the check already
concedes the sampling problem and then picks a tolerance tighter than the drift
it admits to. The shoulder half of the same assertion is exact every time,
because the camera offset is a constant and the hand is not.

**It is not the swing work in this pass.** Every use of `LOAD_END` and `IMPACT`
is inside `attackLayer` (`anim.ts:1948-2056`), and the new `swingT` branch in
`readSwing` sits *after* the `player.state !== "attacking"` early return, so
neither can run for the idle warrior this check samples. The camera pass that
added the harness reported `blade at x=-0.404 m`; this branch reads -0.199 to
-0.405 on the same code.

**To close it**, sample the blade on a *held* frame rather than a live one — the
photo path already freezes a pose — or assert the mirror on `hand.scale.x`,
which is the thing that actually mirrors, instead of on a limb position that
breathes.

---

## Nothing measures the swing phases or the hitstop on the CLIENT

**What is proven.** The sim's side is: `playtest` 21/21 covers the phase shares,
the turn cap and the wire fields.

**What is not proven.** The three client wirings added in this pass have no
harness at all:

- the whoosh now fires on the `windup -> contact` edge (`GameCanvas.tsx:673`)
  rather than on the `attacking` state edge;
- the freeze is taken from `GamePlayer.hitstop` off the wire
  (`GameCanvas.tsx:686`) instead of three hand-picked client numbers;
- the pose's coil and pass are now `SWING_PHASES.windup` and
  `windup + contact` (`anim.ts:1500`) instead of 0.34 / 0.64.

`profiletest` proves only that a fight still starts. Nothing samples a warrior
mid-stroke on the client and checks the blade is where the sim says the blow
landed. **To close it**, extend `cameratest`'s readback — it already reaches
into the rig from a live fight — to log `attackPhase`, `swingT` and the blade's
world position over one stroke, and assert the blade crosses the target between
`swingT` 0.40 and 0.55.

---

## A staged capture is not evidence for a stage the code aims

**Closed, and worth keeping as a shape of mistake.** The end-of-match summary
shipped verified. Two captures of it disagreed: `/shot?preset=summaryduel` was
dusk blue and green with the loser's body full in frame, and the real driven
match at 390x844 was drowned in amber with no body visible anywhere. Both were
the same commit of the same file.

**What it actually was.** `render/summary.ts` aims the duel lens off the corpse
and chose its axis on the corpse's radius alone — past 5.2 m it stood the lens
inside the tableau looking outward, and closer in it swung to a tangent. A duel
decided AT the hearth takes the tangent, and a tangent through a corpse at the
origin points the lens back through the bonfire. Measured on a real driven duel:
aim point (-0.44, 0.55), r = 0.7 m, lens 4.3 m away. The frame was orange
because it was a photograph of a fire. The staged preset never showed it because
its corpse lies at 8.7 m and took the other branch.

Two things followed from the same root. The corpse was invisible because it lay
inside the burning log pile, and the anchor the tableau framed was `motion.rx/rz`
— the smoothed, extrapolated body, 2.4–3.8 m from where the sim actually stopped
him and drifting for seconds afterwards. There were no dismembered parts: the
pale chunks in the shipped frame are the hearth stones.

**The rule this leaves.** A composition that the code computes from match state
can only be reviewed against match state. `tools/summaryreal.mjs` drives a
genuine duel to its end at both viewports, kills the opponent two different ways
(in the hearth, and out on open ground by afterburn), and prints
`window.__summaryStage` — the aim the frame was taken with — beside every shot.
Note its `--settle`: the camera push accumulates RENDERED dt, and on this box the
summary runs at about three frames a second, so the default eleven-second wait
photographs a lens a quarter of the way through its move. A settled frame costs
two and a half minutes and is a different picture.

---

## The face is not a caricature any more, and it is not right yet

**Open.** The owner's five notes on the armoury card — beak, receding chin, long
skull, thin neck, scored mouth and beady eye — are all measurable and all fixed.
`tools/headmeasure.mjs` is the instrument; run it before and after touching
anything in `faceSurface`, `skeleton` or `faceComplexion`.

    measure              before    after     life / target
    lengthOverHeight     0.944     0.827     0.845     note 3, the long skull
    noseBeyondChin       51.7      29.1      ~24 mm    note 1, the beak
    noseProjection       28.0      29.7      25-30 mm
    chinBeyondNasion     -         +0.6      0 mm      note 2, the facial angle
    jawOverCheek         0.93      0.85      0.84-0.90
    neckOverJaw          0.74      0.89      ~1.05     note 4
    eye aperture / head  0.080     0.093     0.129     note 5

**What is still wrong, stated so the next pass does not have to rediscover it.**
The bare-head front card (`npm run shots -- headturn`) shows a broad dark form
over the mid-face with a hard upper edge along the brow — a domino mask. Half of
it was the shadow field summing four justified terms to a clamped 1.0 and that
half is fixed. The other half is **not the paint**: rendering the same frame with
`dim` forced to zero moves 31,721 pixels and the form is still there.

**Two hypotheses have been tested and both are wrong.** Write them down so the
next pass does not spend a capture round each on them:

1. *The shadow field.* Disproven by the `dim = 0` render above.
2. *The maxillary face block's lateral falloff.* The block was gated by
   `front = clamp01(z * 1.15)`, and `z` on a sphere falls with latitude as well
   as bearing, so one gate was shaping the block in two axes. That is a real bug
   and it is fixed — the gate is now on azimuth (`ax / h`) with the vertical
   profile stated separately — but it is **not the mask**. The fix moved 3.4% of
   the frame and the dark form is unchanged.

**What it looks like instead.** A hard terminator at the brow ridge under the
arena's night key at 60 degrees elevation, with too little fill under it at this
framing. Two things point that way: the edge is crisp and follows the ridge
exactly, and the SAME head under the armoury stage's own lighting shows no mask
at all (`art/ui/armourycard-desktop.png`). If that is right then the fix is in
the rig or in the brow's 24 mm over a 13 mm falloff, not in the complexion field
and not in the skull's plan — and it is worth checking whether a 24 mm ridge is
simply too much once the face beneath it stopped receding.

**Two method notes, both of which cost capture rounds here.**

1. *Do not A/B two 700x860 renders by eye.* Twice in this pass two frames were
   read as identical when a pixel diff put 5.3% of the frame between them, and
   once a frame was read as fresh when it was the previous run's file — the
   `until [ -f ... ]` wait returned instantly because the path already existed.
   Diff the pixels, and check the mtime against the build's.

2. *A metric can pass while the thing it names fails.* `craniumShare` scored 0.34
   against a canonical 0.35 for a head that reads as an egg, because it measures
   the cranium's share of the head's HEIGHT and note 3 is about its share of the
   head's MASS. The number was right and useless. The turntable card is what
   caught it.

---

## Four helms are broken geometry, and the lift direction was only half of it

**Half closed, half open.** Found gating the unmerged wave on 2026-08-06.

**The half that closed.** `headWear` stood every worn shell off the skin along
`faceNormal` — the normal of the *undisplaced* ellipsoid. The head stopped being
an ellipsoid when the face block went on. `tools/wearmeasure.mjs` measures the
resulting error over 32 heads at 11.4 deg mean, 71.6 deg worst over the band a
helm rim sits on; at the worst point a 6 mm lift clears 0.00 mm. `faceNormalTrue`
central-differences `faceSurface` instead. That **fixed the Shadow Hood**, which
had been cutting a flat plane through the skull.

**The half that is open.** It did NOT fix the Spectacle (280 g), Boar-Crest
(380 g), Jarl's Crowned (570 g) or Wyrm-Crest (950 g) cheek guards, which still
render as a slab with razor-straight edges standing proud of the face with skin
punching back through it. Frame:
`art/shots/fix1/cards/helmcards-7._Boar-Crest_Helm_380g.png`.

**What it is instead, read off that frame.** The guard's boundary is a
*rectangle in (u, v)* — its edges are straight lines in parameter space, which is
why they project as a hard-edged quad rather than as the outline of a piece of
beaten iron. And the standoff is large enough that the plate has left the face
altogether, so the head pokes through wherever the head's curvature exceeds the
plate's.

**The template is already in the file.** The Sutton Hoo mask is the one helm of
the ten that reads correctly, and it is the only one that (a) shapes its lower
edge as a function of azimuth — `maskBot(u)`, mixing `chinV` to `jawV` on a 1.55
power — and (b) had its standoff cut to 20.5 mm at the chin and 15 at the brow.
Give the four guards both.

**A hypothesis NOT yet tested, written down so it is not re-derived.** The blur
shell that builds the Sutton Hoo mask still averages `faceNormal` over its
kernel rather than `faceNormalTrue`. That was left alone deliberately — it is
the one helm that works and a blurred normal is arguably what it wants — but if
the four guards share that path, it is the first thing to check.

**Method note that held up.** Do not A/B two helm sheets by eye; the earlier
note in this file is right. The per-panel pixel diff is what proved the fix
touched every worn item (Hood 3.5%, Spectacle 4.0%, Boar 4.0%, Jarl 3.8%, Wyrm
6.6%, Sutton Hoo 3.1%) while the bare head moved 0.18% — which is also what
proved the *face itself* was untouched by it.

---

## Long Mane is two detached slabs, and no harness would have noticed

**Open.** `art/shots/fix1/hair.png`, row 2 (`back`). The 40-gold Long Mane, seen
from behind, is two separate brown slabs with a gap between them hanging over
the shoulders. It does not read as hair; it reads as broken geometry. This is the
**first time hair has ever been captured** — `tools/shoot.mjs` has defined a
`hair` sheet for some time and nothing had ever run it.

Two more from the same sheet, both of which cost real money in the shop:

- **All four hairstyles are pixel-identical under the Sutton Hoo mask.** 100 g
  of Braided War-locks buys what Shaved buys.
- **All four war paints are pixel-identical under the same mask**
  (`warpaint.png`, row 2). They are genuinely distinguishable bare-headed.

**The gate that would have caught all of it** does not exist: no harness renders
a cosmetic and asserts anything about it. Twelve sheets are defined in
`tools/shoot.mjs` and Cloaks (5), Armour Finish (7) and both colour ladders (12)
have still never been rendered at all. Assert that adjacent panels differ by more
than N% of pixels and every finding above falls out without a human looking.

---

## Three the fourth unit never got to push

**Open, and nothing was rebuilt here on purpose.** Four units worked this wave
and all four hit a session limit. Three had pushed their core fix first and are
now landed. The fourth had not pushed anything at all, so its work is gone —
there is no branch, no commit and no diagnosis to inherit, only the three
defects it was holding.

They are recorded here rather than re-attempted, because the next wave should
start from the owner's description and not from a second agent's guess at what
the first one was doing. Each is written in the owner's own words as they were
relayed; nothing has been added to them, and where a phrase is short that is
because the phrase is all there is.

1. **"floating blood on round two"** — blood persists or detaches between
   rounds. Round one is not reported as affected, which makes the round
   transition the place to look: something spawned in round one is surviving a
   reset that was meant to clear it, or is being re-parented to a corpse that no
   longer exists. `docs/GORE-DESIGN.md` owns the blood; `docs/ROUNDS-AND-SPAWNS.md`
   owns the transition.

2. **"pupils looking in opposite directions"** — the two eyes do not converge.
   Whatever aims them is being applied per-eye with a sign or a mirror that
   differs between the left and the right, which is the same shape of fault as
   the hand chirality this wave just fixed: a reflection that no distance-based
   ruler can see. `wearmeasure` §6 is the worked example of how that class of
   defect gets measured — take the sign of a triple product, not a length.

3. **"the last of the neck sloppiness"** — the residue of a neck problem that
   earlier passes have already narrowed. "The last of" is the owner's phrase and
   it implies this is a remnant rather than the whole fault, so the first job is
   to find the frame that still shows it before changing anything.

**Do not treat these as one job.** They touch three unrelated systems — gore,
the face, and the neck — and the only thing they have in common is the unit that
died holding them. The first two are cheap to gate: a count of live blood decals
across a round boundary, and a convergence sign on the two pupils. Both belong
in a CPU harness, and neither needs a browser.

---

## The head stack bought hair-through-helmets by deleting the hair, and it is paid hair

**Open, and it is a REGRESSION AGAINST MAIN — the one on this page that should
be picked up first.** `npm run cosmetictest -- --no-render` is 15/15 on
`origin/main` (6d10f84) and 14/15 on `integrate` (9fa32ac). The failing check is
`every paid hairstyle still reads under every helm that is not a hood`, and it
was already failing before the fittings, the hands and the beard were merged on
top. It was not caught because the head stack was judged on `wearmeasure` §4,
which it passes.

**How much hair went.** Silhouette difference against Shaved, portrait lens:

| helm | Long Mane 40g | Braided War-locks 100g |
|---|---|---|
| Iron Spangen | 6.86% -> 2.26% | 8.68% -> 2.26% |
| Nasal | 6.66% -> 2.19% | 8.42% -> 2.19% |
| Ridge | 6.66% -> 1.98% | 8.42% -> 1.98% |
| Spectacle | 6.14% -> 1.19% | 7.38% -> 1.19% |
| Boar-Crest | 6.03% -> **0.95%** | 7.25% -> **0.95%** |
| Jarl's Crowned | 6.04% -> **0.95%** | 7.26% -> **0.95%** |
| Wyrm-Crest | 4.00% -> **0.31%** | 6.00% -> **0.31%** |
| Sutton Hoo | 2.87% -> **0.05%** | 4.98% -> **0.05%** |

The bar is 1%. A player pays 100 gold for Braided War-locks and, under six of
the ten helms, gets 0.05-0.95% of a silhouette — which is nothing. The two paid
styles are also now identical to each other under every helm, because what
survives under a helm is the scalp shell and both styles share it.

**Why the existing ruler says this is fine, and this is the interesting part.**
`wearmeasure` §4 carries `SHOW_FLOOR = 0.02` precisely to stop this — its own
comment calls the failure mode "a helmet on a mannequin". It passes at 39-86%
shown. It passes because SHOW is *the fraction of hair vertices lying in
directions no garment covers*, and the head stack deletes the hair that would
have been in those directions rather than covering it. A ratio whose denominator
shrinks with its numerator cannot see a deletion. **§4's SHOW_FLOOR needs to be
measured against a fixed reference — the bare head's hair — not against whatever
hair is left.** That is a small change to an existing ruler and it would have
failed this on the day it was written.

**Where the geometry actually goes.** Two rules in `buildCharacter`, both
deliberate and both commented:

- `if (style.cheek !== "none") continue;` deletes BOTH war-locks outright on the
  six rungs with cheek guards. The comment is right that a plait was standing
  through those plates — 18.8 mm through the Spectacle's, 200 mm through the
  Sutton Hoo's ventail. Deleting it is the blunt answer to that.
- `hairFall(u)` takes the mane to zero inside a coif or a hood.

**The fix is not to relax the bar.** It is to make a war-lock hang *clear of* a
cheek guard instead of vanishing — root it further back and swing it outboard of
the plate — and to let a mane emerge below an aventail's hem rather than be
scaled out. Both are shape problems with a ruler already built for them
(`hairFitProbe`), which is the good position to be in. Neither is a merge fix,
which is why this is written down rather than attempted at the end of a landing
pass.

## The beard's cheek boundary is a hard-edged patch — 12 Aug 2026, NEW

Found by eye on `look4/hair-3._Long_Mane_40g_3_4.png` and visible on every
bearded rung at the three-quarter: a brownish, hard-edged patch sits on the
cheekbone below the outer eye corner, and a smaller angular mark at the temple.

**Caused by the fix, and worth being precise about why.** The beard's upper
boundary has always been there — `cut.skin` (0.019 for Full, 0.0105 for Close
Crop) is the density with which the beard rides onto the face — but while the
surface was `wool` at 56 repeats it integrated to a flat tone that differed from
the skin by very little, so a sparse boundary read as a soft shadow. The `hair`
substance has real contrast between lock and trough, so the same sparse boundary
now reads as a TEXTURED PATCH with an edge on it. Nothing about the boundary
changed; what changed is that it became visible.

This is the price of the substance, and it is the right price — a beard that
reads as hair with one boundary to feather beats a beard that reads as felt. But
it is a defect and it is on the face, which is the most-looked-at surface in the
game.

**What it needs:** the beard's face leg has to FEATHER rather than stop. The
boundary wants a density ramp over about 8-12 mm rather than a step, and the
albedo needs to converge on the complexion at the top of that ramp instead of
staying beard-coloured to the last texel. `cut.skin` is the density; the ramp
does not exist yet.

**What it must not become:** a lower `cut.skin`. That deletes the cheek hair
instead of blending it, and a beard that starts at the jawline is a chinstrap.

Not fixed in the same pass because `characters.ts` was locked by the rig unit.

## Three caveats on the rig fix, surfaced by its adversary — 12 Aug 2026

The hands/axe/shield unit was adversarially verified and NOT refuted. These are
the things its adversary found that do not refute it but are real:

**1. The axe roll is a trade, and the unit did not name it.** At the fight-
distance lens the head goes from an edge-on sliver to a proper axe. At the
frontal `lineup` camera the reverse happens: the head is now edge-on and reads
as a torch flame. `buildAxe`'s own haft comment declines to roll the SWORD on
exactly this silhouette argument — "a camera that is nearly always in front of
the warrior" — and that argument was not applied to the axe. The functional case
(a one-sided head must cut in the swing plane) is sound and the call is
defensible, but it IS a call. If the lineup silhouette matters more than the
fight-distance read, this is the number to revisit.

**2. `wearmeasure` §6b cannot catch a 180-degree bit error.** It scores
`lead = Math.abs(dir.dot(fwd))`, so a bit pointing BACKWARD scores identically
to one pointing forward. The build happens to be right (+0.967 signed), but the
gate is blind to the half of the owner's sentence that said "anticlockwise". Make
the dot product signed.

**3. The low-tier `tip` landmark is never exercised.** `handProbe` builds "high"
only, so the `collar.slice(-2)` branch added for the low tier has no gate over
it. Ruler-only data, so low risk, but untested.

Also unresolved rather than attributed: `cosmetictest` printed one self-check
FAIL about two captures of one subject not being byte-identical (0.75% mean, on
the facecard portrait lens) during the adversary's run, which was killed before
finishing. That is renderer determinism on faces and nothing the rig unit
touched, but it was not confirmed pre-existing.

## Two nits its adversary found on the round-beat unit — 13 Aug 2026

Neither refutes the unit; both are recorded because an unrecorded nit is how a
gate rots.

**1. One of the 42 deathcamtest claims does not discriminate.** "THE WINNER
WATCHES IT — 4.97 s watched against 2.20 s asked for" passes on the UNFIXED
camera too; the adjacent blind claim prints the same 4.97 s. It is bracketed by
two claims that DO discriminate (cos(lens, spray) −0.88 → +0.97, and lens
distance 5.78 m → 2.07 m), so the gate as a whole still bites — but that one
line is decoration and should either be made to bite or be relabelled as
reported-not-gated.

**2. One shipped frame is disqualified by the tool that took it.**
`art/ui/hud/after-desktop.png` is a countdown screen, not a running fight, and
`hudshot` stamps it `*** NOT IN A FIGHT ***` in capitals. The unit's evidence
sentence "desktop showed a tidy bottom-right pair with nothing to move" was
therefore read off a frame its own instrument rejects. The claim happens to be
true — `GameHud.tsx:1198` replaces that pair with an "ESC FOR KEYS" note once the
pointer is locked — but it is not proven by that frame, and desktop was out of
scope anyway. Retake it in a fight before citing it.

The tool shouting in capitals is what made this findable, which is the argument
for instruments that describe their own conditions rather than only their
results.
