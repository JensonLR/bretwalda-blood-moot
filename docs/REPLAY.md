# The kill replay — what is built, what is not, and what it costs

The owner, 19 Aug 2026, having played the merged build:

> "The final kill camera would be better as a slow-mo replay before the next
> round starts, and before a match ends too — skippable at end of match, just
> take them to the lobby."

**It is a replay. It is not the live camera with the clock turned down.** That
sentence is the whole of this document's first job, because the cheap version of
this feature passes every eye test in a still frame and is a lie in one specific
and checkable way — see §1.

---

## 1. Why a slowed live camera would not have been this

`createRoundCamera` in `src/game/deathcam.mjs` arms on the frame the last man
falls, which is **one frame after the swing landed**. The approach, the windup
and the contact have already happened and are not on screen any more. Slowing
the lens from that frame onward shows a body settling, slowly.

The owner asked to see the kill. A replay **rewinds**.

`tools/replaytest.mjs` asserts the difference rather than asserting the
adjective. It drives the real `poseWarrior` off the recorded ring and requires
the replayed body to match the pose that was live at that recorded moment. A
slowed live camera has no past and cannot be put through that at all — which is
exactly what `--lever=live` demonstrates:

```
  R1 LEVER ON (live): the replay now shows the present, not the past.
      worst pose OUTSIDE the live track's own      78.61°  (bar 0.50°)
    FAIL  §2 the replay opens only -0.00s before the blow, not 0.92s
  RED — 4 finding(s)
```

Against the real module, the same section:

```
  §1 RECORD   228 frame(s) of a real fight replayed off the ring. Worst pose 0.39° outside the live track's
              own sampling bracket (bar 0.50°), worst 0.005s from the moment it claims (bar 0.025s; raw argmin 0.055s).
  §2 CLOCK    opens 0.91s BEFORE the blow and runs at 0.498x over 4.00s of wall clock.
```

**That line used to read `0.055s from the frame it claims to be (bar 0.025s)`
and it used to be RED**, and the block before it used to be one lucky draw,
which is the fault this project keeps recording: `replaytest` was unseeded and
drew a different fight every time, red in seven runs of twelve. The fixture is
seeded now. The red that survived the seeding is settled in the next section —
**the recording was never out; the ruler was**, and the raw argmin above is the
old number, still measured, still printed, no longer gated.

### What the flakiness actually was

Not the bots. `tools/seeddie.mjs`'s die was added first and changed **nothing**:
ten seeded runs still gave ten different outputs. This fixture has no bots in it
— four scripted sessions — so the rolls that die governs are never made.

It was the **warriors' names**. `createMotion` sets `seed: hash01(p.id + "s")`
once, off the player id, and `deathLayer` rides it:
`pace = c.pace * (1 + sin(seed * 12.9898) * 0.08)` — **±8% on the whole collapse
clock**. The ids come from `crypto.randomUUID`, which `seeddie.mjs` deliberately
leaves alone on the grounds that "nothing downstream can start depending on a
fixed identity by accident". This was downstream and it did depend on it. Every
run, every warrior fell at a different speed.

`makeRig` now takes a stable label. **Ten consecutive runs of `--only=record`
are byte-identical** (md5 `4d4f3399a431`, 10/10).

### The seeded spread, over ten seeds declared before the run

`--seed=N` renames the fixture's two warriors, which is the axis that actually
varies. Seeds declared first, all ten run, none discarded:

Seeds declared first, all ten run, none discarded. The two right-hand columns
are the same ten fights measured by the old ruler and by the one that replaced
it — **the recording did not change between them; every raw-argmin number below
is identical to the one that round printed.**

| seed | worst pose outside bracket | raw argmin (old gate) | nearest frame it could be (gate) | verdict |
|---|---|---|---|---|
| default | 0.39° | 0.055 s | 0.005 s | green |
| 1 | 0.31° | 0.038 s | 0.005 s | green |
| 2 | −0.03° | 0.022 s | 0.005 s | green |
| 3 | 0.21° | 0.038 s | 0.005 s | green |
| 7 | −0.06° | 0.022 s | 0.005 s | green |
| 11 | −0.02° | 0.022 s | 0.005 s | green |
| 42 | −0.04° | 0.022 s | 0.005 s | green |
| 99 | −0.04° | 0.022 s | 0.005 s | green |
| 20260820 | 0.27° | 0.055 s | 0.005 s | green |
| 424242 | −0.06° | 0.022 s | 0.005 s | green |

