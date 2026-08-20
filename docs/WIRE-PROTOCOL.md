# The wire protocol, as it actually is

This is the contract between `src/game/engine.mjs` — the authoritative
simulation — and anything that wants to be a client of it. It is derived from
the code, line by line, and not from the other documents in this repo, several
of which describe a game that was never built (`CLASS.gorget`; and see §9.11 for
four more found while writing this).

**Why it exists.** `docs/PLATFORM-PATH.md` §2 says the one decision that costs
nothing today and decides everything later is whether the simulation is a
portable headless module speaking a defined protocol, or something entangled
with the web client. No console accepts a web wrapper, so a console client is a
rewrite of the *client*. It is a rewrite of the *whole game* if this document
does not exist. `tools/protocoltest.mjs` runs the conformance suite that keeps
this file true — it imports `engine.mjs` with `window`, `document`, `navigator`,
`self` and `location` rigged to throw, drives a complete match, and asserts
every shape below.

Version: derived from `engine.mjs` at 2432 lines. Line numbers are that file
unless another is named.

---

## 1. Transport, and what is not part of the protocol

The protocol is **newline-free JSON objects, one per frame, `{type, data}`**.
The transport underneath is interchangeable and the simulation never sees it:

| Transport | Path | Where |
|---|---|---|
| WebSocket (preferred) | `GET /ws`, upgrade | `custom-server.mjs:24-47` |
| HTTP + SSE (fallback) | `POST /api/game/msg`, `GET /api/game/stream?sid=` | `src/app/api/game/{msg,stream}/route.ts` |

`custom-server.mjs` is 52 lines and the whole of its game duty is four calls:
`engine.connect(send)` → session id, `engine.message(sid, obj)`,
`engine.disconnectSession(sid)`. **A native client's server needs no more than
this.** Anything that can deliver a string and receive one can host this sim.

Three facts a non-browser client must know:

1. **`type` is always the first key of the serialised frame.** Not by design —
   by every `broadcast`/`sendSession` call site writing the object literal in
   that order. `src/db/matchLedger.ts:151` depends on it
   (`frame.startsWith('{"type":"match_end"')`) to pay players their gold. It is
   load-bearing and undeclared; `protocoltest` now declares it.
2. **There is no sequence number, no acknowledgement, no server timestamp and
   no delta encoding.** Every snapshot is complete and idempotent. A dropped
   snapshot costs one frame of smoothness and nothing else.
3. **The only clock on the wire is `data.matchTimer`** — seconds of simulation
   since the round started, advanced by exactly `1/20` per fixed step
   (`stepRoom`, 2237). Use it, not the arrival time, to order anything.

### The HTTP fallback changes one thing

Over WebSocket a client sends and the server pushes. Over HTTP, `httpMessage`
(2390-2399) temporarily replaces the session's sender so that anything the
server says *in direct response* comes back in the POST body as
`{ok:true, replies:[…]}`, while broadcasts continue to arrive on the SSE
stream. A native client using a single socket can ignore this entirely.

---

## 2. Client → server

Every message is `{type, data}`. `data` may be omitted; the router defaults it
to `{}` (939). **Unknown types are silently dropped** (the `switch` at 941 has
no `default`) — there is no negative acknowledgement, ever. Malformed JSON is
swallowed by the transport (`custom-server.mjs:42`).

All of these except `create`/`join`/`solo`/`ping` require the session to
already hold a room and a player (`withRoom`, 1011-1019); if it does not, the
message is dropped silently.

| `type` | `data` | Guards | Effect |
|---|---|---|---|
| `create` | `{name?, mode?, bestOf?, appearance?, awaitLoad?}` | none | New room, caller is host and the only member. Replies `join`. `name` truncated to 20 chars (1043). `mode` defaults `"blood_moot"`; `"honour_duel"` caps the room at 2, everything else at 8 (1051). Caller's class is forced to `warden` (1056). |
| `join` | `{code, name?, appearance?, awaitLoad?}` | room exists; `state === "lobby"`; `humanCount < maxPlayers` | Joins. Replies `join` to the caller, broadcasts `player_joined` to everyone else, then `lobby_update` to all. Code is upper-cased (1067). Re-sending `join` for the room you are already in re-sends the snapshot instead of duplicating you (1069-1072). Failures reply `error`. |
| `solo` | `{name?, difficulty?, botCount?, warriorClass?, appearance?, autoStart?, awaitLoad?}` | none | Private training room, `maxPlayers:1`, `bestOf:1`, sealed to other humans but holding up to 7 bots (`SOLO_MAX_BOTS`). `autoStart !== false` starts the match 800 ms later on a `setTimeout` (1120-1124). Replies `join`. |
| `select_class` | `{warriorClass}` | class must exist in `WARRIOR_STATS` | Sets class **and refills health and stamina to the new maximum**. ⚠ **No room-state guard — see §9.1.** Broadcasts `lobby_update`. |
| `select_team` | `{team}` | **none whatsoever** (953) | Writes `data.team` onto the player verbatim. ⚠ **See §9.2.** Broadcasts `lobby_update`. |
| `ready` | — | — | Toggles. Broadcasts `lobby_update`. Nothing reads `ready` to decide anything — see §9.4. |
| `loaded` | — | ignored unless the caller declared `awaitLoad` | **"My arena is standing."** Releases this man from the muster; when he is the last one the countdown starts on that message rather than on a timer. Idempotent. See §2.1. |
| `set_appearance` | `{appearance}` | — | Stored opaquely and echoed to every client on every snapshot. The simulation never reads it; see §5. |
| `add_bot` | `{difficulty?, warriorClass?}` | host only; `botsIn < botCapacity` | Adds one bot. `warriorClass` names what it fights as; anything not in `WARRIOR_STATS` is ignored and the roster cycles `BOT_CLASSES` as before. |
| `remove_bot` | `{botId?}` | host only | Named bot, or the last one added. |
| `set_bots` | `{count?, difficulty?}` | host only; `state === "lobby"` | Sizes the whole roster in one message and re-grades existing bots. |
| `set_rounds` | `{bestOf}` | host only; `state === "lobby"`; not solo | Best of 1, 3 or 5; anything else falls back (`normalizeBestOf`, 890). |
| `start` | — | host only; `state === "lobby"`; ≥2 players unless solo | Begins the match. Replies `error` if alone in a shared room. |
| `input` | see below | `state` is `fighting` or `last_stand`; sender not `dead` | The only message sent during a fight. |
| `emote` | `{emote}` | id in `EMOTES`; alive; not committed, dodging or staggered; 2500 ms wall-clock throttle | Broadcast to the room, sender included. Refusals are silent (1706-1716). |
| `leave` | — | — | Same as dropping the socket. |
| `ping` | — | — | Replies `pong` to the sender only. Purely a keepalive; the sim has no timeout of its own. |

