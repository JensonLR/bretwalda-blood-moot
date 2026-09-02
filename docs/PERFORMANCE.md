# Performance: the judder, its cause, and its fix

The owner said "the frame rate feels laggy". It was not the frame rate.

This file exists because the measurement that found the fault is expensive to
re-derive and has now been lost to a container rebuild three times. The harness
is `tools/latencytest.mjs`; everything below is reproducible from it.

## Three faults feel exactly like a bad frame rate

Only one of them is the renderer:

| symptom | actual cause | measured by |
| --- | --- | --- |
| the picture is slow | the renderer | `tools/perf.mjs`, `tools/fpstest.mjs` |
| you press, the man moves late | input latency | **nothing. See below.** |
| the man moves in steps | **judder** | `latencytest judder` |

`latencytest input` was written in that cell for a year and **there is no such
phase**. The dispatcher handles `tick`, `judder` and `all`; anything else fell
through and exited 0 in silence, which reads as "ran, clean". It exits 2 with a
message now. End-to-end input latency is measured by nothing in this repository
and that is a gap, not a phase.

**Judder is the one that was wrong.** The server ships state at 20 Hz. A phone
draws at 60 or 120. Twenty discrete positions a second shown on a 120 Hz display
reads as stutter *at a perfect frame rate*, and no amount of renderer work
touches it. The fix is entirely in how `stepWarriorTransform` turns 20 Hz of
truth into 120 Hz of motion.

This box has no GPU — it rasterises through SwiftShader at about 1 fps — so the
judder section is deliberately GPU-free. It drives the real `anim.ts` function
on the CPU against a synthetic frame clock and a synthetic wire. The quantity
under test is arithmetic, and arithmetic measures honestly on a box with no
graphics card.

## The measurement

A warden walks a straight line at 4.5 u/s. At 60 fps that is **7.50 cm of travel
every frame**, forever. Print the per-frame step and the fault is visible without
a statistic:

```
BEFORE   4.13  11.48  6.89  4.13  11.48  6.89        ripple 247.8%
AFTER    7.51   7.51  7.51  7.51   7.51  7.51        ripple   0.0%
```

`ripple` is `(max speed - min speed) / mean speed` across a run. Under 10% at
every refresh rate is the bar. Note that ripple is a max-minus-min statistic and
one bad frame in two hundred sets it; `|accel| p95` is the companion number and
should be read beside it.

The per-frame step at each refresh rate, driven through the real function:

```
  local   30 fps  ideal=15.00cm/frame  ripple=0.0%  worst frame dev=0.040cm
        steps: 15.04  15.04  15.04  15.04  15.04
  local   60 fps  ideal=7.50cm/frame   ripple=0.0%  worst frame dev=0.010cm
        steps: 7.51  7.51  7.51  7.51  7.51  7.51
  local  120 fps  ideal=3.75cm/frame   ripple=0.0%  worst frame dev=0.000cm
        steps: 3.75  3.75  3.75  3.75  3.75  3.75  3.75  3.75  3.75
```

## Cause 1: chasing the newest packet

The original code eased the rig toward the newest authoritative position by a
fraction per frame. An exponential chase after a target that only moves every
50 ms is a sawtooth by construction, and it is **worse on a better phone**: at
120 fps the ripple was 482.7% and `|accel| p95` was 1253.72 u/s^2. The owner's
friends on 120 Hz phones had the worst version of it.

**Fix.** Buffer four authoritative states per warrior, stamped on a grid one
measured period apart, and lerp linearly between the two that bracket the render
instant. A straight line between two known states over a known interval is even
by construction. Remote bodies render 1.5 periods back so there is always a
snapshot on each side; the local rig runs at zero delay and extrapolates.

## Cause 2: the grid believed the arrival gap

This one survived three waves as "load noise" and it is the reason this file
exists.

