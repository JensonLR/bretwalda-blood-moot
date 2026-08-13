# Three grounds to fight on

The owner: *"design, process & perfect multiple maps to play on, lets say 3
total, all different, all unique, all utterly beautiful."*

There is one arena today — `saxon_village` — hard-coded in two places in
`engine.mjs` (`arena: "saxon_village"` at room creation, both the multiplayer
and solo paths), and built by a 3,730-line `world.ts` that assumes it.

---

## What has to happen before any map gets built

**`world.ts` does not have a seam.** It builds *the* arena: terrain field,
settlement, palisade, bonfire, torches, banners, props. Every one of those is
written as "the" thing rather than "a" thing. Two more maps means finding the
seam first — a map is data plus a build function, and the shared machinery
(terrain generation, prop scattering, the lighting rig, the height lookup) is
reused rather than copied.

Copy-pasting `world.ts` twice would be the fastest way to three maps and the
end of ever changing any of them. Do not.

**Three things outside the renderer already depend on the arena being one
place**, and every one of them is a real bug if a map changes shape:

1. **`groundHeight` in `engine.mjs` is a hand-copy of `world.ts`'s terrain
   field.** It is already flagged as drift-prone in the rounds work. With three
   maps it is drift-prone three ways, and it decides where men spawn.
2. **`ARENA_RADIUS = 18` is a constant**, and the spawn ring is solved against
   headcount inside it. A map of a different size or shape needs this per-map.
3. **The bonfire hazard is at the origin** with a radius derived from the
   fire's geometry. A map without a central bonfire needs a different hazard,
   or none — and the "walked tracks converge on the fire" terrain detail is
   authored to match.

## The three grounds

One is built. The other two should differ in **silhouette, palette and light**
— not be the same field with different props. The test is whether a single
screenshot is instantly identifiable.

**1. The Saxon Village** *(exists)* — dusk, firelit, warm. A palisade ring, thatch
and timber halls, a bonfire at the centre. Enclosed and communal: this is a
moot, a gathering that turned to violence.

**2. Something cold, open and lit by sky rather than fire.** The village's
entire look is a warm key from a bonfire against a dusk sky. A ground with a
*cold* key and a wide horizon changes every material in the game without
touching one of them, and it is the cheapest way to make map two feel like a
different game. A tidal flat, a frozen fen, a moor under low cloud — long
sightlines, low contrast, weather doing the work.

**3. Something enclosed, vertical and old.** The opposite pole: tight, dark,
with stone and height. A ruined Roman fort the Saxons never rebuilt is the
strongest candidate — it is historically exact for the period, it puts *stone*
in a game that is currently all timber and thatch, and broken walls give real
sightline breaks in a game that has none. Vertical structure also gives the
camera something the other two cannot.

Each ground should carry **one thing that changes how people fight** — the
village has the bonfire. A hazard, a chokepoint, or cover. Not a gimmick, and
not the same gimmick.

## What "beautiful" is measured against

`docs/VISUAL-BAR.md`, 8+ on every axis, judged from regenerated captures rather
than from code. The `arena` capture preset exists and each new ground needs its
own — plus the same duel/portrait/brawl set, because a map is judged in play,
not as a landscape.

Two traps carried from `docs/OPEN-DEFECTS.md` that will recur on any new
ground: everything past ~10 m collapsing to one orange hue, and the bloom
threshold sitting above where the grade already clips. A cold map will expose
the first immediately.

## Obstacle decoration and decoration decoration

The owner, 13 Aug 2026:

> "Is there a way to make some of the map objects solid too (the wooden stick
> pile on current map for example) instead of walking through them? Bare this in
> mind for creating other maps but i guess the sticking out items like the
> spikes & bones etc, obviously you'd be able to walk around / through them no
> problem so they don't need to but any 'larger' objects (wood pile, wood fire
> structure, fence, larger rocks or boulders, buildings or structures, castles
> or formations, that are deemed as more of an obstacle decoration rather than a
> 'decoration decoration' (sword in ground, helmet on floor, blood on floor
> etc.)"

He drew the line and it is the right line, so it is the line the code draws.
`src/game/solidground.mjs` owns the collision maths; `grounds.mjs` declares
which side of the line each prop is on, and `render/world.ts` builds the picture
out of the same declaration.

**The rule for every ground, including the two that do not exist yet:**

