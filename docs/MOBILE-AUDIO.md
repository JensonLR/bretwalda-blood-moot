# The phone is silent, and the test that should have caught it passed

The owner, hours after sound shipped: *"cant hear anything on mobile full volume
& ringer turned on."*

Desktop works. This is the exact failure `docs/SOUND.md` named as the most
common way browser audio ships broken — and the harness written to prevent it
reported 7/7.

---

## The test gap, which is the real defect here

`tools/phonesound.mjs` proves the unlock path at a 390x844 touch viewport with
Chromium's autoplay policy left in force. That is a genuine test and it passes.

**It cannot prove iOS.** It runs headless Chromium on Linux. iOS Safari has a
different and stricter Web Audio implementation, and the rules that actually
bite there — gesture-token lifetime, the hardware silent switch, `webkit`-
prefixed behaviour — are not present in Chromium at all. So a green
`phonesound` says "the unlock logic is coherent", not "it makes noise on a
phone", and those were treated as the same claim.

That is the fifth time on this project a green result has not meant what it
appeared to. It is also the least excusable, because the doc predicted this
exact failure before the code was written.

## What has been ruled out, by reading rather than guessing

`unlock()` in `src/game/client/render/audio.ts` is written correctly for iOS:
it constructs the context **synchronously**, plays a silent one-sample buffer,
and only then awaits `resume()` — all before the first `await`, so the gesture
token is intact. That is the textbook sequence and it is not the bug.

Mute defaults to `false` and is only true if `bretwalda.audio.muted === "1"` is
in `localStorage`.

## Candidates, in the order worth checking

1. **A stale bundle on the device.** Sound merged only hours before the report.
   Mobile browsers cache aggressively; a phone running the previous bundle is a
   genuinely silent build. Ruled in or out by a hard reload — do this first,
   because it costs nothing and would explain everything.
2. **A persisted mute.** The HUD toggle writes `localStorage`, so one stray tap
   is sticky across sessions.
3. **iOS silent switch.** On iPhone, the hardware switch mutes Web Audio in
   Safari. The owner reports the ringer on, which rules this out for an iPhone,
   but it is the classic cause and worth confirming against the actual device.
4. **`UNLOCK_EVENTS` missing the gesture the phone actually sends.** The
   listeners are `capture: true, passive: true` on `window`, which is right, but
   the event *list* has not been checked against what iOS delivers for a tap on
   a React button inside a canvas overlay.
5. **The context resuming and the graph being silent** — unlock succeeding while
   the master bus, tier budget, or a zero gain leaves nothing audible. `ready`
   would be true and the phone still quiet.

## What would actually settle it

A real device. Nothing in this container can run iOS Safari, so no test written
here can close this. The cheapest real evidence is the owner opening the page on
his phone and reporting whether `window.__audio?.ready` is true after a tap —
that single boolean splits the space in half: false means the unlock never ran,
true means the graph is silent and the fault is downstream.

**Do not add another Chromium test and call it proven.** That is what produced
this entry.

---

## Resolved — it was the stale bundle

The owner reports sound working on mobile. No code changed between the report
and the fix, so candidate 1 is what it was: the phone was running the bundle
from before audio existed, which is a genuinely silent build.

**The test gap above is not resolved and this entry stays open for it.**
`phonesound` was green while a phone was silent. It happened to be green for an
honest reason this time — the deployed code really was fine — but it would be
just as green if iOS Safari broke the unlock tomorrow, because it cannot run
iOS Safari. Nothing has been learned about the thing it claims to prove.

Two things follow, and they are the point of keeping this:

- **Treat `phonesound` as proving the unlock LOGIC, never the platform.** Say so
  in any report that cites it. The temptation to write "verified on mobile" off
  a Chromium run is exactly how this entry came to exist.
- **A stale bundle is now a known cause on this project.** Sound merged hours
  before the report, and the first instinct was to distrust the code. Anything
  shipped in the last day should have a hard reload ruled out before it is
  debugged — it costs the owner ten seconds and it saved a wasted pass here.

---

## The SECOND mobile audio problem, and it is not the unlock

Everything above is about whether a phone makes any sound at all. There is a
separate problem underneath it, and it was live the whole time this document was
being written about silence:

> **A phone that is playing the game perfectly is playing a fight with the blows
> deleted and the ringing left in.**

A micro-speaker in a phone is a few millimetres of cone in a sealed sliver of
air. It is flat enough from about 700 Hz to 8 kHz and it falls off a cliff below
that — measured against the model in `tools/soundtest.mjs`, roughly −6 dB at
400 Hz, −21 dB at 200 Hz and −49 dB at 80 Hz. Every gram of weight this engine
synthesises lived between 46 and 190 Hz: a flesh hit falling to 62, a shove's
drive to 56, a body meeting the ground at 44.

Measured through that model, before this was fixed:

```
flesh light      loses  -22.1 dB          parry   loses  -0.1 dB
flesh heavy      loses  -20.3 dB          mail    loses  -4.5 dB
shove            loses  -22.2 dB          shield  loses -12.9 dB
```

The blow that matters most lost 22 dB and landed 19 dB under the parry. **This is
not a volume slider.** Turning the phone up turns the ringing up with it, and the
ordering of the fight is what has changed, not its loudness.

### The answer: the missing fundamental, not a bass boost

`body()` in `audio.ts` is the whole of it. Every low body note in the game goes
through it, and on a small speaker it additionally emits **the two consecutive
harmonics that straddle 560 Hz** — chosen by where they LAND, not by harmonic
number, and taken from the geometric mean of the note's sweep so a falling body
does not take its harmonics out of the passband on the way down. Their spacing is
the fundamental, so the ear rebuilds the note it cannot hear. It is what lets a
60 Hz bass line survive a laptop speaker and it is what a phone's own DSP does.

