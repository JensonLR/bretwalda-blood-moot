# Turning on a phone

The owner: *"how a player turns on mobile. at the moment it feels very erratic
especially while trying to fight & use moves while also moving, need to review &
define what the absolute best solution is for that."*

He is right, and it is not a sensitivity problem. It is a binding problem.

---

## The root cause: one thumb, three jobs

All of this is in `src/game/client/input.ts`.

**1. The camera chases your movement heading.**

```js
if (isMobile && alive && !pressedAttack && (Math.abs(mx) > 0.08 || Math.abs(mz) > 0.08)) {
  rig.yaw += shortestAngle(rig.yaw, Math.atan2(moveX, moveZ)) * Math.min(1, dt * 4.5);
}
```

Walking turns the camera. The comment says a second finger is never needed to
turn, which was a reasonable goal — but it means **you cannot look somewhere
without walking there.**

**2. Your swing direction is read off the movement stick.**

```js
if (joystick.x < -0.5) attackDir = "left";
else if (joystick.x > 0.5) attackDir = "right";
else if (joystick.y < -0.5) attackDir = "overhead";
else if (joystick.y > 0.5) attackDir = "stab";
```

**You cannot choose a swing without walking in that direction.** Want an
overhead? Walk forward — into the man swinging at you.

**3. The two interact, and that is the erratic feeling.**

To swing left you push the stick left → you walk left → the camera turns left →
your facing rotates → the swing lands somewhere other than where you aimed. And
the `!pressedAttack` guard means the camera *stops* chasing the instant you
attack, so facing snaps between two different regimes mid-fight.

Movement, aim and attack-direction are three independent intentions bound to one
thumb. No amount of smoothing fixes that; they have to be separated.

## The decision

**Left thumb moves. Right thumb aims and chooses the swing. Nothing else is
overloaded.**

- **Left stick: movement only.** Remove the camera-chase entirely. Walking
  never turns the camera again.
- **Right side: free-look drag, anywhere on the right half.** Today the drag
  zone is `clientX > 55%` **and** `clientY < 62%` — a rectangle, and the lower
  third does nothing. A thumb that starts a drag low is simply ignored. Make it
  the whole right half minus the button footprints.
- **Swipe to swing.** The swing direction comes from the *direction of the
  right-thumb swipe* on the attack, not from the movement stick. Left swipe is a
  left cut, up is an overhead, a short forward flick is a thrust. This is the
  established solution in the reference class (Mordhau and Chivalry bind attack
  direction to mouse movement for exactly this reason), the game already has
  precisely four directions, and it puts aiming and attacking on the same thumb
  where they belong.
- **Soft target-facing assist on attack.** When a swing starts and an enemy is
  within that weapon's reach and roughly ahead, turn toward them over the
  windup. Every console melee game does this and on a phone it is the difference
  between a fight and a slapstick. It must be *soft* — assist, not snap, and
  never override an active drag.

**Keep a tap fallback.** A tap on the attack button with no swipe should still
attack, using the last direction or a default. A control scheme where the only
way to attack is a gesture will lose players in the first ten seconds.

---

# Round two: the right thumb had two jobs as well

The owner, having watched friends play: *"their biggest issue is the camera
turning being the same hand that controls all of the attack, dodge & shove
buttons etc. There must be a better solution like some form of tracking so all
they have to do is move with the left stick & attack with the buttons on the
right."*

The fix above was right and it is still here. What it did not notice is that it
moved the problem rather than removing it. **Free-look drag and every action
button are the same thumb.** You cannot turn and attack at the same time.

This is the same shape as everything above, and it has now appeared **five
times**: *one channel carrying two orthogonal intents*. It is named in a comment
at the head of the lock-on section in `input.ts`, with all five sightings listed,
because it keeps being diagnosed as a sensitivity problem and it never is one.

## The decision: soft lock-on

The reference is For Honor, which the owner named himself. In a melee game the
camera nearly always wants to point at the man trying to kill you, so **the game
says so instead of making the player say so, sixty times a second, with the
thumb it also needs for swinging.**

- **Camera and facing track a target.** Nearest live enemy, scored as
  `metres + 3.2 × radians off screen centre` — so a man 6 m dead ahead beats a
  man 2 m away at 90°, because the one in front of you is the one you are
  fighting.
