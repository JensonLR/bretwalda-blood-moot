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

## 2. What was wrong, and what it is now

| | before | now |
|---|---|---|
| heavy vs light, same material | 0.38–0.83 JND | 3.66–5.04 |
| axe vs seax on the same mail | 0.25 JND | 2.85 |
| the parry's shimmer | 0.02 | 0.40, against 0.08 for the next |
| a flesh hit through a phone speaker | −22.1 dB | −2.3 dB |
| my own parry against eight men | +0.0 dB of duck | −10.3 dB |
| a parry into a full voice pool | 1.03x — dropped | 664x |

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
the wire today (`GameCanvas` already passes `shield: !!slot.rig.shield`). They
are now 6.0 JND apart and both are in the graded blow set.

**"Spatialisation is a gameplay feature."** Unchanged, and now it has a second
job: the near/far split that carries the duck is the same split.

## 4. THE PARRY HAS NEVER PLAYED

This is the most important line in this document and it is a **wiring** defect,
not a synthesis one, in a file this unit does not own.

`tools/soundwire.mjs` is new and it exists for one rule — *a gate that is green
because the case is absent is not a gate*. It runs the real server, a real
browser and a real Training match, wraps a recorder around every method of the
live audio engine, plays for seventy seconds, and reports which sounds the game
actually asked for. `soundtest` grades the parry on five separate claims. The
game has never made one.

The mechanism, exactly:

* The server does broadcast it. `engine.mjs` sends
  `{ type: "hit", data: { type: "parry", damage: 0, ... } }`.
* **The client never listens to the `hit` message at all.** `GameCanvas.tsx`
  derives everything from snapshot deltas, and its call to `audio.hit()` sits
  inside `if (p.health < slot.prevHp - 0.5)`.
* A parry does **zero** damage. The branch is never entered, and the type it
  would derive is computed from the health delta and the blocking state, so it
  could never be `"parry"` even if it were.

Two more things `soundwire` reports, from the same call site:

* **No blow carries the weapon that threw it.** `audio.hit()` now takes a
  `weapon`, and the attacker is already resolved in that same block for the blood
  direction. Without it every blow in the game is a sword, and the axe-versus-seax
  work is dead code with a green test over it.
* Heavy and light are derived from `dmg >= 22` rather than from the wire's own
  `type`, which is a proxy that a zone multiplier can flip either way.

All three are one edit in `src/game/client/GameCanvas.tsx`, which belongs to
another unit. The engine side is done and measured; it is waiting for the call.

## 5. What grades it now

* `npm run soundtest` — **41 claims**, in five phases. Phase 1 calibrates every
  instrument against signals of known truth, including the three added this
  wave; two of the three were WRONG on their first run and the calibration is
  what caught them. Phases 3, 4 and 5 are the read, the phone and eight men.
  `SOUND_PHASE=3` runs one phase while iterating and says so on the verdict line.
* `npm run phonesound` — the unlock path on a real touch viewport, plus the
  engine's own phone detection and a live-app measurement through real biquad
  filters shaped like a micro-speaker. **It still proves the unlock LOGIC and
  never the platform** — see `docs/MOBILE-AUDIO.md`, which exists because that
  conflation shipped once.
* `node tools/soundwire.mjs` — which of these sounds a real match makes. **Red,
  for the reason in §4.**
