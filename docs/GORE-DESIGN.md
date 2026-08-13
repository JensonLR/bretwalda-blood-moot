# Dismemberment and blood

A death should tell you how it happened. The limb that took the killing blow
comes off, blood goes with it, and the body falls without it.

This is the feature the game's owner asked for, in his words: *"if it hits
neck/head the head falls off & spits blood out, arm hit, arm falls off and
sprays blood. same for legs etc. If waist is hit then it should be like one of
those samurai scenes where the body is split laterally across the waist & both
parts fall to the floor separately."*

Reference class for the feel: Mordhau and Chivalry 2. Both dismember on the
killing blow, both spray from the stump rather than from a generic point, and
both let the severed part carry its own momentum.

---

## The blocker: the server does not know where a hit landed

`applyDamage` (engine.mjs) broadcasts:

```
{ type: "hit", data: { type, attackerId, targetId, damage, health, direction } }
```

`direction` is the attacker's swing direction — `left`, `right`, `overhead` or
`stab` — not a place on the body. Nothing anywhere in the sim carries a hit
location, so there is currently no way for the client to know which limb to
remove. **This is the whole of the work; the visuals are downstream of it.**

## Where the location should come from

The server is authoritative and must stay so — the client cannot decide what
came off, or two players watching the same death would see different bodies.

Derive it in `processAttack`, from what the sim already knows:

- **Swing direction** is the strongest signal and already exists. An overhead
  chop lands high; a horizontal swing lands at the mid-line; a stab lands where
  it is aimed.
- **Relative height** between attacker and target. The classes are not the same
  height and the sim knows both positions.
- **Approach angle** — `processAttack` already computes `angleDiff` between the
  attacker's facing and the target. A blow from behind should not sever a face.

Map to a small, closed set the client can switch on, and put it in the wire
message so replays and spectators agree:

```
hitZone: "head" | "neck" | "armL" | "armR" | "legL" | "legR" | "torso" | "waist"
```

Add it to the `hit` broadcast and to `kill`, since the kill message is what
drives the death sequence.

Keep the damage model honest while you are there: a head or neck hit should be
worth more than a leg. That is a balance change, so state it explicitly rather
than sneaking it in — and check it against `WARRIOR_STATS` before shipping it.

## What the client does with it

`characters.ts` builds warriors as merged `Part` geometry, and `anim.ts` now has
elbow and knee joints. A severed part has to be a real object with its own
transform, so it can fall on its own.

- **Head / neck** — the head comes off at the collar, the body drops. The
  severed head keeps the helm it was wearing.
- **Arm** — off at the shoulder or elbow depending on where the blow landed.
  The dropped arm should still hold whatever it was holding; a hand releasing a
  sword mid-air is the detail that sells it.
- **Leg** — the body falls toward the missing side rather than straight down.
- **Waist** — the samurai case. The body separates into two halves that fall
  independently: the upper half forward onto its face, the lower half folding
  where it stood. This is the hardest one and the most memorable when it works.

Blood is `vfx.ts`: a burst from the stump on the frame of separation, then a
weaker continuous spray for a beat as the part falls, then pooling. It must
arc under gravity and land as a decal — the panels have twice noted that
particles which ignore gravity read as confetti.

See **§ The shape of the spray** below for what "arc" now means as a number,
and for the elevation ceiling that is the reason it can be thrown hard.

## Constraints

- **No new binary assets.** Everything procedural, like the rest of the game.
- **Pooled.** Eight warriors can die in a brawl. Severed parts and blood
  emitters allocate from a pool; nothing churns geometry per frame.
- **Quality tiers.** The low tier may reduce particle counts and skip the
  bisection, but a death should still read as a death on a phone.
- **The corpse still has to work.** Bodies persist, respawn in solo, and are
  spectated. A dismembered body must clean up on respawn and must not leak.
- **Late joiners and spectators** see the `kill` message, not the `hit` — make
  sure the zone survives into whatever state a client reconstructs from.

## A note on tone

This is a Dark Age melee game about killing people with axes; blood is the
point and it should land hard. Keep it to combat: dismemberment on a killing
blow, blood from wounds. There is no reason to go further than the reference
class, and the game is a drop-in link that lands in group chats, so the default
should be something an adult would happily show a friend.

---

## The round boundary owns the blood

The owner, playing: *"when loading into a second round blood floating in mid
air."*

