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

## And the rest of the game has to know

- **Arena selection in the lobby**, on the wire, and in the room. `Room.arena`
  exists and is always `"saxon_village"` — it becomes real.
- **Per-map spawns.** The spawn solver takes radius, shape and obstacles from
  the map rather than from constants.
- **The capture harness needs a map parameter**, or two thirds of the game
  cannot be reviewed.
- **Quality tiers.** Three maps is three times the surface for a phone to
  choke on. Whatever the budgets are, they are per-map now.
