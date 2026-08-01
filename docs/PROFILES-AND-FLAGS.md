# Profiles without signup, and flags

The owner: *"Is there an easy way that we can remember peoples profiles without
them signing up? otherwise how will they managed to save up for cosmetics etc.
If we have profiles then do we also allow flags & if so custom flags or presets
or both."*

Yes — and most of it is already built and unwired.

---

## What exists

`src/db/schema.ts` already defines exactly the right thing:

```
players: id, name, secret, level, xp, gold, honour, kills, deaths, wins,
         matches, favoriteClass, cosmetics, unlockedCosmetics, timestamps
matchHistory: roomCode, mode, winnerId, winnerName, playerCount, duration, results
```

Drizzle and `pg` are dependencies, `src/db/index.ts` builds a pool. **Nothing in
the application touches any of it.** `DATABASE_URL` is unset and every piece of
persistence in the game is `localStorage`:

```
src/app/page.tsx:119  localStorage.getItem("bretwalda_name")
src/app/page.tsx:121  localStorage.getItem("bretwalda_profile")
```

That `secret` column is the no-signup mechanism somebody intended and never
finished.

## The problem this creates today

**The economy is not real.** Gold, unlocks and cosmetics live in localStorage,
client-side, unvalidated. Any player can open devtools and grant themselves the
2400-gold Sutton Hoo helm in ten seconds. Everything the shop does is
decoration until this moves server-side — which makes this wave a prerequisite
for the cosmetics audit, not a peer of it.

It also means a cleared cache is a wiped account, which is the owner's actual
question.

## The decision

**An anonymous, server-authoritative profile, created silently on first play.**

- On first load the client asks the server for a profile. The server mints a row
  and returns `{ id, secret }`. The client keeps them in localStorage. **No
  name, no email, no password, no step before the first fight.** The 30-second
  drop-in is the product and nothing may come before it.
- Every subsequent request carries `id + secret`. The server is the only thing
  that grants gold, spends it, or records an unlock. The client asks; it never
  decides.
- **A recovery code** so a device change is not a wipe: a short human-typable
  phrase the player can find in their profile screen and enter on another
  device. Three or four common words, generated from a fixed list — no email,
  no account, and legible read aloud over a group chat, which is where this
  game lives.
- **Graceful degradation is mandatory.** If `DATABASE_URL` is absent the game
  must still run, falling back to the current localStorage behaviour. Render's
  free-tier Postgres expires after 90 days, and the day it lapses the game must
  degrade to "your gold is device-local again", not to a white screen.

**Migration**: an existing localStorage profile is claimed by the first server
profile it meets, so nobody loses the gold they already earned. Once. Guard it
against being replayed to farm gold.

## Flags

**Presets and a constrained builder. Not free-drawing, not uploads.**

The builder offers a **division** (the field's geometry), one or two **charges**
(a beast or symbol), and **colours from a fixed heraldic palette**. That is
enough for tens of thousands of distinct banners, and every one of them looks
like it belongs in this game.

Three reasons, and the third is the one that decides it:

1. **Zero binary assets.** An upload path means storing and serving images,
   which breaks the constraint the whole product rests on.
2. **Constrained systems produce better results.** Real heraldry is a
   constrained system for exactly this reason. Free-drawn banners in a
   procedural Dark Age game will look like free-drawn banners.
3. **Moderation.** This game is a link dropped into group chats, with strangers
   in an eight-person free-for-all. A free-draw or upload flag is an
   unmoderated image channel between strangers, and it *will* be used to draw
   the obvious things. A fixed palette and a fixed charge set cannot be. This
   is not a hypothetical: it is the predictable outcome, and the cost of getting
   it wrong lands on the owner, not on us.

Player-entered **names** are already an unmoderated text channel and are worth a
separate look; out of scope here, recorded so it is not forgotten.

**Where flags appear**: the banner already flying in the arena, the lobby beside
each warrior, and the scoreboard. In war band they should read team colour at a
glance — a flag that makes it harder to tell friend from enemy is a net loss,
so team identity wins over personal identity in the one place they conflict.

## Things that will go wrong

- **The server must validate every purchase.** "Client says it bought a helm" is
  not a purchase. Cost, ownership and balance are all server-side or the
  economy is theatre again.
- **Bots and guests have no profile.** Everything must work when there is no
  row: solo training, a bot in the lobby, a player whose DB write failed.
- **A profile write on every kill will hammer a free-tier database.** Persist at
  match end, in one write, from the totals the server already accumulates.
- **`secret` in localStorage is a bearer token.** It is the right trade for zero
  signup, but it should be scoped to what it is — a game profile holding
  cosmetic currency and no personal data. Do not put anything in that row that
  would hurt if it leaked.
- **The name is not the identity.** Two players called Aethelred are two rows.
  Nothing may key off the display name.
