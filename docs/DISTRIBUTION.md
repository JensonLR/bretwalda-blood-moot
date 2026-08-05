# How strangers find it

The group-chat link is the distribution channel that already works, and nothing
below replaces it. This document is about the channels beyond it — which ones
can actually carry this game, which can only point at it, and which might pay
for it.

---

## itch.io cannot host this game — and is still worth a listing

The confusion to kill first: itch.io hosts HTML5 games as **static zips served
from their CDN**. There is no server process, no WebSocket endpoint, nothing
persistent. But `custom-server.mjs` *is* the game — the authoritative sim, the
rooms, the sockets (see `docs/HOSTING.md`). A zip of the client with no server
behind it is a menu for a restaurant that isn't there.

What itch.io is, is a **discovery channel**: a real audience browsing for
exactly this kind of small, sharp, free game, plus jams, collections and an
algorithm that likes new. So: a listing — screenshots from `art/shots/`, the
pitch, honest tags — whose play button points at the real host. A landing page
on someone else's high-traffic storefront, for free. Worth an hour, as long as
nobody mistakes it for hosting.

## Fly.io, in brief

The how-to, so it never needs rediscovering (the *why* — region placement as a
gameplay decision — is in `docs/HOSTING.md`):

1. The **Dockerfile already in the repo** is the whole artifact: multi-stage
   build, then one `node custom-server.mjs` process serving Next.js and the
   WebSocket on one port. Fly runs Dockerfiles natively.
2. `fly launch` from the repo root — it reads the Dockerfile, asks for a region
   (pick where the players are), and writes `fly.toml`. Set the DB connection
   string as a secret (`fly secrets set DATABASE_URL=...` — the DB is Neon and
   does not move with the app).
3. **Auto-stop must be off.** This is the one setting that can silently break
   the game: Fly's default scale-to-zero stops the machine when traffic looks
   idle, and this process's idleness is an illusion — `rooms` live in its
   memory and a 20 Hz loop is running. A stopped machine is every live match
   dead and every room code in every group chat pointing at a cold start. In
   `fly.toml`: `auto_stop_machines = false`, `min_machines_running = 1`.

## The web portals are the revenue channel

For a game of this exact shape, the real distribution money is **Poki and
CrazyGames**: web game portals with tens of millions of players that pay
revenue share to embedded games, handle discovery, and *optimise for instant
load* — their whole model is a player clicking a thumbnail and being in the
game in seconds. That is not a constraint this repo has to contort to meet; it
is the constraint the repo was built under. Zero binary assets, procedural
everything, no signup — the portal requirements read like this project's own
hard rules. Multiplayer with invite links is a feature they actively want.

The friction is the gore. Beheadings and burning men sit badly with portal
content policies aimed at broad audiences and advertiser safety. **A
reduced-gore build flag may be the price of entry** — severance off, blood
down, the fight intact. The sim already distinguishes these paths (fire is the
explicit no-severance death; severance is decided server-side by blow
direction), so a flag gates presentation, not gameplay. That is a build
variant, not a fork, and the full-gore game stays the game everywhere else.
Whether the price is worth paying is a decision for when there is a build to
submit; the channel is recorded now because it is the one with money attached.

## The quiet part

Said once, out loud: **the tech may be worth more than the game.** Multiplayer
3D combat, authoritative and cheat-resistant, instant from a shared link, no
install, procedural assets, phone-first — that stack is rare and general, and
Bretwalda is one game built on it. Portals, publishers, and platform companies
pay for exactly this capability. Nobody is selling anything today, but every
distribution conversation should be had knowing there are two assets in the
room: a melee game, and proof that the link-first multiplayer pitch works at
all. The repo is the durable form of both (`docs/HOSTING.md`).

## Retention first, in every path

Every channel above delivers strangers to the front door, once. itch.io
browsers, portal players, group-chat clickers — all of them are play-once
traffic until the game gives them a reason not to be, and the reasons are the
retention list: rematch, rating, Hearths (`docs/FEATURES.md`,
`docs/MONETISATION.md`). Distribution spent before retention exists is the most
expensive mistake available — it burns each channel's one first impression on
a version of the game that loses the player it just won. Build the loop, then
open the doors.
