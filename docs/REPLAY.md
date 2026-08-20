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

Against the real module, the same section — **and this block used to be one
lucky draw, which is the fault this project keeps recording**:

```
  §1 RECORD   228 frame(s) of a real fight replayed off the ring. Worst pose 0.39° outside the live track's
              own sampling bracket (bar 0.50°), worst 0.055s from the frame it claims to be (bar 0.025s).
  §2 CLOCK    opens 0.91s BEFORE the blow and runs at 0.498x over 4.00s of wall clock.
```

**`§1` IS RED ON THE DEFAULT FIGHT AND THE NUMBER ABOVE IS THE SEEDED ONE.**
What was printed here before — `-0.06°` and `0.022s`, green — was a real run and
not the module's result: `replaytest` was unseeded and drew a different fight
every time. Measured over twelve consecutive runs of that build it went **red in
seven of them**, with the phase column swinging 0.022 s to 0.055 s against a
0.025 s bar. Quoting the good draw is exactly the fault `docs/PROCESS.md` warns
about, and it is corrected here rather than re-run until it agrees.

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

| seed | worst pose outside bracket | worst phase offset | verdict |
|---|---|---|---|
| default | 0.39° | 0.055 s | RED |
| 1 | 0.31° | 0.038 s | RED |
| 2 | −0.03° | 0.022 s | green |
| 3 | 0.21° | 0.038 s | RED |
| 7 | −0.06° | 0.022 s | green |
| 11 | −0.02° | 0.022 s | green |
| 42 | −0.04° | 0.022 s | green |
| 99 | −0.04° | 0.022 s | green |
| 20260820 | 0.27° | 0.055 s | RED |
| 424242 | −0.06° | 0.022 s | green |

**Six of ten pass. The bar was not moved and the default was not re-picked.**
The seed is declared, so a green one could have been made the default with one
character; that would be choosing the fight to fit the gate, which is the same
move as choosing the bar to fit the fight.

**What the red means, as far as it has been established.** The pose is inside
its own bracket on every seed (worst 0.39° against 0.50°), so the recording is
not missing a field — that is what `--lever=live`, `--lever=drift` and
`--lever=clock` are for and all three still go red. What exceeds its bar is the
PHASE column, which locates a replayed frame in time by argmin over pose. Its
bar is derived as `1/60 + 1/120` — one live step plus one replay step — and that
derivation does not account for the **ring's own 1/20 s step**, which `slotAt`
resolves nearest-**at-or-before** rather than nearest. Where a discrete field
changes (the state enum flips to `dead`) no interpolator smooths it, and the
localisation floor is a recorded step, 0.05 s. The measured 0.055 s sits exactly
there. **That is a reading, not a finding, and the bar has been left alone on
purpose:** correcting a bar's derivation is the move that most resembles moving
one to buy a pass, and doing it at the end of a round to turn a red green is not
a call to make alone. It is written down so the next round can settle it.

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

Precedence is unchanged and is `deathcam.mjs`'s rule, enforced here too: **your
own death outranks it and the beat is never queued.** With the viewer's own hold
running, the replay holds 0 frames.

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

### And one question for the owner, raised by the measurement

The man who dies last is the commonest viewer of a match's final kill, and for
him that kill is his own — so `own` outranks and he gets his 3.35 s hold and no
slow motion. At a round break that precedence is clearly right (the two do not
both fit). At match END nothing is waiting on either. Whether the replay should
outrank the hold there is a call about the game and has been left alone.
