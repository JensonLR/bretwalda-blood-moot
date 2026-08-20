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
  §1 RECORD   228 frame(s) of a real fight replayed off the ring. Worst pose -0.06°
              outside the live track's own sampling bracket (bar 0.50°), worst
              0.022s from the frame it claims to be (bar 0.025s).
  §2 CLOCK    opens 0.91s BEFORE the blow and runs at 0.498x over 4.00s of wall clock.
```

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

## 5. NOT LANDED: the render wiring, and why not

**The module and its harness are done. The renderer is not wired to them, and
this is a refusal rather than an oversight.**

There is no GPU and no browser on the machine this was built on —
`npx playwright` reports `Executable doesn't exist at .../chrome-headless-shell`
— so `npm run shoot`, `roundbeatshot` and `freezetest --phases=freeze` cannot
run. R5 says open the render before telling the owner anything is fixed. A
playback branch in `GameCanvas.tsx`'s main warrior loop is a change nobody here
can look at, and the two most likely failure modes are both invisible to every
headless number in this repository: blood spawning twice, and the HUD running at
half speed with the bodies.

So the recorder is **not** wired either. An unused 56 KiB ring and a per-frame
call in every player's browser, for a feature nobody can see, is not a
foundation — it is dead code with a cost.

### What remains, precisely

`src/game/client/GameCanvas.tsx`, main frame function:

1. **Record.** One call where snapshots land, beside `lastFallRef`:
   `buf.record(simTime, Object.values(roomState.players))`. The recorder needs
   the SERVER's clock for its stamps, not the render clock.
2. **The seam is already single.** `const players = roomState.players;` (one
   line, ~1157) feeds the whole warrior loop. Swap it for `readInto`'s output
   while `update()` returns a frame.
3. **Thread the slowed dt.** `update()` hands back `dt` already multiplied by
   `rate`; the two calls in the warrior loop (`stepWarriorTransform`,
   `poseWarrior`) must take THAT, and nothing else in the frame may. Set
   `ctx.time = at`. Both are in `replay.mjs`'s header with the numbers behind
   them — §1 measured 83.27° of error on a knee from getting the first one
   wrong.
4. **Suppress the second cut's VFX.** `animHooks.onSever` spawns blood, decals
   and a stump through `stage.vfx`. The replay re-runs the death, so it fires
   again. *(The rig's own gore needs nothing: `poseWarrior` calls
   `reassemble(rig)` on any frame the man is not dead, and that clears
   `g.done`, so the body puts itself back together and re-cuts on its own.
   Verified by reading `anim.ts`; it is only the VFX side that needs a guard.)*
5. **The camera.** `runRoundCam` already reads the wound off the RIG via
   `bodyOf`, so pointing it at a rewound rig needs no change to
   `frameDeathShot`. Time is this module's; space stays `deathcam.mjs`'s.
6. **`src/app/page.tsx`.** `ROUND_HOLD_MS` is 2950 and `deathcamtest` fails if
   it stops agreeing with `ROUND_HOLD.total`. If the replay replaces the round
   beat, that constant becomes `REPLAY.wall * 1000` = 4000 and the gate must be
   pointed at the new number. At match end the summary has to be held off for
   `REPLAY.wall` and a skip routed to the lobby.

Whoever has a browser should run `roundbeatshot` across the break and at match
end before this is called done.
