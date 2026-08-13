# What this game is

Written 12 Aug 2026, because the owner asked the only question that matters:

> "Also need to find what the 'so what' is of the game, whats the purpose & why
> would people come back... I also want you to think about what this game is,
> what it currently has & what is missing which could revolutionise the game.
> I've decided its 100% going on steam once its ready, then mobile, then
> console."

This document is the answer, and it is a design decision rather than a survey.
Everything in `BACKLOG.md` is sequenced against it.

---

## 1. The honest diagnosis of what exists today

Bretwalda: Blood Moot is, right now, **a cosmetics shop with a deathmatch
attached**. That is not a slight — the deathmatch is real, the server is
authoritative at 20 Hz, the armoury has 47 options across 8 slots, and the whole
thing opens from a link with nothing to install. Those are genuine assets. But
the loop a player is actually in is:

> fight → earn coins → buy a helmet → fight again, to buy another helmet

A cosmetic treadmill is a legitimate retention engine in exactly two conditions:
there is a **social audience** for the cosmetics (Fortnite: you are seen by a
hundred people a match, in a lobby, on a stream), or there is **deep mechanical
mastery** whose ceiling keeps players in the fight for its own sake (Mordhau,
Chivalry). This game currently has neither at the required depth. A match is
eight strangers who will never meet again, and the combat — honestly — is a
swing, a block and a dodge.

So the treadmill turns and nothing is on the other end of it. **That is the "so
what" problem**, stated precisely: *nothing a player does on Tuesday is still
true on Wednesday.* Coins accumulate; nothing else does.

## 2. What this game has that nothing else has

Three things, and the strategy has to be built out of these rather than out of
what other melee games do well.

**Zero install.** A link opens a real 3D melee fighter, on a phone, in a
browser, in about four seconds. Mordhau cannot do this. Chivalry cannot do this.
This is the distribution superpower and it is the reason the "no binary assets"
rule has been worth its enormous cost. It means the game can be *shared into a
group chat and played by everyone in it ninety seconds later*.

**Anglo-Saxon specificity.** Not generic medieval fantasy. Sutton Hoo, the
Bretwalda, the blood moot, the heptarchy, garnet cloisonné, plaitwork. Nobody
owns this ground — everyone else is either high fantasy or French-and-English
plate. It is a genuinely unoccupied aesthetic position with a deep, real,
free source of art direction behind it.

**Gore as a first-class aesthetic.** Severing, spray, the pyre. Most melee games
treat blood as a particle effect. This one treats it as a subject.

## 3. The decision: what the game IS

> **Bretwalda: Blood Moot is a persistent war for Britain, settled in
> three-minute melee rounds.**

The title has been telling us this the whole time and nobody read it. A *moot* is
an assembly convened to settle a dispute. A *Bretwalda* is the overlord all the
other kings of Britain acknowledge. The name of this game is literally **"the
bloody assembly that decides who rules Britain."** The game should be that, and
at present it is not that at all — the kingdom map is a menu decoration.
(**Superseded 14 Aug 2026.** The map is no longer a decoration: it is a
persisted, shared object that every match writes to. §3.1 is the honest
inventory of what that does and does not yet include. This sentence is left
standing because the diagnosis it belongs to is the reason the rest exists.)

This gives the answer to "why would people come back", and it is one sentence:

> **Because the map moved while you were asleep, and your kingdom is losing
> Mercia.**

Nothing else in the backlog produces that sentence. Ranked ladders produce "my
number went down", which works for the top 2% and nobody else. Cosmetics produce
"I want the gold helm", which is a purchase, not a return. A **shared, visible,
persistent territorial war** produces an obligation to people on your side, and
obligation is the strongest retention mechanic that exists.

### The three loops, and only one of them is built

| Loop | Span | What it is | State today |
|---|---|---|---|
| **The fight** | seconds | swing, parry, riposte, shove, sever | built, but weightless — see §5 |
| **The match** | minutes | rounds, a victor, coins, rank | built |
| **The war** | weeks | territory shifts, a people rises, a Bretwalda is crowned | **the spine stands — see §3.1** |