**The server does not broadcast on a clock.** `gameTick` owes itself whole
`TICK_MS` simulation steps against `performance.now()`, and broadcasts once per
wake that owed at least one (`engine.mjs`, "no simulation, no duplicate
snapshot"). So a packet carries a **whole number of 50 ms steps**, while the gap
between arrivals is the **wake period**. Those are the same number only on a host
that holds 50.000 ms, which no shared-CPU host does — and Render's free tier is a
shared CPU.

When they differ, the grid was wrong in both directions:

- **Wake period short** (say 49 ms). Every packet carries one 50 ms step, so the
  wake creeps forward until one wake owes nothing, sends nothing, and the packet
  after it arrives on a *double* gap still carrying **one** step. Timing called
  that two slots, spent 98 ms of segment on 50 ms of walking, and drew the man
  at **2.29 u/s**.
- **Wake period long** (say 51 ms). The slip accumulates the other way until one
  wake owes **two** steps and ships both in one on-time packet. Timing called
  that one slot, drove 100 ms of walking through 50 ms of segment, and drew him
  at **9 u/s**.

Both are one packet in fifty. Both are a whole frame of the man at half or
double speed, which is exactly what a hitch looks like.

**Why it hid.** Every synthetic clean-wire case reads 0.0%, and the only case
that catches it replays a *captured* wire — so it appeared and vanished with box
load and was argued about as noise. It is not noise. A dead-constant 50.5 ms wake
period, one part in a hundred off nominal on an otherwise silent box, rippled the
local rig **26.1%** (4.19..5.37 u/s). Sweeping constant wake periods makes it
deterministic and removes the box from the argument entirely:

```
  constant 49.0ms   256.0%     constant 50.5ms    26.1%
  constant 49.5ms   229.1%     constant 51.0ms    26.1%
  constant 49.8ms     0.0%     constant 52.0ms    26.1%
  constant 50.0ms     0.0%     50ms + 70ms every 10   20.4%
  constant 50.2ms     0.0%     50ms + 95ms every 10  204.4%
```

**Fix, two coupled halves.**

1. **Count slots by what a packet carries, not by when it turned up.** Distance
   moved over the reported velocity is the time the packet carries, directly, in
   seconds — and `position` is integrated from `moveVel` while `velocity` is
   reported as the same quantity, so for a man simply running it is exact.
   Arrival timing still bounds it to one slot either way, because a knockback
   impulse moves the man by its own decaying integral rather than by
   `velocity * dt`, and a stride killed against the palisade spends ground the
   reported velocity no longer admits to. Timing is a poor witness to *which*
   step and a sound one to roughly *how many*.
2. **Open the lead side of the phase deadband.** A grid that advances by content
   legitimately runs *ahead* of the arrivals when the wake period is short, right
   up until the skipped wake hands the time back. That is a sawtooth about zero,
   not a drift — over any fifty packets both clocks advance by the same amount,
   because the simulation cannot outrun the wall clock it is stepped against.
   Clamping the lead side hard at `now` re-imposed the wake period on the grid one
   packet at a time and shortened the segment it did it on to 44 ms, which is the
   5.09 u/s half of the same ripple.

Result: **21/21**, every wire shape in the sweep at 0.0%, and framerate shape
residual from 1.59 cm to 0.00 cm.

## Cause 3: a teleport that did not say so

Not the fight — the summary stage, but the same buffer.

`summary.ts`'s `snap()` carried a man to his podium mark by setting the render
position, and left the snapshot buffer holding his death position. That is not a
teleport as far as the interpolator is concerned: the mark arrives as one more
packet, and the segment velocity between the two is the whole carry divided by
one packet interval — about **300 u/s**. `ingestNet` catches a jump over
`NET_TELEPORT` (6 m) on its own, but a shorter carry is indistinguishable from a
sprint, and the staged player record is **frozen**, so no later packet ever
corrects the guess. The extrapolator ran it for its full 220 ms cap.

Measured on the real eight-man flow at 390x844: two of three podium men at
`[7.32, 0, 19.08]` and `[-3.76, 0, 14.15]` with the lens at `z=14.49` — behind
it. A point behind the eye plane divides by a vanishing `w`, so they came back as
ndc `-10.071` and `-1.8` rather than as anything readable, and three waves read
that as the framing solver being wrong. **The solver was right the whole time**:
`fitted=true`, and every man it was asked about was inside the band.

**Fix.** `cutNetHistory(m)` — a caller that teleports a body says so, and the
buffer is emptied. Anything that moves a rig without a packet behind it must call
it.

## What is still true, and what it costs

- **The local rig is drawn 8.3 ms behind truth at 60 fps** (4.2 ms at 120,
  16.7 ms at 30), constant, p50 = p95 = max. It used to be drawn ~5 ms *ahead*,
  which was a guess that was sometimes wrong; it is now exactly one frame's worth
  of honest lag. Real client-side prediction needs an input-sequence ack that
  `input.ts` and `engine.mjs` do not carry.
- **Remote bodies render 75-100 ms behind**: the 1.5-period buffer plus, since
  `JITTER_DELAY_PACKETS`, up to half a period of the arrival lateness the client
  has actually measured. On a clean wire the second term decays to zero and the
  delay is the 75 ms it always was.
- **Ripple is not the only number.** Read `|accel| p95` beside it.

## How to re-derive all of this

```
node tools/latencytest.mjs            # everything: tick and judder
node tools/latencytest.mjs judder     # the interpolation trace alone
```

The judder section replays the gaps section 1 measured off a real engine under
four concurrent matches and four CPU neighbours. **That makes it load-dependent
and it is a poor regression gate on a busy box.** If it reports a MEASURED-jitter
failure, do not reach for "the box was loaded" — sweep constant wake periods from
49 to 55 ms first. A real fault shows up at 50.5 ms on a silent box; box noise
does not.


---

# The GPU ask, and the number that had been quoted was the cheapest tier

Everything above is about the CPU and the wire. This section is about what a
frame **submits**, which is the question a Steam build actually turns on, and it
is separate because the two have nothing to do with each other.

`tools/framecost.mjs` counts draw calls and triangles **at the WebGL context**.
That figure is portable: this box has no GPU and rasterises through SwiftShader,
so not one millisecond of a drawn run here means anything — but what a frame asks
for is the same on any device.

## Measured, one run a tier, seven bots and a player at 1280x720

| | draw calls p50 | triangles p50 | visible meshes | lights (casting) |
| --- | --- | --- | --- | --- |
| `low` | **595** | 391.5k | 400 | 11 (1) |
| `medium` | **3,079** | 2,155.7k | 526 | 16 (3) |
| `high` | **4,204** | 3,399.2k | 530 | 22 (4) |

**Every draw-call figure this repository had quoted — "614 draw calls, 395.5k
triangles" — is the `low` row.** `framecost` fetched `?quality=low` on a
hardcoded URL and never printed the tier. A desktop build asks for **seven times
the draw calls and nearly nine times the triangles** of the number that was being
reasoned about. Both harnesses take `--quality=` now and both print the tier on
their header.

## Where the calls are

The eight warriors are **72% of the visible meshes on `low` and 79% on `medium`
and `high`**. The arena itself is already instanced — rocks, tufts, debris,
palisade stakes and coals come through `world.ts`'s `field()` as `InstancedMesh`
at every tier, up to 301 in one call — so there is nothing left to win there.

A warrior is not one number. Counted one man at a time (which `framecost` now
does; it used to keep only the first body handed to it, and that single sample
read 29, 32 and 49 meshes on three runs of three tiers and was quoted as a
property of the build):

| tier | meshes per man | triangles per man | **distinct materials per man** |
| --- | --- | --- | --- |
| `low` | 32-40 | 13.0k-16.6k | 18-24 |
| `medium` / `high` | 44-57 | 22.5k-32.9k | 26-33 |

`medium` and `high` build the identical warrior; only `low` differs, because
`characters.ts` collapses near-neighbour substances there (`thrifty`).

## What a stage-5 fix can and cannot buy (R12)

`Part.merge()` already merges by material **within** one emitted part, and there
are eight parts (two legs, two arms, torso, neck, head, cloak). Merging **across**
parts is the stage-5 move, and its floor is the man's distinct material count,
because two meshes can only become one draw call if they share a material.

    low               289 warrior meshes  ->  158     131 fewer
    medium / high     417 warrior meshes  ->  229     188 fewer

Multiply by one plus the shadow-casting light count — every caster is drawn again
per casting light — and at `high` that is about **940 draw calls of 4,204, or
22%**. Real, and it is not the order of magnitude the framing implied.

**It is also more work than it sounds, and less than the last round assumed.**
The rig already carries `THREE.Skeleton` — `anim.ts:articulate` builds one
skeleton of seventeen bones per warrior and rebinds every limb and cloak mesh as
a `SkinnedMesh` — so this is not "add skinning to `characters.ts`". What blocks
the merge is that each of the eight parts is posed by its **pivot's** transform
rather than by a bone, so meshes on different pivots cannot share one geometry.
Landing it means moving the pivot transforms into bones, baking the pivot offsets
into the vertices, and merging by material. That is a rewrite of `anim.ts`'s
posing, which two other branches also hold.

**The larger lever is the material count itself.** 26-33 distinct materials on
one man is what caps the merge at 45%. They exist because kit colour is expressed
as a new `MeshStandardMaterial` per colour (`M.armour(c)`, `M.tunic(c)`,
`M.tinted(...)`). The machinery to express colour as a **vertex attribute on a
shared material** is already in `characters.ts` — `VERTEX_TINTED`, `Part.paint`,
and the invariant that keeps `mergeGeometries` working — and it is used for the
face and not for the kit. Collapse the kit onto shared materials and the merge
floor drops toward single digits per man, which is a different order of saving
and would also let identical loadouts share one material across warriors.

## What was NOT done, and it is the point (R12)

The two cheapest ways to move every number above are **fewer shadow casters per
warrior** and **fewer of the 22 lights**. `framecost` prints the arithmetic that
makes them tempting:

```
  530 for the picture + 477 casters x 4 shadow light(s) = 2438 before anything else
```

Both are **stage 6**. They change what the player sees, they belong to the owner,
and they are named in the harness's own output so that they are not reached for
by accident. Neither was made. The stage-5 answer is costed above instead.

---

# THE FIRST TRUSTWORTHY ABLATION — 1 Sep 2026, on an Apple M5

Every performance number in this file above was taken through SwiftShader, and
`tools/fpstest.mjs` said so on every run in its own words: *"this box has NO GPU.
It rasterises through SwiftShader. Any fps number measured here is SwiftShader's
fill rate and says nothing about a phone."* Its ablation had stopped ranking
altogether — the noise floor was larger than the best cut in it.

**It ranks now, and it took two things and not one.** That is the correction
worth leading with, because the obvious reading — "get a GPU and the ablation
works" — is only half right and was written into a handover before it was
checked.

| run | rasteriser | `--secs` | noise floor | best cut | ranks? |
|---|---|---|---|---|---|
| the standing state | SwiftShader | 14 | — | — | no, 2-11 frames a row |
| first GPU run | Metal (M5) | 14 | **−4.20 ms** | 7.40 ms | **NO** |
| second GPU run | Metal (M5) | 60 | **−0.50 ms** | 10.40 ms | **YES** |

Removing work cannot make a frame faster than it was, so the most negative row
IS the noise floor in the ranking's own units. At `--secs=14` it was more than
half the best cut and `fpstest` correctly refused. At 60 it is a twentieth.
**The GPU bought the frames; the seconds bought the ranking.**

`fpstest`'s refusal message used to blame SwiftShader unconditionally, which on a
GPU run is a lie that would send the next round to buy hardware it already had.
It now says which of the two is the problem.

## What the frame actually costs — tier high, eight-man brawl, 640x360

Baseline **p50 18.70 ms, p95 26.70, p99 28.90, 1665 draws, 3552k triangles.**
(The shorter run reads p50 13.70 at 1465 draws; the two differ because the long
run holds more of the fight. Compare rows within a run, never across two.)

    RANKED BY WHAT THEY COST (baseline minus ablated, JS ms per frame)
    what was removed              ms@p50   ms@p99   draws    fbo   kB/frame
    the whole post chain           10.40    17.20     809     41    1445.07
    shadows                         9.40    15.70     756      9     825.45
    props (density 0)               8.50    13.60     309      0     835.56
    AO (GTAO alone)                 8.10    12.20     617     11    1294.61
    grade + vignette                4.90     4.60     192      0     692.52
    DoF                             4.60     2.20     241      0     775.57
    bloom                           4.60     1.50     258      9     762.63
    particles                       2.40     1.50     -86      0     -38.02
    3D HUD damage numbers           2.20     1.10       2      0       9.72
    the audio engine               -0.40     1.90    -153      0     -81.46
    dynamic torch lights           -0.50     1.30    -209      0     -99.39

**Read the top four together.** The post chain is the single largest line, and
**AO is 8.1 ms of its 10.4** — GTAO alone is 78% of everything the whole chain
costs, and it is 617 of the 809 draws the chain adds. Shadows are the next
9.4 ms for 756 draws, which is the same order and is what the per-bone proxy
(664 → 539 draw calls) was already chipping at. Props are 8.5 ms for only 309
draws — a worse ratio than either, and the cheapest thing on this list to make
a setting.

**Two rows are noise and must not be read as findings.** The audio engine at
−0.40 ms and the torch lights at −0.50 ms are at the floor; both also show
NEGATIVE draw deltas, which is the same statement twice.

## The server is not the problem, and now that is measured rather than assumed

    388 snapshots over 20 s against a 20 Hz / 50.00 ms target
    interval  p50 51.27 ms   p95 55.74   p99 60.34   worst 101.05   mean 51.51
    ticks more than 25 ms late: 1 of 388 (0.3%)

    live round trip to the production server, GET /api/health x12
    p50 58.33 ms   p95 174.96   worst 174.96   (the first includes TLS)

## THE HANDOVER HITCH IS CLOSED, AND IT WAS SHADER COMPILATION AFTER ALL — 2 Sep 2026

**R8 against the section below**, which located the hitch correctly and named
its cause wrongly. It ruled out shader compilation because `getProgramParameter`
cost 14 ms a session — but on ANGLE's Metal backend the blocking call is
`linkProgram` itself, which that probe never timed. `tools/hitchprobe.mjs`
fights a real blood moot against three AI in the shipped page and records,
for every frame, wall time, GL draw time, `linkProgram` calls, first-use
programs and framebuffer binds, then fingerprints what the worst frame linked.

| GPU arm, 640x360 | worst frame after the verdict | where | links in it | draw in it |
|---|---|---|---|---|
| high, as shipped (2 runs) | **196 / 337 ms** | +240 (the replay's last frame) | 18 / 31 | 0 ms |
| medium, as shipped | ~325 ms | +241 | 31 | 0 ms |
| **high, warmed (2 runs)** | **36 / 22 ms** | +241 | **0** | 0.2 ms |
| **medium, warmed** | **23 ms** | +241 | **0** | 0.1 ms |

The frame that stages the tableau linked 18–31 programs and drew nothing;
every one of them a `MeshStandardMaterial` — ground, rock, palisade, mail,
wool, leather, iron, steel, skin, bone, the rune glow — with `USE_ENVMAP` and
`USE_SHADOWMAP`. The cause is the tableau's light rig: two spot lights (one
casting) and a point light into a scene that fought with none of those, and
three keys every program on the count of each light type, so every lit
material in view recompiled on the frame the rig went in.

**Two fixes that did not work, so nobody spends them again:**

* `renderer.compileAsync` on the replay's first frame — 34–46 links,
  340–840 ms, in THAT frame. "Async" moved the freeze to the moment of the
  kill: on this driver the link is synchronous in `linkProgram`.
* A per-frame warmer compiled with no render target bound — every program it
  made was for sRGB output, and the composer draws the scene into a linear
  target, so the keys never matched: "30 of 30 warmed keys in the cache, 31
  fresh links at the handover regardless". The key also carries the material's
  VERSION (the environment rebake bumps it), which a ledger by uuid missed.

**What works** (`warm` in `render/summary.ts`): a budgeted warmer, 6 ms a
frame during every round's countdown and 3 ms a frame during the match-end
replay, that compiles the scene's objects one at a time against the real light
rig (added to the scene for the length of one synchronous `compile` and removed
again) INTO a scratch render target, and remembers what it has done by material
uuid, material version and object shape. By the handover the cache holds every
program the stage needs. The `fpstest` ablation is untouched by this: the
warmer never runs during a fight.

## THE MULTI-SECOND STALL IS THE INSTRUMENT — measured, and it is not the game

**R8, against the section below, which was written the same day and is wrong.**
It read the `worst` column off `fpstest` and called a seven-second hitch on the
summary "something a player would report before any of the millisecond columns
above". That claim was made on an unattributed number, which is the exact defect
this whole session was spent correcting, so it is corrected here rather than
edited away — the original text is kept underneath.

A dedicated probe fought REAL duels and blood moots through the shipped page
with no `fpstest` instrumentation in the way, tapping only `linkProgram`,
`compileShader` and `getProgramParameter`, and timing every frame across the
match-end → summary transition:

| | worst single frame | frames over 100 ms |
|---|---|---|
| phone, 390x844, tier low | **18 ms** | **0** |
| 640x360, tier high | **~400 ms** (376–671 across runs) | **1** |

**There is no multi-second stall.** What is real is ONE frame of roughly
four-tenths of a second at tier high, at the transition, and nothing at all on
the phone preset.

And two candidate causes are dead, so nobody spends them again:

* **NOT shader compilation.** `linkProgram` 98 calls / 1 ms, `compileShader`
  196 calls / 0 ms, and `getProgramParameter` — the call that BLOCKS until a
  link finishes — **14 ms over the entire session**, 5 ms of it after the fight
  began. The profile's `getParameters` and `getProgramCacheKey` rows look like a
  compile stall and are not one.
* **NOT the clip recorder**, which was the strongest remaining candidate because
  it arms on `tier !== "low"` and the stall follows the same tier line. Deleting
  `MediaRecorder` so `canRecord` is false made the worst frame **671 ms against
  376 ms with it on** — the opposite of the prediction.

* **NOT depth of field**, which was the next candidate because `depthOfField` is
  true on `high` and false on `medium` and `low` — the same tier line the hitch
  follows — and `BokehPass` draws the whole scene again through an
  `overrideMaterial`, which would compile a depth program per material the first
  time it runs. Measured: **`high` 348 ms, `medium` 318 ms.** Thirty
  milliseconds. Not it.

It also barely scales with the cast: two men 402 ms, eight men 466 ms.

**AND IT IS NOW LOCATED, which is most of the next round's work done.** Marking
the frame index of `match_end` and of the summary's own mount against the frame
the hitch lands on:

    match_end seen        frame 466
    THE HITCH             frame 704   <- 305 ms
    summary mounted       frame 714

Two hundred and thirty-eight frames after the verdict and **ten frames before
the summary mounts**. The match-end replay holds 240 frames (`replaytest` §4),
so the hitch is not in the replay and not in the summary: it is the HANDOVER
between them — the frame where the replay ends and the victory tableau is
staged. `render/summary.ts` is where that happens, and it is where the next
round should point its profile.

So: a fixed ~0.3–0.4 s stutter at the replay→tableau handover, on `medium` and
`high`, barely scaling with the cast, not shader compilation, not the clip
recorder and not DoF. A stutter at a scene change, not a freeze, and it should
be priced accordingly.

**AND `fpstest`'s `worst` COLUMN SHOULD NOT BE READ AS A PLAYER-VISIBLE STALL**
until somebody attributes it. Its p50/p95/p99 rows agree with an independent
measurement; its `worst` does not, by an order of magnitude, and the difference
is the harness — it wraps every GL call, records and stops, and reads pixels
back. That is a defect in the ruler, not in the game.

---

## THE ORIGINAL SECTION, KEPT — a multi-second stall nobody has explained

The `worst` column carries numbers three orders of magnitude over their own p50
and they are not the ablation's business:

    tier high, summary stage        p50 21.60 ms   worst  7705.10 ms
    ablation baseline               p50 18.70 ms   worst 11240.60 ms
    ablation, no shadows            p50  9.30 ms   worst  6498.30 ms

A frame is not slow here, it is BLOCKED. Nothing in the session that measured
this touched any of it, and the obvious candidates — first-use shader
compilation, a GC that the 10.38 ms p99 above does not support, the capture
harness itself — are guesses. It wants its own round with the profile phase
pointed at it, and it is worth one: a seven-second hitch on the summary is
something a player would report before any of the millisecond columns above.

---

# WAVE D, FIRST CUT — the AO pass was drawing the whole scene a second time

The ablation above prices the AO stage at 8.1 ms and 617 draw calls, and a
screen-space occlusion pass has no business owning 37% of the draw calls in a
frame. Those draws were a **second full draw of the scene**: `GTAOPass` renders
its own depth-and-normal prepass, filling a buffer the beauty pass had already
computed one pass earlier and thrown away.

`render/postfx.ts` had this written down as a known trade and left it, correctly,
because it could not be priced: *"the composer's own colour buffers carry a depth
renderbuffer rather than a depth texture, so there is nothing to sample… that
trade is worth revisiting; it is not worth doing blind."* The ablation is what
made it not blind.

The composer's buffers now carry a depth TEXTURE, and `GTAOPass.setGBuffer` is
handed it, which sets the pass's own `_renderGBuffer` false and removes the
prepass.

## What it bought — same session, same `--secs=25`, tier high, eight-man brawl

|  | frame p50 | draws | triangles | FBO binds |
|---|---|---|---|---|
| the prepass, as it shipped | 10.10 ms | 1229 | 2764k | 46 |
| **reusing the beauty depth** | **7.60 ms** | **922** | **1897k** | **41** |
| | **−2.50 ms (−25%)** | **−307 (−25%)** | **−867k (−31%)** | −5 |

**Both arms measured on one machine in one session at one run length**, because
this file has already recorded that the baseline moves with `--secs` — 14.90 at
14 s, 18.70 at 60 s, 10.10 at 25 s — so a number from one run length says nothing
against a number from another. The first draft of this section compared 7.60
against 18.70 and would have claimed a 60% cut. It is 25%.

And the ablation's own AO row collapses, which is the same finding said twice:
removing GTAO used to save 1.5 ms and now saves **−0.2 ms**, i.e. nothing. There
is no longer an expensive half to remove.

## What it costs, stated rather than buried

With no normal buffer the shader's `NORMAL_VECTOR_TYPE` is 0 and it
**reconstructs normals from depth derivatives**. That is a worse normal at a
silhouette, where neighbouring depths belong to different surfaces. The occlusion
is a low-frequency signal, denoised by a Poisson kernel at half resolution, which
is why it survives — but "why it survives" is an argument, so here is the
measurement. Twenty frames, four peoples on all five grounds:

    mean luma      63.91 -> 64.06     +0.15 of 255
    dark pixels    21.95% -> 22.53%   +0.58 points

The occlusion is not weaker; if anything a fraction more of the frame is dark.
`gradesplit --gate` holds at 6.1 dH\* against a bar of 10, and the close lenses
(`facecard`, `kitcard`) keep their contact shading under the chin, in the eye
sockets and through the mail with no silhouette haloing.

## Three things checked in the three.js source rather than assumed

1. **MSAA still resolves the depth.** These buffers are multisampled and a
   multisampled attachment is not sampleable. `WebGLRenderer`'s resolve blits
   `DEPTH_BUFFER_BIT` whenever the target has `resolveDepthBuffer` (default true)
   and a depth buffer, so the texture holds resolved depth before anything reads.
2. **Both ping-pong buffers get a depth texture, and the pass is aimed at the
   right one every frame.** `RenderPass` draws the scene into the READ buffer and
   which that is alternates. Bound once, every other frame would occlude against
   the previous frame's depth — the occlusion swimming a frame behind the camera.
3. **`setGBuffer` is called AFTER construction, never through the constructor.**
   Its last line dereferences `this.normalRenderTarget` unguarded, so passing a
   depth texture to the constructor throws — the target it reaches for has not
   been built yet. Constructing normally leaves it there to be dereferenced and
   then disposed.

## What is still on the table

## The tier table after the cut — a SNAPSHOT, and deliberately not a before/after

Apple M5, 640x360, `--secs=25`, `BRETWALDA_GPU=1`. JS ms per frame.

| tier | scene | p50 | p95 | p99 | draws | tris |
|---|---|---|---|---|---|---|
| low | one-on-one | 1.80 | 2.90 | 3.20 | 244 | 305k |
| low | eight-man brawl | 2.90 | 5.00 | 5.80 | 303 | 305k |
| low | summary stage | 4.20 | 5.90 | 6.30 | 579 | 520k |
| medium | eight-man brawl | 4.00 | 6.80 | 7.60 | 598 | 920k |
| medium | summary stage | 5.10 | 7.10 | 7.40 | 885 | 1375k |
| high | one-on-one | 3.50 | 5.00 | 5.40 | 433 | 802k |
| high | eight-man brawl | 5.00 | 7.70 | 9.00 | 814 | 1390k |
| high | summary stage | 6.80 | 8.20 | 8.90 | 891 | 1637k |

**IT IS NOT A BEFORE/AFTER AND MUST NOT BE READ AS ONE.** The earlier tier table
in this file was taken at `--secs=14` and this at `--secs=25`, and the brawl's
content depends on how long it is watched — how many men are still standing. The
tell is `low`, whose draws read 545 then 303: `low` has **no AO at all**
(`AO_SCALE.low` is 0), so the cut above cannot have touched it, and the whole
difference is the scene. The only controlled comparison in this file is the
ablation A/B above, both arms at `--secs=25` in one session.

**AND THESE ARE M5 NUMBERS.** A phone is several times slower and this file's own
honesty clause has always said so. The device-independent figures are the counts:
**303 draws and 305k triangles for an eight-man brawl on `low`** is what a phone
is actually asked for, and that is the number to carry into the mobile wave.

## DEPTH OF FIELD RUNS NOW — 2 Sep 2026 — and the cut below it is taken

The section under this one is kept as written: for its first five days the pass
never rendered a frame, because nothing called `setDepthOfField`. That was a
design call and it has been made: **the lens is on for the two authored shots —
the deathcam replay and the victory tableau — and off in the fight**, where a
man has to read every foe at every distance. `GameCanvas` switches it at the
three render branches; the camera rig now writes `ctx.focus` to its own aim in
the photo and summary branches (the deathcam rides the summary branch too), so
the sharp plane sits on the man's face and not, as the old ground-plane seed
had it, a little under his boots. The blur ceiling is 0.0045 rather than the
0.006 default: at 0.006 the palisade smeared and a faint halo stood off the
victor's silhouette.

Seen: `art/shots/dof/` — the tableau at `high` (lens) against `medium` (none),
and the last stand. The A/B is decisive: with the lens the eye goes to the
victor and the corpse and the palisade recedes.

**And the BokehPass cut is now taken**, because it now buys something. The
pass's third full draw of the scene for its RGBA-packed depth is replaced by
one full-screen quad that packs the beauty pass's own depth into the same
target in the same encoding (window-space depth IS `gl_FragCoord.z`), reading
`sceneDepth` and not `read`, because `AoComposite` swaps. The bokeh shader is
untouched. The pass falls back to its own prepass only when no depth texture
exists (AO off), which on `high` never happens.

Priced on the same rig as the tables above (`--phases=matrix --tiers=high
--secs=25`, GPU): **the summary stage — the lens ON — reads p50 4.60 ms, p99
5.40, 941 draws, 47 FBO binds.** The same row before the lens existed read 891
draws and 42 binds, so the whole of depth of field is about fifty draws and five
framebuffer binds a frame — the quad, the blur and the composite — where the
pass as three.js ships it would have added a third draw of every mesh on the
stage. A SNAPSHOT against a different run, not an A/B; the draw and bind deltas
are the numbers to trust.

## THE RECORD AS IT STOOD — depth of field had never rendered a frame

`BokehPass` has the identical defect the occlusion pass had: its `render` sets
`scene.overrideMaterial = this._materialDepth` and calls
`renderer.render(scene, camera)` — a THIRD full draw of every mesh, for a depth
buffer the beauty pass computed two passes earlier. It looked like the obvious
next cut, and the fix was written: pack the beauty depth into its RGBA-packed
target with one full-screen quad, leaving the bokeh shader untouched, because
window-space depth is exactly the `gl_FragCoord.z` that `MeshDepthMaterial`
would have packed.

**Then the caller was looked for and there is not one.** `dofWanted` is set only
by `setDepthOfField`, and nothing in `src/` or `tools/` calls it — the whole
tree's other 118 matches for "dof" are `handoff`, `standoff` and `CloudOff`. So
`dofBlend` decays to zero, `bokeh.enabled = dofBlend > 0.02` is false for the
life of every session, and **the pass has never rendered a frame in the shipped
game.**

Which means three things:

1. **The optimisation was thrown away.** It typechecked and built and it buys
   nothing, at the price of two reaches into `BokehPass`'s private fields. The
   recipe is written into `render/postfx.ts` beside the pass for whoever wires
   the feature up.
2. **The ablation's "no DoF" row is not a measurement of depth of field.** It
   removes the pass's CONSTRUCTION and nothing else. The 4.6 ms it showed at
   `--secs=60` and 2.6 ms at 25 is scene variance, and the earlier table in this
   file should be read with that correction.
3. **What DoF costs today is its construction**: a full-resolution RGBA render
   target allocated on every `high` session, for a blur nobody asks for. Either
   something should call `setDepthOfField` — the deathcam and the victory
   tableau are the obvious candidates, and the focus already tracks the subject
   through the follow camera's lag — or the pass should stop being built.
   **That is a design call, not a fixer's.**

Shadows are then the largest line and they are a real cost rather than a
duplicated one — 756 draws for four shadow-casting lights on `high`, already
chipped at once by the per-bone proxy (664 → 539). Props are 8.5 ms for 309
draws, the worst ratio on the list and the cheapest thing to make a setting.
