# MERCY OR FINISH — built, played, removed

Removed 20 Aug 2026. This file exists because **a backlog that forgets why
something was removed grows it back**, and this feature has a strong design
review behind it (`DESIGN-SYSTEM.md` §8 called it "the strongest screen in the
bundle"). Somebody will read that review again. They should read this first.

---

## What it was

A man whose health reached 0 did not die. `applyDamage` handed him to `goDown`,
which knocked him over, set `mortal = true`, opened `mercyTimer` at
`MERCY.window` (2.5 s), named `mercyTo` — the man whose choice it was — and
broadcast `downed` with a **real** count of the living men in the room who were
neither of the two in the moment. Letting the window run out was itself the
merciful act and the server said so out loud with `spared`; he rose on a quarter
bar carrying `spared: true`, so a man could be spared once per round and the
second fall was a death. Finishing him inside the window produced
`deathCause: "finish"`, its own collapse shape in `anim.ts`, and a
`menFinished` count on the results table beside `menSpared`.

It was on the server, gated by `tools/mercytest.mjs`, and it had no UI.

## Why it was removed

### 1. It froze men mid-round, and it froze the wrong men

The owner, having played the merged build:

> "The whole vote for mercy or kill thing is what's causing the bodies to
> freeze — always when low health. But it's for every player, not the final
> 1v1, and during the game, so the animation of them frozen stood up straight
> runs out after a few seconds with no vote."

He is right on every clause, and the code said so:

* **Every player, not the final 1v1.** `goDown` fired on ANY player reaching 0
  health. Nothing in it scoped the window to a last man standing, to a duel, or
  to the end of a round.
* **During the game.** So seven other men fought on around a man parked on the
  floor for 2.5 s.
* **Frozen stood up straight.** `goDown` parked the floor clock —
  `downTimer = KNOCKDOWN.down + KNOCKDOWN.rise` — and the tick refused to spend
  it while `mortal` was set. `knockLayer` phases the fall off `player.downTimer`,
  so a held `downTimer` is a held POSE. `gravitytest` §1 measured it on the real
  engine driving the real `poseWarrior`: **159 of 159 frames drawn under 37°
  from upright, for 2.65 s unbroken, and then 73.8° of trunk in ONE frame at
  60 fps** when the window shut. That one-frame snap is also the owner's third
  report — "flopping quickly down and up" — with a mercy window behind it.
* **Runs out after a few seconds with no vote.** There was no vote to have. The
  UI was never built, so the choice existed only as a wire field. A mechanic
  whose entire user interface is "wait and see what the server decides" is not
  a decision; it is a delay.

### 2. It belongs to another culture's arena

The owner again:

> "I feel like it's an unnecessary feature as I imagine it wasn't even a thing
> for Anglo Saxons and would be more Roman?"

He is right about that too. A spare-or-kill decision taken over a downed
fighter, in front of a watching crowd, on a signal — *missio*, *pollice verso*,
the editor and the mob — is Roman arena procedure. It is the shape of a
spectacle with an audience whose approval is the mechanism.

The nearest real Anglo-Saxon thing is **grið** — and `feorhgrið`, "life-peace".
It is quarter, and its shape is completely different: it is **granted by a
lord** or by a king's officer, or it is **asked by a man who yields**, and it is
a matter of law, kinship and *wergild* settled afterwards. It is not a timed
choice made mid-melee by whichever man happened to land the last blow, and it is
certainly not put to a crowd. The game the owner is building is a moot, not an
amphitheatre; see `WHAT-THIS-GAME-IS.md`.

That is a stage-1 fault in R11 terms — the mass is in the wrong place — and no
amount of tuning the window would have fixed it.

## What went with it

| removed | where |
|---|---|
| `MERCY` (`window`, `risesOn`) | `src/game/engine.mjs` |
| `goDown`, `spare`, `witnessesTo` | `src/game/engine.mjs` |
| `mortal`, `mercyTimer`, `mercyTo`, `spared` | player record and the wire |
| `menSpared`, `menFinished` | player record, wire, `match_end` ledger rows |
| the `downed` and `spared` broadcasts | `src/game/engine.mjs` |
| the held floor clock in `stepRoom` | `src/game/engine.mjs` |
| `deathCause: "finish"` and its `causeOf` branch | `types.ts`, `anim.ts` |
| `tools/mercytest.mjs` | deleted |

A lethal blow now takes the death path that was always sitting underneath the
`goDown` call: `state = "dead"` on the tick the blow lands.

## What was NOT removed, and is worth keeping in mind

The design review's three properties are good and none of them depends on mercy:

* **State the pressure socially rather than as a meter.** Still true of the
  whole game.
* **A window DRAINS, it does not count down.** The riposte window already works
  this way (`vulnerableTimer`), and `docs/WEIGHT.md` cites the rule.
* **The absence of an act is itself an act, and the game should name it.**
  Nothing currently uses this. It is the one idea here worth rescuing.

If a yielding mechanic is ever wanted, `grið` is the honest one to build: a man
who is beaten **asks**, and a lord **grants**. That is a player-initiated
surrender, not a timer, and it does not park anybody's body.

## How to tell if it comes back

`tools/gravitytest.mjs` §1 measures `zeroToDead` — **how many 20 Hz server ticks
a man spends at zero health before the server calls him dead**. Mercy made that
number 50. The bar is 0, and it is not a threshold anybody can argue down: it is
the feature's absence, stated as an integer. `mercytest` going away proves
nothing; that number does.