> A SOLID IS PLACED BY THE GROUND. A DECORATION IS SCATTERED BY THE RENDERER.

Declaration *is* placement. A prop that blocks owns its position in
`grounds.mjs`, and the renderer reads it from there — so there is one woodpile
in this repository rather than a drawn one and a collided one, which is the
mirrored-definition fault (five recorded instances) not getting a sixth.
Everything the renderer draws out of `scatter()` is decoration by construction:
the sim never learns where those went, and arrows, bones, helms, broken boards
and loose rocks are exactly the "sword in ground, helmet on floor" the owner
exempted. Making a prop solid therefore *costs* something — its placement has to
move up into the ground — and that friction is the point. It is the difference
between a decision and a default.

Nothing defaults. `solid()` throws without a `height` and without a `why` that
says something, and `passable()` throws without a reason too, because the
distinction is only worth having if the answer is written down for **both**
halves. The village's passable list is in `VILLAGE_PASSABLE` and it names the
bonfire, the hearth stones, the spilled billets, the packing stones, the fallen
shield and the debris, each with the reason it does not block.

**The one deliberate exception, and it is the interesting one.** A "wood fire
structure" is on the owner's obstacle list, and the village's bonfire is
declared PASSABLE anyway: it is the arena's only hazard and the whole point of
it is that men are shoved *into* it. Make it solid and the fire stops killing
anybody. Its kerb of hearth stones is passable for the same reason — fenced off,
the hazard is decoration. If a ground has a fire nobody is meant to burn on, that
one is solid.

### What is solid on the Saxon Village

Two things, and that is not an oversight. `CLEAR_RADIUS` keeps everything but
the fire out of the middle 6.2 m, the fire has to stay walk-into-able, and
everything else in the moot — huts, hall, palisade, banner poles, shield racks,
spear bundles, barrels, loose rocks — stands outside the play bound at 18 m,
which stops a man 1.6 m short of the palisade. Two things stand on the fighting
floor and both of them were holograms:

| | plan footprint | height | note |
|---|---|---|---|
| `woodpile` | 1.87 × 1.20 m | 0.75 m | the owner's own example |
| `runestone` | 1.51 × 0.68 m | 3.74 m | centre at r 17.7, **corner past the ring** |

Neither footprint is written down. Both are FITTED to the prop's own parts —
every billet, every crib stake, every vertex of the stone's outline — by
`fitFootprint`, from the same layout the renderer instances the meshes from.
Move the woodpile and the picture and the wall move together; `tools/solidtest.mjs
--lever move` shows the collision following and `node tools/shoot.mjs arena`
with the same edit shows the picture following.

### The world is 2-D on the server, and that is a simplification

The sim has no y. Boots are planted at y = 0 and the village's field is held
within ~5 cm of that inside the palisade precisely so that stays honest. So a
solid is a plan-view shape and nothing else: a man cannot climb, so a knee-high
rick of firewood stops him exactly as a four-metre standing stone does, and a
footprint is the union over HEIGHT of everything the prop is made of. The
woodpile's crib stakes lean outward, so its collision footprint is 17 cm wider
across than its billets are. A ground that wants a wall a man can vault has to
move the sim first, not the collision.

### Three things a new ground has to decide

1. **Which props are solid**, and the reasons go in the declaration. Anything a
   grown man could not push over is the working test; the owner's list — wood
   pile, fire structure, fence, larger rocks or boulders, buildings, castles,
   formations — is the guide.
2. **Whether any solid reaches past the play bound.** The runestone does, by
   0.53 m, and it is why the play bound is solved *inside* `resolveSolids`
   rather than clamped separately: two rules that can each push a body into the
   other will do it forever. Solids are hard and the ring is soft, in that
   order.
3. **Whether any two solids touch.** Two overlapping rectangles are one obstacle
   with a shape no rounded rectangle has, and possibly a re-entrant one. The
   bot steering is one waypoint deep and CANNOT plan a two-corner route: on a
   fixture with two ruin walls forming an L, 6 of 44 bot runs never got round.
   **The ruined fort is exactly this map**, so it needs either corners authored
   without pockets or a real planner, and that decision belongs with the map
   rather than after it.

### The two calls the server makes — and it was ONE for a day, which was wrong

`engine.mjs` makes them now. The first is at the movement step, immediately after
`integrateMovement`, and it **replaces** the palisade clamp that used to follow —
the play bound is part of the same solve, so the eight-line radial clamp is gone
rather than left as a no-op:

