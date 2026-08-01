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
