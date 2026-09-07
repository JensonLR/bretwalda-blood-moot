# ONE CLIENT — the Unity build is retired, and the war has never fired

Written 7 Sep 2026, on the owner's ruling:

> "I think I really want to scrap the unity build as the quality is so much
> worse & focus on the threejs variant thats on web (assuming that is still
> suitable for ios/android & steam). I still feel like we have so much more we
> can upgrade, improve & add to the game & concept."

This document is the ruling and the first cycle's spec. It **supersedes** the
2 Sep 2026 ruling in `docs/HANDOVER.md` ("Steam/iOS/Android won't be ready
until we start building in Unity & Blender"), the whole of
`docs/REBUILD-PLAN.md`, and §5 and §5b of `docs/PLATFORM-PATH.md`. Each of
those carries a note at its head pointing here. They are marked rather than
deleted, because the reasoning in them was not stupid — it was answered by
something only the owner could supply, which is his own eyes on both builds.

---

## 1. The decision

**One client: Three.js. Three targets: web, Steam via Tauri, iOS and Android
via Capacitor. Console is out of scope until this game holds an audience.**

Console was the only thing Unity bought that Three.js cannot deliver, and it
was always behind a question — *does anyone come back to this game* — that is
still unanswered. Buying a door years before it can be walked through, at the
cost of maintaining a second client, is a bad trade. It is now untaken.

### 1.1 What that costs, stated honestly

- **Retail console is gone until a native client is rebuilt.** Not deferred by
  a wrapper or a plugin: PlayStation, Xbox and Switch take no webview. If the
  game earns a console release, that is a new client against the same wire
  protocol — which is exactly the position `PLATFORM-PATH.md` §2 spent its
  effort making possible, and that effort is not wasted by this ruling. It is
  what makes this ruling reversible.
- **~35 C# files and a week of Unity work stop being maintained.** The project
  is its own repository (`BRETWALDA---Blood-Moot`), checked out inside this one
  and ignored by it, so nothing here has to be deleted for this to be true.

### 1.2 What it does NOT cost, and this is the part that was not obvious

**The Blender pipeline survives the engine that motivated it.** Every exporter
under `tools/blender/` writes glTF and OBJ — engine-neutral formats three.js
reads natively. The only Unity-shaped thing in them is where they copy the
result: 14 `StreamingAssets` references across `tools/`. That is a path, not a
port.

`PLATFORM-PATH.md` §5b already sequenced the loader that makes this true —
*"an asset loader in the renderer, behind a build flag, with the procedural
path as the fallback the web build always takes"* — and then it was built for
Unity instead of for three.js. **P2 below is that step, finally aimed at the
client we are keeping.** Roughly 500 MB of finished output in `art/blender/`
— rigged men, nine clips, 64 cosmetic props, five grounds, strand beards —
stops being stranded the moment it exists.

### 1.3 The three targets, verified rather than assumed

| Target | Path | State in this repo, checked 7 Sep 2026 |
|---|---|---|
| Web | as today | shipping |
| Steam | Tauri, system webview | `desktop/src-tauri/` exists; `.github/workflows/desktop.yml` builds Windows/macOS/Linux installers on a `desktop-v*` tag. `players.steam_id` + `players_steam_id_idx` are in `schema.ts` |
| iOS / Android | Capacitor around the same build | PWA shell ships, both rotations gated (`touchtest` 32/32 landscape, 33/33 portrait), touch targets gated at 44/56 px |

---

## 2. The finding that outranks the renderer question

The database was read directly on 7 Sep 2026 (Neon project `flat-bird-85856627`,
`eu-west-2`, Postgres 18):

| table | rows |
|---|---|
| `players` | 26 — **10 sworn**, across all four peoples |
| `match_history` | 85, from 8 Aug to 4 Sep |
| `seasons` | 1 |
| `territories` | 16, all held |
| `war_ledger` | **2** |
| `war_flips` | **0** |

`docs/WHAT-THIS-GAME-IS.md` stakes this game's entire answer to *why would
people come back* on one sentence: **"the map moved while you were asleep."**

**The map has never moved.** Not once, in 85 matches, in four weeks.

### 2.1 Why, exactly

`warReport` in `src/game/engine.mjs:4565` drops a match on any of four gates.
The fourth is the one:

```js
const humans = results.filter((r) => r && !r.id.startsWith("bot_"));
if (humans.length < 2) return null;
```

With 26 players arriving across a month, **two humans in one room at one
moment is a coincidence, not an event.** 83 of 85 matches were solo, friendly,
or a lone man.

### 2.2 What this is, named properly

A **cold-start deadlock**. The retention thesis needs concurrency;
concurrency needs an audience; the audience needs the retention thesis.

The war is not broken. `wartest` is 79/79 green and its arithmetic is correct.
It is **starved** — held to a condition that a game at this size cannot meet.
That is how 79 passing checks and zero territory flips sit together without
either of them lying, and it is worth recording as a class of defect this
repository has not previously had a name for: *a gate that is correct, tested,
and structurally never satisfied.*

It also explains a thing that would otherwise read as bad luck. Every visual
pass, every gore gate, every armoury rung has been work on the **fight** and
the **match** loops. The **war** loop — the one the design document says is
the whole point — has been shipped, gated, and never once run.

---

## 3. The sequence

| | Sub-project | Shape |
|---|---|---|
| **P0** | Retire Unity | Small. Removes maintenance drag before anything else is built |
| **P1** | Make the war fire | The retention spine. This document specs it |
| **P2** | glTF loader + asset redirect | The visual ceiling. Its own cycle |
| **P3** | Ship — Steam, iOS, Android | Packaging, store pages, ratings, the Steam auth door |

The owner's ordering, taken 7 Sep 2026: **war first, then visuals, then ship.**
P0 and P1 are one cycle, specced below. P2 and P3 get their own.

---

## 4. P0 — retire Unity

### 4.1 The web client has no Unity coupling

Checked before anything was deleted. Four matches for `unity` in `src/`, and
**all four are false positives**: three are the number one (`render/world.ts`
"linear about unity", `render/postfx.ts` "interpolates toward unity",
`characters.ts`) and one is a passing comment in `factionMap/Roster.tsx:9`.

**Nothing in the Three.js client depends on Unity existing.** This is a
dividend of `PLATFORM-PATH.md` §8.1 — `tools/platformcheck.mjs` mechanically
holds the sim off the renderer and the server off the client but for one named
seam. A codebase that policed its own boundaries can lose a client without
surgery.

### 4.2 Retire

| Tool | Why it dies |
|---|---|
| `tools/unitywire.mjs` | the Unity client's conformance to the wire |
| `tools/unityui.mjs` | the Unity client's IMGUI screen rules |
| `tools/unitycheck.sh` | Roslyn compile of the C# without the editor |
| `tools/palettesync.mjs` | exists **only** so two clients wear one palette. With one client there is one palette, and the tool's own reason to exist is gone |

Their four `package.json` scripts go with them.

### 4.3 Keep and repoint

These test properties that outlived their target. Each is re-aimed at the
three.js client.

| Tool | The property it actually holds |
|---|---|
| `tools/cliptime.mjs` | the animation and the server tell the same story about a blow |
| `tools/shadercheck.mjs` | a shader declares every name it uses |
| `tools/severtest.mjs` | the cut knows every zone the engine can name |
| `tools/portraittest.mjs` | the four men in the class picker are men, not magenta |

### 4.4 Retarget

The 14 `StreamingAssets` references in `tools/blender/*` become a
web-servable asset directory. **That directory is P2's input**, which is why
this is done here rather than deferred: the exporters should already be
writing where the loader will read.

### 4.5 The gate

`npm run platformcheck` stays 6/6 across the whole of P0. It is the law that
made this cheap and it is the law that proves nothing was broken in passing.

---

## 5. P1a — bots bank, at a discount

### 5.0 It was claimed to be TWO sites. It is ONE — corrected 7 Sep 2026

**This section originally said the fix needed two sites and that a one-site fix
would bank nothing. That was wrong, it was acted on, and the change was
reverted. The correction is kept here rather than edited away, because the
reasoning that produced it is the kind that will be produced again.**

The claim was that `dealGroundFor` (`engine.mjs:2379`) nulls the territory on a
solo room, so relaxing `warReport`'s human count alone would leave gate three —
`if (!room.matchId || !territory(room.territoryId)) return null;` — rejecting
every solo match on a null territory.

Every sentence of that is true about the code and **irrelevant to the fix**,
because of a distinction not checked before the claim was made:

| | `mode: "solo"` | an ordinary room + bots |
|---|---|---|
| made by | the `solo` message | `create` then `add_bot` |
| what it is | **TRAINING** — one endless round | a real match |
| pays gold | **no** (`buildLedger`) | yes |
| reaches a match end | **no** | yes |
| dealt a territory | no, and correctly so | **yes, always** |

**A lone man does not fight a real match in a `mode: "solo"` room.** That room
is the tutorial: it pays nothing, ends nothing, and `engine.mjs:4534` keeps it
out of the war independently of any territory. A lone man fights a real match
in an ordinary room he has added bots to — and such a room has **always** been
dealt a territory.

So the fix is one site, `classifyMatch`, and it is §5.1. `dealGroundFor`'s guard
is correct as written; removing it only handed a war-less room a territory it
can never use. `wartest` now states which rooms have ground at stake — training
none, friendly none, an ordinary room one — so the claim cannot be remade from
memory.

**What the episode is worth keeping for.** The reasoning was "read the whole
path, not the line the change is about", which is right and which found the
real second trap in §5.4. Applied here it read the path correctly and misread
what one of its rooms was FOR. Reading a call graph is not the same as knowing
which branch a player is standing in, and the gate in §7 is what settled it —
it was pointed at the training room first, waited ninety seconds, and reported
that nothing banked, which was true and measured nothing.

### 5.1 The classification

`warReport` stops rejecting and starts **classifying**. The case that matters is
**one human in an ordinary match room**, alongside bots he added — which is
where a lone player actually fights something that ends and pays. A `mode:
"solo"` training room is NOT included and never was; see §5.0.

| Situation | kind | weight |
|---|---|---|
| ≥2 humans, outside a Moot window | `moot` | 1.0 |
| ≥2 humans, inside a Moot window | `moot` | **1.5** |
| exactly 1 human, room difficulty ≥ `warrior` | `solo` | **0.3**, daily-capped |
| exactly 1 human, room difficulty `recruit` | — | banks nothing |
| `room.friendly` | — | banks nothing — **unchanged** |

### 5.2 Three choices, and the argument for each

**The weight lives in `war.mjs`, not in the engine.** A new
`bankedPoints(result, kind)` wraps the existing `pointsFor`. The engine names
the *situation*; the rules module *prices* it. This matches the split that
already exists — `pointsFor` is in `war.mjs` today — and it keeps the new
arithmetic under `wartest`, which needs no database and runs in seconds. An
engine that knows what 0.3 means is an engine with a second opinion about the
war.

**`friendly` still banks nothing.** The existing comment calls it *"a fight the
war agreed not to watch"*, and that is a good decision that becomes more
valuable, not less, once solo banks: it is the only room left where a man can
fight without moving a border.

**The difficulty floor is `warrior` (`BOT_SKILL` 0.7).** `recruit` is 0.45 and
is the tutorial's opponent. A war that can be dragged by beating the tutorial
is not a war. The floor reads `room.difficulty`, which the engine already
normalises and carries.

**`BOT_SKILL` is a map, not an ordering**, so "≥ warrior" is not a comparison
the code can make as written. The floor is stated as a **skill number** —
`BOT_SKILL[room.difficulty] >= WAR_SKILL_FLOOR`, `WAR_SKILL_FLOOR = 0.7` — so a
difficulty added later is ranked by the same number that makes it hard, and
nobody has to remember to extend a list. An unrecognised or absent difficulty
banks nothing.

### 5.3 The schema change

`war_ledger` gains `kind text NOT NULL DEFAULT 'moot'`.

It stores the **banked** points — what the map is actually decided by — and how
they were earned. Retuning 0.3 changes future banking only; history is not
rescaled, and the column is what makes that visible rather than invisible. The
default backfills the two existing rows correctly: both were two-human matches.

### 5.4 The daily cap

`SOLO_DAILY_CAP` points per profile per **UTC** day, enforced in
`src/db/war.ts` **inside the insert's transaction** so it cannot race.

**Two timezones appear in this spec and the split is deliberate.** The cap's
day boundary is UTC because it must be unambiguous: `Europe/London` has an hour
that happens twice each October, and a boundary that repeats is a boundary a
cap can be walked through. The Moot's hour (§6.1) is `Europe/London` because it
is an appointment with people, and an appointment that drifts an hour twice a
year is a broken appointment. A reader who finds them differing later should
find this paragraph rather than assume one is a mistake.

Two rules it must not break:

1. **Idempotency stands.** `war_ledger_match_player_idx` still rules; a
   retried or double-delivered match is still exactly one row. The cap is
   computed inside the same transaction as the conflict-guarded insert.
2. **A part-capped match banks the remainder, clamped — not zero.** A man with
   10 points of headroom fighting a match worth 30 banks 10. Dropping the whole
   match at the boundary is a cliff a player would feel and could not see.

### 5.5 The numbers are guesses, and are labelled as such

**0.3 and `SOLO_DAILY_CAP` are not derived from anything.** 26 players and 85
matches is not enough data to fit them to. They ship as named constants whose
comments say they are unvalidated, and they are revisited once the map has
moved for a fortnight. Recorded here so that a later session does not find them
and assume they were measured.

---

## 6. P1b — the Moot, and a map you can watch

### 6.1 The schedule is a constant, not a table

A fixed daily hour in `Europe/London`, held in `war.mjs`. Testable with no
database, in the module that already owns the season's arithmetic.

A table is what you build when the schedule needs to vary. It does not yet.

### 6.2 Three surfaces

- **A countdown** on the landing page and on `/factions`: *"The Moot convenes
  in 3h 12m."*
- **The 1.5× bonus** of §5, which makes attendance mechanically worth something
  rather than only socially.
- **`/factions` polls.** `WHAT-THIS-GAME-IS.md` §3.1 lists *"the map is not
  live"* as an open gap: it reads the war when it opens and never again. This
  is the payoff surface for everything else in P1 — **a map that moves and
  that nobody can watch moving is not the feature.**

### 6.3 Push — last, and cut-able

`public/sw.js` exists and caches nothing, deliberately. (`PLATFORM-PATH.md` §6
says *"No service worker, deliberately"* and has been stale since the PWA shell
shipped one on 1 Sep. Corrected there.)

Push adds `push` and `notificationclick` listeners to that worker. **It adds no
fetch handler**, so the file's stated law — that the browser's network stack
serves everything byte for byte — is untouched. Plus a `push_subscriptions`
table, a VAPID keypair in the deployment environment, and a dispatcher firing
about fifteen minutes before a Moot.

**The honest caveat, before it is built:** iOS delivers web push only to a PWA
installed to the home screen. A meaningful share of phone players will never
receive one, whatever is built here. That is a property of the platform, not a
defect to be fixed later, and it is the reason this item is last and may be
cut without the rest of P1 losing its point.

### 6.3a As built, 7 Sep 2026 — and what is NOT built

**Do not read this section as "push works". The SUBSCRIPTION half works.**

Built:

* `public/sw.js` gains `push` and `notificationclick` listeners. **It still has
  no fetch handler** — the file's own law is untouched, and `shadercheck`'s
  sibling concern applies here too: a cache in this worker could serve a stale
  bundle against a moved wire protocol, so there is none.
* `push_subscriptions`, one row per endpoint, upserted. The endpoint IS the
  identity.
* `POST /api/moot/subscribe`, validating all three fields or refusing, and
  answering `localMode()` rather than an error when there is no database.

**NOT built, and none of it is hidden:**

* **The dispatcher.** Nothing sends a notification. There is no cron, no
  fifteen-minutes-before trigger, and no `web-push` dependency. A subscription
  row today is a row nobody reads.
* **The VAPID keypair.** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are the
  owner's to generate and set in the deployment environment. They are
  credentials and belong nowhere else.
* **The client-side subscribe call.** No screen asks for notification
  permission yet. The route exists; nothing calls it.
* **`profile_id` is always NULL.** The column exists for a dispatcher that may
  one day want to address a man rather than a browser. Resolving one here would
  mean trusting an id off the wire without its secret, or demanding a secret to
  subscribe to a notification, and neither is worth it.

**iOS delivers web push only to a PWA installed to the home screen.** A
meaningful share of phone players will never receive one whatever is finished
here. That is a property of the platform and it is why this was sequenced last.

---

## 7. How P1 is gated

The discipline is this repository's own: a gate, shown red before it is
believed green.

- **`wartest`** extends with the per-kind arithmetic, the cap, and the
  difficulty floor. Still no database, still seconds.
- **`wartest --prove`** gains three injected defects that must each go red:
  the weight ignored, the cap unenforced, a `friendly` match banking.
- **`warflow`** gains the end-to-end solo bank against real Postgres, cap
  enforcement across two matches in one day, and idempotency under retry with
  the new column present.
- **The Moot window across a BST/GMT boundary.** A real trap: a window computed
  in the wrong offset opens at the wrong hour for half the year, and does it
  silently.
- **Which rooms have ground at stake** — training none, friendly none, an
  ordinary room one. §5.0 says why that list is the correction it is.
- **The gate that would have caught §2.** An assertion that a representative
  alpha session — solo rooms, one human, ordinary difficulty — produces a
  **non-zero** war ledger. Per the standing instruction in `HANDOVER.md`:
  *a gate green because the case is absent is not a gate.*

---

## 8. Deliberately not in this cycle

- **Ghost opponents.** Fighting a recorded warrior from an enemy kingdom, both
  sides banking. The best of the three cold-start answers considered, and the
  most expensive; `replay.mjs` and `replaytest` mean the recording half already
  exists. Revisit once P1 has shown whether a moving map brings anyone back.
- **P2, the glTF loader.** Its own cycle. Procedural-first with a background
  upgrade and a live swap: the web keeps its four-second open, Steam and mobile
  load authored meshes immediately because the download has already happened.
- **P3, shipping.**
- **`neon_auth`.** Provisioned on the Neon project with **0 users**. Real
  cross-device accounts would serve `PLATFORM-PATH.md` §8.2's "one hoard, three
  keys" — and they contradict the anonymous `id + secret` door that lets a link
  open a game in four seconds with no sign-up. A P3 decision, recorded here so
  it is not stumbled into.
- **Rescaling the two existing `war_ledger` rows.** They are correct as banked.
