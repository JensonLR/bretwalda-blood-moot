# Off Render, onto Steam, and eventually onto a console

The owner: *"My ideal scenario is to move away from the hosting I think, I want
the best possible option for still having multiplayer & beam available on steam
with the later release ideal to be console. (if you could find a mobile option
too thats great)"*

Four platforms, one codebase, and a multiplayer game that cannot be static.
This file sets out what is cheap, what is a rewrite, and the one architectural
decision that decides whether the console version is a port or a restart.

**Some figures below are marked ⚠ UNVERIFIED and are being checked. Treat them
as the shape of the answer, not as quotes.**

---

## 0. Three owner decisions, taken 2026-08-08, that change this file

1. **"I don't mind losing the Render database."** *"the game is still fresh &
   only close friends have tested it."* — This removes the migration entirely.
   There is no export, no import, no reconciliation of anonymous profiles
   against recovery codes. Stand up a clean database, run the schema, point the
   app at it. **The 90-day deadline stops being an emergency and becomes a
   choice**, and the job drops from "a careful migration" to "an afternoon".
   *It does not remove the need.* The next set of players will care, and by
   then the deadline is real again — so do it now while it is free to do.
2. **Unity and Blender are both available.** Console stops being hypothetical.
   See §5, rewritten.
3. **PWA approved for mobile.** Built on 2026-08-08 — §6.

---

## 1. What we actually have, because it constrains everything

- A **Next.js/React/three.js client** — WebGL, procedural, zero binary assets.
- A **stateful authoritative simulation**: `engine.mjs`, a fixed 20 Hz step,
  rooms held in process memory, spoken over WebSockets by `custom-server.mjs`.
- **Postgres** for anonymous profiles.

Two consequences that are not negotiable:

1. **Serverless is a rewrite, not a migration.** No long-lived sockets, no tick,
   no room state. Vercel and Netlify are out. This is already recorded in
   `docs/HOSTING.md`.
2. **The client is WebGL.** That is fine on desktop, fine on mobile, fine in a
   desktop wrapper — and **not acceptable on a retail console**.

---

## 2. The one decision that matters, and it costs nothing today

**Separate the simulation from the renderer now, formally.**

`engine.mjs` is already close: it is pure game logic with no DOM, no three.js,
no browser. What is missing is a **written wire protocol** and a promise that
the sim never grows a web assumption.

Do that, and every later platform is *a new client talking a known protocol*.
Skip it, and a console port is a total restart.

This is the difference between a port that costs months and one that costs a
year, and the work to secure it is small: pin the protocol down, keep the sim
headless, add a conformance test that a non-browser client can run.

**Everything below assumes this is done first. It is the cheapest insurance on
the page.**

**Status, 2026-08-08 — the simulation no longer owns its clock.** `makeEngine`
is exported and takes `{ autoTick: false }`; `step(dtSeconds)` advances the sim
on the caller's time, and nothing inside it reads a wall clock any more. The
countdown, the round break, the summary rollback, the solo deal-in, the input
lapse and the emote throttle all run on accumulated sim time, and the four
`setTimeout`/`setInterval` calls that used to drive the first four are gone. One
process may hold several engines. `tools/protocoltest.mjs` plays a whole match —
lobby, countdown, fighting, round transition, summary — through `step()` alone,
with no timer and no wall-clock wait, then runs the same script twice and holds
the frames identical to the byte. API and the two things that stay process-wide
(`Math.random`, `randomUUID`): `docs/WIRE-PROTOCOL.md` §9.9.

That is the third bullet — a console client driving the sim from its own frame
loop — together with deterministic replay and concurrent engines. The written
protocol and its conformance test were already here; the host's right to own the
loop was the piece that was missing.

---

## 3. Hosting: leave Render, and the answer depends on who is playing

### The near term, and it is days of work, not weeks

- **Database → Neon.** Serverless Postgres, a free tier that does not expire
  after 90 days like Render's, and a connection string swap. **Do this
  regardless of every other decision on this page** — Render's free Postgres
  takes every profile with it when it goes.
- **App → Fly.io.** Persistent machines, cheap, and **region placement is a
  gameplay decision** for a 20 Hz sim: put the machine near the players. Turn
  **auto-stop off**, or the machine sleeps and every live room dies.

That is the whole browser story. It is not exciting and it removes the deadline
that is currently sitting on the profiles.

### The bigger idea, when there are enough players to need it

For a **room-based, 2–8 player, session-length** game, the modern answer is not
"a big server". It is **on-demand room orchestration** — a service that spins a
server up per match, in the region nearest the players, and tears it down after.
**Hathora** and **Edgegap** both do exactly this shape. ⚠ UNVERIFIED: pricing,
free tiers and whether either has a Node-friendly path.

Worth it only when concurrency and geography are real problems. Today they are
not.

