# The feature moot

The owner brought a list. This is the triage — what gets built now, what gets
split into a part worth building and a part worth deferring, what gets refused
and why. The decisions below are settled; the point of this document is that
they stay settled when the container that made them is gone.

The test every request was held to: **does it make the link in the group chat
better?** The whole product is that link — no signup, no download, instant play,
on a phone. A feature that makes the link heavier, slower, or unfair to the
person who just clicked it is working against the product no matter how good it
looks.

---

## Build now

### The end-of-match summary screen

Today the match ends in a `match_end` message (`engine.mjs`, the broadcast
around line 1617) that already carries everything a ceremony needs — kills,
deaths, damage, score, `isWinner`, `xpEarned`, `goldEarned`, per man — and the
client spends it on numbers. That is a scoreboard, not an ending.

Build the ending out of the game's own bodies. The renderer can already stage a
warrior with no arena — `shot/page.tsx` fabricates one for a portrait — so the
summary screen stages the real characters, in their real cosmetics, as a
tableau: the fallen and the also-rans in a shield-wall line, the victor at the
centre. In a duel, the loser lies where he fell — the corpse system already
carries `deathZone`, `deathDir`, `deathHeavy` and `deathCause` on the player
precisely so a body can be rebuilt from a snapshot. The data is paid for; the
screen just has to spend it.

This is also where cosmetics earn their gold. A helmet is worth 2400 when
seven other players are made to look at it.

### The shove

The gap is exact and it is one sentence: **nothing in the sim can move a man
except himself.** `applyImpulse` (`engine.mjs:1175`) exists and works — it is
how dodges (line 1216) and lunges (line 1266) travel — but it is only ever
called on the actor. No blow, no block, no collision displaces the other man.

That is why the bonfire is less than it should be. The fire is the arena's one
hazard and you can only back into it. A shove — a stamina-priced, short-range,
blockable push — turns the centre of the map into a threat and the palisade
edge into a wall you can be pinned against.

And the bookkeeping is already done. Fire kill credit exists: `lastHitBy` /
`lastHitAt` are written on every hit (`engine.mjs:1401-1404`) and a burn death
inside `BURN_CREDIT_WINDOW` (5 seconds, line 69) credits whoever last drew
blood (lines 1493-1511). A shove that lands should write `lastHitBy` exactly as
a blow does, and the man you pushed into the fire is your kill with zero new
attribution code.

### Victory emotes

There are none — `grep -rin emote src/` finds nothing but false positives. A
small set, class-flavoured, playable in the post-match tableau and in the
seconds after a kill. Cheap, procedural, and they feed the summary screen
directly: the victor at the centre of the shield-wall should be *doing*
something. Also the obvious first sidegrade for the shop — an emote sells
without touching balance.

### The block-walk glide

A real defect, not a feature. `PlayerState` (`types.ts:34`) is one slot —
`"idle" | "walking" | ... | "blocking" | ...` — and blocking overwrites
locomotion: the input handler sets `player.state = "blocking"` outright
(`engine.mjs:1221`) while movement continues at `BLOCK_MOVE_MULT` (line 1914).
The state slot is carrying two orthogonal facts — what the guard is doing and
what the legs are doing — and only has room for one. So a man walking behind
his shield tells every client "blocking", no walk cycle plays, and he glides.

The fix does not need a protocol change: **`velocity` is already on the wire**
(`types.ts:180`; it is not in `PRIVATE_FIELDS` at `engine.mjs:804`, and the
hitstop contract even documents reporting it as zero). The animator should
drive the legs from velocity whenever the state slot is spent on something
orthogonal to locomotion. Guard from state, gait from velocity.

---

## Split: part now, part later

### Rating now, matchmaking later

A rating is cheap: the DB exists, matches already produce results, and a number
that goes up is the retention feature underneath every other retention feature.
Build it now, show it on the profile, feed it to the summary screen.

