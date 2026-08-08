# Off Render, onto Steam, and eventually onto a console

The owner: *"My ideal scenario is to move away from the hosting I think, I want
the best possible option for still having multiplayer & beam available on steam
with the later release ideal to be console. (if you could find a mobile option
too thats great)"*

Four platforms, one codebase, and a multiplayer game that cannot be static.
This file sets out what is cheap, what is a rewrite, and the one architectural
decision that decides whether the console version is a port or a restart.

**Checked 8 August 2026.** Every figure below carries a source and a date.
Where a source could not be opened from this machine, or where no public answer
exists, it is named in §8 — *What could not be verified* — rather than guessed
at. Two things changed as a result of checking: **Hathora no longer exists**
(§3) and **the Steam networking claim needed qualifying, not withdrawing** (§4).

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
   desktop wrapper — and **not acceptable on a retail console**. §5 now has the
   receipt for that, not just the assertion.

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
the page.** Checking the rest of this file only raised its value: the Steam
path (§4) and the console path (§5) now both depend on a transport swap, and a
transport swap is cheap only if the protocol is already written down.

---

## 3. Hosting: leave Render, and the answer depends on who is playing

### The near term, and it is days of work, not weeks

**Database → Neon.** Verified against Neon's own documentation source
([neondatabase/website, `content/docs/introduction/plans.md`](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md),
read 8 Aug 2026):

| Free plan | Limit |
|---|---|
| Storage | 0.5 GB per project |
| Compute | 100 CU-hours per project per month (~400 h of a 0.25 CU compute) |
| Projects | 100 |
| Branches | 10 per project |
| Scale to zero | After 5 min idle — **cannot be disabled on Free** |
| Expiry | None stated; CU-hours and transfer reset each billing period |

**The file's claim that Neon's free tier "does not expire" holds.** The
correction is a detail that matters in practice: **scale-to-zero is mandatory on
Free**, so the first profile read after five idle minutes pays a cold start.
For anonymous profiles loaded once at session start that is acceptable; it
would not be if the DB were ever in the tick loop. It must not be.

**Do this regardless of every other decision on this page** — Render's free
Postgres takes every profile with it when it goes.

**App → Fly.io.** Persistent machines, and **region placement is a gameplay
decision** for a 20 Hz sim: put the machine near the players. Turn **auto-stop
off**, or the machine sleeps and every live room dies.