---

## 4. Steam, and the fact that changes the economics

**Shipping the client is the easy half.** A **Tauri** wrapper builds the
existing web app into a desktop binary using the system webview — a few
megabytes, against Electron's hundred-plus. No rewrite. It keeps the browser
build as the demo and the funnel.

**The half that matters: Steam gives you multiplayer for free.**

**Steam Datagram Relay** carries game traffic across Valve's own backbone, and
**Steamworks networking lets one player host while the others connect through
that relay** — no dedicated server, no bandwidth bill, and it hides players' IP
addresses. For a small-room session game this is close to ideal, and it means
**the Steam version can cost nothing to run**. ⚠ UNVERIFIED: current Steamworks
terms, whether relay use is unconditionally free, and how it is reached from a
webview-based client rather than a native one.

If that holds, the shape is:

| Who | How they connect |
|---|---|
| Browser players | Our server on Fly, as today |
| Steam players | Listen-server over Steam's relay, at no cost to us |
| Cross-play | Only through our server — a Steam client can join it, but a browser client cannot join a Steam relay |

**The cost of a listen server is a design cost, not a money cost:** the host has
an advantage (zero latency to the sim), and when the host quits the match ends
unless host migration exists. For a game whose matches last minutes, that may
be an acceptable trade — but it is a real one and it belongs in the design
before it is in the code.

---

## 5. Console: the honest bad news, and the honest good news

**Bad news: no console takes a web wrapper for a retail release.** PlayStation,
Xbox and Switch all require a native build through their own toolchains. There
is no Tauri path, no Electron path, no PWA path. **The client must be rebuilt in
a native engine.**

**Good news: only the client.** If §2 is done, `engine.mjs` stays exactly where
it is — a headless Node sim speaking a known protocol — and the console client
is a renderer plus an input layer plus a socket. That is the whole reason to
formalise the protocol now.

**Which engine, if it comes to that:**

| | Godot | Unity |
|---|---|---|
| Cost | Free, no revenue share | Free under a revenue threshold ⚠ UNVERIFIED |
| Console | **No official export** — needs a paid porting partner (W4 Games, Pineapple Works) ⚠ UNVERIFIED cost | Official, with dev kits and platform approval |
| Web export | Yes — could even replace the browser client one day | Yes, but heavy |
| Mobile | Yes | Yes |
| Fit for this game | Good — small, 3D, code-first | Good, more overhead |

**Godot is the better fit for this project's shape and budget; Unity is the
lower-risk path to a console specifically.** Neither is a decision for now.