The matchmaking queue is deferred, and the reason is arithmetic, not effort:
a queue is only as good as its population, and **an empty queue is a worse
experience than an invite link that always works.** Today every match starts
because someone dropped a link and friends clicked it — that flow has a 100%
match rate. A queue at this player count has a match rate of roughly zero and
teaches the first organic visitor that the game is dead. The queue becomes
worth building when concurrent strangers exist; the rating makes sense today
and is what the queue will eventually sort on.

### Clans — which are called Hearths

Yes to the social layer, and it earns a real name. Not "clan" — that is every
other game and the wrong culture besides. The word is **Hearth**, from
*heorðwerod*, the hearth-troop: the men who share a lord's fire. It is exact
for the period, it is one syllable, and this game already has a literal fire
that people fight around. The recovery-word list even contains "hearth"
already.

Scope for the first cut: a name, a member list, a tag by your name in the kill
feed. Not territory, not chat, not war declarations. A Hearth is who you share
a link with, formalised.

### Stairs, indoors, layered maps

Deferred to its own wave, with `docs/MAPS.md` — and the reason is structural.
**The sim is flat.** There is no jump, position is solved in x/z, and the
arena is a clamped circle (`ARENA_RADIUS = 18`, `engine.mjs:16`). Height in
the renderer without height in the sim is set dressing plus camera bugs: a man
"upstairs" whose hitbox is downstairs, a camera clipping through a floor the
server does not know exists. When maps go vertical the sim goes vertical
first, and that is a wave of its own, not a rider on a feature list.

---

## Rejected, with the reasons on the record

### Importing free three.js assets

No, three times over:

1. **It breaks the rule the product stands on.** Zero binary assets is why the
   link opens instantly on a phone in a group chat. One "free" GLB pack is
   megabytes, and megabytes are the difference between "it just opened" and
   "it's loading".
2. **It fractures the art direction.** Everything in this game is procedural
   and shares one palette and one lighting rig — that unity is why screenshots
   look like one made thing. An imported asset is lit wrong, textured wrong,
   and scaled wrong, and it never stops looking imported.
3. **Licence risk.** Free packs are a thicket of CC-BY and non-commercial
   terms, and this product intends to make money. Attribution chains and
   licence audits are a real cost bought for negative aesthetic value.

The one exception worth arguing someday: a reverb impulse response. It is
small, it is not visible, and convolution reverb from a real space is genuinely
hard to synthesise. Even that is an argument for later, not a decision.

### XP-bought power

No, permanently. The pitch is a link in a group chat; the person who clicks it
is a newcomer against veterans. **The newcomer must be killable by skill
only.** The moment level 30 hits harder than level 1 for a reason stored in a
database, the link is a trap and the pitch is a lie. Progression spends on
cosmetics — that is the entire economy design (see `docs/MONETISATION.md`).
Sidegrades — trades with no net power, like a slower heavier swing — are
acceptable in principle and should still be approached with suspicion.

### More classes

No. Four classes deepened beat six shallow. Runekeeper, berserker, huscarl and
warden already differ in reach, speed, stamina and ability, and each new class
multiplies every future system — sounds, animations, balance, cosmetics, the
summary tableau — by a fifth and a sixth. The game needs its four to be
distinct the way the four impact materials are distinct, not more entries in
the picker.

---

## Extras the list did not ask for

- **A rematch button.** Possibly the highest-value feature in the repo. The
  loop of this game is play-again; today play-again means someone makes a new
  room and re-drops a link into the chat while the losers drift away. One
  button on the summary screen — same room, same men, go — converts the exact
  moment of highest intent. If only one thing from this document gets built,
  it should be this.
- **Splintering shields.** BUILT, 1 Sep 2026. A huscarl's board wears with
  every blow it turns and bursts at zero — cracks across the field, splinters
  off each block, the board thrown from his arm, a haft's guard until he stands
  again. `docs/BACKLOG.md` Wave G carries the numbers; `tools/shieldtest.mjs`
  holds the sim half and `art/shots/shield/` the seen half.
- **Picking up a dead man's weapon.** The corpse persists and the sim knows
  what he carried. A weapon on the ground is a reason to move, and moving is
  what the shove and the fire want you doing anyway.
