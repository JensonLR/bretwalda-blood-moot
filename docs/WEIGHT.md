# Weight, handedness, and what a blow should feel like

The owner, after playing:

> *"The camera is over the left shoulder which feels like it would be better for
> left handed people with the sword in left hand too but most people would prefer
> I think with the camera over the right shoulder & weapon in the right hand.
> Also the spawning angle — the game should start with the camera centred looking
> in front of the player so it's ready to fight straight away. Turning as a player
> & attack animations are quite fast at the moment. Attacks would be cool to have
> some weight behind them so you almost feel every movement & hit, like For
> Honor. Sounds are basic but okay, would be good to have death sounds too, &
> victory & loss music, level up noise, purchase noise if not already."*

Four separate things. Taken in order of how much they change the game.

---

## 1. Weight — the big one

`WARRIOR_STATS.attackSpeed` is **0.4 s** (runekeeper) to **0.9 s** (berserker)
for an entire swing. That is the whole windup, contact and recovery. At 0.4 s
nothing can read as heavy, because there is no time in which to read anything.

This is a **server-side balance change**, not an animation tweak — the sim owns
`attackTimer`, the hit test and the bot cadence. Anything done only on the
client would desync from what the server thinks happened.

The reference is For Honor, and what it actually does is five things:

- **A windup you can see and react to.** The blow is telegraphed long enough
  that a defender has a real decision. This is what makes a fight a conversation
  rather than a coin-flip.
- **Commitment.** Once you swing you are swinging. Cancelling freely is what
  makes light attacks feel weightless.
- **Hitstop.** A few frames of freeze at contact, on both fighters. This is the
  single cheapest trick in the book and it does more for impact than any
  particle.
- **Recovery.** A whiff costs you. That is where the tension lives.
- **Camera kick**, scaled by the blow. Small, or it becomes nausea on a phone.

**Turning must slow while attacking**, or a player pirouettes mid-swing and every
committed blow becomes a tracking missile. Note the mobile work deliberately gave
the right thumb free aim; that freedom has to end at the moment of commitment or
weight is impossible. There is already a `SWING_DRAG_LOOK_GAIN` in `input.ts`
that lets a drag re-choose the cut mid-combo — reconcile with it rather than
fighting it.

**This changes balance for every class.** State the new numbers explicitly and
check them against `WARRIOR_STATS`, the per-weapon reach (runekeeper 1.70,
berserker 2.20, huscarl 2.26, warden 2.64) and the zone multipliers. The
runekeeper is the class this hurts most — speed is the whole reason to pick it —
so the fast class should stay fast *relative to the others* while everything
gets heavier in absolute terms.

**And it must stay playable on a phone.** Longer windups are easier on touch,
not harder, so this should help the mobile game. Verify rather than assume.

## 2. Handedness and the camera

The owner is right that the default should suit the majority: **camera over the
right shoulder, weapon in the right hand.** Left-handers are the minority and
should be served by a toggle, not by the default.

**A left-handed toggle already exists** — the mobile work added a mirror that
flips the touch zones and the HUD cluster, persisted through the profile. That is
the natural home for this: one setting that mirrors *everything* — camera
shoulder, weapon hand, HUD side. Do not add a second, separate control.

Check what the rig actually does before changing it; the shoulder offset was not
obvious from a read, and the weapon arm mounts at local `+x`.

## 3. The spawn angle

A round should start **ready to fight**: camera behind the warrior, level, and
looking where he is looking. The sim already faces men toward the middle (or the
enemy arc in war band) — the camera rig has to *adopt* that heading on spawn and
on every round transition, rather than keeping whatever yaw it had.

Getting this wrong is why a player spends the first second of a round turning
around. With best-of-5 that is up to five wasted openings a match.

## 4. Sound

The engine is built and synthesised; these are additions to it, not new
machinery.

- **Death sounds are unplugged, not missing.** `audio.ts` exposes `death()` and
  `GameCanvas.tsx` never calls it — only `sever()` is wired. One call site.
- **Level-up does not exist.** It should be the reward sound of the game and it
  is currently silent.
- **Victory and loss want more than a sting.** `roundWon`, `roundLost` and
  `matchWon` exist as short UI phrases; the owner is asking for *music* at the
  end of a match. Keep it short — it plays every match — and keep it in the same
  mode as the family so it sounds like the same instrument.
- **Purchase already exists.** If he has not heard it, check it is actually
  fired on the shop's buy path rather than assuming.

