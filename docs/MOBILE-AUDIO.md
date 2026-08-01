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
