# The game is silent

The owner asked: *"Is it possible to also add accurate & beautiful sounds that
match all the in game actions & then unique but also beautiful sounds for the
screen interactions etc.?"*

Yes. And the constraint that makes it hard is the same one that makes it good.

---

## Where we are

`grep -rl "AudioContext\|new Audio\|<audio\|\.mp3\|\.ogg\|\.wav" src/` returns
**nothing**. There is not one sound in the game. A man is beheaded in silence.

For a melee game that is the largest missing sensory channel there is — bigger
than any remaining visual defect on the list, because sound is half of how a hit
*feels* and all of how you know something happened off-screen.

## It has to be synthesised, not sampled

**Zero new binary assets** is the rule the whole product rests on: the pitch is a
link dropped in a group chat that plays instantly, with no download and no
signup. A decent melee sample pack is 200 KB–2 MB. That is the difference
between "it just opened" and "it's loading", and it would cost far more than the
sound is worth.

So: **Web Audio synthesis**, built at runtime, exactly as every texture in this
game already is. This is not a compromise. A synthesised impact can be
parameterised by the thing that caused it — mass, material, force — which a
fixed sample cannot, and this game already knows all three.

The existing procedural texture work in `render/textures.ts` is the model: build
it in code, cache it, pool it, budget it by quality tier.

## What needs a sound

**Combat**, and it should be driven by data the sim already has rather than by a
lookup table of names:

- **Swings** — a whoosh whose weight comes from the weapon. The reach table is
  already per-weapon (runekeeper 1.70, berserker 2.20, huscarl 2.26, warden
  2.64) and so is the swing arc. Twin daggers and a Dane axe must not share a
  sound.
- **Impacts, and they must differ by what was hit.** Steel on shield, steel on
  mail, steel on flesh, and a parry are four different events and the player
  needs to tell them apart without looking. The server already sends `hitType`
  (`light` / `heavy` / `blocked` / `blocked_heavy`) and `hitZone`.
- **Blocks, dodges, footsteps** — footfall should follow the terrain the height
  field already describes, and the burn hazard already knows when a man is in
  the fire.
- **Death, and dismemberment.** These are the moments the whole visual feature
  was built for and they currently land in silence.
- **Fire** — a bed of crackle at the bonfire, and a man alight carries his own.
  This is the one continuous, spatialised source in the game and it doubles as a
  navigational cue.
- **Abilities** — four classes, four distinct signatures.

**Screens.** Tap, confirm, back, purchase, refusal, countdown, round won, round
lost, match won. These should be a *family* — same synthesis, same palette —
so the interface sounds like one instrument. The visual language is gilt,
garnet and knotwork on near black; the audio equivalent is struck metal and
low wood, not a modern UI blip.

## The traps, in the order they will bite

1. **Autoplay policy.** `AudioContext` starts `suspended` on iOS and Chrome
   until a real user gesture. Resume it on the first deliberate tap — the game
   has an obvious one, the button that enters a match — and never before, or
   the context is created dead and every later sound silently does nothing.
   This is the single most common way browser audio ships broken.
2. **Eight men in a brawl.** Voices must be pooled and capped, with a limiter on
   the master bus. Eight simultaneous deaths must not clip, and the same
   discipline that governs particle budgets in `quality.ts` applies here.
3. **Spatialisation is a gameplay feature, not polish.** In an eight-man
   free-for-all, hearing the man behind you is information. Pan and attenuate
   by world position relative to the camera. But keep it subtle — a phone
   speaker is mono and most players are on a phone.
4. **Phones.** Audio work is main-thread work. It must be budgeted by tier like
   everything else, and the low tier should thin the voice count, not the
   feedback that tells a player what just hit them.
5. **A mute that is remembered.** Profiles exist now and can hold it. Somebody
   opening this at work needs one obvious tap, and needs it to stick.
6. **Never carry information in sound alone.** Anything audio tells the player
   must also be visible — players are deaf, muted, or on a bus.