`soundtest` is currently **20/21**: the nine screen sounds spread 4.45x
brightest-to-darkest against a 3x limit. Adding more sounds without fixing that
makes it worse. Fix the spread as part of this.

## How this gets judged

`playtest` (11/11), `touchtest` (19/19) and `firetest` (7/7) guard the mechanics
and must stay green. But **none of them can tell you whether a blow feels
heavy** — that is the whole point of the change and it is not measurable here.

What *can* be asserted: windup, contact and recovery each occupy the intended
share of the swing; turn rate is reduced during commitment by the stated amount;
hitstop lasts the stated frames and applies to both fighters; the camera adopts
the spawn heading within one tick of a round starting.

**The owner is the judge of the feel.** Everything above proves the numbers are
what we said; only playing it says whether it lands like For Honor or like
treacle. Ship it behind numbers that are easy to retune and tell him which ones
to turn.

---

# Part two — what got built, 12 August 2026

The document above was written as a **plan**, in July, against a build in which
a whole swing was 0.4–0.9 s. Most of §1 has since been built and is standing:
`SWING_PHASES`, `HITSTOP`, `SWING_TURN_RATE` and the shove all exist and are
gated. §2, §3 and §4 are other people's units and are untouched here.

What this section records is the part that was **still zero**, how it was
measured, and where it departs from the plan above.

## The instrument came first, and it read seven out of nineteen

There was no ruler for any of this, so `tools/weightprobe.mjs` was written
before a line of the fix (PROCESS.md E4) and pointed at the build that still
had the defect (R2). It drives the engine headlessly, seats two men face to
face, throws one blow, and watches. **Every number it prints is a behaviour it
observed, never a constant it imported** — which is this repository's ten-times
-recorded failure and the one thing a harness for "feel" could most easily get
wrong.

The before, verbatim:

```
IMPACT (metres of ground covered from the tick of contact)
  light          target 0.117 m   attacker 0.117 m   dmg  20   (light)
  heavy          target 0.121 m   attacker 0.121 m   dmg  33   (heavy)
  blocked heavy  target 0.121 m   attacker 0.121 m   dmg  19   (blocked_heavy)

STAGGER, KNOCKDOWN, GET-UP
  stagger from an open heavy    0 ticks (0 ms)
  shove onto a reeling man      knocked 0 ticks, rising 0 ticks

RIPOSTE
  window on the wire            0 ticks = 0 ms
  bonus                         x1.00

[weightprobe] 7/19 passed
```

**Read the first block again.** A light blow and a heavy blow moved the struck
man *the same distance*, and so did a blocked one — because none of them was
knockback at all. It was the soft body-separation push in `gameTick` shoving two
overlapping men apart by exactly as much for any blow, or for none. Had the
probe printed a single number instead of three, 0.117 m would have looked like a
feature working weakly. Three numbers that are equal is a proof that the
mechanism is absent.

After: **24/24** (`node tools/weightprobe.mjs`) — the nineteen it was written
with, plus five added as the work found things: the parry message's `window`
field, the stride channel a floored man must not have, and the three that gate
WHO owns a riposte window.

**It runs in 0.6 seconds and opens no browser.** That belongs on the record
next to `docs/GATES.md`'s cost table, which prices `playtest` and `touchtest`
in minutes and calls them flaky one run in three. Everything in this wave —
telegraph, impulse, displacement, stagger, knockdown, get-up, parry window,
riposte window and bonus — is measured by an instrument cheap enough to run on
every single edit. That is the E3 argument (*measure with the cheapest
instrument that can see the defect*) landing about as well as it can.

## The five things, and the reasoning behind each number

**1. The telegraph was already right, and the probe is what says so.** 200 ms
(runekeeper light) to 650 ms (berserker heavy), a 3.25× spread. It is gated now
against a 250 ms human-reaction floor on the heaviest weapon, so the next
balance pass cannot quietly take readability away.

**2. Impact moves both bodies.** `KNOCKBACK` is stated in **metres the struck
man actually covers** — not a gain constant — because `applyImpulse` already
converts a distance into the speed whose decay covers it, so the table is the
thing you can measure. Light 0.42 m, heavy 0.95 m, blocked 0.14 m, blocked
heavy 0.30 m, all × `WEAPON_MASS` (runekeeper 0.72 → berserker 1.28). Measured:
light 0.44 m, heavy 1.00 m, blocked heavy 0.31 m.

A shield does **not** zero it. A guard stops an edge, not momentum, and a
blocked heavy still shifting a man is the whole argument for the shove existing
as a separate guard-break.

