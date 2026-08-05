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
| you press, the man moves late | input latency | `latencytest input` |
| the man moves in steps | **judder** | `latencytest judder` |

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
- **Remote bodies render ~83 ms behind**, which is the 1.5-period buffer and is
  the price of never extrapolating a man you do not control.
- **Ripple is not the only number.** Read `|accel| p95` beside it.

## How to re-derive all of this

```
node tools/latencytest.mjs            # everything: tick, judder, input
node tools/latencytest.mjs judder     # the interpolation trace alone
```

The judder section replays the gaps section 1 measured off a real engine under
four concurrent matches and four CPU neighbours. **That makes it load-dependent
and it is a poor regression gate on a busy box.** If it reports a MEASURED-jitter
failure, do not reach for "the box was loaded" — sweep constant wake periods from
49 to 55 ms first. A real fault shows up at 50.5 ms on a silent box; box noise
does not.