### 2.1 `awaitLoad` and `loaded` — the muster

The owner, verbatim (BACKLOG 2b.2):

> "a lot of the time the game starts before fully loading in which is a poor
> experience, we shouldn't start until everyone is fully loaded in."

So there is a phase in front of the countdown. `start` puts the room in
**`state: "loading"`**, and the bell is not armed until every client that
declared `awaitLoad: true` on `create`/`join`/`solo` has sent `loaded`, or
`LOAD_HOLD_MS` (12 s) has run out.

**The declaration is opt-in, and that is a protocol decision worth stating.**
A browser building a three.js arena wants to be waited for. A harness, a
headless second server, a bot client and every client written before this
feature have nothing to build, and a room that waited twelve seconds for each
of them would cost `classmatrix` three hours a run. A client that does not
declare is dealt in exactly as it was before this phase existed, so this is a
strictly additive change to the protocol: **an existing client is unaffected in
every respect.**

**What happens at the deadline is a decision and not a default: the match
starts.** One bad connection must not hold seven people. The men who never
answered are still seated, still in the round, and arrive standing where they
were placed.

**Withholding `loaded` is worth nothing**, which is what keeps this out of the
cheat surface: there is no extra spawn grace, no extra health, no delay past
the shared deadline, and no information. The only thing it buys is being late,
which a player can already achieve by closing his laptop. `tools/readytest.mjs`
§5 fights a match with a silent client and compares his spawn grace to the
honest man's, to the tick.

The muster is a **match's**, not a **round's**. Rounds two and three rebuild
nothing, and a hold a player could impose three times a match would be a stall
rather than a courtesy.

### `input` — the whole of combat

```
{ moveX, moveZ, rotationY, sprint, attack, heavyAttack,
  block, dodge, crouch, ability, shove, attackDir }
```

`attackDir` is one of `"left" | "right" | "overhead" | "stab"`. Everything else
is a number or a boolean. Every numeric field goes through `finite()` (715) —
`NaN`, `null`, strings and `undefined` all become `0`, because a `NaN` in a
position is permanent.

Two halves with completely different timing, and a native client must
understand the split (`processInput`, 1264-1332):

- **Standing intent** — `moveX/moveZ/rotationY/sprint/block/crouch`. Recorded,
  then acted on by the fixed 20 Hz step. The last input received keeps applying
  until a newer one arrives or it lapses after `INPUT_LAPSE_MS` = 600 ms
  (`currentIntent`, 2176). A client that stops sending stops moving in 600 ms.
- **Edge-triggered deeds** — `attack`, `heavyAttack`, `dodge`, `shove`,
  `ability`. These resolve **on the message, not on the tick**, deliberately:
  "a click that waits for the next tick is a click the player believes he lost"
  (1261). They are gated by stamina and by their own timers, so a faster send
  rate cannot throw more blows — but it does mean **input latency is bounded by
  your send rate, not by the tick rate**.

`(moveX, moveZ)` is an intent *direction*; its magnitude is a throttle clamped
to 1 (`integrateMovement`, 2130). A thumbstick at half deflection walks at half
speed; a keyboard diagonal walks at exactly `moveSpeed`, not `1.41×`. **A native
client must not normalise its stick to 1.0 or it loses analogue walking, and
must not send lengths above 1.0 expecting speed.**

`rotationY` is a yaw in radians, world-space, `atan2(x, z)` convention. It is
adopted instantly when the body is free and *slewed toward* under a cap while
committed (1421-1423), so **`rotationY` is a request and `player.rotation` in
the snapshot is the answer**. They differ by design during a swing.

`crouch` lowers the hit zone by `CROUCH_DROP` (296). The desktop client binds
it; the touch client never sends it, so it is optional.

---

## 3. Server → client

| `type` | Sent to | When |
|---|---|---|
| `join` | the caller | Answer to `create` / `join` / `solo`. |
| `error` | the caller | A refused `join` or `start`. `{message}` only — **the server never sets `code`**; the `code:"lost"` a browser sees is fabricated by `src/game/client/transport.ts`, not by the sim. |
| `pong` | the caller | Answer to `ping`. |
| `player_joined` | room, minus the joiner | `{playerId, name}`. |
| `player_left` | room | `{playerId}`. |
| `lobby_update` | room | Any lobby mutation, and 10 s after `match_end` when the room rolls back. Full snapshot. |
| `match_loading` | room | The muster. `{waitingFor: string[], until}` — the NAMES the room is still standing about for, and the epoch-ms deadline past which nobody waits. Re-sent each time the list gets shorter. `until` is the only wall clock this phase puts on the wire; the deadline the server enforces is in sim ms. See §2.1. |
| `countdown` | room | Once at round start with a **full snapshot plus `countdown`**, then once a second with **`{countdown}` and nothing else**. See §9.3. |
| `game_state` | room | Once per server wake during `fighting` / `last_stand`, and once on the countdown→fighting transition. Full snapshot. |
| `hit` | room | Every resolved blow, parry, block, shove and knockdown. |
| `kill` | room | Every death. |
| `ability_used` | room | `{playerId, ability, warriorClass}`. |
| `last_stand` | room | Once per round, when exactly two men remain of more than two, free-for-all only. `{players:[{id,name}]}` — **not** a snapshot. |
| `round_end` | room | Full snapshot spread with the round result and `matchOver`. |
| `match_end` | room | Once, immediately after the final `round_end`. Payouts. |
| `emote` | room, sender included | `{playerId, emote}`. |

**Bots never receive anything.** `broadcast` (842) skips any player whose id
starts with `bot_`. That prefix is protocol-significant: it is how the server
counts humans (916), picks a new host (1031) and decides whether a room is
empty. **A client may rely on `bot_` meaning AI.**