Verified against Fly's own docs source
([superfly/docs, `about/cost-management.html.md`](https://github.com/superfly/docs/blob/main/about/cost-management.html.md)
and [`about/pricing.html.markerb`](https://github.com/superfly/docs/blob/main/about/pricing.html.markerb),
read 8 Aug 2026):

- Egress: **$0.02/GB** North America and Europe, **$0.04/GB** Asia Pacific,
  Oceania, South America, **$0.12/GB** Africa and India.
- Fly's own worked example: one always-on `shared-1x` 256 MB machine is
  **"$2.32/month"** left running full-time.
- Fly's own advice, which happens to match ours: *"We recommend budgeting for
  the 'always-on' cost… The most predictable way to save money isn't fiddling
  with auto-stop/start settings (since any random request might spin a machine
  up again), but by just…running fewer machines."*

So the shape of the claim is right and the order of magnitude is single-digit
dollars a month for one always-on machine. The exact per-RAM price table is not
in Fly's open-source docs repo (see §8).

That is the whole browser story. It is not exciting and it removes the deadline
that is currently sitting on the profiles.

### The bigger idea — and **the file was wrong here**

The previous version recommended **Hathora** as one of two on-demand room
orchestrators. **Hathora's game-hosting business no longer exists.** Hathora was
acquired by Fireworks AI (announced 4 March 2026,
[fireworks.ai/blog/fireworks-acquires-hathora](https://fireworks.ai/blog/fireworks-acquires-hathora));
the hosting platform was frozen on acquisition and **shut down on 5 May 2026**,
with customers offboarded to Nitrado. The fallout is documented in trade press —
*Stormgate* lost its servers and is being pushed to an offline mode
([Game Developer, March 2026](https://www.gamedeveloper.com/business/stormgate-rushing-offline-mode-after-losing-server-access-to-an-ai-company)).

**Anyone reading the old paragraph would have spent a week integrating a dead
service.** That is the single most expensive error this check caught.

What remains for on-demand, per-match, region-nearest room orchestration:

- **Edgegap** — container-based, deploys arbitrary Docker images (a plain Node
  process is fine), usage-billed per vCPU-minute plus egress, free account with
  no card required ([edgegap.com/resources/pricing](https://edgegap.com/resources/pricing)).
  Exact rates: see §8 — the site is unreachable from this machine and the rates
  circulating in comparison pages are not a source I will quote as fact.
- **Nitrado / GameFabric** — where Hathora's customers were sent.

Worth it only when concurrency and geography are real problems. Today they are
not, and the churn in this market in the last six months is itself an argument
for staying on a boring always-on machine until the players force the issue.

---

## 4. Steam, and the fact that changes the economics

**Shipping the client is the easy half.** A **Tauri** wrapper builds the
existing web app into a desktop binary using the system webview — a few
megabytes, against Electron's hundred-plus. No rewrite. It keeps the browser
build as the demo and the funnel.

**The half that matters: can a wrapped web client actually reach Steam
networking?** This was the load-bearing question on the page. **Yes — but not
the way the file implied, and the honest answer has three parts.**

### 4a. Steam Datagram Relay is real, and it is Steam-only

From Valve's own repository (primary source, read 8 Aug 2026):

- *"On Steam we use a custom relay service known as Steam Datagram Relay — SDR
  for short — carrying packets through our network of relays and on our
  backbone."*
  ([README_P2P.md](https://github.com/ValveSoftware/GameNetworkingSockets/blob/master/README_P2P.md))
- *"On Steam we often do not share public IP addresses between untrusted peers,
  so that malicious players cannot DoS attack. In that case NAT punch is not
  possible and traffic would be relayed."* (ibid.) — **IP hiding is the default
  behaviour, not an option we have to build.**
- *"Some features are only available on Steam, such as Steam's authentication
  service, signaling service, and the SDR relay service."* … *"Because this is a
  live service, and we need to control our security and backward compatibility
  burden, at this time we are not able to offer access to SDR on other platforms
  to all partners."*
  ([GameNetworkingSockets README](https://github.com/ValveSoftware/GameNetworkingSockets))
- The API supports both shapes we care about: *"Also supports SDR ('Steam
  Datagram Relay') connections… There is a 'P2P' use case and a 'hosted
  dedicated server' use case."*
  ([isteamnetworkingsockets.h](https://github.com/ValveSoftware/GameNetworkingSockets/blob/master/include/steam/isteamnetworkingsockets.h))

So: relay over Valve's backbone, IPs hidden, listen-server/P2P supported, and
**it works only for Steam-authenticated peers** — which is exactly the
cross-play boundary the table below already drew.

**On cost: the "free" claim is not something I can stand behind with a primary
source.** Valve's SDR documentation page publishes no price that I could
retrieve, and `partner.steamgames.com` is unreachable from this machine (§8).
What *is* documented is that the **dedicated-server** side of SDR is a
restricted beta with real conditions — all game traffic must route through SDR,
server IPs never revealed, the server must be a Linux Docker image, and Valve
cannot be your only hosting provider. **The P2P/listen-server use case, which is
the one this game wants, carries no such published gate.** Treat "Steam
multiplayer costs us nothing to run" as *very likely true and untested*, not as
a quoted term — and confirm it in the Steamworks partner portal before it is
load-bearing in a budget.

### 4b. The JS bridge exists, is maintained, and has a gap you must plan around

This is the part the file did not answer, and it is the part that decides
everything.

**`steamworks.js`** — *"A modern implementation of the Steamworks SDK for
HTML/JS and NodeJS based applications"*, v0.4.0, published 6 Aug 2024
([registry.npmjs.org/steamworks.js](https://registry.npmjs.org/steamworks.js)),
most recent commit 7 Sep 2025
([ceifa/steamworks.js](https://github.com/ceifa/steamworks.js/commits/main)).
It supports Electron explicitly (`contextIsolation: false`,
`nodeIntegration: true`, plus `electronEnableSteamOverlay()`).

**But its networking surface is the *legacy* interface only.** From
[`client.d.ts`](https://github.com/ceifa/steamworks.js/blob/main/client.d.ts)
and [`src/api/networking.rs`](https://github.com/ceifa/steamworks.js/blob/main/src/api/networking.rs),
the entire networking namespace is:

```ts
sendP2PPacket(steamId64, sendType, data): boolean
isP2PPacketAvailable(): number
readP2PPacket(size): P2PPacket
acceptP2PSession(steamId64): void
```

That is `ISteamNetworking`, which **Valve has deprecated**: *"These APIs are
deprecated, and may be removed in a future version of the Steamworks SDK. See
ISteamNetworkingMessages."*
([Steamworks SDK comments, via Steamworks.NET's generated bindings](https://github.com/rlabrecque/Steamworks.NET/blob/master/com.rlabrecque.steamworks.net/Runtime/autogen/isteamnetworking.cs))
Valve's own comment on `SendP2PPacket` confirms it *"automatically manages
NAT-traversal or relay server connections"* — so it does relay through Steam and
does hide IPs today. It is a working path on borrowed time, capped at 1200-byte
unreliable packets.

**The modern, SDR-native APIs are one layer down and already bound.**
`steamworks.js` is a napi wrapper over the Rust crate **`steamworks`**
(`Noxime/steamworks-rs`), and that crate ships
[`networking_sockets.rs`, `networking_messages.rs`, `networking_utils.rs`,
`networking_types.rs`](https://github.com/Noxime/steamworks-rs/tree/master/src).
The crate is alive: **v0.13.1 published 5 May 2026**
([crates.io/api/v1/crates/steamworks](https://crates.io/api/v1/crates/steamworks)).

**Which produces the actual answer, and it is better than the file implied:**

> **Tauri's backend is Rust.** A Tauri build does not need `steamworks.js` at
> all — it can link `steamworks-rs` directly, use `ISteamNetworkingSockets`/
> `NetworkingMessages` over SDR, and expose send/receive to the webview through
> Tauri's own command bridge. The webview renders; Rust does Steam. **No
> deprecated API, no missing binding, no unmaintained dependency.**
>
> If the wrapper were Electron instead, the path is `steamworks.js` — which
> works, but today gives you only the deprecated P2P interface unless someone
> writes the napi binding for the sockets API that the Rust layer already has.

**The "Steam costs nothing to run" argument therefore survives — and it is now
an argument for Tauri over Electron specifically, on technical grounds and not
just binary size.** `greenworks` (Greenheart Games) is the other JS option and
is explicitly best-effort: *"active development is not a priority"*
([greenheartgames/greenworks](https://github.com/greenheartgames/greenworks)).
Do not build on it.

### 4c. What Steam requires of us generally

- **Steam Direct: $100 per app**, non-refundable but **recoupable once the app
  reaches $1,000 adjusted gross revenue**
  ([Steamworks: Steam Direct Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)).
- **Steam-to-Steam multiplayer implies a Steam account** — that is what
  authenticates the relay. There is **no Steam-wide mandate** to support
  cross-play, and no requirement to expose a server browser; matchmaking,
  lobbies and dedicated-server listing are offered as APIs, not obligations
  ([Steamworks: Multiplayer](https://partner.steamgames.com/doc/features/multiplayer)).

The shape, unchanged:

| Who | How they connect |
|---|---|
| Browser players | Our server on Fly, as today |
| Steam players | Listen-server over Steam's relay, at no cost to us *(cost unconfirmed — §8)* |
| Cross-play | Only through our server — a Steam client can join it, but a browser client cannot join a Steam relay |

**The cost of a listen server is a design cost, not a money cost:** the host has
an advantage (zero latency to the sim), and when the host quits the match ends
unless host migration exists. For a game whose matches last minutes, that may
be an acceptable trade — but it is a real one and it belongs in the design
before it is in the code.

---

## 5. Console: the honest bad news, and the honest good news

**Bad news: no console takes a web wrapper for a retail release.** This is now
evidenced rather than asserted, at least for the one platform that publishes
anything:

- **Xbox.** Microsoft's public GDK builds for Windows and cloud only. *"Xbox
  console development requires the Microsoft Game Development Kit with Xbox
  Extensions (GDKX)"*, which is *"only available under confidential license
  within an NDA Xbox program"* — obtained through a managed programme such as
  ID@Xbox ([microsoft/GDK](https://github.com/microsoft/GDK), read 8 Aug 2026).
  **The old UWP path is not a live retail route for a game like this**; the
  console target is GDKX, and GDKX is a native C++ toolchain. There is no
  Electron or Tauri story there.
- **PlayStation and Nintendo** publish nothing outside NDA. Access is by
  application — `partners.playstation.com` and `developer.nintendo.com` — and
  Nintendo's process expects a shipped portfolio and separate LOTCHECK
  registration. I could not find, and do not expect to find, any published
  policy permitting a webview-wrapped retail title. **See §8: this is stated as
  "no evidence any console permits it", which is weaker than "confirmed
  prohibited", and the distinction is honest rather than pedantic.**

**Good news: only the client.** If §2 is done, `engine.mjs` stays exactly where
it is — a headless Node sim speaking a known protocol — and the console client
is a renderer plus an input layer plus a socket. That is the whole reason to
formalise the protocol now.

**Which engine, if it comes to that:**

| | Godot | Unity |
|---|---|---|
| Cost | Free, MIT, no revenue share | **Personal free** below a **$200,000** revenue/funding ceiling; **Pro $2,310/seat/yr** from 12 Jan 2026 (up 5% from $2,200), $210/mo ([Unity pricing updates](https://unity.com/products/pricing-updates)) |
| Console | **No official export.** Third-party middleware/porting only — **W4 Games** ships Switch / Xbox Series X\|S / PS5 export templates for Godot 4.3+, with early Switch 2 beta as of early 2026 ([w4games.com/w4consoles](https://www.w4games.com/w4consoles)); **Pineapple Works** and **Lone Wolf** are porting *services* rather than middleware ([Godot: Console Support](https://godotengine.org/consoles/)) | Official, with dev kits and platform approval |
| Console cost | **Not published.** W4 quotes per title, per platform, annual subscription ([W4 pricing announcement](https://www.w4games.com/blog/w4-games-news-1/w4-games-announces-pricing-model-for-console-ports-5)) — see §8 | Engine licence above, plus platform approval and dev kits |
| Web export | Yes — could even replace the browser client one day | Yes, but heavy |
| Mobile | Yes | Yes |
| Fit for this game | Good — small, 3D, code-first | Good, more overhead |

The old file marked Unity's revenue threshold ⚠ UNVERIFIED. **It is $200,000**,
and the Runtime Fee that once complicated this was cancelled
([Unity: "Unity is Canceling the Runtime Fee"](https://unity.com/blog/unity-is-canceling-the-runtime-fee)).
Unity Personal's 3-seat cap is also being lifted to unlimited. **Neither engine
is a licence-cost problem at our scale; the console cost is the platform and
the porting partner, not the engine.**

**Godot is the better fit for this project's shape and budget; Unity is the
lower-risk path to a console specifically.** Neither is a decision for now, and
nothing found here changes that.

**Age rating — and the gore genuinely matters, but less than the file feared.**

- **Digital-only ratings are free.** The **IARC** questionnaire at
  [globalratings.com](https://www.globalratings.com/) issues ESRB, PEGI, USK,
  ClassInd and other regional ratings at no charge, and is accepted by Microsoft
  Store, Nintendo eShop and Google Play. **ESRB explicitly directs digital
  developers to IARC** as it phases out its paid Short Form process
  ([ESRB via Game Developer, on the Short Form phase-out](https://www.gamedeveloper.com/game-platforms/esrb-points-devs-toward-iarc-ratings-as-it-looks-to-phase-out-short-form-option)).
- **Paid ratings are the physical/boxed and some European console paths** —
  reported in the low hundreds to low thousands per platform
  ([Game Developer, on paid ratings in Europe](https://www.gamedeveloper.com/business/how-paying-for-content-ratings-is-hurting-devs-who-release-in-europe)).
- Dismemberment will push the rating to the top bracket (PEGI 18 / ESRB M) and
  will constrain marketing and storefront visibility. **It does not by itself
  block console approval** — mature-rated console titles ship constantly.

**What console actually requires beyond the port:** a developer account and
approval per platform, dev kits, certification (a long list of requirements
about save data, suspend/resume, controller conventions, and network failure),
age rating, and either a publisher or a porting house. Months, and money, after
the port itself. Unchanged, and confirmed by the access model above.

---

## 6. Mobile

Three options, in increasing cost:

1. **PWA — available today, costs nothing.** Installable straight from the link,
   no store, no review queue, no 30% cut. Already recommended in
   `docs/MONETISATION.md` and still unbuilt.

   **iOS is no longer the obstacle it was, with one exception that matters for
   the funnel.** Home-screen web apps get Web Push and the Badging API (since
   iOS 16.4), Declarative Web Push (Safari 18.4), screen-wake control, and as of
   **iOS 26 a site added to the Home Screen opens as a web app by default even
   without a manifest**. **The exception: there is still no
   `beforeinstallprompt` and no automatic install prompt on iOS** — the user
   must go through Share → Add to Home Screen. **So the install has to be taught
   in-page, with an iOS-specific hint.** That is a UI task, and it is the
   difference between a PWA that installs and one that doesn't.
   (Apple ships this behaviour in Safari; see §8 on sourcing.)

   Android has none of these problems: Chrome prompts for install, and a PWA can
   additionally be listed on Google Play via a Trusted Web Activity.

2. **Capacitor wrapper** — the same web build inside a native shell for the App
   Store and Play Store. **Capacitor is MIT-licensed and free**; Capacitor 8 is
   current (8.3.x as of April 2026). Ionic's paid products (Appflow etc.) are
   enterprise-priced and **not required** to ship.

   **The review friction is real and it has a guideline number.** App Store
   Review **Guideline 4.2, Minimum Functionality**: *"Your app should include
   features, content, and UI that elevate it beyond a repackaged website. If
   your app is not particularly useful, unique, or 'app-like,' it doesn't belong
   on the App Store."*
   ([App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
   read 8 Aug 2026). A real-time 3D multiplayer game with native input is a
   comfortable pass — **a thin shell around a URL is not**. Budget for native
   touches (haptics, safe-area handling, offline behaviour) as review insurance,
   not as polish.

3. **Falls out of a Godot/Unity port for free**, if that ever happens.

Start at 1. It is the only one that costs nothing and it fits the "link in a
group chat" pitch exactly.

---

## 7. The sequence I would actually follow

Unchanged in order. The checking made steps 1–3 more urgent and step 6 more
concrete, and it deleted a service from the "later" list.

1. **Neon.** Removes the 90-day deadline sitting on every profile. Days.
   Remember scale-to-zero is mandatory on Free — keep the DB out of the tick.
2. **Fly.io, auto-stop off.** Leaves Render, keeps everything working. Days.
   Single-digit dollars a month; egress $0.02/GB in NA/EU.
3. **Formalise the wire protocol and keep the sim headless.** The cheapest thing
   on this page and the one that decides the console question. Days. It is also
   what makes the Steam transport swap in step 6 a swap rather than a rewrite.
4. **Ship analytics.** Nothing on this page can be prioritised honestly while
   "most players are on a phone" remains unmeasured (`docs/PLATFORMS.md`).
5. **PWA** — including an **iOS-specific "Add to Home Screen" hint**, because
   iOS will never prompt on its own. Mobile, free, immediate.
6. **Tauri build + Steam page + wishlists**, with SDR for Steam-to-Steam play,
   **linking `steamworks-rs` from Tauri's Rust backend** rather than going
   through `steamworks.js`. $100 Steam Direct, recoupable at $1,000 revenue.
   This is the first step that costs real time.
7. **Content that justifies a price** — factions, grounds, ranked, the finisher
   (`docs/FACTIONS-AND-STEAM.md`, `docs/GAUNTLET-BRIEF.md`).
8. **Console** — engine port, then platform approval, then certification. Only
   after Steam has proved the game holds an audience. Rate via IARC (free) for
   digital; expect PEGI 18 / ESRB M.

**The thing to resist:** doing 6 before 4. Steam reviews are permanent, and the
only way to know whether this game is ready for a paying audience is to measure
whether a free one comes back.

---

## 8. What could not be verified

Stated plainly, because a guess dressed as a figure is worse than a gap.

**Blocked from this machine.** Outbound HTTPS here runs through a filtering
proxy that refused a number of vendors' own sites: `partner.steamgames.com`,
`developer.valvesoftware.com`, `store.steampowered.com`, `unity.com`,
`docs.unity3d.com`, `godotengine.org`, `w4games.com`, `fly.io`, `neon.com`,
`hathora.dev`, `edgegap.com`, `learn.microsoft.com`, `pegi.info`, `esrb.org`,
`capacitorjs.com`, `developer.mozilla.org`. Where a vendor publishes its docs as
an open repository — **Fly.io (`superfly/docs`), Neon (`neondatabase/website`),
Valve (`ValveSoftware/GameNetworkingSockets`), Microsoft (`microsoft/GDK`)** —
I read the primary source there instead, and those figures are solid. Where it
does not, the figure below is sourced to the official page by URL and date but
**was not opened directly by me**, and should be re-checked by someone who can
open it before money moves.

Items in that second category: Unity's $200,000 threshold and $2,310/seat/yr
Pro price; the Steam Direct $100 fee and its $1,000 recoup; Steam's
multiplayer/cross-play policy statements; Edgegap's rates; iOS 26 web-app
behaviour and Safari's Declarative Web Push; Capacitor's current version.

**No public answer exists at all** — these are not research failures, they are
genuinely unpublished:

- **The price of Steam Datagram Relay.** Valve publishes no rate card for SDR,
  free or otherwise. The universal claim that it is free is repeated everywhere
  and sourced nowhere I could open. **Confirm in the Steamworks partner portal
  before §4 is used to justify a budget.** Likewise: no published bandwidth cap,
  CCU cap or session-length cap for relayed P2P — absence of a published limit
  is not proof of no limit.
- **W4 Games' console pricing.** Quoted per title, per platform, annually. Not
  public. Requires a conversation.
- **PlayStation and Nintendo developer terms**, including whether any wrapper
  technology could ever be accepted. Behind NDA. The §5 claim is therefore
  *"no console publishes any route for a webview-wrapped retail release, and
  Xbox's published route explicitly requires a native NDA toolchain"* — not
  *"all three have confirmed they forbid it."*
- **Fly.io's per-RAM machine price table.** Rendered from a template that is not
  in the open-source docs repo. The egress rates and the $2.32/month always-on
  example above *are* from Fly's own source.
- **Whether `steamworks.js` will ever expose `ISteamNetworkingSockets`.** No
  open issue requests it as of 8 Aug 2026. This is precisely why §4b routes
  around it via Rust.