- **Left thumb moves, including around him.** Strafing and backpedalling now
  circle the locked man instead of swinging the view off him. That is the whole
  difference between a duel and two men shuffling past each other.
- **Right thumb is buttons only.** Attack, heavy, block, dodge, shove.
- **Bare glass on the button side keeps exactly one job**, and it is the only
  one the lock cannot do for you: *which man*. A horizontal flick takes the next
  target on that side, wrapping round. Travel is banked rather than
  thresholded per event, so a slow drag switches too — a control that silently
  does nothing is the complaint this whole scheme exists to answer.
- **Nobody near: free-look drag comes back**, exactly as before, eased both
  ways over ~0.25 s in and ~0.4 s out. Never snapped.
- **Everything mirrors on the one `bretwalda.hand` store.** No fourth flag.
- **Desktop is unchanged by default.** Lock-on is a profile-persisted binding
  (`Lock on`, default `R`, desktop-only) and it is off until pressed.

## The 8-man FFA, which is the hard case

The duel is easy. Three men converging is where a lock either helps or starts
arguing with the player, so:

- **Hysteresis of 28%.** A challenger takes the lock only if he scores 28%
  better than the man being held. Two men standing shoulder to shoulder cannot
  trade the reticle between them at frame rate.
- **A man the player picked with a flick is protected for 1.2 s** against the
  automatic scoring, or the lock drags itself straight back to the nearest man
  and the flick reads as broken.
- **Range hysteresis:** acquire at 11 m, drop at 15 m. A flick can only take a
  man inside *acquire* range, so a switch can never hand you somebody the lock
  is about to let go of.
- **The acquire cone opens to the full circle at arm's length.** It is 143°
  either side out at 11 m and closes to nothing inside 3.6 m. The harness found
  why: the lock's man died, two live recruits were standing at 1.4 m *behind*
  where he had been, and the lock came up empty and handed the camera back. A
  man close enough to hit you is the fight, whichever way he is standing.

## The weight wave, on a phone — 12 August 2026

Four things arrived in one wave (`docs/WEIGHT.md`): knockback on every blow, a
poise bar, a knockdown with a get-up, and a riposte window a parry opens. All
four had to be designed for a thumb as well as a mouse, because the owner has
now said three times that every upgrade is for both.

**The shove already had its pad and it is inside the law.** 56 px, which is the
`docs/DESIGN-SYSTEM.md` §3 floor for anything pressed mid-fight, sitting
outboard of DODGE at `near(124, 200)` — inside the 132 px thumb band, clear of
every other footprint, on the aiming side and mirrored by the one
`bretwalda.hand` store like everything else. **The layout did not grow a ninth
button for this wave and it must not**, which is the constraint that decided the
next two entries.

**The parry needs no control at all, on either platform, and that is the whole
point.** It is BLOCK, pressed inside the 150 ms before a blow lands — a tap
where a hold would have been. A phone player parries with the pad he already
has and a desktop player with the button he already has. Had the parry been
given its own control, the touch layout would have needed a ninth pad in a
cluster that has no room for one, and the mechanic would have been *easier* on
desktop than on a phone, which is the half-a-feature failure this document
exists to prevent.

**A knockdown takes the controls away and hands them back, which is a touch
problem desktop does not have.** A man who is `knocked` or `rising` is refused
by `processInput` — no turn, no swing, no guard. On a phone the buttons are
still on the glass and still under his thumb, so a player will press them and
nothing will happen. That is handled the way the death case already is: the
cluster's held flags are released whenever it is not `clusterUp`, so a BLOCK
held at the moment he is floored does not come back set when he stands. The
pads themselves are deliberately left ON SCREEN rather than hidden — a control
cluster that vanishes and reappears in 1.3 s is a flicker, and the man on the
ground has enough to read.

**The riposte window is drawn on the opponent, not on the HUD, and on a phone
that is the difference between a mechanic and a rumour.** `DESIGN-SYSTEM.md` §3
already required it (his brackets, the window's real duration, never a bar on
mine) and the phone is the reason it is the right rule rather than merely a
tasteful one: at 390×844 there is no room for a fifth meter, and a player whose
eye leaves the fight to read one has lost the fight. So the lock's jaws go warm
and close over `vulnerableTimer`, and `input.ts` hands the lock to the man you
just parried so the jaws are guaranteed to be on him. Nothing was added to the
thumb band at all.

## It must not become an aimbot