### The snapshot — `serializeRoom` (858-885)

Carried identically by `join`, `lobby_update`, `game_state`, the first
`countdown`, and `round_end`.

```
code, mode, state, arena, hostId, countdown, matchTimer, maxPlayers,
players: { [id]: Player }, killFeed: KillFeedEntry[]   // last 10 only
lastStandTriggered, difficulty, botCount, maxBots, autoStart,
bestOf, roundIndex, roundTarget, roundWins, roundScoreBy, lastRound, nextRoundAt,
territory: { id, name, native, holder } | null
```

`territory` is **the ground this match decides** — see §11. It is dealt when
the match starts, so the first `countdown` frame already carries it and a man
knows what he is fighting over before the bell. `null` in a lobby that has not
been dealt a match, and always `null` in training. `holder` is the people that
held it when the server last read the war rolls; it is **decoration on this
wire** and the territories table is the authority.

`join` additionally carries `playerId` (yours) and `warriorStats` — **the whole
`WARRIOR_STATS` table, from the server**. This is the single most important
thing in the protocol for a native port: **a client never needs to ship the
balance sheet.** It is handed the authoritative numbers at join.

`state` is `lobby | countdown | fighting | last_stand | intermission |
finished`. `roundScoreBy` says whether `roundWins` is keyed by player id or by
`"red"`/`"blue"`, so nothing has to infer it from `mode`.

### The player, on the wire

Every player object is the server's own record **minus a denylist**,
`PRIVATE_FIELDS` (854-856): `moveVel`, `impulse`, `latestInput`, `inputAt`,
`lastHitAt`, `aiSkill`, `nextThink`, `nextAttackAt`, `strafePhase`,
`blockUntil`, `isBlocking`, `yaw`, `baseName`, `aimYaw`, `pendingSwing`,
`shovePending`, `shoveCooldown`, `emoteUntil`.

That leaves 54 published fields, and it is a **denylist, not an allowlist** —
see §9.5, this is the most fragile line in the protocol.

(It read 59 here and "the 53 fields" in `protocoltest`, and **both were wrong**:
MERCY OR FINISH added six fields to a list of 54, and neither number was
recounted when it did. `protocoltest` holds the list exactly in both directions,
so 54 is the count it asserts against `serializeRoom` today; the two prose
figures were a mirrored definition and are now one. Mercy's six —
`mortal`, `mercyTimer`, `mercyTo`, `spared`, `menSpared`, `menFinished` — were
removed with the feature, see `docs/MERCY-REMOVED.md`.)

The 54, grouped by what a client does with them:

- **Identity** `id, name, warriorClass, team, ready, appearance, bot?,
  difficulty?`
- **Body** `position{x,y,z}, rotation, velocity{x,y,z}` — `velocity` is the
  *whole* motion, steering plus impulse (2165), and is what a client
  extrapolates on. It is forced to zero during hitstop (2278).
- **Vitals** `health, maxHealth, stamina, maxStamina`
- **State** `state, attackDir, blockDir, attackTimer, blockTimer, dodgeTimer,
  staggerTimer` — `state` is `idle | walking | running | sprinting | attacking |
  blocking | dodging | rolling | staggered | knocked | rising | dead | ability |
  shoving`.
- **Swing** `attackPhase (null|windup|contact|recovery), attackPhaseT, swingT,
  swingDuration, swingHeavy, hitstop, shoveTimer`
- **Weight** `balance, maxBalance, downTimer, vulnerableTimer, vulnerableTo` —
  the five fields the weight wave added, and every one of them is public
  because a player has to be able to SEE it:
  - `balance` / `maxBalance` are POISE. Every blow that lands takes some, scaled
    by the weapon's mass and doubled when the man was caught off guard (already
    reeling, on the floor, rising, or struck from behind). It refills at
    `BALANCE.regen` (26/s) whenever he is neither staggered nor down. **At zero
    he is knocked over.** `maxBalance` is per class — huscarl 100, berserker 86,
    warden 78, runekeeper 58 — which is what makes the huscarl the hardest man
    in the game to floor.
  - `downTimer` is **the whole floor sequence in one clock**: it starts at
    `KNOCKDOWN.down + KNOCKDOWN.rise` (1.30 s) and `state` is derived from it —
    `knocked` above `KNOCKDOWN.rise` (0.55 s), `rising` below it, and neither
    once it reaches 0. A client phases a fall off this exactly the way it phases
    a swing off `swingT`, and the two cannot disagree because there is only one
    number. 0 whenever he is on his feet.
  - `vulnerableTimer` / `vulnerableTo` are **the riposte window**, written onto
    the man who was PARRIED. Above zero he is open, and `vulnerableTo` is the id
    of the one man who collects: that player's next blow does `RIPOSTE.bonus`
    (1.6x) damage, throws him `RIPOSTE.knockbackScale` (1.7x) further, and
    **closes the window**. One parry buys one blow. Anybody else's blow lands at
    its ordinary weight. `vulnerableTo` is `""` whenever the timer is 0.
    The window is 0.90 s = 18 ticks; the reasoning at 20 Hz is in
    `docs/WEIGHT.md`.
- **Ability** `abilityCooldown, abilityActive, abilityTimer`
- **Score** `kills, deaths, damage, score, lastHitBy, comboCount, comboTimer,
  deadAt`
- **Grace** `invincible, invincibleTimer` — note `invincible` is a *rule*, not a
  picture; see `src/game/grace.mjs`.
- **Fire** `burning, burnTimer, burnInside`
- **Corpse** `deathZone, deathDir, deathHeavy, deathCause` — null on the living
  and cleared on every road back to standing (`clearBodyMarks`, 770). This is
  why a spectator arriving late rebuilds the same one-armed corpse the room
  watched drop.
- **Flourish** `emote` — his *chosen* emote, kept so the summary can pose him.

### `hit` — seven kinds under one type

`{type, attackerId, targetId, damage, health?, direction?, hitZone?, hitstop,
riposte?, knockback?, window?}`