**Ten of ten. The bar is still `1/60 + 1/120` = 0.025 s and the default fight is
still the default fight.** What moved is what is measured against it.

**AND THE COMMAND THAT REPRODUCES THIS TABLE RUNS AGAIN.** `node
tools/replaytest.mjs --sweep` printed `?s` for every one of the ten offsets: the
round that rewrote the gate renamed the emitted line at `tools/replaytest.mjs:660`
— "worst distance in time to **that frame**" became "...to the **NEAREST live**
frame this pose could be" — and left the scraper regex at `:163` matching the old
wording. The green count still worked, because it greps FAIL lines, so a table
whose whole argument is that column was reproduced by a command that could not
print it. Fixed by matching the stem, and a scrape that misses now FAILS the
sweep and names the pattern instead of printing a blank column under a green
count:

```
    SWEEP BROKEN — worst phase offset: /worst distance in time to the NEAREST live\s+([\d.]+)s/
                   matched nothing in --only=record's output
    The table above has a dead column, so it does not reproduce anything.
```

The live run reproduces the two right-hand columns of the table above digit for
digit: `10/10 green`, every offset `0.005s`, poses
`0.39 / 0.31 / −0.03 / 0.21 / −0.06 / −0.02 / −0.04 / −0.04 / 0.27 / −0.06`.

### Settling the red — and the previous round's reading is REFUTED

That round wrote down a hypothesis and deliberately did not act on it: the
offset's floor was said to be "the **ring's own 1/20 s step**, which `slotAt`
resolves nearest-at-or-before... the localisation floor is a recorded step,
0.05 s. The measured 0.055 s sits exactly there."

**It is not.** Dumped frame by frame on the default fixture, the 228 compared
frames of the old column gave

| offset | frames | | offset | frames |
|---|---|---|---|---|
| −0.0050 s | 82 | | +0.0033 s | 48 |
| −0.0133 s | 66 | | −0.0217 s | 31 |
| −0.0550 s | **1** | | | |

227 of 228 inside the bar, nothing anywhere near 0.05 s, and **one** outlier. A
quantisation floor of a recorded step would put a great many frames at 0.05 s,
not one.

**What the one frame is.** It is the replay's first frame after the collapse
begins — `at` = 19.9550 s, ring slot 19.9500 s, the first `dead` snapshot. Its
pose distance to every live frame in the search window:

| live t | 19.9000 | 19.9167 | 19.9333 | 19.9500 | 19.9667 |
|---|---|---|---|---|---|
| gap | 0.56° | 0.60° | 0.63° | 1.73° | 8.50° |

The first three lie within **0.07° of each other and span 0.033 s**. The argmin
picked 19.9000 by four hundredths of a degree. That is not a measurement of
time, it is a coin toss across a basin three frames wide — and the pose is the
thing that cannot tell them apart: the live track itself moves only 0.17° over
the render frame at 19.9000, while the replayed pose sits 0.56° off the live
polyline at the corner where the collapse starts. **That 0.39° of excess is the
POSE column's own worst reading for this very frame, and it passes at 0.50°.**
Both columns were reporting one residual; only one was reporting it honestly.

**The fix is to the ruler, and it is the question that changed, not the number.**
The phase column now asks a falsifying question instead of a selecting one:
not "which live frame is this?", which has no answer where the pose is flat, but
"could this replayed frame be the moment it claims to be?" — refuted only when
**no** live frame near `at` matches. And "matches" is not a new tolerance
invented for the occasion: it is `BAR.bracket`'s, the one this file already
gates the pose column on — a replayed pose IS a given live frame when it sits
inside that frame's own sampling bracket plus `BAR.pose`. The column reports the
nearest **in time** of the frames that pass that test. The raw argmin is still
computed and printed beside it, ungated.

**It still has teeth**, and that is the part a bar-move could not have claimed:

| run | worst pose outside bracket | phase (gated) | verdict |
|---|---|---|---|
| clean | 0.39° | 0.005 s | green |
| `--lever=drift` | 25.66° | 0.058 s | **RED, both columns** |
| `--lever=live` | 77.69° | 0.060 s | **RED, both columns** |
| `--lever=clock` | 21.67° | 0.055 s | **RED, both columns** |

