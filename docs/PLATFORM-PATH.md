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

## 6. Mobile

Three options, in increasing cost:

1. **PWA — available today, costs nothing.** Installable straight from the link,
   no store, no review queue, no 30% cut. Already recommended in
   `docs/MONETISATION.md` and still unbuilt.
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
   on this page and the one that decides the console question. Days.
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