The weight pass caps a committed body at `SWING_TURN_RATE = 1.8 rad/s` so a blow
cannot follow a man who dodges. **The lock obeys the same cap** — the client
mirrors the constant so the *camera* is held with the body, or the player would
watch his own blow miss a man who is dead centre of frame. For Honor works
precisely because commitment survives the lock, and this is where that line is
drawn. It is measured, not asserted: see the harness.

## How it gets judged

`npm run touchtest` now runs in **two acts**, because the two halves of the
scheme want opposite rings. Act one is the empty ring the twenty original
assertions need — an AI that kills the test warrior takes all of them with it.
Act two musters **three recruits**, because the lock is entirely a claim about
who else is standing there, and grades:

- the lock holds facing on a *moving* man with no thumb on the glass at all;
- a flick across the button side switches target;
- a committed swing still cannot follow the man the lock was handed — measured
  as the server's own rotation against the 1.8 cap, with the demand the lock was
  making printed beside it;
- the mark is painted on the man it is holding, moves with him, and is painted
  off the RIG HE IS DRAWN ON rather than off the wire;
- the mark and its tuition line take no bite out of the button side, for
  **both** handednesses.

Act two's warrior can and does die. Every assertion in it waits for a man on his
feet and takes its verdict off the snapshot trail rather than off the state at
the end of a settle — the first cut of the switch test watched a perfectly good
switch happen and then failed it, because he was cut down 350 ms later.

The mark assertion samples from a **rAF loop in the page**, not from polls, and
keeps collecting across a death and the next round until it has 12 qualifying
samples. Its gate is narrow on purpose — the man 1.5–6 m from the camera, within
6° of dead ahead, the mark lit and on the glass — and at 6.7 pokes a second,
landing inside it was luck: one run in three came back with zero samples and
read as a failure of the reticle, which it never was.

Frames land in `art/shots/lock/`.

**`npm run lockshot` is the one that is for eyes.** touchtest's frames are taken
at the end of a four-minute fight, best-effort, and the warrior is usually dead
by then with nobody left to hold — three in a row came back with an empty field
in them. `tools/lockshot.mjs` stands a fight up, waits until the mark is on a
live man at a range worth photographing, HOLDS THE WIRE so the fight cannot move
while the shutter is open, and takes both handednesses off that one frozen
moment plus a close-up of each. It asserts nothing. It is how you find out
whether the mark is any good to look at, which is not a question a harness can
answer — and the first cut of this mark passed every assertion in touchtest
while being, on the man, a pair of faint ticks you had to be told were there.

## Things that will go wrong

- **The two thumbs will fight over the touch surface.** The current code tracks
  one `touchId` for the stick and one for the drag. Swipe-to-swing adds a third
  intention on the same finger as the drag, and telling "aim" from "swing"
  depends on whether an attack is being pressed. Get the touch bookkeeping right
  or the whole thing feels haunted — and it must survive a third touch landing
  (a stray palm) without dropping either of the first two.
- **Left-handed players.** The layout is hard-coded to left-stick/right-look. A
  mirror toggle is cheap now and expensive later.
- **The HUD buttons sit in the drag zone.** Attack, block, dodge and ability are
  on the right. Their footprints have to be excluded from free-look without
  leaving dead gutters around them.
- **The desktop path must not regress.** Desktop reads the same function and its
  bindings are correct. `npm run playtest` covers the desktop path at 9/9 and is
  the guard.
- **This changes what a player can express**, so it is a balance change as much
  as a controls change. A phone player who can finally aim independently of
  movement is meaningfully stronger than one who could not.

## How it gets judged

Not by reading the diff. A control scheme is a feel problem:

- Drive it headlessly the way `tools/playtest.mjs` does — synthesise touch
  sequences and assert what reaches the server: a stick push produces movement
  with **no yaw change**, a right-side drag produces yaw with **no movement**,
  and a swipe during an attack produces the swing direction the swipe described.
  Those three assertions are the whole fix, stated as tests.
- Then a human-shaped pass: does a swipe-up overhead while strafing left
  actually land as an overhead? That is the owner's exact complaint and it is
  the acceptance case.

`npm run touchtest` is that harness. It drives a phone-shaped session with real
multi-touch through the browser's own input pipeline and reads the answers back
off the game socket, so what it grades is what the server was told, not what a
handler was called with. `npm run playtest` still guards the desktop path; the
two are siblings and both have to stay green.