```js
const wasX = player.position.x, wasZ = player.position.z;   // before the stride
integrateMovement(player, dt);
resolveInto(ground, player, wasX, wasZ);   // resolveSolids + killComponent
```

**THE SECOND CALL IS THE ONE THIS DOCUMENT USED TO BE MISSING, AND IT IS THE
DIFFERENCE BETWEEN A DUEL AND A SCRUM.** The engine does not stop after the
movement step. It then runs a **soft body-separation pass** that holds warriors
1.05 m apart by writing `player.position` directly — and that pass runs *after*
the resolve, so it pushes bodies straight back into the props the resolver had
just cleared, with nothing behind it to undo that:

```js
// ...the separation loop, unchanged and deliberately still naive...
if (pushed) {
  for (let i = 0; i < arr.length; i++) {
    if (unmoved) continue;
    resolveInto(ground, arr[i], beforeSep[i].x, beforeSep[i].z);
  }
}
```

Measured on the real engine, the two builds differing by that one `if`:
**374 of 48,000 man-ticks ended with a body inside the woodpile, deepest 258 mm**,
in an eight-man scrum. In a plain duel: **0 of 12,000, on both builds.** So the
defect is invisible in the case a single-body harness tests and continuous in the
case the owner reported, and the fix that only holds in a duel is not a fix.
`tools/solidtest.mjs` claim 12 runs `engine.mjs` itself — real room, real bots,
real tick order — and gates it.

The alternative was a *solid-aware push*: teach the separation loop to choose a
direction that does not enter a prop. That is a second piece of code that knows
what a solid is, in the file with the least reason to own one, and this
repository has recorded the mirrored-definition fault five times. So the push
stays naive and its output goes back through the same resolver. **A new pass that
moves bodies must be followed by a resolve, or it is a hole** — that is the rule
this section exists to carry forward.

Two optional hooks, neither on the movement path: `steerAroundSolids` for bots —
without it a bot walking dead-on into a flat face stops there for the rest of the
round, which is correct collision and useless navigation — and `clearanceAt` for
the spawn solver, because the village's spawn ring is 6–12 m and the woodpile is
at r 6.8, so a round can currently open with a man standing in the firewood.
`resolveSolids` ejects him within two ticks either way and says so with
`rescued`, but not opening the round inside a rick is better.

Gated by `node tools/solidtest.mjs`, which walks a man into every solid on the
village and on a proving-ground fixture from 24 bearings at every speed the game
can produce, and asserts he is stopped, never inside, never stuck and always
sliding free. `--hollow` runs the same claims with the resolver removed, which is
the build this replaces: 384 of 384 walks put a body inside a prop, the deepest
1.59 m into a boulder.

### One correction that belongs here

`grounds.mjs` used to claim in its header that `engine.mjs` "imports this
instead" of keeping its own copy of the terrain field. **It does not, and it
never has.** Measured 13 Aug 2026 by grepping every importer in the repository:
`render/world.ts` is the only one. `engine.mjs` still carries its own `clamp01`,
`smoothstep`, `hash2`, `noise2`, `fbm`, its own `GATE_ANGLES` and `pathMask`,
its own `groundHeight`, its own `ARENA_RADIUS = 18` and its own
`FIRE_GEOMETRY_RADIUS = 2.0`. Its comment gives the reason as "that module is
the renderer's and pulls three.js in with it", which was true of `world.ts` and
has never been true of `grounds.mjs`.

So point 1 at the top of this document is still open, and the header claiming
otherwise was itself the fault this file's list of traps warns about. The numbers
agree today; nothing makes them agree tomorrow, and `tools/solidtest.mjs` now
fails loudly if `ARENA_RADIUS` and `play.radius` ever disagree.

## And the rest of the game has to know

- **Arena selection in the lobby**, on the wire, and in the room. `Room.arena`
  exists and is always `"saxon_village"` — it becomes real.
- **Per-map spawns.** The spawn solver takes radius, shape and obstacles from
  the map rather than from constants. `spec.obstacles` is real now and
  `clearanceAt` is what a solver should ask; the village's ring already crosses
  the woodpile.
- **The capture harness needs a map parameter**, or two thirds of the game
  cannot be reviewed.
- **Quality tiers.** Three maps is three times the surface for a phone to
  choke on. Whatever the budgets are, they are per-map now.
