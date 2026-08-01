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