Layer 3 was the missing spine. Every item the owner listed — clans picking a base
kingdom, making the map matter, factions differing, ranked with historical
titles, a campaign worth playing, flags and colours — is a *rib* of that spine.
They read as a scattered wish-list only because the spine is absent. Add the
spine and they become one coherent feature.

### 3.1 What of the war is actually built, as of 14 Aug 2026

Written the day it landed, and deliberately specific, because a document that
says "the war layer is done" is worth less than no document at all.

**Built and gated.**

* **Sixteen named territories**, four to each people, in `src/game/war.mjs` —
  one table, shared by the server and the map screen. The heptarchy's names
  live here, which is the composition `FACTIONS.md` §5 settled on. Boundaries
  are authored in degrees and clipped to the real Natural Earth coastline.
* **The oath.** `players.allegiance`, sworn over `POST /api/war/swear`, durable
  for the season once a man has banked his first point.
* **The attribution write**, in `endMatch` — the one place the fight touches
  the war. Idempotent under retry, never blocks the round ending, never throws
  into the engine, and refuses to bank a match fought by fewer than two humans.
* **Contest and flips.** A territory changes hands when a challenger's lead
  over its holder reaches its threshold. Points are conserved and the whole map
  reconciles in one SQL query.
* **The map screen** at `/factions`: who holds what, what moved and when, where
  the season stands, and which four borders are closest to falling.
* **The rulers.** `tools/wartest.mjs` (79 checks, plus a `--prove` arm that
  injects the two defects the neutrality gates exist to catch and requires them
  to go red) and `tools/warflow.mjs` (22 checks, end to end, real Postgres).

**NOT built, and none of it is hidden in a corner.**

* **No season has ever ended in production.** `endSeason` and `settleSeason`
  are written and gated by fixture — a Bretwalda is crowned, exactly one, and
  the mark is written to a column no other code path touches — but the first
  real crowning is 35 days after the first real season opens, and until that
  day the reset path has been exercised only by a harness.
* **No clans.** A clan is sworn within a people (§3, and the owner's own
  instinct). Nothing here builds one.
* **No per-faction kit.** A man's people decides nothing about how he looks
  yet; `appearance` is still whatever the armoury sold him. That is the
  largest single gap between what this screen promises and what a match
  delivers.
* **No adjacency.** Any people may contest any territory, whether or not it
  holds a neighbour. The territory table carries no adjacency graph.
* **No flags or heraldry.** `FACTIONS.md` §6 still stands untouched.
* **The map is not live.** `/factions` reads the war when it opens and does not
  poll. "The map moved while you were asleep" is true; "the map is moving while
  you watch" is not.

### How the war works — the concrete proposal

* **SUPERSEDED — see `docs/FACTIONS.md`.** This bullet proposed the heptarchy
  as the roster. It was wrong: the heptarchy barely exists by 878, seven
  Anglo-Saxon kingdoms look identical to each other, and seven splits a queue
  worse than four. The roster is **four peoples** — Anglo-Saxons, Norse,
  Britons, Picts — with Dál Riata as a spare fifth. The heptarchy's names
  survive as *territory* on the map, which is what actually moves. The rest
  of this section stands.
* A player **swears to a kingdom** on first run. This is the "big decision"
  the owner asked for, and it is big because it is *social and durable*: it
  decides who your allies are for the season, what your flag is, what your
  starting kit looks like, and which border you are fighting over.
* Every match is fought **over a named territory**. The winning side's kingdom
  banks that territory's contested points. A territory flips when it crosses a
  threshold.
* The map is **shared across every player** and **redrawn continuously**. When
  you open the game you see what happened overnight.
* A **season** runs 4–6 weeks and ends with one kingdom holding the most
  territory. Its highest-contributing player is crowned **Bretwalda** for the
  season, with a permanent, unbuyable mark on their profile. Then the map
  resets, with the previous Bretwalda's kingdom starting at a small advantage
  and a large target on it.

  **This last sentence was true in `war.mjs` and false in production, and that
  is worth recording here rather than only in a commit message.** Under
  concurrent callers the 35-day rollover raced: three seasons opened at once,
  and every one of them opened DEAD EVEN — so the advantage and the target,
  the entire reward for winning a season, silently did not happen and no number
  in the repository said so. `openingHoldings` was never wrong; the persistence
  around it could not be trusted to ask it the question. It is now enforced by
  a partial unique index in Postgres and gated by `npm run warrace`, which
  fires the boundary at ten callers at once and was shown red first. A design
  document that states a mechanic owes the reader a note when the mechanic was
  found not to be running.