Three design decisions inside that, each of which could have gone the other way:

1. **It reinforces, it does not replace.** The fundamental is kept at 0.45. It is
   inaudible on the speaker and it eats limiter headroom the audible part of the
   mix needs — but a phone with headphones plugged in is still a phone by every
   sniff available, and taking the bottom octave from a listener who can hear it
   is the worse error.
2. **Noise gets moved, not reinforced.** A lowpassed rumble has no harmonics to
   reinforce, so `lift()` simply moves those bands up by 2.4x. It is only ever
   called on content below the speaker's corner. The mail's 3 kHz jangle is fine
   where it is and must not be touched, or the four materials stop being ordered
   and the read goes with them.
3. **The detection is a sniff and is named as one.** There is no Web Audio API
   that says what is on the other end of `destination`, and none that says
   whether headphones are in. `detectSpeaker()` calls a touch device with a short
   side under 950 CSS px a phone. `setSpeaker()` overrides it. Being wrong is
   cheap in one direction — a desk mistaken for a phone gets a harder-edged blow —
   and expensive in the other, which is the bug this exists to prevent.

After it: every blow loses between 0.2 and 2.3 dB, and the read survives the
speaker at 2.3 JND on its worst pair.

### What grades it, and what it does not prove

* `soundtest` phase 4 renders every event twice — once for a desk, once for a
  phone — and puts the phone render through a **calibrated** filter. The filter
  is checked against tones of known frequency in phase 1; its first version was a
  24 dB/octave wall that read −33 dB at 200 Hz, which is steeper than any real
  driver and would have condemned sounds a phone can reproduce.
* `phonesound` adds the same shape as real `BiquadFilterNode`s spliced onto the
  live app's destination, and asserts the engine's own detection fires at
  390x844.

**And it proves nothing about an iPhone.** That is the whole point of this
document. Both instruments are MODELS of a small speaker, run in Chromium on
Linux. They say what a speaker with no low end cannot reproduce. They do not say
what your phone sounds like, and the only thing that ever will is the owner
holding one. The line above this section stands unchanged and now covers two
claims instead of one: `phonesound` proves the unlock logic and the mix's
low-end survival **as modelled**, never the platform.

---

## SETTLED — the handle inside the fight is the same handle, and the probe was the bug

This section was **OPEN** for a wave. It recorded that
`window.__bretwaldaAudio` had `setSpeaker` on the landing screen and that
`typeof a.setSpeaker` read `"undefined"` inside a fight, and it offered two
candidates. The second one — quoted here as it stood, because a doc that hides
what it used to say is worse than one that was wrong —

> **Two module instances.** `src/app/page.tsx` imports
> `"../game/client/render/audio"` and `GameCanvas.tsx` imports
> `"./render/audio"`. They resolve to one file and a correct bundler gives one
> instance — but if they ever did not, the consequence is severe and quiet:
> **two engines, two AudioContexts, and a mute toggle that silences one of
> them.**

**was wrong, and it should have been condemned when it was written.** The
section itself says so two paragraphs later — *"candidate 2 does not explain a
missing method, only a second copy of a complete one"* — and that sentence is
the whole answer. Two contexts explain a duplicate. Nothing about them removes a
method from an object.

**What actually happened.** `window.__bretwaldaAudio` is a **class instance**.
Every method on it lives on its prototype and is non-enumerable, so the
instance's own enumerable keys are its fields and nothing else. Any probe that
carries that object **out of the page** — `page.evaluate(() => window.__bretwaldaAudio)`
returns a structured clone, and `Object.keys()` returns own enumerable names —
sees the fields and none of the methods. Demonstrated on a two-line stand-in
with no app, no bundler and no browser in the path:

```
typeof a.setSpeaker  = function
Object.keys(a)       = ["ready","_speaker"]
prototype own names  = ["constructor","setSpeaker","speaker","hit"]
after a structured clone: typeof clone.setSpeaker = undefined
```

The last line **is the reported symptom, verbatim**, produced by a correct
single-instance engine. The reading was taken in Node about a copy of an object
whose prototype chain had been cut off on the way out of the browser. This is the
same family as everything else in `docs/PROCESS.md` part 1: **the ruler measured
the wrong quantity**, and the quantity here was "what survives serialisation"
rather than "what the fight is holding".

**And it is a gate now, not a note** (`docs/PROCESS.md` R6). `phonesound` asks
the question **inside the page**, where a prototype still exists, and fails if
the answer is ever really no:

```
PASS  the fight holds the same audio module the landing screen does
      setSpeaker is a function inside the fight and speaker reads "small";
      the instance has N own enumerable keys and M prototype methods — a probe
      reading Object.keys(), or one that carries this object out of the page,
      sees NONE of them
```

If the bundler ever really does hand the fight a second module instance, that
check goes red and the two-context hypothesis comes back with evidence behind
it. Until then it has none, and this document no longer asserts one.

**What is still true and unchanged.** The phone mix is **proven offline and
unproven on iOS**. `soundtest` phase 4 renders both mixes and grades them
against a calibrated small-speaker model with no bundler in the path, and
`phonesound` measures the live app through real biquad filters of the same
shape. Both are **models of a small speaker running in Chromium on Linux**. They
say what a speaker with no low end cannot reproduce. **Only the owner holding a
phone can say what a phone sounds like.**