It is the countdown flash again in a different organ — **an effect the client
owns whose ending condition the server owns**. `engine.mjs` ends a round, waits
out `ROUND_BREAK` (5 s), stands every warrior on a fresh ring and starts the
next; nothing on the client side spent what the last round had left. The numbers
say it cannot have worked: a thrown stain lives **26 s**, a pool **70 s**, a mark
of blood stuck to a man's skin **30 s**. All three outlive the break.

The airborne half is the marks on skin. One is stored in the local frame of the
victim's **spine** bone, so it is redrawn at chest height wherever that bone has
got to — measured leaving round two with blood at **y = 1.8 m**, and, when a
death lands on the turnover frame, 191 droplets still flying at **y = 3.3 m**.

Three pieces, and each has exactly one owner:

| what | where | says |
|---|---|---|
| **when** | `src/game/roundreset.mjs` → `roundBoundary(prev, next)` | a new round has been dealt: `roundIndex` rose, or the room entered `countdown` on a packet too thin to carry an index. Never on the way *down* to the lobby — the match-end tableau is staged over the corpse the last round left, and its pool has to stay. |
| **what** | `vfx.clearBattle()` | stains, pools, marks on skin, running stumps, blood in the air, shockwave rings, blade ribbons and burning men. Stumps end **without** dropping their pool: a wound that stopped because the round stopped has nothing to drip onto. The arena's own dust, embers and smoke are kept — the bonfire burns through an intermission by design, and `dustSeeded` is a one-shot, so emptying the store outright would put the arena out for good. |
| **proof** | `tools/goretest.mjs` (`npm run goretest`) | a real best-of-3 duel on the real engine, replayed through the real `vfx.ts` on the CPU. No browser. |

`vfx.census()` is the instrument: it counts all six pools and reports the
**height** of the highest leftover, because a stain on the ground and a stain in
the air are different bugs and a count cannot tell them apart.

`node tools/goretest.mjs --blind` runs the whole suite against a client that
never calls the reset — which is what shipped — and is kept permanently as the
proof of failure.

---

## The shape of the spray

The owner, 12 Aug: *"Think it's in already but more blood splattering &
spraying. Really over the top"*.

It was in, and it was quiet. Measured on the code this replaces, a severed
throat threw a mean of **1.37 m**, a furthest of **2.75 m**, and left **7**
marks on the ground — blood landing on the man's own boots.

**A count could not see that**, which is why nothing caught it. Sixty droplets
that go nowhere and sixty that lay a stripe across four metres of turf are the
same number, and `census()` only ever counted. So `vfx.probe()` reports **raw
positions, velocities and mark centres — no derived quantity and no verdict** —
and every statistic is computed in `tools/goretest.mjs`. That separation is the
point: a module that scored itself would be a module the harness agreed with by
construction.

### The four properties, and the control

| property | what it catches | now |
|---|---|---|
| **reach** | a spray that dribbles down the body | mean 2.8 m, furthest 5.8 m |
| **direction** | a spray that fans off anywhere | 100% of marks on the wound's side |
| **elongation** | a *hard* puff, which is still round | 4.4× longer along the axis than across |
| **rise** | a flat throw with no curve in it | 1.2–1.9 m above the wound |
| **pulse** | a hose with a wobble in it | falls 96% away between beats |

The **control** is `burst({ kind: "blood" })` with no direction — the
compatibility shim `BurstOptions` documents, which fans off at a random bearing
by design. Same module, same frame, same quantity of blood: it must FAIL
direction and elongation. That is the section's proof that the ruler can tell an
arc from a puff, and it runs on every invocation.

### The elevation ceiling, and the finding it preserves

`vfx.ts` carries a note recording that an earlier pass threw at
`3.6 + 4.4·force`, that a gout left the stump at 11 m/s, and that it was "still
six metres out and three up when the camera took the picture". The throw was cut
for it, and the note is right.

**That pass was not wrong about the airtime — it was wrong about where the
airtime came from.** Range goes as *v²* and airtime as *v·sinθ*, so the entire
cost of a hard spray is paid by the droplets that leave STEEPLY. `RISE_CEIL`
folds the top of the cone down to 41° above horizontal and blends the folded
droplet's bearing toward the wound's own axis, so what would have gone up goes
downrange instead. With it the throw nearly doubled and the arrival time did not
move: **0.77 s, against 0.92 s for the same spray without the ceiling.**

That constraint is now `goretest`'s **AND IT ARRIVES** claim rather than a
comment, because a finding that only lives in a comment is a finding the next
pass undoes. Its bar is arithmetic, not taste: a wound sits about 1.46 m off the
turf, so **0.40 s is gone to the fall before any throw is added**. The comment
beside the original finding said "within about half a second"; half a second was
never physically possible from a wound at chest height, and main measured
0.76 s. Corrected.