Where the fight is still, the bracket is a fraction of a degree and the
admissible set is one or two frames wide; where it is violent the bracket is ten
degrees and the set is wide — and a wide set is the honest report, because a
body moving 10° per frame cannot be placed in time to a sixtieth of a second by
looking at it. What cannot pass either way is a replay drawn at the wrong rate:
its lag grows without bound and no admissible frame stays near `at`.

---

## 2. What is recorded, and what it costs

Not the `game_state` broadcast. `protocoltest` measures that at **10,517 bytes
per snapshot** for eight men, and a ring of a hundred of those is ~1 MB of JSON
churned into the collector at 20 Hz.

What the picture needs is the fields `anim.ts` actually reads off a
`GamePlayer`, and that list was taken from the file rather than guessed:

| | fields |
|---|---|
| **16 × f32** | position xyz, rotation, velocity xyz, attackTimer, swingT, swingDuration, blockTimer, staggerTimer, downTimer, hitstop, health, maxHealth |
| **5 × u8** | state, attackDir, deathZone, deathDir, deathCause |
| **1 × u8** | flags: swingHeavy, invincible, abilityActive, deathHeavy |

Held in preallocated typed arrays with a seat table:

```
  seats                             8
  frames held (5.00s at 20 Hz)    100
  bytes, allocated once         57,600   = 56.3 KiB
  bytes after 2000 recorded frames 57,600  — UNCHANGED, nothing allocated on the hot path
  per man per frame                72.0 B
```

R12 stage 3 and stage 4: the work is done once at construction and the hot path
produces no garbage. `replaytest` §5 measures `bytes` before and after two
thousand recorded frames and fails if it moved.

**The completeness of that field list is not asserted by reading it.** A field
left out is a field the replayed body will not have, and §1's pose comparison is
what catches it — miss `swingT` and the arm is tens of degrees out.

### The ring is sized by the read-head lag, not by `pre`

The first draft held 3.0 s on the reasoning that playback only reads
`REPLAY.pre` = 0.92 s behind the write head. That is wrong, and §1 caught it on
its first run with *"the ring did not hold t+19.04s, which the replay asked
for"*. The read head does not keep station — it falls further behind every
frame, because recording runs at life speed and playback at half of it:

```
  worst lag = pre + wall * (1 - rate) = 0.92 + 4.0 * 0.5 = 2.92 s
```

`REPLAY.history` is 5.0 s, and `replaytest` §5 asserts the **identity** rather
than the number, so retuning `rate` or `wall` cannot quietly make it too short
again.

---

## 3. The constants, and where each one comes from

| | value | derivation |
|---|---|---|
| `rate` | 0.5 | Half. The one rate nobody has to argue about. |
| `pre` | 0.92 s | The longest time in this game between a swing STARTING and its contact window CLOSING: `swingDurationOf("berserker", true)` = 1.663 s × `(SWING_PHASES.windup + contact)` = 0.55 → 0.915 s. Below this the replay opens part way through the killing swing. |
| `wall` | 4.0 s | `ROUND_BREAK` is 5 s and one second is held back so the countdown is still dealt on time. `replaytest` §3 reads `ROUND_BREAK` out of `engine.mjs` and fails if this stops fitting. |
| `post` | 1.08 s | The remainder: `wall * rate - pre`. |
| `history` | 5.0 s | The read-head lag above, with margin. |

**One deferral, and it rides the verdict line.** `freezetest --phases=collapse`
measures a body reaching the ground between 0.52 s and 1.17 s. `post` is 1.08 s,
so **the slowest death is still moving when the replay ends** — 0.09 s short of
the turf. It is not gated, because the budget above is the server's and not this
feature's, and `replaytest` prints it on its `PASS` line every run.

---

## 4. What this fills: `docs/BACKLOG.md` 2.6

2.6 has stood open on one line: *"the death that ends the LAST round of a
match"*. `endRound` sets `state = "finished"` and calls `endMatch` in the same
tick — there is no break — and `render/summary.ts` takes the lens for the
victor's portrait. Measured, on the shipping build:

```
                                  frames of hold   at the end of a match
    the LIVE round beat                 177               0
    the REPLAY                          240             240
```