**What console actually requires beyond the port:** a developer account and
approval per platform, dev kits, certification (a long list of requirements
about save data, suspend/resume, controller conventions, and network failure),
age rating (PEGI/ESRB — and **this game's gore will matter here**), and either a
publisher or a porting house. Months, and money, after the port itself.

---

## 5b. Assets: procedural on the web, authored on the desktop — decided 2026-08-08

The owner: *"so are we going to utilise blender going forward?"*, and then, having
read the reasoning below: *"i will take your recommendation here."*

**The decision. The zero-binary-asset rule stays for the browser build and stops
applying to the desktop build.** They become two targets of one codebase rather
than one target with one rule.

### Why the rule existed, and why it expires

Every mesh, texture and sound in this game is generated in code. That was not
purity — it bought one specific property: **the game opens from a link, on a
phone, with nothing to download.** A 5 MB asset pack would have destroyed the
only distribution channel the game had.

That channel is being retired. The owner has already removed the "link in a group
chat" pitch, and the game is going to a storefront. **A Steam user has already
downloaded the game before they run it; the size of the payload is not a feature
they experience.** So on desktop the rule buys nothing and costs a great deal —
because the thing procedural geometry is worst at is exactly what this project
keeps failing at.

### The evidence that it costs something

Every head-and-face defect in `docs/OPEN-DEFECTS.md` is a parametric bug, and the
list is long: nine failed face passes, the ear that was `ball + torus + ball`
with daylight through it, the beard that was three solids, the hand that was
mirrored inside out, the boar that was a bracket. The two the owner raised today
are the same shape —

- the iris is a **full circle with no clip**, so it draws over the eyelid;
- the beard's inner wall dies at a **fixed 60 mm** under a jawline whose neck was
  later reworked underneath it.

Neither is a modelling problem. Both are the cost of describing a face as
arithmetic. **In a mesh, an eyelid occludes an iris because it is in front of
it** — there is no clip to forget.

### What this does NOT mean

- **The browser build keeps every line of the procedural pipeline.** It is not
  legacy and it is not deleted. It is the free, instant, no-download demo that
  feeds the storefront, and it is the reason anybody played this game at all.
- **It does not start now.** Authored assets need the renderer to be able to load
  them, and the seam that makes two clients possible is §2 — the wire protocol
  and the headless sim. **Export the clock first.** Doing assets before that seam
  means doing them twice.
- **It is not a licence to reach for Blender for the current defect list.** The
  eye and the beard are being fixed in the code they live in. Rebuilding a head
  as a mesh in the middle of a defect pass is how a pass takes five hours.

### Blender is not reachable from a cloud session, and this is why

The owner has `blender-mcp` listening on his Mac — port 9876, then 9877. **A
Claude Code session running in the cloud cannot reach it, and no amount of
enabling it in the connector settings will change that.** Checked four ways on
2026-08-08: the connector list, a keyword filter of it, a tool search, and a TCP
probe of both ports on `localhost`, `127.0.0.1` and `host.docker.internal`. All
negative.

The reason is not configuration. **A local MCP server bound to a port on a laptop
can only be reached by a Claude Code session running on that laptop.** claude.ai
connectors are remote HTTP services — Canva, Gmail, Drive — reached outward from
Anthropic's side. They are not a tunnel from a cloud container back into a
machine at home, and there is no setting that makes them one.

**So: Blender work has to be driven from Claude Code running locally on the Mac**
— the desktop app or the CLI — where `localhost:9877` means the same machine
Blender is on. That is a real and easy option; it is simply a different session
from this one. Recorded here so nobody spends another twenty minutes proving it
again.

### The order, when it comes

1. §2's seam — headless sim, exported clock, written protocol. **In flight.**
2. A Tauri desktop build that runs the existing WebGL client. No assets yet.
3. An asset loader in the renderer, behind a build flag, with the procedural path
   as the fallback the web build always takes.
4. Author the highest-value pieces first, and the list is not arbitrary — it is
   the defect log: **head, face, hands, beard, helmets.** These are the things
   twenty passes have not closed and the things a player looks straight at.
5. Environments and weapons only if there is reason to.

**The rule to hold on to:** an authored asset must never become the only way a
thing can be drawn. The moment the procedural path is deleted, the browser build
is dead, and the browser build is the funnel.

---

## 6. Mobile

Three options, in increasing cost:

1. **PWA — BUILT, 2026-08-08.** Installable straight from the link: no store, no
   review queue, no 30% cut. `src/app/manifest.ts` and `src/app/icon.tsx`, both
   GENERATED rather than stored, so the zero-asset rule holds — the icon is
   drawn by the same renderer as the link card and shares its palette, so a
   player who saw the unfurl recognises what lands on his home screen.

   What it buys beyond an icon is the reason to bother. `display: "standalone"`
   takes the browser chrome away — roughly 120px of vertical handed back to a
   HUD laid out against 390x844 — and it stops the address bar appearing and
   disappearing mid-fight, which resizes the WebGL canvas while a man is
   swinging. `orientation: "portrait"` because the touch controls put a thumb
   either side of the screen, and a rotation mid-match buries the attack buttons
   under the player's palms.

   **No service worker, deliberately.** Installability does not require one, and
   a worker caching this app would be a liability rather than a feature: it is a
   live WebSocket against an authoritative server, so there is nothing useful to
   serve offline, and a stale bundle speaking an older wire protocol is a class
   of bug worth not inventing. If offline ever matters it will be for the
   armoury, and that deserves its own reasons.
2. **Capacitor wrapper** — the same web build inside a native shell for the App
   Store and Play Store. Real store presence, real review queues, real cut.
3. **Falls out of a Godot/Unity port for free**, if that ever happens.

Start at 1. It is the only one that costs nothing and it fits the "link in a
group chat" pitch exactly.

---

## 7. The sequence I would actually follow

1. **Neon.** Removes the 90-day deadline sitting on every profile. Days.
2. **Fly.io, auto-stop off.** Leaves Render, keeps everything working. Days.
3. **Formalise the wire protocol and keep the sim headless.** The cheapest thing
   on this page and the one that decides the console question. Days. **This is
   also the gate on §5b** — an authored-asset pipeline needs a renderer that can
   be swapped, and that is the same seam. Do not start assets before it.
4. **Ship analytics.** Nothing on this page can be prioritised honestly while
   "most players are on a phone" remains unmeasured (`docs/PLATFORMS.md`).
5. **PWA.** Mobile, free, immediate.
6. **Tauri build + Steam page + wishlists**, with Steam relay for Steam-to-Steam
   play. This is the first step that costs real time.
7. **Content that justifies a price** — factions, grounds, ranked, the finisher
   (`docs/FACTIONS-AND-STEAM.md`, `docs/GAUNTLET-BRIEF.md`).
8. **Console** — engine port, then platform approval, then certification. Only
   after Steam has proved the game holds an audience.

**The thing to resist:** doing 6 before 4. Steam reviews are permanent, and the
only way to know whether this game is ready for a paying audience is to measure
whether a free one comes back.
