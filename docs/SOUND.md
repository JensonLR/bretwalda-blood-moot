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

## Scope note

This is a substantial feature — a synthesis engine, an event layer wired
through the sim's existing messages, a UI family, a mixer, and a test harness.
It is not an afternoon, and it should not be started with a nearly exhausted
budget and left half-built. Better silent than half-voiced.