The replay flags which ending it is in (`atEnd`), so the caller can hold the
summary off and route a skip to the lobby — *"skippable at end of match, just
take them to the lobby"*. Skipped on frame 30, it ends on frame 30, with
`skipped=true` and `atEnd=true`.

Precedence is `deathcam.mjs`'s rule at a ROUND break — **your own death outranks
it and the beat is never queued** — and at a round break the replay holds 0
frames with the viewer's own hold running. **At match end it is not, and the
next section is why.**

### 4.1 The match-end hole under the hole — 20 Aug 2026

The line above ("the REPLAY: 240 at the end of a match") was driven with
`own: false`. Drive it against the REAL `createDeathCamera`, in the order and
with the arguments `GameCanvas.tsx` uses, and sweep the one axis that decides
whether the viewer's hold is running on the edge — **how long before the room
ended he died** — and the shipping build reads:

| gap | his own hold ran | replay frames, MATCH END | …ROUND END |
|---|---|---|---|
| 0.00 s | 0 | **240** | 1 |
| 0.02 s | 1 | **0** | 0 |
| 0.50 s | 30 | **0** | 0 |
| 2.00 s | 120 | **0** | 0 |
| 3.34 s | 200 | **0** | 0 |
| 3.40 s | 201 | **240** | 240 |

Zero, and **permanently** — `update()` armed on
`if (edge && !armed && !s.own && s.ready)` and then `else if (edge) { armed =
true; }`, and `armed` is cleared only inside `if (!ended)`. A finished room does
not become un-finished.

**The refutation that opened this named "the man who dies last". He is the one
case that already worked** (gap 0): his hold has not armed on the previous frame
either, so `own` was false and he drew all 240. The hole was everyone who died
in the last **3.35 s** of the match — `DEATH_HOLD.total`.

**And `own` was stale, which is what makes this a bug rather than a design
call.** `GameCanvas` reads `deathCamRef.current.holding` ABOVE the cameras, so
it is the previous frame's answer; `runDeathCam` passes
`live` = `fighting | last_stand | intermission`; and `createDeathCamera` stops on
any frame `live` is false. **The transition into `finished` ends the hold, later
in the same frame that offers the edge.** The replay was refusing to outrank a
hold the same edge had already taken away — nothing was being protected, and the
viewer got the results panel instead of the beat.