### How long it stays

| mark | was | now | ends because |
|---|---|---|---|
| pool | 70 s | **210 s** (100 on low) | `clearBattle` at the round boundary |
| thrown stain | 26 s | **90 s** (45 on low) | same |
| blood on skin | 30 s | **120 s** (60 on low) | same |

The brief asks for pooling that "persists for the round", and **a round has no
clock on it at all** — `endRound` fires when men die, and the duel `goretest`
drives takes two and a half minutes to get there. A pool that dried at seventy
seconds was gone before the round it was spilled in had finished. These numbers
can be longer than a round precisely because the boundary is what ends them.

### Blood on the camera

The brief's third surface — "on the ground, on nearby men and on the camera" —
and the only one that is not in the scene. `vfx.ts` decides when; `postfx.ts`
draws it, because a thing in front of the lens can only live in the pass that
owns the frame.

**It is absorption and nothing else.** `docs/DESIGN-SYSTEM.md` §1 adopts the
cold Trewhiddle palette on the argument that a cold world makes blood the only
warm thing on screen, so blood "needs no glow, no pulse and no siren to read".
So the film does what a film of blood does: Beer–Lambert with σ = (0.55, 3.4,
4.0), haemoglobin's own shape — red passes almost untouched, green and blue are
eaten. Deep red, and **not one unit of light added to the frame**. `goretest`
reads the shader block and fails on any `hdr +=` inside it, which is the design
law made checkable.

It is triggered **at the wound**, not by a droplet reaching the lens, and the
number behind that approximation is worth stating: the follow camera sits 4.4 m
behind the local warrior and a droplet's range from chest height is about 4.7 m,
so a collision-driven version would fire perhaps once an evening. What the
feature is about is being opened up in front of the camera, and that is what is
tested for — within 5 m, and with the spray axis within 76° of the lens. The
paired negative cases are gated too: twelve metres away, behind you, or spraying
across the frame all leave the glass clean.

### What the phone loses, said plainly

`decalBudget` is **24 on a phone against 64 on a desktop** (8 on the low tier),
and `particleScale` is 0.7 and 0.4 against 1. Measured over thirty wounds a tier:

```
high    12.9 marks a wound (worst 9), furthest 6.01m
medium  11.2 marks a wound (worst 6), furthest 5.61m
low      6.3 marks a wound (worst 2), furthest 5.86m
```

**The reach is the same on all three.** What the phone loses is how much of it
the ground keeps, and how long: its pool dries at 100 s against 210. What it
does not lose is a death that reads as a death — no wound on any tier leaves the
ground clean, and that is a gate rather than an intention.

---

## The death camera

The owner, 12 Aug:

> *"When you die you should be able to see long enough for you body to be
> stumbling to the floor spraying blood everything before the view moving or
> changing away from the map, it could move to show best angle of the the
> severing of the body part / death at point of death."*

Read that sentence in order, because the order is the design: **see first, move
second.**

### What shipped did neither

`GameCanvas.tsx` had one branch for a dead man:

```
if (localPlayer && localPlayer.state !== "dead") ... "follow"
else { focus.set(0,0,0); setMode("spectate") }
```

so the frame your death lands on is the frame the lens leaves you. Focus snaps
to the middle of the arena and `camera.ts`'s spectate orbit lerps out to a 15 m
ring at 7.5 m looking at (0, 1.4, 0). Measured on a real duel: **4.8 m from the
wound at the instant of death, 10.6 m a second later.** The collapse `anim.ts`
spends 1.1 s authoring, the stump that runs for 1.8 s and the pool it drops at
the end of it were all played to an empty house.

### The shape of the hold

| beat | seconds | what the lens does |
|---|---|---|
| **fall** | 1.25 | nothing at all. It is where the follow camera left it, and you watch your own body buckle from the view you were playing in a moment ago. **No cut** — a cut here throws away the one thing the player is trying to understand. |
| **move** | 1.15 | eases round to the side the wound faces and comes in close. This is "it could move to show best angle of the severing". |
| **linger** | 0.70 | sits there while the stump runs out and the pool spreads. |

**3.10 s, identical on every tier.** The instinct everywhere else in this
repository is that the phone gets less; here it gets exactly the same, because
nothing else is on screen — no eight bodies, no input, no swings to resolve. The
death is the one moment a phone can afford to look expensive. What the phone
loses is decals and droplets, which is `quality.ts`'s business, not seconds.

### Where it lives, and why that is a separate file