Two of the claims above are geometry, not behaviour, and no amount of dragging
proves them — so the harness measures those off the DOM instead. It sweeps the
free-look half point by point and requires every one of them to reach either the
canvas or a combat button, which is the "no dead gutters" promise stated as a
test; and it requires that nothing in the cluster is drawn over anything else,
button or readout. Both run **for each handedness**, because a thing that fails
to mirror lands in the free-look half the cluster has just vacated — which is
how the training screen's own END button came to be sitting in it.

## Soft lock-on: the decision, and what it costs

The scheme above gave the phone player independent aim, and then charged him a
thumb for it. Both thumbs are spoken for in a fight — the left one walks, the
right one presses SLASH, BLOCK, DODGE, SHOVE — so the drag that turns the camera
has to happen in the gaps between blows. Against a man who circles you, there
are no gaps.

**The decision: the camera holds the nearest man in front of you, by itself.**
`input.ts` scores every live enemy at `metres + 3.2 x radians off screen centre`
and holds the best, with 28% hysteresis so two men shoulder to shoulder do not
trade the reticle at frame rate. It acquires inside 11 m and drops at 15 m; a
target the player picked himself outranks the scoring for 1.2 s. When nobody is
near, free-look eases back in and the drag works exactly as it did.

So a player can fight the whole match with **the left stick and the right-hand
buttons and never touch the glass to turn**. That is the claim, and touchtest
asserts it with no thumb anywhere near the button side: over 32 snapshots the
locked man travelled 5.22 units, the camera turned 78 degrees to stay on him,
and the worst facing error was 9.4 degrees.

**Switching targets is a horizontal flick on bare glass**, on the button side.
This was chosen over on-screen target chips because the thumb is already there,
the gesture is directional in the way the choice is, and it draws nothing new
over the fight. The cost is that horizontal travel on that half of the screen no
longer free-looks while a lock is held — which is why the lock eases out and
hands the drag back the moment nobody is in range.

### What the lock deliberately does NOT do

**It does not turn a committed swing.** A body with a blow out turns at
`SWING_TURN_RATE = 1.8 rad/s` and no faster; the server enforces it on its own
fixed step and the client mirrors the same cap, so the camera is held with the
body rather than sliding off it. Strafe around a man at arm's length and the
bearing to him moves faster than the shoulders are allowed to follow, and the
blow misses — which is the point. Measured: the direction to the target swept at
2.10 rad/s while the server turned the attacker at 0.90 rad/s mean and 1.85 peak
against the 1.8 cap, leaving 22 degrees between them when the blow finished. An
uncapped lock runs at 5.0. This is the line between an assist and an aimbot and
it is a test, not a comment.

It also drops a target that dies or leaves 15 m, it never acquires a man outside
the cone, and it is **off by default on desktop** (`lockon`, bound to `R`).

**Desktop look is routed now.** It used to be added straight onto `rig.yaw`
immediately before `sampleInput` ran the lock's spring, which took most of it
back out again — the player pushed, the camera pushed back, and nothing he asked
for happened. Every look the PLAYER asks for, mouse or thumb, now goes through
`CameraRig.look` → `routeLook`, which hands back whatever the lock does not
claim `(1 - blend)` and banks the rest into the same target-switch flick a thumb
makes on bare glass — 0.64 rad of asked-for look, which is exactly the 64 px the
phone measures at the free-look gain. The lock's own corrections still write the
yaw directly: they are not the player asking for anything. Sixth sighting of the
overloaded channel, and the first one fixed by naming the two channels rather
than by tuning either.

### The mark

It is on the glass every second of every fight, which makes it the most-seen
element in the game — and the man it points at is what the player is actually
trying to read. So it says WHO and then gets out of the way. The first cut was a
56 px amber gunsight: ring, four ticks, two chevrons, an inset glow, full
opacity. It won the frame off the fight. What replaced it is

- **two hairline jaws at his sternum** — who; and
- **a scribed oval on the ground he is standing on** — where he stands,

in the nameplates' own bone rather than saturated amber, at a third of the width
and a fifth of the ink. Every stroke is drawn twice, a dark one under a light
one, because the alternative on daylight turf is a glow and a glow is how a UI
mark starts competing with the lighting.