* **Clans** are sworn *within* a kingdom (this is exactly the owner's instinct,
  and it is right). A clan is 2–4 players who queue together and whose wins are
  attributed to both the clan and the kingdom.

This costs far less than it sounds. The fighting already exists. What is needed
is a persisted territory table, an attribution write at match end, and a map
screen that renders it. The campaign, the ranked ladder, the faction kits and the
flags all become *content for a frame that already exists*, rather than four
unrelated features each needing their own justification.

> **Those three are now built** — `territories`, `endMatch`'s war report, and
> `/factions`. §3.1 says exactly how much of the rest is, and how much is not.
> One estimate in this paragraph was right and is worth recording as such: it
> did cost far less than it sounds. The spine is about 700 lines of rules and
> persistence, on top of a fight that already worked.

## 4. What this means for Steam

Steam changes the calculus and the owner is right to name it. Two consequences:

**The zero-install superpower does not disappear on Steam — it becomes the
funnel.** The browser build is the demo that costs nothing to try and can be
shared in a message. Steam is where people who are already playing go to buy in.
The correct relationship is *one account, two doors* — the same war, the same
map, the same clan, whether you came through a link or through the Steam client.
This must be true from the first Steam build or it will never be retrofitted.

**Steam demands a reason to exist next to Mordhau and Chivalry, and "it also
runs in a browser" is not one.** The reason has to be the war. "A melee game
where the fighting decides a persistent map of Dark Age Britain" is a shelf
position. "A melee game" is not.

## 5. What is missing that would revolutionise it

Ranked by how much each changes the game, not by cost.

1. **The war layer** (§3). Turns disposable matches into contribution. This is
   the single highest-value thing in the whole backlog.
2. **Weight.** The owner has now said this three separate ways — "need to feel
   more weight", "shoving people", "being able to fall over if caught off
   guard". Right now a hit is a number leaving a health bar. It needs mass:
   wind-up you can read, impact that moves both bodies, a stagger state, a
   knockdown, a get-up. This is what makes the *fight* loop worth repeating
   independently of the war, and it is what a Steam audience will judge in the
   first ninety seconds.
3. **The parry window and the riposte.** Already the owner's ask, and it is the
   single mechanic that turns a swing-fest into a conversation. Parry must open
   a real, visible, punishing window. This is the mastery ceiling.
4. **Being seen.** The death camera holding on your own severing; the round-end
   beat where the victor emotes and everyone watches; the results table that
   records rounds won. Every one of these is the game telling a player *that
   thing you did was witnessed*. The owner listed all three separately; they are
   one idea.
5. **Solid objects and real maps.** Walking through a woodpile is the single
   loudest "this is a student project" tell in the build. Cover that blocks,
   ground that shapes a fight, and maps that are *places in Britain* rather than
   arenas.

## 6. What this game is NOT, so it stays not that

* Not a battle royale. Eight men in a moot is the format; scale is not the axis
  of improvement.
* Not high fantasy. No magic, no dragons, no elves. The Runekeeper is a man with
  carved staves and a reputation, not a wizard.
* Not a hero shooter. The four classes are *fighting styles*, not characters
  with lore and voice lines.
* Not free-to-win. Cosmetics and titles may be sold or earned. Reach, damage,
  health and speed may never be.

## 7. The one-line pitch, for the Steam page

> **Dark Age Britain is decided by combat. Swear to a kingdom, take the field,
> and drag the border with your own hands.**

---

## Where this leaves the backlog

`BACKLOG.md` is re-sequenced against this document. The short version:

* Everything that makes the **fight** feel heavy comes first, because it is what
  a new player judges in ninety seconds and it is the foundation the war layer
  sits on. A persistent war fought with weightless swings is a spreadsheet.
* The **war layer** is next, and it is a project rather than a wave.
* Cosmetics, screens and symbols are **finishing**, not foundation. They are
  already good enough to not lose a player; they are not what brings one back.
