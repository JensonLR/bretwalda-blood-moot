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
- the reticle is painted on the man it is holding, and moves with him;
- the reticle and its tuition line take no bite out of the button side, for
  **both** handednesses.

Act two's warrior can and does die. Every assertion in it waits for a man on his
feet and takes its verdict off the snapshot trail rather than off the state at
the end of a settle — the first cut of the switch test watched a perfectly good
switch happen and then failed it, because he was cut down 350 ms later.

Frames land in `art/shots/lock/`.

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