**It holds still.** Motion is how a mark says something has *changed*, so a mark
that is always moving has nothing left to say with it: one ease-out tighten
(0.22 s) when the lock takes a man, a shorter, harder one (0.15 s) when a flick
hands it another, and nothing whatever in between. No idle pulse, no spin.

**Two anchors, two projections.** "Who" and "where he stands" are different
claims about different points in the world, and one scaled wrapper cannot carry
both: the distance scale is clamped at 0.62 and 1.35 so the mark never becomes a
dot or shouts, and anything hung off it at a fixed offset walks up his shins the
moment it clamps. The jaws are projected onto his chest, the oval onto his feet.

**It is painted on the man as DRAWN, not as sent.** It used to read
`target.position` straight off the wire while a remote body renders 1.5 packet
intervals in the past (`REMOTE_DELAY_PACKETS`, `render/anim.ts`) — ~83 ms, and
at a run about 0.34 m of turf between the mark and the man. Two captures caught
it sitting on empty grass beside him. `render/hud3d.ts` now registers each
warrior's rig group as it attaches the nameplate that tracks the same object,
and the mark is projected off that. The wire stays the lock's own answer for
scoring — it is what the server will judge a blow against — and survives here
only as the fallback for a man who has no rig yet, plus a readback of the lead
it used to carry. touchtest asserts the source, not just the position.

**It mirrors**, because it is projected through the real camera and the camera
sits over the weapon shoulder. That is asserted as the thing which is
unconditionally true — the element sitting within 2 px of `lockPaint.sx`, which
comes out of the real `camera.project()`, on every reading it is lit for — and
the shoulder itself is measured in METRES in the warrior's own frame by
`tools/cameratest.mjs`. touchtest also freezes the wire, switches the hand and
reads the mark twice on a scene verified not to have moved (the man's drawn
position within 3 cm), and prints the shift; it does not assert a floor on it,
because the shift is genuinely ZERO for a man standing on the camera's optical
axis. The rig looks 3.6 m ahead of the warrior: a man at that range does not
move when the shoulder does, men either side of him move opposite ways, and the
old test's median over a moving brawl was averaging all three regimes together
— which is how one run reported a 228 px shift with the sign reversed and
nobody noticed it meant nothing.

**The whole top row mirrors too, not just the thumb cluster.** END and the mute
toggle live under the timer on the movement side so they never sit in the
free-look half — which puts them on the RIGHT for a left-handed player, straight
through five rows of kill feed. The layout sweep did not catch it because it
measures overlaps in the *button* half and this is the other half; a capture
caught it. The kill feed and the timer now swap sides with everything else.

---

# Round three: two things on the glass that a sweep could not see — 13 Aug 2026

Both reported by the owner off screenshots, both green under every assertion
this file had, and both for the same reason: **`touchtest` answers "does this
swallow a drag" and "is this drawn on top of that", and neither question is
"is this in the way".** A dead-zone sweep cannot see furniture.

## The tuition line that never left

> *"Flick screen to change foe stays on screen permanently that needs to fade
> away."*

`◀ FLICK THE GLASS TO CHANGE FOE ▶` was already written to retire. `GameHud.tsx`
drew it under `!hasSwitched`, and `hasSwitched` read `input.ts`'s
`lock.switches` — which increments in `applySwitch` **after** a man has been
found on the side the thumb flicked:

```js
const next = take ?? wrap;
if (!next) return;        // nobody there; nothing is counted
lock.switches++;
```

So it retires on a switch that **lands**, and in an **honour duel there is
nobody to switch to**, so a switch can never land, so the line is permanent — in
the mode the owner plays, on the one surface a phone player is trying to look
through. `tools/tuitiontest.mjs` drives a real duel and reports the most live
enemies the local man ever had at once: **one**. Flicking harder does not help
and nothing on screen says why.

**The decision, and what it keys off.** `src/game/tuition.mjs` owns it, for the
reason `deathcam.mjs` and `roundreset.mjs` are files: the thing worth asserting
is a *decision*, and a decision inside a React render can only be tested by
standing up a browser. Three keys, in this order of authority:

1. **The gesture was made.** Not "a switch landed" — the *gesture*. `input.ts`
   counts it in `requestTargetSwitch`, where the thumb has been read and the
   direction is known, *before* the lock goes looking for a man. Whether there
   was anybody there is the game's business, not the player's. This one line is
   the whole duel fix.