The striker takes **one sixth** of it, backwards. That is the "blow stops
against mass" the brief asks for; it is deliberately small, because at any real
size it becomes a second knockback pointed the wrong way.

**3. Balance, and three routes to the floor in one number.** The owner named
three — *"enough force"*, *"caught off guard"*, *"shoved"* — and they are one
mechanism rather than three special cases. `balance` is poise: every blow takes
some, it refills at 26/s, and at zero the man goes down. Off guard (staggered,
already down, rising, or struck from behind, `REAR_ARC`) **doubles** the cost;
a shove takes the single biggest bite in the game.

The class numbers are the point: huscarl 100, berserker 86, warden 78,
runekeeper 58. One heavy from behind is 42 × 1.06 × 2 = 89 poise — which floors
a warden and does not floor a huscarl. That separation is the classes reading as
bodies rather than as stat blocks, and it is deliberately *not* proportional to
health.

**4. The floor is one clock and two states.** `downTimer` starts at 1.30 s;
above `KNOCKDOWN.rise` (0.55 s) he is `knocked`, below it `rising`, and `state`
is derived rather than stored, so the server and the client cannot disagree
about which half of a fall a man is in. 0.75 s down + 0.55 s rising is the
brief's "long enough to matter and short enough not to be a death sentence",
priced against the fastest contact in the game: a huscarl light needs 0.408 s to
reach the target, so the man who floored you gets **one** blow and a second only
if he was already in reach. He stands up with a third of a bar, not a full one.

**5. The riposte, and the number that had to be argued.** A parry now writes
`vulnerableTimer` and `vulnerableTo` onto the man who was read. Inside that
window the parrier's blow — and only his — does **1.6×** damage, throws him
1.7× further, and **closes the window**. One parry buys one blow.

### Why 0.90 s, honestly, at 20 Hz

The brief asked for this reasoning in writing, so here it is with both halves.

The **parry input** is 3 ticks wide — `weightprobe` sweeps it (raise the guard
N ticks before contact, for every N, and keep the set that parries) rather than
reading `PARRY_WINDOW`, and 3 ticks is what the sweep finds. 150 ms is tight,
and it should be: it is the thing skill is measured on. Two ticks would be a
coin flip after one tick of jitter; four would be a held state.

The **riposte window** is a different kind of number. It is not an input test,
it is a licence, so it has to survive a round trip rather than merely a tick.
0.90 s is 18 whole ticks. A 120 ms ping costs a player about 2.4 ticks at each
end, leaving **13 ticks — 650 ms — genuinely usable on a bad connection**,
which is still more than the 408 ms a huscarl light needs to reach contact from
a standing start. A 0.45 s window would have read tidier on paper and would have
been a LAN-only feature.

It is also *exactly* the length of the stagger the parry deals
(`STAGGER_DURATION × 1.5 = 0.90 s`), and that is not a coincidence: the window
is precisely as long as the punishment it rewards, so what a player learns is
"he is reeling, therefore he is open" rather than two clocks he has to hold
apart.

**No sub-tick handling was needed and none was added.** Both windows are whole
tick counts by construction, which is the only way a 20 Hz server can promise a
duration it will actually deliver.

## Where this departs from the plan above, and why

- **§1 says "hitstop … on both fighters" and lists camera kick.** Hitstop is
  built and gated. Camera kick is `render/camera.ts`, which is not this unit's
  file — the `hit` message now carries `knockback` in metres precisely so
  whoever owns that file can scale a kick off the server's own number instead of
  guessing from damage.
- **§1 says a clean heavy is the game's weight blow.** The probe found that an
  *unblocked* heavy staggered nobody while a *blocked* one staggered for 0.6 s —
  so the game's answer to thirty damage from an axe was that your tempo was
  untouched, and the man who successfully got his shield up was punished harder.
  A clean heavy now rocks him for `HEAVY_CLEAN_STAGGER` = 0.30 s, chosen under
  the 0.408 s fastest contact so that it is **readability and not a free
  follow-up**. The blocked heavy keeps the longer 0.6 s, because there the
  stagger *is* the price the shield paid.
- **§1's "the runekeeper is the class this hurts most".** Still true, and now
  twice over: he has the least poise (58) and the lightest weapon (0.72 mass).
  That is intentional and it is the class's identity, but it is the first thing
  to look at if Wave 3's stat rework finds him unplayable.
