# Rounds, and where men start

The owner played a match and found it ended with one life: *"For the create a
match at the moment it seems it ends with only 1 life. I feel like we should
have 'Best of X Rounds' or something similar. Then is there something for the
Team variants too? Also respawn locations & start points & how that varies with
more players in the game."*

He is right on all three counts. This is the design; the code is downstream.

---

## What the sim does today

`checkMatchEnd` (engine.mjs) ends the whole match the moment one man is left
standing, or one team is wiped:

```js
if (alive.length <= 1) endMatch(room, alive[0] || null);
```

So a duel is decided by a single exchange. One mistimed block and the match is
over — which is the worst possible shape for a game whose pitch is *drop a link
in a group chat*. The player who loses gets ten seconds of scoreboard and no
second chance, and the player who wins learns nothing about whether he is
better. Every melee game in the reference class (Mordhau duel servers,
Chivalry 2, For Honor) runs best-of.

`spawnPositions(count)` is a bare circle:

```js
const angle = (i / count) * Math.PI * 2;
positions.push({ x: Math.cos(angle) * 9, y: 0, z: Math.sin(angle) * 9 });
```

Four faults, in rising order of how much they matter:

1. **Radius is fixed at 9 regardless of count.** Two duellists start 18 m
   apart — a long walk before anything happens. Eight men start 6.9 m apart
   along the arc, which is inside some weapons' engagement distance.
2. **`y: 0` ignores the terrain.** `world.ts` exposes a height lookup that
   `vfx.ts` already uses. A man spawned at y=0 on raised ground starts inside
   it; on low ground he starts in the air and drops.
3. **Nothing avoids the bonfire at the origin.** It is not on a spawn point
   today only because the ring has radius 9.
4. **Teams are interleaved.** `war_band` assigns red/blue but spawns by index
   around one circle, so in a 2v2 your shield-friend is diametrically opposite
   and both enemies are adjacent. The mode is named for fighting shoulder to
   shoulder and it starts you surrounded.

---

## Rounds

**A match is best of N rounds.** N is chosen by the host at creation: 1, 3 or
5, defaulting to **3**. First side to `ceil(N/2)` round wins takes the match —
so best-of-3 ends at 2 wins and can finish in two rounds, which is the point.

- A **round** ends on the existing condition: one man left (FFA) or one team
  wiped (war band). That logic is already written and correct; it just has to
  stop being the end of the match.
- Between rounds, a short intermission (~5 s) with the round result on screen,
  then everyone revived at fresh spawn points and a countdown.
- `lastStandTriggered` resets per round — last stand is a round-level moment.
- **Kills, deaths and damage accumulate across the whole match**, so the
  end-of-match scoreboard reads over all rounds. **Round wins are tracked
  separately** and are what decides the winner.
- A draw within a round (both last men die in the same tick) awards no round
  win to anyone and moves on.

**Team modes get the same treatment**, scored by team rather than by man. A
war band match is best of N; a round goes to whichever team still has someone
standing. The end-of-match winner is a team, not an individual — the
`match_end` message currently carries a single `winnerId` and that is no longer
sufficient for war band. Widen it rather than overloading it.

**Reward for the match, not the round.** Gold and XP are granted once, at match
end, from the accumulated totals. Do not pay out per round; a best-of-5 would
then be worth five times a best-of-1 for the same wall-clock and the economy
would tilt toward whoever picks the longest format.

Solo training is not a match and does not get rounds. It respawns endlessly —
that is what it is for.

## Where men start

Spawn placement should answer three questions the current code never asks:
how many are fighting, whose side are they on, and what does the ground look
like there.

- **Radius scales with count.** Enough room that nobody is inside anyone's
  reach at the bell, not so much that the first ten seconds are a walk. Two men
  want less than the current 18 m gap; eight want more than 6.9 m of arc.
- **Sit on the terrain.** Use the same height lookup the renderer uses, so a
  man starts on the ground he appears to stand on.
- **Clear the bonfire and any other fixed obstacle**, at whatever radius the
  count produces.
- **Teams start together and opposite.** Red on one arc, blue on the facing
  arc, each man's shield-friend beside him, both sides facing the middle.
  Spread the arc with the team's size so a 4v4 line is a line, not a huddle.
- **Face the fight.** A spawned warrior's rotation should look toward the
  centre of the arena, or toward the enemy arc in team modes. Starting with
  your back to the fight is the kind of detail that reads as broken.
- **Vary between rounds.** Rotate the whole ring by a per-round offset so a
  best-of-5 is not the same opening five times. Derive it from something the
  server already has — round index is enough — so it stays deterministic and
  the server remains the only authority.

**Solo respawn** (engine.mjs, the endless-training path) currently picks a
random one of eight fixed points, which can drop the player on top of a bot.
Pick the point furthest from the nearest living enemy instead.

---

## Constraints

- **The server stays authoritative.** Spawn points and round state are
  computed server-side and broadcast. The client draws what it is told.
- **The wire has to carry it.** Round index, round wins per side, and the
  target are needed by the HUD and the lobby, and must survive into whatever a
  late joiner or spectator rebuilds from — the same requirement that
  `deathZone` had, and the same three roads back to standing.
- **`npm run playtest` is 9/9 and must stay there.** It plays a real match; a
  round transition must not break the control assertions.
- **Do not weaken the reward economy.** Check the new totals against the shop
  costs in `characters.ts` before shipping — a top-tier helmet should still be
  a goal, not an afternoon.
