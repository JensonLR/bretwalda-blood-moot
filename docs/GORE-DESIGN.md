# Dismemberment and blood

A death should tell you how it happened. The limb that took the killing blow
comes off, blood goes with it, and the body falls without it.

This is the feature the game's owner asked for, in his words: *"if it hits
neck/head the head falls off & spits blood out, arm hit, arm falls off and
sprays blood. same for legs etc. If waist is hit then it should be like one of
those samurai scenes where the body is split laterally across the waist & both
parts fall to the floor separately."*

Reference class for the feel: Mordhau and Chivalry 2. Both dismember on the
killing blow, both spray from the stump rather than from a generic point, and
both let the severed part carry its own momentum.

---

## The blocker: the server does not know where a hit landed

`applyDamage` (engine.mjs) broadcasts:

```
{ type: "hit", data: { type, attackerId, targetId, damage, health, direction } }
```

`direction` is the attacker's swing direction — `left`, `right`, `overhead` or
`stab` — not a place on the body. Nothing anywhere in the sim carries a hit
location, so there is currently no way for the client to know which limb to
remove. **This is the whole of the work; the visuals are downstream of it.**

## Where the location should come from

The server is authoritative and must stay so — the client cannot decide what
came off, or two players watching the same death would see different bodies.

Derive it in `processAttack`, from what the sim already knows:

- **Swing direction** is the strongest signal and already exists. An overhead
  chop lands high; a horizontal swing lands at the mid-line; a stab lands where
  it is aimed.
- **Relative height** between attacker and target. The classes are not the same
  height and the sim knows both positions.
- **Approach angle** — `processAttack` already computes `angleDiff` between the
  attacker's facing and the target. A blow from behind should not sever a face.

Map to a small, closed set the client can switch on, and put it in the wire
message so replays and spectators agree:

```
hitZone: "head" | "neck" | "armL" | "armR" | "legL" | "legR" | "torso" | "waist"
```

Add it to the `hit` broadcast and to `kill`, since the kill message is what
drives the death sequence.

Keep the damage model honest while you are there: a head or neck hit should be
worth more than a leg. That is a balance change, so state it explicitly rather
than sneaking it in — and check it against `WARRIOR_STATS` before shipping it.

## What the client does with it

`characters.ts` builds warriors as merged `Part` geometry, and `anim.ts` now has
elbow and knee joints. A severed part has to be a real object with its own
transform, so it can fall on its own.

- **Head / neck** — the head comes off at the collar, the body drops. The
  severed head keeps the helm it was wearing.
- **Arm** — off at the shoulder or elbow depending on where the blow landed.
  The dropped arm should still hold whatever it was holding; a hand releasing a
  sword mid-air is the detail that sells it.
- **Leg** — the body falls toward the missing side rather than straight down.
- **Waist** — the samurai case. The body separates into two halves that fall
  independently: the upper half forward onto its face, the lower half folding
  where it stood. This is the hardest one and the most memorable when it works.

Blood is `vfx.ts`: a burst from the stump on the frame of separation, then a
weaker continuous spray for a beat as the part falls, then pooling. It must
arc under gravity and land as a decal — the panels have twice noted that
particles which ignore gravity read as confetti.

## Constraints

- **No new binary assets.** Everything procedural, like the rest of the game.
- **Pooled.** Eight warriors can die in a brawl. Severed parts and blood
  emitters allocate from a pool; nothing churns geometry per frame.
- **Quality tiers.** The low tier may reduce particle counts and skip the
  bisection, but a death should still read as a death on a phone.
- **The corpse still has to work.** Bodies persist, respawn in solo, and are
  spectated. A dismembered body must clean up on respawn and must not leak.
- **Late joiners and spectators** see the `kill` message, not the `hit` — make
  sure the zone survives into whatever state a client reconstructs from.

## A note on tone

This is a Dark Age melee game about killing people with axes; blood is the
point and it should land hard. Keep it to combat: dismemberment on a killing
blow, blood from wounds. There is no reason to go further than the reference
class, and the game is a drop-in link that lands in group chats, so the default
should be something an adult would happily show a friend.