| `data.type` | Carries `health`/`direction`/`hitZone`? | Meaning |
|---|---|---|
| `light` | yes | Clean blow. |
| `heavy` | yes | Clean heavy. The target is rocked for `HEAVY_CLEAN_STAGGER` (0.30 s). |
| `blocked` | yes | Shield ate `blockReduction` of it. |
| `blocked_heavy` | yes | Guard broken: half reduction, and the target staggers for 0.6 s. |
| `parry` | **no** — `damage:0` | Guard raised inside `PARRY_WINDOW`; the *attacker* staggers, and a riposte window opens on him. Carries `window` (seconds). |
| `shove` | **no** — `damage:0` | Position, not damage. Sets `lastHitBy` so the bonfire pays the shover. |
| `knockdown` | **no** — `damage:0` | His poise ran out and he is on the ground. `attackerId` is whoever spent the last of it. **Always arrives AFTER the `hit` that caused it** — cause then effect, in the order they left the server. |

The four wounding kinds also carry:

- **`riposte`** (boolean, always present on a wound) — this blow landed inside a
  window its attacker had earned by parrying, so its damage already includes
  `RIPOSTE.bonus`. A client sounds and shakes on this; it is not optional.
- **`knockback`** (number, metres, always present on a wound) — how far the blow
  will actually carry the struck man, rounded to millimetres. 0 on a killing
  blow, because the corpse is the gore system's to move.

A native client must not assume `hitZone` is present. `hitstop` is `0.06` light
/ `0.11` heavy and a parry uses the heavy value.

### `kill`

`{killerId, killerName, victimId, victimName, hitZone, direction, heavy, cause}`

`cause` is `"blow"` or `"fire"`. A fire death has `hitZone:null`,
`direction:null`, `heavy:false`, and `killerId:""` **unless** a blow inside
`BURN_CREDIT_WINDOW` (5 s) drove the man in — then it is that man's kill and
`killerName` is his. Otherwise `killerName` is the literal string `"The Fire"`,
which a feed may print verbatim.

There was a third cause, `"finish"` — a man killed while he lay inside a mercy
window. MERCY OR FINISH was removed (`docs/MERCY-REMOVED.md`), so the server
cannot produce it, and the `DeathCause` union in `types.ts` and the `causeOf`
branch in `anim.ts` were narrowed with it. **A client written against the old
protocol must not treat `"finish"` as reachable**: every death by steel is
`"blow"` again.

### `downed` and `spared` — REMOVED

Both were MERCY OR FINISH and both are gone; see `docs/MERCY-REMOVED.md`. They
are recorded here rather than silently dropped because a client written against
an older build may still be listening for them. **The server never sends either
message.** A man whose health reaches 0 dies on that tick and the room hears
`kill`, exactly as it did before mercy was built.

### `round_end`

Full snapshot, spread with `{index, winnerId, winnerTeam, winnerName, draw}`
and `matchOver`. `winnerId` is set in a free-for-all, `winnerTeam` in a war
band, both null on a draw. Then either `match_end` follows immediately, or
`nextRoundAt` (epoch ms) says when the next `countdown` arrives — the break is
`ROUND_BREAK` = 5 s.

### `match_end`

```
{ winnerKind: "player"|"team"|"none", winnerId, winnerTeam, winnerName, winnerBy,
  bestOf, roundsPlayed, roundTarget, roundWins, roundScoreBy,
  results: [{id, name, kills, deaths, damage, score, isWinner,
             place, roundsWon, xpEarned, goldEarned}],
  war: { matchKey, territoryId, entries: [{playerId, name, points}], at } | null }
```

`war` is **what this match did to the war for Britain** — §11 — and it is
`null` far more often than not: training, a match under two humans, and any
room that was never dealt ground all report nothing.

**`results` arrives SORTED, and the order is the answer.** It used to leave in
the room's join order and every screen sorted its own copy; the owner reported
the consequence — *"I've seen same kills & rounds won more be snubbed on coins &
ranking placement from 1st to 2nd due to alphabetical order names"*. `place` and
the row order both come from `rankEntrants` in `engine.mjs`, which is the same
rule `decideMatch` uses to name the winner: **rounds won, then kills, and nothing
else.** A client must not re-rank it.

* `place` is **competition ranking** — two entrants level on rounds AND on kills
  are both `place: 1` and the next man is `place: 3`. In a war band it is the
  BAND's place, so every man on a side carries the same number.
* `roundsWon` is the rounds that man's SIDE won: his own in a free-for-all, the
  band's in a war band. It is the column the results table prints.
* `score` is **the rank key, not a display number** — and it is a PROJECTION OF
  `place`, not a restatement of the ranking rule:
  `(n + 1 - place) * PLACE_RANK_STEP + kills * 100`, where `n` is the number of
  seated entrants. Nothing renders it; it exists so that any consumer sorting by
  it descending reproduces the server's order exactly.

  **This paragraph used to document `roundsWon * 1e6 + kills * 100`, and that
  key was a defect** — it is written out here rather than quietly replaced,
  because a client written against the old text reproduces the bug. `place` is
  the BAND's rank in a war band, but `roundsWon * 1e6 + kills * 100` mixes the
  band's rounds with the MAN's kills, so the two keys only agree when the bands
  differ on rounds. On any best-of-three that finishes 1–1 the table came out
  `#1, #2, #2, #1`, with a man placed first printed last, beneath two men he had
  out-placed — which is exactly what the owner photographed. Deriving the key
  from `place` means it cannot contradict `place` by construction; within a
  place it falls through to the man's own kills.

Paid **once**, from whole-match totals plus the purse the PLACE bought:
`xp = 50 + kills*30 + damage*0.5 + PLACE_XP[place-1]`,
`gold = 10 + kills*15 + PLACE_GOLD[place-1]`, with
`PLACE_GOLD = [50, 0, 0]` and `PLACE_XP = [100, 0, 0]` — the purse is first
place only, and nothing below it. First place is what the winner's bonus has always been, so a won match
pays what it always paid. Per-round payout is still deliberately absent — the
rounds are paid *through the place they bought*, so the format a player picks is
not an economic decision.

Ten seconds later the room resets and a `lobby_update` arrives (1822-1835).
Solo rooms never emit `round_end` or `match_end` at all — training is not a
match and pays nothing (`checkRoundEnd`, 1747).

---

## 4. The sequence of a match