## How it gets judged, because you cannot look at it

This is the gate that makes the feature real rather than vibes, and it has an
answer: **`OfflineAudioContext` renders deterministically and far faster than
real time.** A harness can therefore assert on the actual samples:

- Peak below clipping, including eight simultaneous deaths.
- Envelope length within the intended window — a "click" that rings for two
  seconds is a bug.
- Spectral centroid separating events that must be distinguishable: a shield
  block and a flesh hit should not land in the same place.
- Nothing emitted at all before the context is unlocked.
- Voice count never exceeds the tier budget.

That is a `soundtest.mjs` alongside `playtest`, `touchtest`, `firetest`,
`profiletest` and `cheattest` — same shape, same discipline: measured, not
asserted. **The owner is the final ear.** Everything above proves it is not
broken; only a person can say whether it is beautiful.

## What shipped

All of it, in two passes, and the harness that grades it was built before the
second one landed.

- `src/game/client/render/audio.ts` — the engine. Synthesis only; not one byte
  of sampled audio, and no `three` import, so the landing screen carries it
  without dragging the renderer in.
- Combat is wired in `GameCanvas.tsx` beside the `vfx` call that draws the same
  moment. The screens are wired in `app/page.tsx` by ONE delegated
  `pointerdown` listener: every button in the game is audible by default and
  `data-snd="confirm" | "back"` is what the load-bearing presses say instead. A
  screen added tomorrow is audible without anybody remembering.
- The nine screen sounds are one instrument — `strike()`, a bronze bar over a
  wooden board — played nine ways from one mode on one root. Measured:
  brightest/darkest 2.47x across the nine.
- The mute is on the profile beside the key bindings (`players.muted`), with
  localStorage as the fallback, and reachable in one tap from every screen
  including the fight.
- `npm run soundtest` (21 claims) and `npm run phonesound` (7 claims, a real
  suspended context at 390x844 with the autoplay policy left alone).

One thing was found by measurement and would not have been found any other way:
the mail was BRIGHTER than the parry, because its ring was built from square
waves and its transient from unbounded highpassed noise, so the "steel turned
by armour" out-sparkled the one event in the game that is supposed to ring
highest. See the transient comment in `impact()`.

**And nobody has heard it.** See `docs/OPEN-DEFECTS.md`.

## Scope note

This is a substantial feature — a synthesis engine, an event layer wired
through the sim's existing messages, a UI family, a mixer, and a test harness.
It is not an afternoon, and it should not be started with a nearly exhausted
budget and left half-built. Better silent than half-voiced.

---

# Wave 2 — combat that sounds like it weighs something

The owner: *"Satisfying sounds that compliment fighting."*

Everything above shipped and was green. `soundtest` reported 22/22 and every
claim in it was true. This section is about what all 22 of them could not see,
because **not one assertion in the file compared two sounds to each other**, and
the thing the owner is buying is exactly that comparison: *the player should know
without looking whether he was blocked, parried, or opened up.*

Two sounds a player cannot tell apart are one sound. Measured that way, the
shipped engine had four defects, all of them invisible to a green harness.

## 1. The ruler, and the axis it deliberately refuses

`soundtest` phase 3 takes a feature vector for every event the game can make and
a pairwise distance between all of them, in **just-noticeable differences**. The
axes are brightness, noisy-versus-tonal, attack, decay, body below 400 Hz, ring
above 3 kHz, and shimmer. A pair passes on Euclidean distance in that space —
the standard shape of a perceptual distance, because the ear integrates across
timbral axes — with a second condition that at least one single axis clears
1 JND, so nothing passes by accumulating seven inaudible differences.

**LEVEL IS NOT ONE OF THE AXES, and that is the whole design.** The mixer already
spends level on DISTANCE: a sound that is only louder is not a different sound,
it is the same sound closer. Until level stops counting, *"a heavy blow is not a
loud light blow"* cannot be falsified. With it excluded, the shipped engine's
heavy blows measured **0.38 to 0.83 JND** from their own light versions — the
same sound — while carrying 3 to 5 dB of level that a player cannot read.