So `s.own` outranks a round-end replay and is ignored at match end. The comment
at `GameCanvas.tsx:1150` asserted the opposite ("the summary branch resets the
death camera, so `holding` is already false by the time a `finished` edge
arrives" — the summary branch is BELOW that call and cannot have run) and is
replaced by what the code does. `replaytest` §4 sweeps the gap and gates the
match-end column; back the fix out and it reports RED at gap 0.02 s.

---

## 5. LANDED: the render wiring, and what the browser then found

**The reason this section previously gave for NOT wiring it was false.** It
read: *"There is no GPU and no browser on the machine this was built on —
`npx playwright` reports `Executable doesn't exist at .../chrome-headless-shell`
— so `npm run shoot`, `roundbeatshot` and `freezetest --phases=freeze` cannot
run. R5 says open the render before telling the owner anything is fixed."*

There is a browser: `/opt/pw-browsers/chromium`, a symlink to
`chromium-1194/chrome-linux/chrome`, which launches and reports **Chromium
141.0.7390.37**. The error quoted above is real and is about something else —
the installed Playwright resolves its browser directory by version and asks for
`chromium_headless_shell-1234`, which is not there, so a bare `chromium.launch()`
fails. Every harness in this repository already passes `executablePath` when that
symlink exists and every one of them opens the browser. `npm run build` also
succeeds and `custom-server.mjs` serves. A refusal is worth exactly what its
reason is worth.

### What is wired

`src/game/client/GameCanvas.tsx`:

1. **Record** — one `buf.record()` per SNAPSHOT, in the effect keyed on
   `[roomState]`, guarded on `wireSeq`. **Not in the frame loop**; see below.
2. **Playback** — the branch that poses bodies between rounds draws the ring's
   frame instead while `update()` returns one, with `ctx.time = at`.
3. **The slowed dt** — `replayFrame.dt` goes to `stepWarriorTransform` and
   `poseWarrior` and to nothing else. The world, sky, fires and HUD keep the
   frame's real `dt`.
4. **No second cut** — playback passes `groundAt` only, never `onSever`, so the
   arena is not sprayed twice. The rig re-cuts itself, as this document said.
5. **The camera** — `runRoundCam`'s `ended` now includes a running match-end
   replay, which is the hole `docs/BACKLOG.md` 2.6 named.
6. **`src/app/page.tsx`** — `ROUND_HOLD_MS = REPLAY.wall * 1000`, the break
   card's guard moved `left > 2` -> `left > 1` to match, the results panel waits
   while a match-end replay runs, and a **SKIP** is offered at match end which
   ends the beat and leaves the arena.

`deathcamtest` gates the derivation, the containment, **and that GameCanvas
imports the module at all** — the last of those exists because its absence was
the whole of the previous round's failure, and it was shown failing before it
was trusted.

### What opening the render actually found, which no headless number could

`tools/replayseen.mjs` drives the real client against the real server and reads
the DOM and a `window.__bretwaldaReplay` readback — the same shape of hook
`camera.ts` hangs on the window for `cameratest`. It photographs nothing, on
purpose: one screenshot on this box's software rasteriser blocks the page for
about **nine seconds** (`roundbeatshot`'s own discard lines say so) and the beat
is 4.0 s, so it cannot be photographed here. That is the true limitation, and it
is a much narrower one than "there is no browser".

**It found a real defect in the first cut of the wiring.** The recorder was in
the render loop, firing once per rAF frame on which the packet number had
changed — which caps the recording at the RENDER rate. Measured in the real
client:

```
  before   the ring held  16 frames spanning 45.08s   (one sample every 3 s)
  after    the ring held 100 frames spanning  ~5s     (100 of 100)
```

`replaytest` cannot see this and never could: it calls `record()` itself, once
per simulated tick. A recording is a property of the wire, not of how fast the
machine can draw, so it now runs on the packet-driven effect and fills at the
server's rate on a client that is dropping frames.

### What is still NOT proven, and it is not a pass

`replayseen` ends **NOT PROVEN** on this box, and says so rather than printing
green over a run in which every claim was skipped. The clock reported PLAYING on
**0 frames** across three runs, for two reasons that are both this box:

* The sim runs far enough behind the wall clock that the server's 5.00 s
  `ROUND_BREAK` reaches the client as **1.64 s**, so `RoundBreak`'s `left > 1`
  guard correctly covers the arena before any replay could finish.
* The harness's warrior does not fight, so he dies first or last, and his own
  death hold outranks the beat every time — `replay.mjs`'s stated precedence.

**The case not reached is a viewer who is ALIVE when somebody else falls**, and
reaching it needs a harness that fights. Nothing here says the picture is right:
whether the bodies look right, whether blood spawns twice and whether the HUD
runs at half speed all need a shutter faster than the beat.

### The question this raised for the owner — ANSWERED, and it was not a call

That question was: the man who dies last is the commonest viewer of a match's
final kill, and for him that kill is his own; whether the replay should outrank
the hold at match end is a call about the game.

**It was not a call.** It is §4.1: at match end the hold does not survive the
edge, so there is nothing to outrank and no collapse being cut off. What the
viewer was losing the beat to was the results panel.

### 5.1 PHOTOGRAPHED — `tools/replayshot.mjs`, 20 Aug 2026

The reason this section gave for photographing nothing was also wrong, and the
correction is read off the client rather than argued. `GameCanvas.tsx`:

```
const rawDt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05);
```

The frame clock is **clamped at 0.05 s**, and `createKillReplay` spends `dt` out
of `REPLAY.wall` — so a nine-second frame costs the 4.0 s beat a twentieth of a
second, not nine. The beat can be photographed here.

What it does cost is the SERVER's budget: `endMatch` sets
`phaseAt = simMs + SUMMARY_HOLD * 1000` and `SUMMARY_HOLD` is 10 s, after which
the room is a lobby and `ended` goes false. A first run took three shots at ~9 s
each, the room rolled over underneath them, and the replay ended 0.28 s in. So
the beat is photographed in one match and the SKIP is pressed in another.

A real blood moot in Chromium 141 against `custom-server`, one round, the viewer
standing still until a bot kills him — the death that ends the match:

```
    the viewer is down at t+55.53s; 1 man/men still alive
    SHOT .replay/shots/last-replay-1.png
         0.05s into the beat, 1 frames drawn, SKIP ON screen, results panel held back
    gap: the viewer died 0.00s before the room said "finished"
    PASS  a SKIP was on screen for him
    PASS  the results panel never overlapped the replay
```

and in the second match, pressing it:

```
    pressed SKIP 0.05s in
    SHOT .replay/shots/last-after-skip.png   (what he is looking at now: landing)
    PASS  pressing SKIP took him to the lobby, which is what the owner asked for
```

### What is still NOT proven on this box, and it is not a pass

**The gap > 0 case cannot be watched here.** `replayshot --case=held` forces it
— a socket warrior kills the viewer and then leaves the moot a chosen interval
later, so `disconnectSession` calls `checkRoundEnd` and the match ends on that
tick — and three runs all came back **NOT OBSERVABLE**, which the file prints
instead of a finding:

```
      the ring filled at   0.71 Hz against the server's 20 Hz
```

`record()` is called once per rendered frame, so the ring's fill rate IS the
client's frame rate. With three men in the arena this box draws about **one
frame every 1.4 s** and the whole match-end window is 10 s; at 480x300 it was no
better, so it is not pixel-bound, it is a saturated box. Nothing about the beat
can be concluded from a page that is not drawing the game — not that it ran and
not that it did not. That case is gated in `replaytest` §4 against the real
`createDeathCamera` instead, and `replayshot`'s verdict says **NOT PROVEN**
rather than green when every pass is routed past the scoring.

### `summaryflow` was RED, and the cause was the CLOCK, not the withholding

The paragraph that stood here said `summaryflow` was RED on this branch and on
the one before it, that it was "either the summary-withholding this branch added
or the box", and that somebody should run it on a machine with a GPU before
touching the withholding. The duel phase reached

```
  PASS  the verdict names the phone player — winner Prober
  PASS  pressed before the rollback, the intent parks
  PASS  the summary overlay stands over a live canvas
[flow] failed: Error: timed out waiting for the stage to report its cast
```

**It was neither of those two things, and the either/or was the wrong pair.** An
adversary narrowed it correctly to the withholding by deleting the one token
`&& !replaying` from `isSummary` and watching the harness go green — but that
experiment names the CARRIER, not the cause. The withholding was only fatal
because it lasted thirty times longer than it was designed to.

`REPLAY.wall` is 4.0 s and it is not this module's number: it is the server's 5 s
`ROUND_BREAK` less the second held back for the countdown. The countdown was
being run on the ORCHESTRATOR'S dt — `Math.min(frameMs / 1000, 0.05)` in
`GameCanvas.tsx`, multiplied by 0.22 again during hit-stop. Neither is a clock.
The replay therefore needed **eighty rendered frames however long a frame takes**,
so on a page drawing at 0.66 Hz the four second replay is a **two minute** one,
and `castNow`'s thirty seconds never came close.

Measured on the real page, same duel, same box, back to back, the one token
`s.wall` toggled and nothing else:

```
  budget on the clamped dt   the replay stopped at elapsed 0.20 / 0.25 of 4.00,
                             with state "lobby" — the SERVER'S ROLLBACK ended it,
                             ten seconds in. The cast appeared at 27.4s / 27.9s,
                             a hair inside castNow's 30 s, by accident.
  budget on wall clock       the replay stopped at elapsed 4.08 / 4.60 of 4.00,
                             with state "finished" — its OWN clock ended it.
```

The fix is in `replay.mjs`'s `update` (`s.wall`) and `GameCanvas.tsx`'s `wallDt`,
and it is gated by `replaytest` §4's starved-renderer table at 60 / 20 / 5 /
0.66 Hz and under hit-stop. Backed out, verbatim:
`FAIL §4 at 0.66 Hz the replay ran 121.21s of wall clock, not the 4.00s
REPLAY.wall claims`.

**The withholding is untouched.** `isSummary` still carries `&& !replaying`, the
results panel is still held back for the whole beat, and `replayshot` still
photographs `SKIP ON screen, results panel held back` with `the results panel
never overlapped the replay` passing on every scored case.

**And "GREEN 14/14 on main" is a property of a quiet box.** Three runs of
`origin/main` in one window here read 12/14 RED, 12/14 RED, 15/15 GREEN, the two
reds failing on a FIGHT AGAIN press that landed 19.3 s and 15.5 s after the
verdict because the first summary frame jams the main thread. See
`docs/OPEN-DEFECTS.md`.