`src/game/deathcam.mjs` — the whole decision, as arithmetic over plain numbers.
No THREE, no DOM, no React. Same arrangement as `roundreset.mjs` and for the
same reason: **a decision that only a browser can reach is a decision that
drifts.** `tools/deathcamtest.mjs` drives the real module, not a model of it.

It exports **no measurement**. Every angle in the harness is computed there,
from `position`, `target` and `fov`, so a harness that agreed with it by
construction was never possible.

The rig is aimed through `setSummaryShot` with `from == to`, which is
`camera.ts`'s "put the lens exactly here and look exactly there" — no shake, no
bob, no lock reticle, all of which are wrong over a corpse. **`camera.ts` is
untouched**, and every eased frame belongs to `deathcam.mjs`, where it can be
asserted.

### It runs during the round break too, and that is the case

`checkRoundEnd` fires on the tick the last man falls, so **in an honour duel the
very packet that first reports your death is already `intermission`.** A hold
wired only into the fighting branch would never once run in the mode the owner
plays. So the predicate is `live` — fighting, last stand or the break — and it is
false for the countdown (a new round is being dealt and you are standing up
again) and for the match summary, where `render/summary.ts` owns the lens.

### It costs the living nothing

Three ways, and the third is arithmetic rather than intent:

1. It ends on **any input** — keydown, mousedown, touchstart. Both platforms.
2. It ends on **its own clock**, and releases the instant the next round is dealt.
3. It **fits inside the break the server already takes**: 3.10 s of hold inside a
   break measured at 4.99 s on the harness's own packets — not copied out of
   `engine.mjs`, because a constant copied into a harness stops tracking the
   thing it was copied from.

It sends nothing, decides nothing the server decides, and no other client reads
it. The seven men still fighting cannot tell whether the eighth's lens is on his
corpse or already back on the arena.

### The two rulers that were wrong

Recorded because both looked right:

* **"In frame" is not "the subject".** The first `heldFor` asked only whether the
  wound was inside the middle fifth of the frame — and on a run where the man
  fell near the middle of the ring, the *shipped* orbit held that for 3.98 s. The
  proof-of-failure PASSED against the defect. A wound thirty pixels tall is in
  the picture; it is not the subject of it. "Subject" is now two conditions and
  the second is about size: the body must fill **at least 22% of the frame's
  height**. Shipped orbit: 18%. End of the hold: the frame.
* **The head was off-axis and the legs were fine**, which is how a framing fault
  hides. The aim point followed the severed part weighted by distance alone, so a
  head on the turf a metre and a half away still pulled the aim a quarter of a
  metre — 117% of the framing budget on `head` and `neck`, 43% on `legL`, because
  the drift is proportional to how far the part has got and a leg does not go
  anywhere. **The part is the subject at the instant of separation, not two
  seconds later**, so the weight decays with the swing as well as with the gap.

### Known open, and not mine to fix

* **`anim.ts:3809` — the shared one-shot clock.** `motion.actT` is incremented
  for `dead || rolling || staggered || casting || shoving` and reset only when
  the warrior is in none of them, so a death that follows a stagger, dodge, cast
  or shove **inherits that state's elapsed time**. `deathLayer(motion.actT, …)`
  then starts past its own `rest` window at 1.1 s: the knees never fold, and
  `settleOnFeet` seats a horizontal body on a nearly straight leg. That is the
  "corpses float mid-air" defect (BACKLOG 1.3), and it also means
  `if (dead && motion.actT <= dt) motion.fall = …` on the next line never fires,
  so the body topples on a stale bearing. The fix is a reset on the transition
  *into* dead. The death camera aims at the rig's live position, so it frames a
  floating corpse correctly and cannot hide this.
* **The `FALLEN — Spectating the survivors…` overlay** lands the instant you die
  and covers the middle of the screen for the whole hold. It is DOM, not canvas,
  and it belongs to the HUD layer. The hold is now the thing behind it, so the
  overlay wants to become small and cornered, or to wait out `DEATH_HOLD.total`.
  Found by `tools/goreshot.mjs`, which is the only instrument in the repository
  that photographs a real death with the real HUD over it.

---

## What was looked at, and what the frames still say

Three captures were read with eyes, not just measured:

* `art/shots/gore/gorehead.png` — a beheading. The head is off and on the turf,
  and the ground carries the blood across several metres.
* `art/shots/gore/goresplit.png` — the waist bisection. The best of the three:
  a **directional fan of elongated droplets** in the air, clearly along one axis,
  and half a dozen deep red ground marks spread over metres.