The bar on the nine blows a player has to identify mid-fight is **3 JND**, not 1.
One JND is a discrimination threshold, measured on somebody doing an A/B in a
quiet room. Nobody in this game is doing an A/B.

### And the ruler measured one throw of the dice

Every number in the paragraph above used to be taken from **one render under one
pinned seed**. `noiseAt` starts every burst at a random offset in the shared
noise bed — deliberately, it is what stops a synthesised library sounding
machine-gunned — so the harness pinned `Math.random` to make its readings repeat.
That made them **repeatable and not true**. The shipped game draws a fresh offset
on every blow; the harness was measuring one realisation of a stochastic process
and printing it as a property of the engine. Re-run under other arbitrary seeds,
the worst blow pair read:

| seed | shield heavy / shove shoulder |
|---|---|
| `0x12345678` | **2.86 — fails the 3.0 bar** |
| `0x9e3779b9` | 3.20 — the seed that was committed |
| `0xdeadbeef` | 3.27 |
| `0x0badf00d` | 3.30 |

Margin over the bar 0.20; spread between draws 0.44. **About one realisation in
four of the shipped synth failed a claim this harness printed as proven** — and
the same seed took "no two events in the whole game are one sound" down with it,
on `swing sword / dodge`, where no single axis reached 1 JND.

**The measurement moved and no bar did.** Every event is now rendered under
twelve seeds, and a pair's separation is taken over the **full cross product** of
those draws — event A on draw *i* against event B on draw *j*, for every *i* and
*j*, because in a real fight the two blows being told apart are two independent
draws and comparing only *i* against *i* would keep a correlation the game does
not have. The **worst** case in that sample is what is gated, at the bars that
were already there, and the verdict line carries worst / median / best and the
sample size so a reader sees the variance instead of one lucky number.
`SOUND_SEEDS` under 12 says so on the verdict line: a sweep of 2 is not a sweep.
Phases 2, 3, 4 and 5 all sweep.

Hunting for a luckier seed would have been the same defect with a different
number. **If two events are only distinguishable on a good draw they are not
reliably distinguishable, and the fix belongs in the synthesis** — see §2.

## 2. What was wrong, and what it is now

| | before | now |
|---|---|---|
Every JND in this table is now the **worst of 144 draws** (twelve seeds, cross
product), not one pinned render — see §1.

| | before | now, worst draw |
|---|---|---|
| heavy vs light, same material | 0.38–0.83 JND | 3.06–3.92 |
| axe vs seax on the same mail | 0.25 JND | 2.77 |
| the closest pair of blows anywhere | 2.84 on a bad seed, 3.20 on a good one | 3.06 |
| the parry's shimmer | 0.02 | 0.40 at its weakest, against 0.14 for the next |
| a flesh hit through a phone speaker | −22.1 dB | −2.2 dB |
| my own parry against eight men | +0.0 dB of duck | −10.3 dB |
| a parry into a full voice pool | 1.03x — dropped | 659x |
| a parry, a shove or a knockdown reaching the mixer | never | 7 of 7 kinds |

**Weight.** `heavy` was `force *= 1.2` and nothing else. It now moves the contact
band down (a heavy blow has a bigger contact patch, which is lower and lasts
longer), the attack out by roughly an order of magnitude, and the decay out by
two to four times. Level moves by 1 dB. That is where weight actually lives.

**The weapon.** `impact()` now takes the attacker's class. There is a second
weapon table, `WEAPON_HEAD`, and it is deliberately not the reach table the
whoosh uses: a whoosh is tip speed and a spear moves the most air, but an impact
is what is behind the edge when it stops, and by reach the spear came out the
heaviest weapon in the game. A spear is 300 g of iron on a stick.

