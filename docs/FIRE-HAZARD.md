# The fire should burn you

The owner asked for it in these words: *"please make it so stepping on the fire
in the centre does damage & shows the character on fire while on it & for a
short period after. obvs dont want instant death but should be some sort of
punishment for passing through the fire."*

This is a good instinct and it is nearly free ground. The arena already has a
bonfire at dead centre, every walked-off track in the turf converges on it, and
it is the one landmark every fight orbits. Making it hot turns a decoration into
the only piece of terrain in the game that changes how people move.

---

## What exists today

The bonfire is drawn by `world.ts` at the world origin. The module's own comment
records that **the fire's widest geometry reaches 2.0 m** and the nearest spawn
sits at 4.2 m.

The server knows none of this. `engine.mjs` has exactly two spatial rules —
`ARENA_RADIUS = 18` as a hard boundary, and a soft push so warriors cannot stack
on each other. There is no obstacle list, no hazard, nothing at the origin.
A warrior walks through the flames with no effect whatsoever.

So the whole feature is: give the sim a hazard, give the player a burning state,
and give the renderer something to draw on a man who is alight.

## The rule

**Standing in fire kills you. Passing through it hurts.** That distinction is
the entire design and it falls out of a damage rate rather than a special case:

- While inside the hazard, take burn damage continuously.
- On leaving, keep burning for a few seconds at a lower rate, then go out.
- Re-entering refreshes it rather than stacking a second burn.

Tune it so a **clean run through costs a noticeable bite but is survivable at
any health the classes actually have**, while **standing in it is fatal in a few
seconds**. The classes run 90–130 max health; pick the rate against the low end,
because a runekeeper is who will find the edge of this. State the numbers and
the crossing time you assumed in your report — this is a balance change and it
should be arguable.

The hazard radius should sit **slightly inside the visible flame**, not outside
it. A player who can see he is clear of the fire and burns anyway will call it
broken; one who clips the edge of the flame and gets away with it will not
notice. Derive it from the fire's real geometry rather than picking a number,
the way the attack reach was derived from the weapon meshes.

## Things this breaks if nobody thinks about them

**A burn death has no attacker and no hit zone.** Dismemberment shipped last
round: the death sequence reads `deathZone` and severs a limb. Burning to death
must not tear an arm off — there is nobody swinging. Give it its own death, or
an explicit no-severance path. A man who burns to death should fall, not come
apart.

**Kill credit.** If a warrior burns to death seconds after someone hit him, that
kill belongs to the man who drove him into the fire. Outside a short window it
is nobody's — an environmental death. This lands the same round as best-of-N
scoring, so whatever is decided has to agree with how a round is won: a last man
standing who burns to death should not hand the round to a corpse.

**Bots will cook themselves.** Bot steering beelines at its target, and the
hazard is at the exact centre of an arena everything orbits. Bots must path
around the fire, or every match becomes a suicide cult. This is the single most
likely way this feature ships broken.

**Burning is a fourth road back to standing.** `clearDeathMark` already runs on
three (`startCountdown`, the `endMatch` lobby reset, the solo respawn) and best-
of-N rounds is adding round transitions. A warrior must not respawn on fire.

**Spawn invincibility** (`SPAWN_INVINCIBLE = 2.0`) exists. Decide whether it
covers burning and say which; spawns are 4.2 m out so it is not reachable at the
bell, but a round transition could put someone closer.

## What it looks like

Flame on the man, not a tint on him. It has to be visible on a phone at fight
distance and it has to travel with him as he runs, which is the whole point of
the "for a short period after" — a burning warrior fleeing the fire is the image
this feature exists to produce.

- Flame that reads as attached to the body, plus the light it casts. `vfx.ts`
  already owns the bonfire's own flame and its lights; this is the same problem
  at a smaller scale and should reuse that machinery, not invent a second one.
- Smoke trailing after the flames go out, so the state has a visible tail.
- **Zero new binary assets**, like everything else in this game.
- Pooled and budgeted. Eight warriors can be alight at once in a blood moot, and
  the quality tiers in `quality.ts` are the ceiling. The low tier may thin it,
  but a burning man must still read as burning on a phone.

## The feel

There should be a moment of jeopardy when you realise you are standing in it —
the player needs to know *now*, not from a health bar he is not looking at.
Whatever the HUD does for damage already, burning deserves more than a number
ticking down.