- **"None of the harnesses can tell you whether a blow feels heavy."** That was
  true and is now half false. `weightprobe` answers every *quantity* named in
  the plan's last section. It still cannot answer the feel, so
  `tools/weightshot.mjs` exists beside it: a burst of frames out of a real fight
  in a real browser, tiled into a strip, for eyes. **The owner is still the
  judge**, and the numbers to turn are `KNOCKBACK`, `BALANCE`, `KNOCKDOWN` and
  `RIPOSTE`, all in one block at the top of `engine.mjs`.

## What is left, stated as a handoff rather than as a to-do

Three files this unit does not own now have a server number they can read
instead of a guess. Naming them precisely, because "add sound to the knockdown"
is not a handoff and this is:

* **`render/audio.ts`** — `WireHitType` is `light | heavy | blocked |
  blocked_heavy | parry`. The wire now also sends `shove` and `knockdown`, and
  every wound carries `riposte: boolean`. Nothing breaks today (`materialFor`
  falls through), but a riposte lands with the same sound as any other light,
  and the owner asked for a parry that "really makes you feel it". A riposte
  and a body hitting the ground are the two loudest new events in the game and
  neither has a voice.
* **`render/camera.ts`** — every wound message carries `knockback` in METRES,
  which is the server's own figure for how far the blow will actually throw the
  man. `docs/WEIGHT.md` §1 above asks for a camera kick "scaled by the blow";
  that scale now exists as a number rather than as an inference from damage.
  Keep it small — §1 says nausea on a phone, and it is right.
* **`GameCanvas.tsx`** — hit feedback is currently reconstructed from health
  deltas in the snapshot (`dmg >= 22 ? "heavy" : "light"` at line 990), so the
  `hit` message's own `type`, `riposte`, `knockback` and `hitZone` are all
  being re-derived less accurately than they are being sent. That is worth
  fixing on its own terms and it is the single cheapest way to give the three
  new events their feedback.

Also worth a line in `docs/GATES.md`, which this unit does not own: the INNER
tier lists four instruments and `weightprobe` belongs in it. It is 0.6 s and
opens no browser.

## What is NOT proven, stated on the verdict line rather than under it

PROCESS.md R4: declining to rule is often correct, hiding it never is.

**`touchtest` did not produce a clean run on this box, and it is not this
wave's doing.** Three runs on the same build gave three different results, all
of them in ACT ONE's opening pair — run 1 `left stick moves the warrior` FAIL
(0.00 units), run 2 `left stick never turns the camera` FAIL (90.01°), run 3
`moves` FAIL again (0.00 units). `docs/GATES.md` already prices this suite as
"flaky 1 in 3" and the box was rasterising a second browser for most of it; the
lock act in one run reported a 4404 ms main-thread block, "which is the box and
not the lock".

What CAN be said with certainty rather than by appeal to flakiness: **act one
musters an EMPTY ring** (`Fewer AI` eight times, no `More AI`, and the comment
says why — "an AI that kills the test warrior takes every assertion with it").
With no enemy present, both of this wave's changes that could possibly reach
those two assertions are unreachable:

* `input.ts`'s riposte lock override requires a player carrying
  `vulnerableTimer > 0`, which requires a parry, which requires somebody to
  parry.
* `engine.mjs` adding `isDown(player)` to `integrateMovement`'s committed set
  requires a knockdown, which requires poise loss, which requires a blow or a
  shove.

Neither exists in an empty ring. That is an argument from the fixture rather
than a green run, and it is offered as exactly that. **The next person to touch
this should get one clean `touchtest` on an unloaded box before trusting the
suite again.**

## What a player can see, and why that was a requirement

A window nobody can see is not a mechanic, it is a dice roll. `docs/DESIGN-SYSTEM.md`
§3 already held the rule — the parry tell lights the **opponent's** brackets for
the window's **real duration**, never a bar on your own HUD — and honouring it
turned up a precondition the rule had not stated: *the brackets have to be on
him.* In an eight-man moot the lock can perfectly well be holding somebody else
at the moment you read a blow.

So `input.ts` now hands the lock to the man you parried, outright, for as long
as the window lasts. It is the one moment in a fight where the game knows for
certain which man you care about, because you proved it 50 ms ago. The jaws then
go warm and **close** over `vulnerableTimer` — a drain, not a countdown. That
rule came out of `DESIGN-SYSTEM.md` §8's mercy window; the window is gone
(`docs/MERCY-REMOVED.md`) and **the rule is not**, because it was never about
mercy: a number invites a player to watch the number instead of the man.