**The parry.** It has a signature nothing else has: it **shimmers**. Detuned
partial pairs give the texture; one shallow LFO across the whole ring gives the
depth, because partials at unrelated carrier frequencies sum in POWER and six
fully-modulated pairs compose to about 1/√6 of a modulation. It also **ducks the
room**: the crowd bus drops 10 dB behind it for a fifth of a second. That gate is
the one measurement here that nothing else could produce — *adding a sound to the
mix made the rest of the mix quieter*, which without a duck is arithmetically
impossible.

**The mix.** Two buses split by WHOSE event it is, not by what kind of sound it
is: `near` is what happened to me and what I pressed, `far` is the other seven
men and the fire, and only `far` is ducked. The voice pool used to refuse to
steal from an equal priority, so once eight men filled it with CRITICAL events
the next CRITICAL — the blow that just landed on me — was the one dropped, while
a hit from three seconds of tail ago kept its slot. Stealing now takes the voice
nearest its end and **stops its sources**, so the tier budget bounds the work and
not merely the audibility.

**A roll, and a shoulder shove.** Both were rewritten because the seed sweep
above showed them held apart from other events by nothing but a noise draw, and
both fixes are on axes a draw cannot move.

* **A roll is a man hitting the ground, not air moving,** and it was synthesised
  as air moving: one band of white noise, which is why the closest thing in the
  game to a sword swing was the dodge. It now has a **fixed corner over the
  band** — a bandpass biquad falls at only 6 dB/octave, so white noise through
  the 1450 Hz band was still open to Nyquist and the event measured 3889 Hz,
  the identical fault the mail's transient and the interface's mallet were both
  fixed for — plus two `body()` notes, a departure and an arrival, and turf under
  the shoulder. `body()` is a tone: it lands the same every time.
* **A shoulder shove's drive is short now,** 0.62 s of low body down to 0.17. It
  and a shield taking a heavy axe were both pure low end (0.99 of their energy
  under 400 Hz) with five of the seven axes dead between them, and everything
  holding them apart was a reading of one noise slice. Decay was the axis to
  open because it is the one that is **true**: a limewood board on an iron boss
  is sprung and rings on; a shoulder into a mailed chest does not ring at all,
  the air goes out of him and it is over. Both sides of that comparison are
  `body()` decays, so the pair went from 0.60 JND on decay to 2.53.

**The phone.** A micro-speaker is flat from about 700 Hz to 8 kHz and gone below
400. Every gram of weight in this game lived between 46 and 190 Hz, so a phone
got the fight with the blows deleted and the ringing left in. `body()` answers it
with the **missing fundamental**: every low body note also emits the two
consecutive harmonics that straddle 560 Hz, chosen by where they land rather than
by number, so the ear rebuilds the note from a series the speaker can actually
move. It reinforces rather than replaces — a phone with headphones in is still a
phone by every sniff available — and the fundamental is dropped to 0.45 because
it is inaudible on the speaker AND it eats limiter headroom the audible part of
the mix needs.

## 3. Where this departs from what the doc above says

**"Steel on shield, steel on mail, steel on flesh, and a parry are four different
events."** Still four. The brief for this wave asked for a fifth — *a haft into a
body* — and **there is no wire message that produces one**, so there is no `haft`
material. A material nothing can emit would be graded forever and heard never,
which is the exact failure `docs/PROCESS.md` rule 3 names. The nearest reachable
pair is the shove **with and without a shield** — a huscarl drives with a disc of
limewood and iron, everyone else with a shoulder — and those are two events on
the wire today. Both are in the graded blow set, so both clear **3 JND on a desk
and 2 JND through a phone speaker, on the worst of 144 draws.**

The two of them are also the clearest illustration in the file of why the phone
gets graded separately. On a desk they part on body weight below 400 Hz, which is
the band a micro-speaker does not have; hold them apart with that alone and they
are one sound in a hand. What separates them down there is the boss's **rim above
3 kHz** — an iron edge speaks where a phone can hear it and a shoulder in wool
cannot.