```
C→S  create {name, mode, bestOf}
S→C  join {playerId, warriorStats, …snapshot}          state=lobby
                                    (second client: C→S join → S→C join,
                                     others get player_joined then lobby_update)
C→S  ready                      →   lobby_update  (broadcast, per press)
C→S  start            (host)
S→C  countdown {…snapshot, countdown:3}                state=countdown
S→C  countdown {countdown:2}          ← partial! 1 s later
S→C  countdown {countdown:1}          ← partial!
S→C  game_state {…snapshot}                            state=fighting
        ↑ grace armed here, not at startRound — see grace.mjs
S→C  game_state × 20/s
C→S  input × n                        ← as fast as you like
S→C  hit / kill / ability_used / emote / last_stand    ← as they happen
S→C  round_end {…snapshot, winnerId, matchOver}        state=intermission|finished
        matchOver=false → countdown again after ROUND_BREAK (5 s)
        matchOver=true  ↓
S→C  match_end {results:[…]}                           state=finished
S→C  game_state {…snapshot}                            state=finished  ← one, always: §9.10
        …10 s…
S→C  lobby_update                                      state=lobby
```

---

## 5. What is *not* in the protocol

- **`appearance` is opaque to the simulation.** It is stored on `create`,
  `join`, `solo` and `set_appearance` and republished untouched. The engine
  never reads a field of it. A native client may define its own vocabulary; the
  web client's is `{helm, hairStyle, hairColor, beardStyle, beardColor, cloak,
  armorColor, warPaint}` (`BOT_APPEARANCES`, 553).
- **`arena` is always `"saxon_village"`** (1049, 1103). Nothing sets it and
  nothing reads it. `ARENAS` in `types.ts:525` lists three; two do not exist.
- **No chat.** `types.ts:512` declares a `"chat"` message type; the engine has
  never had one. Same for `"kill_feed"` (514).
- **No voice, no matchmaking, no lobby browser, no reconnect** — see §9.6.

### The profile and economy calls are HTTP, not socket

None of these touch `engine.mjs`. All are `POST` with a JSON body; all answer
`{ok, …}` or `{ok:false, error}`.

| Route | Body | Purpose |
|---|---|---|
| `/api/profile/new` | `{name}` | Mint an anonymous profile; returns id, secret and recovery code. |
| `/api/profile/me` | `{id, secret}` | Load. |
| `/api/profile/recover` | `{recoveryCode}` | Recover from another device. |
| `/api/profile/claim` | `{id, secret, save}` | Adopt a legacy device-local save. |
| `/api/profile/equip` | `{id, secret, name?, appearance?, favoriteClass?, bindings?, muted?}` | Presentation and keybinds. |
| `/api/profile/purchase` | `{id, secret, itemIds[]}` | Spend gold. |
| `/api/profile/bind` | `{id, secret, playerId}` | **Claim this match's engine player id, before the match.** |
| `/api/profile/match` | `{id, secret, playerId}` | Collect the payout the server already decided. |
| `/api/health` | `GET` | Liveness. |

The join between the two worlds is `src/db/matchLedger.ts`, and its mechanism
is the sharpest coupling in the repo: it **wraps `engine.connect` and
`engine.attachSender` and reads `match_end` off the outbound socket stream**
by string prefix (151, 173-183). The engine has no payout hook; the file says so
itself and calls itself a stand-in. Consequences for a native port in §9.7.

**A non-browser client that does not want the economy can skip every route
here.** The game is complete without them.

---

## 6. What a non-browser client MUST implement

Proven minimal, because the shipped web client already ignores the rest.

**Must send** — 5 messages: `create` *or* `join` *or* `solo`, `ready`, `start`
(host only), `input`, `leave`.

**Must receive** — 7 messages: `join`, `error`, `lobby_update`, `countdown`,
`game_state`, `round_end`, `match_end`.

**Everything else is optional, and this is not a guess.** `src/app/page.tsx`
handles exactly nine types (460-580) and `GameCanvas.tsx` subscribes to
nothing. `hit`, `kill`, `ability_used`, `player_joined`, `player_left`,
`last_stand` and `pong` have **zero consumers in the shipped client** — every
one of them is reconstructible from consecutive snapshots plus `killFeed`. They
are a lower-latency convenience for effects and audio, not a source of truth.

The corollary is the good news for the console port: **the snapshot is
sufficient.** A console client is a renderer, an input layer, a socket and a
seven-case switch.

**Must not do** — the client is authoritative over nothing except its own
intent. It may not decide damage, position, hit zone, death, round result or
payout. Two things it *does* currently decide that it arguably should not are
in §9.

---

## 7. What is authoritative

| Thing | Owner | Where |
|---|---|---|
| Position, velocity, collision, palisade | server | `integrateMovement` 2113, `stepRoom` 2318-2346 |
| Facing while free | **client** — adopted verbatim | 1275 |
| Facing while committed | server, capped at 1.8 rad/s | 1421-1423 |
| Whether a blow lands, and for how much | server | `processAttack` 1506 |
| **Which limb it lands on** | server derives, **from client-chosen `attackDir` and `crouch`** | `deriveHitZone` 290 |
| Death, corpse state, severance | server | `applyDamage` 1581-1597 |
| Round and match result | server | `checkRoundEnd` 1746, `endRound` 1771 |
| Spawn placement | server, from round index alone | `spawnLayout` 677 |
| Gold and XP | server, and remembered before the client can ask | `endMatch` 1797, `matchLedger.ts` |
| Appearance | client, and never read by the sim | §5 |
| Emote | server validates and throttles, client requests | 1706 |

---

## 8. Is the simulation headless?

**Yes, and `tools/protocoltest.mjs` now proves it on every run.** `engine.mjs`
imports exactly one thing: `randomUUID` from `node:crypto` (line 6). No DOM, no
`three.js`, no React, no Next, no `fetch`, no filesystem. Its only other host
requirements are `performance.now()`, `setInterval` and `setTimeout` — all three
are standard everywhere including consoles.

The test rigs `window`, `document`, `navigator`, `self`, `location`,
`HTMLElement` and `requestAnimationFrame` as throwing getters *before* importing
the engine, then plays a complete match through them. The day someone reaches
for a browser global in the sim, that run dies.

It also statically walks the engine's import graph and fails on any specifier
that is not a Node builtin or a sibling `.mjs`.

**Measured cost of the protocol**, from `protocoltest`:

| Room | `game_state` bytes, median | Per client at 20 Hz |
|---|---|---|
| 2 players | ~2.6 KB | ~51 KiB/s (0.42 Mbit/s) |
| 8 players | ~10.4 KB | ~203 KiB/s (**1.66 Mbit/s**) |

Re-measured 12 Aug 2026 after the weight wave added five public fields per
player (`balance, maxBalance, downTimer, vulnerableTimer, vulnerableTo`). The
eight-man snapshot went 9.9 KB → 10.4 KB, about 60 bytes a man, and every one
of those bytes is something the player has to be able to see. `protocoltest`
gates the total at 20 KB so the next growth is noticed rather than discovered.

Two consequences that belong in `docs/PLATFORM-PATH.md`:

1. **A single snapshot exceeds 1200 bytes at two players and is 8× it at
   eight.** `steamworks.js` exposes only the deprecated `ISteamNetworking` P2P
   interface, whose unreliable packets are capped at 1200 bytes. That path
   cannot carry this protocol without a fragmentation layer we would have to
   write. `ISteamNetworkingSockets` — reachable from Rust via `steamworks-rs`,
   i.e. from a **Tauri** backend and not from an Electron one — fragments and
   reassembles for us. This is a measured technical argument for Tauri, not an
   aesthetic one.
2. **A Steam listen server is free for us and expensive for the host.** Eight
   clients × 203 KiB/s is ~13.3 Mbit/s of *upstream* off one player's domestic
   connection. §4 of `PLATFORM-PATH.md` treats "the host pays nothing but
   latency" as the only cost of a listen server. It is not.

Both numbers are uncompressed JSON with no delta encoding. Neither is a reason
to change anything today; both are reasons to know the number before promising
peer hosting.

---

## 9. Defects and couplings found while writing this

Every one is a real behaviour of `origin/main`, verified by running the engine.
**None of them is fixed here** — five defect units are live in the render
modules and a speculative refactor of a live authoritative server is the wrong
move. They are recorded so the fix is a decision rather than a discovery.

### 9.1 `select_class` mid-fight is a full heal — engine.mjs:945-952

`withRoom` checks the session, not the room state. Sending
`{type:"select_class",data:{warriorClass:"huscarl"}}` during `fighting` sets
`warriorClass`, then `player.health = stats.maxHealth`. Measured: a warden on
84.8/120 after walking into the bonfire became a huscarl on 146.7/150 in one
message, mid-round, and it repeats without limit. Every other host-or-lobby
message in the router carries a `room.state !== "lobby"` guard; this one does
not. **This is the most serious finding in this document.**

### 9.2 `select_team` accepts any string, at any time — engine.mjs:953

`player.team = data.team`, unvalidated and unguarded. Measured: `team` became
`"PWNED"` mid-fight. Two consequences. A garbage team passes neither
`attacker.team === target.team` check (1473, 1516), so the player can be hit by
and can hit *both* sides. And `checkRoundEnd` counts survivors by
`p.team === "red"` (1752), so switching sides mid-round can hand the round to
the other war band.

### 9.3 `countdown` has two different payloads — engine.mjs:1218 vs 1240

The first is a full snapshot with `countdown` merged in; the second and third
are `{countdown:n}` with no `players`, no `state`, nothing. The web client
handles this with `if (d.players) … else …` (`page.tsx:505`). A native client
that types `countdown` as a snapshot will crash on the second frame. Documented
rather than fixed because the shipped client depends on the current shape.

### 9.4 `ready` is decoration — engine.mjs:954, 986-993

`start` checks host and player count. It never checks whether anybody is ready.
The flag is broadcast, rendered and ignored.

### 9.5 `PRIVATE_FIELDS` is a denylist — engine.mjs:854-856

Every field added to a player object is published to all clients by default,
twenty times a second, unless someone remembers to add its name to a list 850
lines away from where players are built. It is correct today — `pendingSwing`,
which holds the damage of a blow that has not landed, is on the list — but it is
one forgotten line from broadcasting the outcome of an in-flight swing to the
man about to be hit by it. An allowlist derived from `GamePlayer` in `types.ts`
would make this structural. `protocoltest` now asserts the current published set
exactly, so any change to it is visible in a diff.

### 9.6 There is no reconnect — engine.mjs:2405-2425

`disconnectSession` deletes the player from the room outright and broadcasts
`player_left`. There is no session token, no grace period and no way back into a
match in progress (`join` refuses any room not in `lobby`, 1075). A player whose
train enters a tunnel has forfeited. **Every console platform's certification
requires graceful handling of network loss and resume-from-suspend**
(`PLATFORM-PATH.md` §5 lists it), so this is not merely a quality issue — it is
a certification blocker that has to be designed into the protocol, and the
cheapest time to add a reconnect token is before there are two clients speaking
this.

### 9.7 The economy is a wire-tap, not a hook — src/db/matchLedger.ts:151

Gold and XP reach a player's profile because `matchLedger` monkey-patches
`engine.connect`/`attachSender` and matches outbound frames with
`frame.startsWith('{"type":"match_end"')`. This works, and the file argues
honestly for why it was done this way. But it means **the JSON key order of a
broadcast is part of the economy**, and it means anything that re-hosts the sim
— a Steam listen server, a console build, a room orchestrator — silently stops
paying players unless it also routes every outbound frame through this
interceptor. The named fix is one `onMatchEnd(results)` callback in `endMatch`.

### 9.8 `broadcast` is O(players × sessions) — engine.mjs:842-849

For each player in the room it scans *every session on the server* to find the
socket. One 8-player room on a server holding 200 sessions is 1,600 scans per
tick, 32,000 per second, and it scales with total server population rather than
with room size. A `playerId → session` index is a five-line change. Not urgent
at current concurrency; it is the first thing that will bite on a shared host.

### 9.9 The host may own the clock — FIXED, engine.mjs `makeEngine`/`advance`/`advancePhase`

*This entry used to read "the engine cannot be stepped, and starts a clock on
import", and called it the one defect that decides how a console client is
built. It is fixed; what follows is what a native host is now given.*

```js
import { makeEngine } from "./src/game/engine.mjs";
const sim = makeEngine({ autoTick: false });   // no timer of any kind
sim.step();          // one fixed tick (1/20 s)
sim.step(dtSeconds); // a frame's worth: runs the WHOLE steps it owes, carries the rest
```

| | |
|---|---|
| `makeEngine(options?)` | An independent simulation — own rooms, own sessions, own clock. Exported, so a process may hold several. |
| `options.autoTick` | Default `true`: the 20 Hz `setInterval` this engine has always started, which is what `custom-server.mjs` gets and is unchanged. `false` starts nothing. |
| `options.epoch` | Wall ms that sim time 0 stands for. Read by no rule; it stamps the two display fields below. Pin it and a replay repeats byte for byte. |
| `step(dtSeconds?)` | Advance by that much sim time; returns the fixed steps run. Omit the argument for exactly one tick. |
| `simTime()` | Milliseconds of simulation advanced. Monotonic and exact. |
| `stop()` | Put the internal timer down. A no-op when there is none. |
| `getEngine()` | Unchanged: the `globalThis`-cached default engine the two servers share. |

**The step is still fixed.** `step(dt)` spends `dt` on whole 1/20 s steps and
carries the remainder into the next call, so a ragged frame loop cannot make
speeds, cooldowns or timers a measurement of the host's frame rate. Broadcasting
is unchanged — one `game_state` per call per room that was fighting when the
call began, §9.10 included.

**No rule reads a wall clock.** Every deadline the sim owns is measured against
`simTime()`: the countdown, the round break (`ROUND_BREAK`), the summary
rollback (`SUMMARY_HOLD`), the solo deal-in, an input's lapse
(`INPUT_LAPSE_MS`), an emote's throttle. The four `setTimeout`/`setInterval`
calls that used to carry the first four are gone, replaced by one sim-ms
deadline per room (`room.phaseAt`, server scratch, never on the wire) that
`advancePhase` spends on every step. `performance.now()` survives in exactly one
function — `gameTick`, the optional internal timer — and `Date.now()` in exactly
one expression, the default for `options.epoch`.

**Two epoch-ms fields remain epoch-ms**, because a browser compares them against
its own `Date.now()`: `nextRoundAt` (§9.6) and each kill-feed `timestamp`. They
are now `epoch + simTime()` rather than `Date.now()`, so they name the instant
the *simulation* will act rather than one it has no opinion about.

**What is still shared between two engines in a process**, and it is the host's,
not this module's: `Math.random` (bot decisions, room codes, bot names — two
engines interleave their draws, and it is left global because
`tools/seeddie.mjs` pins that stream process-wide to make harnesses repeatable)
and `crypto.randomUUID` (ids, which are meant to collide with nothing). Room
codes are checked for collision only within one engine's own map, so two engines
may hold the same code — route by engine, never by code alone.

`tools/protocoltest.mjs` plays a whole match — lobby, countdown, fighting, round
break, second round, summary, back to lobby — through `step()` alone, with no
timer and no wall-clock wait, and runs the same script twice to hold the frames
identical to the byte.

### 9.10 One `game_state` always arrives *after* `match_end` — engine.mjs:2227-2231

`gameTick` tests `room.state` **before** its substep loop and broadcasts
**after** it. The death that ends the match happens inside a substep, so the
wake that ended it still sends a snapshot — which now reads `state:"finished"`.
Measured: the tail of every match is exactly `…, round_end, match_end,
game_state`. Harmless, and permanently true, so a native client **must not tear
its room down on `match_end`** or it will drop a frame into a freed object.
Asserted by `protocoltest` so it cannot change silently.

### 9.11 Documented-but-untrue, in files this document supersedes

- `types.ts:493-518` `WSMessageType` declares `chat` and `kill_feed`, which do
  not exist, and omits `solo`, `add_bot`, `remove_bot`, `set_bots`,
  `set_appearance`, `leave` and `pong`, which do. It has no consumers.
  *Corrected in this pass* — it was the only change made to a source file, and
  it now points here.
- `types.ts:405` `Room.teamSize` is never set by the engine and never read.
- ~~`types.ts:115-172` `WARRIOR_STATS` disagrees with the engine's copy on eight
  of twelve columns (huscarl `moveSpeed` 3.5 against 4.0, and so on).~~
  **FIXED by the class rework.** The two copies are now identical field for
  field, and `tools/classmatrix.mjs` reads `types.ts` as text and refuses to run
  a matrix at all if they drift — so the defect cannot come back silently, which
  is how it lasted the life of the project. The engine's copy remains
  authoritative and is still **shipped to the client in the `join` message**, so
  a native client should read `warriorStats` off the wire rather than hard-code
  a table; the second copy exists only because `anim.ts` needs `attackSpeed`
  synchronously and the class card is drawn before a room exists.
- ~~`src/game/grounds.mjs:14-19` states that `engine.mjs` imports it instead of
  carrying a hand-copy of the terrain field. On `origin/main` **it does not**.~~
  **HALF FIXED, and the honest half is worth stating.** `engine.mjs` now imports
  `grounds.mjs` for real — `getGround(room.arena)` in the tick — and its own
  `ARENA_RADIUS = 18` has been **deleted**, so the play bound exists once, in
  `SAXON_VILLAGE.play.radius`, and `resolveSolids` enforces it together with the
  props. What is still a hand-copy is the terrain field: `GATE_ANGLES`,
  `pathMask` and `groundHeight` remain written out in `engine.mjs`. That is a
  live mirrored definition and it decides where men spawn.
- **The class card drew its stat bars against maxima typed in beside the
  roster** — `page.tsx` had `HP max={150}` while the huscarl carries 158, and
  `SPD max={100}` while both the warden's 5.0 and the runekeeper's 5.6 exceeded
  it, so two different warriors drew the same full bar and `StatBar`'s
  `Math.min(100, ...)` hid it. *Fixed*: `src/game/statshape.mjs` is the one
  definition of the four axes and derives every ceiling from the roster, and
  `tools/classmatrix.mjs` fails if a numeric `max=` reappears on a stat bar, if
  two classes that differ on an axis draw the same length, or if the card and the
  shape gate disagree about which two stats a class is strong on.

---

## 10. Appendix — machine-readable message list

`tools/protocoltest.mjs` parses this block. Every message the engine can send or
accept appears here exactly once, and the test fails if the engine emits a type
that is not listed, or if a type marked `live` is never seen during a full
match. Keep it in sync or the gate goes red.

```protocol
C2S create
C2S join
C2S solo
C2S select_class
C2S select_team
C2S ready
C2S loaded
C2S set_appearance
C2S add_bot
C2S remove_bot
C2S set_bots
C2S set_rounds
C2S start
C2S input
C2S emote
C2S leave
C2S ping
S2C join live
S2C error live
S2C pong live
S2C player_joined live
S2C player_left
S2C lobby_update live
S2C match_loading live
S2C countdown live
S2C game_state live
S2C hit live
S2C kill live
S2C ability_used
S2C last_stand
S2C round_end live
S2C match_end live
S2C emote live
```

---

## 11. The war on the wire

Added when the war layer landed (`src/game/war.mjs`, `src/db/war.ts`,
`tools/wartest.mjs`). It is two fields and one rule, and the rule is the
important half.

### The two fields

**`territory` on every snapshot** — `{ id, name, native, holder } | null`. The
ground this match decides, dealt in `startMatch` and cleared when the room rolls
back to a lobby. Carried on every snapshot rather than only on the frame that
set it, for the same reason the round state is: a late joiner, a spectator or a
reconnect must be able to rebuild the whole screen from one frame.

**`war` on `match_end`** — `{ matchKey, territoryId, entries, at } | null`.

```
matchKey     `${roomCode}:${matchId}`, minted when the match STARTED.
territoryId  a `war.mjs` TERRITORIES id.
entries      [{ playerId, name, points }], humans only, points > 0 only.
at           epoch ms, stamped the same way `nextRoundAt` is.
```

`war` is `null` unless **all** of: it was not training, ground was actually
dealt, and **at least two humans fought**. The last is an anti-farm rule and it
is deliberate: one man with seven recruits can win eight matches an hour
against opponents whose difficulty he chose.

`matchKey` is minted at match START and not at write time, which is the whole
of the idempotency design. The database's unique index is
`(match_key, player_id)`; a report retried after a failed write carries the key
it carried the first time, so the retry inserts nothing and moves nothing. A
key minted when the write happens is a new key on every retry.

### THE RULE: the engine is never told a man's people

**No message in this protocol carries a player's allegiance, in either
direction, and none ever may.** `entries` names player ids and points. Which
people banks those points is resolved afterwards by `src/db/war.ts`, from the
`players.allegiance` column — the record a man wrote when he swore, over an
authenticated HTTP route with his own bearer token.

Two things follow, and both are load-bearing:

1. **A client cannot bank for a people it did not swear to.** It is never asked
   which people it is, so there is nothing to lie about. Sending an
   `allegiance` field on `create` or `join` is ignored, and
   `tools/wartest.mjs` §7 proves it changes no byte of any snapshot and no row
   of any result table.
2. **A faction cannot gate a match or grant a stat**, which is
   `docs/FACTIONS.md` §3, the rule Wave 4 lives or dies on. It is kept
   *structurally* rather than by discipline: the simulation has no way to ask.
   The engine may hold the whole map (`engine.setWarFront`) and still nothing
   about a fight changes — that fixture, with a map one people has conquered
   outright, is `wartest` §7, and `--prove` injects both defects and requires
   every one of those assertions to go red.

### THE AMENDMENT: an oath is not a costume — 16 Aug 2026

The sentence above says **"No message in this protocol carries a player's
allegiance, in either direction, and none ever may."** It was written before
`BACKLOG.md` 4.3 was built, and taken at face value it forbids a man of the
Danelaw from *looking* like one, because a client cannot draw an enemy it is
never told anything about. It is amended here rather than quietly stretched.

**`appearance` now carries `people`, and `people` is a COSTUME.** It is one of
`saxon | norse | briton | pict | none`, it rides in the same opaque blob as the
helm and the cloak, the engine assigns it (`set_appearance`, engine.mjs:2230)
and never reads it, and it decides one thing: what colour a warrior is drawn
in. `src/game/client/characters.ts` builds the man from it and nothing else in
the codebase does anything with it at all.

**The OATH is `players.allegiance` and it is still not on this wire.** It is
written over `/api/war/swear`, an authenticated HTTP route with the profile's
own bearer token, it locks the moment a man has fought, and `src/db/war.ts` is
the only thing that ever reads it. `entries` on `match_end` still names player
ids and points. **Which people banks a match is still resolved from the
database and from nowhere else**, so point 1 above is unchanged and unweakened:
a client that lies about its `people` fights in the wrong colours and banks for
whoever it actually swore to, which may be nobody. There is nothing to gain by
lying and nothing to lose by it, which is the definition of a cosmetic.

The two are different objects with different authorities and the rule is
better stated as the distinction than as the blanket ban:

> **A claim on the war ledger may never travel on this wire. A costume always
> could, and a people is a costume here.**

**AND THE GATE WAS AIMED ONE LEVEL TOO HIGH TO SEE THIS COMING.** `wartest`
§7b's leak check is `Object.keys(player).filter(/allegiance|people|.../)` — it
reads the player record's TOP LEVEL, and `appearance` is a nested blob, so a
people inside it was invisible to the assertion whose whole job is finding one.
That is not hypothetical: this feature landed exactly there. §7d is added in
the same commit as this note and closes it — it reaches INTO the appearance
blob, allows a costume, and then proves the costume is worth nothing by
asserting that a room where every man declares a people produces a byte-identical
war report to one where none does. `tools/factionread.mjs` §3b makes the same
claim from the render side over a whole played match.

### What the engine does with the map it is given

`setWarFront({ contested, holdings })` is called by the host process, never by a
client. `contested` narrows the ground a match may be dealt to the borders
closest to moving; `holdings` lets a snapshot name a holder. There is no third
use and no third field.

The deal is seeded on **a per-engine match counter and the sim clock**, not on
the room code or the match's UUID. Both of those come from sources `engine.mjs`
deliberately leaves unpinned, and seeding on them broke `protocoltest`'s replay
check inside a minute — two runs of one scripted match fought over different
ground. A war that cannot be replayed is a war whose bugs cannot be reproduced.