2. **It has been up long enough.** Six seconds of **eligible** time — time while
   the line is actually on screen and the control it describes would actually do
   something. A clock that runs while he is dead, or in the lobby, or with
   nobody locked, expires the hint before it has been read. *Time alone would
   have been the wrong key:* it is furniture for six seconds to the man who
   flicked on second two, and it comes back next round to the man who has been
   doing it for a week.
3. **It has had its turns.** Three airings, ever, on that device. **A player who
   never flicks is still taught** — three times, six seconds — and then the game
   stops asking.

Keys 1 and 3 persist (`bretwalda.taught.foe`), so a player who has demonstrated
the gesture never sees it again and one who has ignored it three times is not
shown a fourth. It **fades** rather than blinking out, and the fade runs on real
time even if the lock lets go mid-fade — a caption frozen half-transparent over
the arena is a worse artefact than the one this fixes.

**And it does not appear in a duel at all.** Eligibility includes *there is
somebody to switch to*: a caption teaching a control that cannot do anything is
furniture for as long as it is up, however briefly.

## The quality pad that was standing in the arena

> *"Better placement on screen for the quality, i like that feature but its a
> bit in the way where it currently is on screen."*

The feature is wanted; only the placement is wrong. It sat at `far(16, 212)` —
movement side, 212 px up from the foot — and the comment above it defended that
from this file: the free-look half swallows an opaque control, so it goes on the
movement side, and 212 is the first shelf clear of RUN at 24, HAND at 92 and the
ability readout at 152–196. **Every word of that is true and none of it answers
the question.** At 212 it is a lit amber pad floating at eye level, on the
warrior's own cloak in both handednesses, at the top of a four-deep column that
had climbed a third of the way up the screen. Only a frame could say so.

**It moves to the top of the movement side, under the sound toggle**, into the
column of things that are not the fight — leave, sound, picture. One decision,
four justifications, all pointing the same way:

* **Out of both thumbs' half of the screen.** `docs/DESIGN-SYSTEM.md` §3 keeps
  combat controls inside the 132 px band and puts anything you cannot take back
  deliberately outside it, *"because a thing you cannot take back should cost a
  small movement"*. A settings dialog opened mid-fight is exactly that.
* **Further from the stick, not nearer.** The joystick is born wherever the
  movement thumb lands below `input.ts`'s `TOP_STRIP`, so a pad on that side is a
  hole in the stick's surface. At 212 it was 60 px from where a thumb rests; it
  is now three hundred.
* **It keeps the constraint that was real.** Still the movement side, so it
  still takes no bite out of free-look, in both handednesses, mirrored on the
  same `bretwalda.hand` store as everything else.
* **Anchored from the top, not the foot**, because the column it joins hangs off
  the top edge and a `bottom` offset tuned on an 844 px screen lands off the top
  of a 667 px one.

**Desktop is unchanged and deliberately so.** The desktop control is the
GRAPHICS button in the bottom-right beside KEYS, and in a running fight the
pointer is locked and neither is on screen at all. The 1280×800 frame shows a
tidy corner pair. There was nothing to move, and moving it would have been a
change made to look busy.

## What now gates it

* **`tools/tuitiontest.mjs`** — new. Drives a real honour duel for the root
  cause, then hammers `src/game/tuition.mjs` for the rule: taught without a
  flick, retired by a flick that lands on nobody, back three times and then
  never, and the clock paused whenever the line is not up. It pulls both levers.
* **`tools/touchtest.mjs`** — one new assertion per handedness, named after the
  owner's report: *the graphics control is reachable from the fight and OUT of
  the play field* — top half of the screen, clear of the 132 px band, 44 px
  floor, still on the movement side. It gates that one control by name and
  **prints** every other control in the thumbs' half rather than judging it,
  because HAND at 92 px is a control a thumb is meant to reach.
* **`tools/hudshot.mjs`** (`npm run hudshot`) — new, and it asserts nothing on
  purpose. It photographs the combat HUD at 390×844 in both handednesses and at
  1280×800 and prints every element's rectangle and its gap from the foot of the
  screen. `lockshot` is its sibling and the argument is the same one: the fault
  above passed every number in the repository and was obvious in one frame.
  Frames land in `art/ui/hud/`, which is gitignored like every other capture
  directory — `npm run hudshot -- --tag before` against an older checkout is how
  the pair gets remade. It also prints, per viewport, whether it believed it was
  in a running fight, and says so in capitals when it was not.