**"Spatialisation is a gameplay feature."** Unchanged, and now it has a second
job: the near/far split that carries the duck is the same split.

## 4. THE PARRY HAD NEVER PLAYED — fixed, and gated

This was the most important line in this document for a wave and a half, and it
was a **wiring** defect rather than a synthesis one. It is fixed now. The record
of what was wrong stays, because the shape of it is the thing worth keeping.

The server broadcasts **seven** kinds under one `{type:"hit"}` message — see
`docs/WIRE-PROTOCOL.md`. The client subscribed to **none** of them. `page.tsx`
routed every other message on the wire and dropped this one; `GameCanvas.tsx`
derived every blow from a snapshot delta inside
`if (p.health < slot.prevHp - 0.5)`. **A parry, a shove and a knockdown all
carry `damage: 0`,** so three of the seven could not enter that branch on any
input any player could give. `soundtest` graded the parry on five separate
claims — its envelope window, its place in the material ordering, its shimmer,
its duck of the whole mix, its survival of a full voice pool — every one green,
and no player had ever heard it.

Two more faults at the same call site: it passed **no weapon**, so every blow in
the game was synthesised as a sword and the axe-versus-seax work was dead code
with a green test over it; and it guessed the type as `dmg >= 22 ? "heavy" :
"light"`, a proxy a zone multiplier can flip either way and one that can never
produce `"parry"`.

**What it is now.** `page.tsx` queues the `hit` payload the way it already
queued emotes; `GameCanvas` drains the queue after the rigs have been stepped —
so a blow is placed on the man who took it — and calls `audio.hit()` with the
wire's own `type`, the attacker's class looked up from `attackerId`, the
`riposte` flag, and whether the shover was carrying a shield. The health delta
still owns the **picture**: the damage number, the blood, the recoil, the camera
kick and the rumble are all things a delta genuinely is the right source for. It
no longer owns the ear.

`audio.hit()` routes `parry`, `shove` and `knockdown` away before `materialFor()`
ever sees them, and `knockdown()` is new: weight arriving all at once with no
wind-up at all, and thirty pounds of mail and kit settling afterwards. It is the
only event in the game where the noise **outlasts** the thump instead of being
its transient, and that is its signature.

`shove()` splits into a **wind-up** and a **contact**, because the engine has
always had both. The grunt fires on the shover's state edge whether or not
anybody is inside the arc — a shove thrown at air is exactly the read the tell
exists to give — and the drive now fires only when the wire says one landed, on
the man who took it. It used to drive a body note into a man who was never
touched.

**The riposte** is a flag the wire sets on any of the four wounds, not a kind of
its own. The engine pays it in damage, knockback and poise (`RIPOSTE.bonus`
makes it the biggest single blow any class can throw); the ear was paid nothing.
It is now a **layer and not a fifth material** — the player still has to hear
*what* he hit, with the riposte's steel on top of it.

### Why a gate on the synthesis alone let this ship

Every claim `soundtest` makes is of the form *if this event is fired, it sounds
like this*. Not one of them can say whether the game ever fires it. That is
`docs/PROCESS.md` rule 3 — a gate that is green because the case is absent is not
a gate — and it now has a check on both sides of the wire:

* **`soundtest` phase 6** drives `hit()` with every kind the module *declares* in
  `WIRE_HIT_TYPES`, reading the list **off the module** rather than keeping a
  copy, and asserts three things: each kind is voiced at all, **no two of them
  arrive as the same sound**, and the riposte flag moves the blow. The second is
  separate from the first on purpose — before this round, `shove` and `knockdown`
  fell through `materialFor()` onto a light flesh hit and measured **0.00 JND**
  apart while "every kind reaches the mixer" passed.