* `art/shots/gore/strip-*.png` — a real death in a real browser (see below).

**Two things the frames say that no number in `goretest` does.**

1. **The jet was idle two thirds of the time.** The first `gorehead` capture, at
   a 0.95 s settle, was a scatter of flecks — because `sin^1.6` is a narrow peak
   and a 0.18 floor meant most instants fell in the quiet part of the beat. That
   is what a real artery does and it is not what "over the top" means. The floor
   and `JET_RATE` were raised off that capture and nothing else.
2. **The ground marks read as mud until they were made bigger.** The count was
   already right — thirteen a wound — and the coverage was not. The decal budget
   caps how MANY marks there are and not how big each one is, so the mark size
   went from `size0 × 6.0` (ceiling 0.58 m) to `× 8.5` (ceiling 0.85 m), which
   costs nothing. Marks per wound fell to 9.4 as bigger marks merge more readily,
   and that is the better picture: a smear rather than a line of dots.

**And one the frames say that is still open.** The marks are matte. The decal
layer is a multiply blend with no specular term, so a fresh pool cannot be WET —
it can only be dark. Wet blood catching the bonfire is the single largest
remaining gain in this feature and it is a material change rather than a number.

### On `tools/goreshot.mjs` and its timings

It drives a real training match, waits for the arena to clear the forge, locks
onto the first death it can actually see, and takes a strip across it. It found
the `FALLEN` overlay and it is the right instrument.

**Its timings are not yet trustworthy on a software rasteriser.** A single CDP
screenshot took 20–40 s on this box, so a 3.10 s hold cannot be sampled: the
strip's frames land at t+17 s, t+60 s, t+79 s rather than at the beats they ask
for, and each caption honestly says so. Two faults were fixed on the way and are
worth keeping in mind for whoever runs it on a real GPU:

* Training respawns every five seconds, so an unlocked death stamp is re-pointed
  at the newest death between one shot and the next. The first run captioned six
  frames with a clock running BACKWARDS — t+34.87 s, t+16.63 s, t+9.04 s — because
  each caption was about a different man's death.
* The forge takes ~8 s to raise the sky and the fight starts behind it, so with
  three jarl bots the local man is dead before the loader clears. The second run
  locked onto that death and photographed the aftermath of two respawns later.

On a machine that can render this at thirty frames a second the strip is the
verdict for the hold. Here, the hold's evidence is `deathcamtest`'s twenty
claims and the frames are the evidence for the blood.

---

## The gates, and the two that go red for reasons that are not ours

| harness | claims | verdict |
|---|---|---|
| `tools/goretest.mjs` | 36 | green (15 before this work) |
| `tools/deathcamtest.mjs` | 20 | green |
| `tools/gracetest.mjs` | 15 | green, unchanged |
| `tools/protocoltest.mjs` | 75 | green — there is no wire change |
| `tools/touchtest.mjs` | 27 | green on the second run; **24/2 on the first** |
| `tools/cheattest.mjs` | 7 of ~12 | **red, and red identically on the commit before this work** |

**Both of the awkward ones were measured against the base rather than argued
away**, because this repository has eleven recorded instances of an argument
beating a measurement.

**`cheattest`.** Run four times. Three on this change: two died on a `LEAVE`
click that never became "stable", one on a `page.goto` timeout — all in browser
plumbing, all after every cheating assertion that had run had passed, and at two
different places, which is not the signature of a defect. Then commit `2117bf7`
— the state before any of this work — was checked out, rebuilt and run:
`EXIT=1, 7 PASS, page.goto: Timeout 30000ms exceeded`, byte-identical to the run
on this change.

**`touchtest`.** The first run on this change came back **24 pass, 2 fail** —
"left stick never turns the camera (yaw moved 1.5708 rad while walking)" and "a
committed swing still cannot follow the man the lock was handed" — against
**27/0 on the base**. That is what a real phone regression looks like and it was
treated as one. A second run on the same commit, same build: **27/0, exit 0.**
Not reproducible, and both numbers are recorded here rather than only the
convenient one. `1.5708 rad` is exactly π/2, which is the shape of a lock assist
snapping onto a target and not of anything in this unit — the death camera
cannot take the lens for a living warrior, because `createDeathCamera().update`
returns null unless `dead` is true.

The cause of all of it is the same: **this container rasterises WebGL in
software**. A single CDP screenshot takes 20–40 s, and Playwright's stability and
navigation waits are 30 s. Nothing in this unit touches `engine.mjs`, the wire,
or any server decision.
