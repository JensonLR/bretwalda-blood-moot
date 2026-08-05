# Where the game lives

The owner asked whether the product is really the GitHub repo — whether hosting
is just a detail that can move anywhere. The honest answer is yes and no, and
both halves matter.

**Yes:** the repo is the durable asset and hosting is a commodity. Everything
that makes this game *this game* — the sim, the procedural art, the sound
synthesis, the harnesses, these documents — is in git, survives any provider,
and can be stood up elsewhere in an afternoon. No host has leverage over it.

**No:** the repo is not the product. Two things the product depends on are not
in git and never will be: **the players and their state.** The group-chat links
in the wild point at one URL; the profiles — gold, helmets, recovery codes,
the mute — live in one Postgres. Lose the URL and the links die; lose the
database and the players' stuff dies (and it is currently on a free tier that
expires at 90 days — see `docs/MONETISATION.md`, step 0). The repo can be
rebuilt from itself. The product cannot.

---

## What the architecture actually is

One process, one port. `custom-server.mjs` boots Next.js, imports the engine
(`getEngine()` from `src/game/engine.mjs`), and hangs a `WebSocketServer` on
`/ws` — HTTP pages and the game share the server. Inside the engine:

- an authoritative sim at **`TICK_RATE = 20`** (`engine.mjs:8`), stepped by a
  fixed-dt loop (`engine.mjs:2156`) that was already hardened against
  scheduler jitter — the comments around line 1987 record the 8 Hz failure
  mode in detail;
- **rooms in process memory** — `const rooms = new Map()` (`engine.mjs:658`),
  every live match, every position, every swing;
- clients on long-lived WebSockets, each connection a session inside that same
  process.

Every hosting decision follows from those three facts.

## Serverless is a rewrite, not a migration

Vercel and Netlify are the reflex answer for a Next.js app, and they are wrong
for this one — not worse, *incompatible*. Serverless functions cannot hold a
long-lived WebSocket, cannot run a 20 Hz loop between requests, and share no
memory between invocations, so there is no place for `rooms` to exist. Moving
there means rebuilding the game as something else: sockets on a third-party
relay, state in Redis, the tick in some scheduled worker — a different and
worse architecture bought at full rewrite price. The Next.js part of this app
is the lobby; the game is the process. Any host must run a persistent process
or it cannot run the game.

## The decisions

**Database: move to Neon now, regardless of everything else.** The DB is
plain Postgres behind Drizzle (`drizzle.config.json`) — the migration is a
connection string and a dump/restore. Neon's free tier does not expire, it
scales past free without moving again, and separating the DB from the app host
means the two can move independently forever after. This is the cheap,
reversible, urgent half of hosting, and it is done first because it defuses
the 90-day clock.

**App: two defensible choices.**

- **Render, $7/month.** Zero migration — the game is already there, deployed
  from this repo (`README-deploy.md`), and the paid tier removes spin-down.
  The do-it-today answer.
- **Fly.io.** Persistent machines that fit the one-process architecture
  exactly, and one thing Render does not offer: **region placement, which for
  a 20 Hz sim is a gameplay decision, not an ops decision.** Latency is game
  feel — a parry window is a handful of ticks, and 150 ms of Atlantic makes a
  worse fighter of everyone on the wrong side. When the players are known to
  cluster somewhere, put the machine there; when they cluster in two places,
  Fly can run a machine in each. The Dockerfile already in the repo is the
  whole deployment artifact (mechanics in `docs/DISTRIBUTION.md`).

Sequence: Neon now; stay on paid Render while it is one region of friends;
Fly when geography starts costing parries.

## For the record: deploys drop matches

Because the sim runs inside the web process, **every deploy kills every live
match** — `rooms` is memory, and the new process starts empty. Restarts,
crashes and instance migrations do the same. Today that is tolerable: matches
are short, deploys are chosen moments, players are friends who re-click the
link.

It is worth knowing today and fixing someday. The eventual shapes: drain on
deploy (stop accepting rooms, let live ones finish, then swap), or a game
process split from the web process so the web half can deploy freely. Both are
real work. Neither is now. But no hosting decision above should be mistaken
for having solved it — this is a property of the architecture, not of the
host.