* **`soundwire` phase 0** reads `engine.mjs`, `page.tsx`, `GameCanvas.tsx` and
  `audio.ts` off disk and holds them to each other. The kinds the engine
  **broadcasts** — extracted from its own `broadcast` and `applyDamage` calls,
  not from this document and not from a list inside the harness, which would be
  the fifth mirrored definition on this project — must be exactly the kinds the
  module declares, **in both directions**. A kind the engine gains and nothing
  routes goes red; so does a kind graded here that no fight can produce.

## 5. What grades it now

* `npm run soundtest` — **46 claims, 46 proven**, in six phases. Phase 1 calibrates every
  instrument against signals of known truth; two of the three added in wave 2
  were WRONG on their first run and the calibration is what caught them. Phases
  3, 4 and 5 are the read, the phone and eight men, and every pairwise claim in
  them is **swept over twelve seeds and gated on the worst draw** — see §1.
  Phase 6 is the wire's vocabulary. `SOUND_PHASE=3` runs one phase while
  iterating and `SOUND_SEEDS=3` thins the sweep; both say so on the verdict line,
  because a partial run must never be readable as a clean one.
* `node tools/soundwire.mjs` — whether the game can ASK for these sounds.
  **Phase 0 is 8/8 and needs no browser and no server** (`SOUNDWIRE_PHASE=0`,
  milliseconds): it reads `engine.mjs`, `page.tsx`, `GameCanvas.tsx` and
  `audio.ts` off disk and holds all four to each other.

  The live leg reaches a fight now — its menu path was three taps out of four and
  it then waited on `window.__probe`, which this build does not install — but it
  **cannot yet drive the man**: sixty seconds of play produce two audio calls and
  no swings, because pointer lock keeps the canvas from taking input in this
  container. That is reported as its own red line, and it is red on purpose:

  ```
  FAIL  the play loop actually drove the man, so the counts below mean something
        NO SWING IN 60s ... the live counts are ABSENT, not zero
  ```

  The four reachability checks below it are **skipped rather than failed**. Before
  that guard they all went red and blamed the health-delta branch that this round
  removed — a gate going red for the wrong reason is worth as little as one going
  green for the wrong reason, and it would have been read as "the parry still does
  not fire" when phase 0 had just proved it does.
* `npm run phonesound` — the unlock path on a real touch viewport, plus the
  engine's own phone detection and a live-app measurement through real biquad
  filters shaped like a micro-speaker. **It still proves the unlock LOGIC and
  never the platform** — see `docs/MOBILE-AUDIO.md`, which exists because that
  conflation shipped once, and which this round corrected again.

### One thing is RED and it is not a sound

`phonesound` reports **9/10**, and the one that fails is this:

```
FAIL  one tap on the toggle silences it and the device remembers
      button present reading "Turn sound off" aria-pressed=false, engine
      muted=false — tap DID NOT take, a synthetic click did not, and neither
      did a DOM click on the element, so the handler itself is not firing
```

**The mute button inside a fight does not respond to a press on a touch
viewport.** It is not a synthesis defect and it is not in this unit's files —
`SoundToggle` and `toggleMute` are in `src/app/page.tsx`. It is left red on
purpose.

Two things about how it was found are worth more than the defect. First, it had
been invisible: `phonesound` tapped a button named `WARRIOR` to reach a fight,
the Testgrounds now needs two presses to get there, so the run **threw a
TimeoutError and printed no verdict at all** — four PASS lines and a stack
trace, which reads exactly like a run that found nothing. The navigation is
fixed and the file now gives its verdict whether or not it reaches a fight, with
the miss on the verdict line. Second, the check used to report only `peak 0.78,
localStorage null`, which says the mute failed and nothing about where; it now
walks down from a real tap, to a synthetic click, to a DOM click on the element
itself, and names which rung moved it — so the next person inherits the
diagnosis instead of the symptom. Confirmed **not** caused by this unit's edits
by re-running against an unmodified `page.tsx`.
