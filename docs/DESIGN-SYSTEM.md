# The design system, judged

12 Aug 2026. The owner had a design agent review the scrapped Bretwalda design
system and amend it for Blood Moot, and sent the review through with:

> "Design system file I sent isn't gospel as it's missing some of your context
> so tweak where needed but I do like parts of it."

So this file is the decision, not the review. Where I agree I say so briefly.
Where I depart I say what the review could not have known — because the
departures are all one thing: **the review was written against the system, and
this repository has constraints the system never saw.**

The headline: **the central thesis is right and I am adopting it.** Most of the
combat language is right and I am adopting it. Three things change, one thing
cannot be imported at all, and one "screen" is actually a game mechanic wearing
a screen's clothes.

---

## 1. The thesis — ADOPTED, and it is the best idea in the bundle

> Anchor on **Trewhiddle**, the ninth-century Wessex silver style with black
> niello inlay, from a hoard buried around 868.

Take it. Three reasons, and the third is the one that makes it more than taste:

* **It is our own decade.** 868 against the game's 878. `docs/FACTIONS.md`
  argues the roster is only honest in that one narrow window; the ornament now
  comes from the same window. That is a coherence the game did not have.
* **Nobody uses it.** Same argument as the Picts.
* **It solves the gore problem for free.** A cold palette makes blood the only
  warm thing on screen, so blood needs no glow, no pulse and no siren to read.
  That is a real saving: `docs/GORE-DESIGN.md` and the vfx work have repeatedly
  reached for intensity to make blood register. If the world is cold, it
  registers by being the only warm thing in it.

And the two ornament laws that fall out of it are keepers:

* **Ornament is dark on metal** — a niello line is *cut into* silver.
* **Ornament is compartmented** — bands with cut ends, small nicked fields,
  never a border running a panel's full length.

The second is the more useful of the two, because it is a rule you can be caught
breaking. A full-length border is exactly what a generic UI reaches for.

## 2. The one place I depart from the thesis: light plates in COMBAT

The review's law is "plates are light and their type is black". I am taking that
for **menus** and refusing it for the **combat HUD**, and this is the departure
the review could not have made because it never had to sit behind the game.

The reasoning:

* A menu screen **is** the subject. A silver plate with black type, in a game
  whose whole aesthetic is a hoard, is superb there — the screen becomes an
  object from the world rather than a layer over it. Title, Muster, Swear, the
  Armoury, Settings, the Reckoning: take it wholesale.
* A combat HUD **is not** the subject. The man is. A light plate over a night
  arena lit by one bonfire is the brightest thing on screen, and it is competing
  with the fight for the eye at exactly the moment nothing may. The thesis says
  blood is the only heat; a bright HUD does not break that — silver is cold —
  but it does break the *hierarchy*, which is the thing the thesis is really
  protecting.
* The fix keeps the law rather than abandoning it: in combat the plates are
  **niello-side-out**. Dark ground, silver line, silver type — the same
  material, read from the other face. It is still Trewhiddle; it is the inlay
  seen against the metal instead of the metal seen against the room. And it is
  arguable in one sentence, which a silent exception would not be.

One thing I checked rather than assumed: the DOM HUD is *not* inside the WebGL
auto-exposure meter (`GameHud.tsx` is React over the canvas; only `hud3d.ts`
nameplates and damage numbers live in the scene). So a light plate would **not**
have dragged the arena's exposure. That objection would have been wrong and I am
not making it. The objection above is about attention, not photometry.

## 3. Taken, essentially unchanged

**The wound ladder.** Six rungs, each with a shape signal as well as a colour —
hollow, stippled, filled-and-slashed, absent-with-a-seam, drips, prone. It
survives greyscale and colour blindness, which in a game read at a glance is
function and not courtesy. And "bleeding out is the only state allowed a pulse,
because it is the only one with a clock on it" is the kind of rule that keeps a
UI from becoming a fairground.

**The target mark.** This answers a defect already on our list — the current
indicator is logged as "too game-like and basic". Three questions, three
devices, and the parry tell lights *his* brackets for the window's real
duration rather than putting a bar on my HUD. Never a full box, never a rotating
reticle, never a mark over a face. That last one matters more than it looks:
this game spent eight passes on the face.

**The kill feed as chronicle.** Three colours only — my kill silver, my death
blood, everything else bone-dim. A feed where eight men each get a colour is a
feed nobody reads. `UNMADE` reserved for a severance is a genuinely good piece
of writing, and `BLED OUT` crediting nobody — and saying so — is honest where
most games quietly hand the kill to whoever swung last.

**The thumb-zone law.** 44 px floor for every control *including on desktop*,
56 px for anything pressed mid-fight, 132 px band a thumb reaches without
regripping. Combat controls inside it; confirmations deliberately outside,
because a thing you cannot take back should cost a small movement. That last
clause is the good part.

**And it becomes a gate.** `tools/touchtest.mjs` already drives 390×844 in both
handednesses. These are numbers, so they stop being a law and start being an
assertion — which is what this repository does with rules it means. That is new
work this document creates, and it is cheap.

**Hearth heraldry.** A Hearth inherits its kingdom's colour and may not choose
its own, because faction colour is how you read an enemy at range in an eight-man
brawl. This *converges* with `docs/FACTIONS.md` §3 from the opposite direction —
that file bans factions from carrying stats and from gating a queue; this bans a
clan from breaking faction legibility. Same instinct. Both stay.

**The aliveness law.** One living thing per screen, and it comes from the world
rather than the interface — embers off the bonfire, firelight on a surface,
blood creeping. Slow, unsynchronised, tiny. No spinners, no bounces, nothing
pulsing for attention. Reduced motion freezes it to a **lit still, never a dead
flat one** — that distinction is exactly right and almost always got wrong.

We already half-ship this: `HeroBackdrop.tsx` is an ember field with three depth
planes and turbulence as a function of height. The law says what it was reaching
for, so it stays and everything else comes to meet it.

**The glyph set.** 24 marks on a 24 px grid in one flat colour, and the faction
devices are *real objects* — the seax that names the Saxons, a Mjölnir amulet of
the kind dug out of York in exactly this decade, the triskele, the Pictish
crescent-and-V-rod. That is the standard `docs/FACTIONS.md` §6 sets for flags:
sourceable to a find, or labelled an invention.

**The bindings table.** Listening, conflict, and **browser-refused** — the
browser took the key and will not give it back. That third state is specific to a
browser-native game, nobody handles it, and we are a browser-native game.

**The brand mark.** Re-cut rather than redrawn; the crowned raven-helm geometry
untouched, only its metal moved. Gilt reserved for the crowned Bretwalda and
nothing else. That reservation is worth more than the mark — it means the game
has exactly one gold thing and you have to win a season to wear it.

## 4. Taken with corrections — where my context changes the answer

**The fonts: import nothing.** The review says to point two font variables at
`next/font`. It did not know that `src/app/layout.tsx:60` **already loads Cinzel
and Alegreya Sans from Google Fonts.** So the display face is already right, and
the body change it proposes — Alegreya Sans → Alegreya, the serif sibling — is
genuinely one word. Take the change; import nothing.

And this matters more than convenience: the bundle ships **27 `.ttf` binaries**.
This repository's no-binary-assets rule is not purity, it is why the game opens
from a link in about four seconds with nothing to download. Those files must not
come across. `opengraph-image.tsx` already demonstrates the sanctioned pattern —
fetch Cinzel at request time, fall back gracefully.

**The war map is already solved, and better than the review knew.** It correctly
cut the bundle's runtime `d3` + `topojson` fetch from unpkg — two CDN scripts on
the critical path, ~250 KB before a single territory draws, and a hard dependency
on a third party staying up. It then specifies "a slot for baked, pre-projected
path data the game owns."

**We own it already.** `src/game/client/factionMap/britain.ts` — Natural Earth
1:10m, Web Mercator projected, Douglas–Peucker simplified to 1,655 points across
43 polygons, committed as SVG path data. Public domain, text not binary. So the
"empty map well" the review ships as an honest placeholder should be wired to the
real coastline on day one. Keep `WarStandings`; drop the placeholder.

**The season plate and overnight ticker are the war layer's UI.** The review
kept them without knowing why they matter. `docs/WHAT-THIS-GAME-IS.md` §3 says
the reason to come back is *the map moved while you were asleep*. The "while you
slept" dispatch strip on the title screen **is that sentence, rendered.** It is
not a nice touch; it is the retention mechanic's only visible surface. Promote it
from decoration to requirement.

**The Armoury preview slot.** Right call — helms drawn as CSS `clip-path` blobs
would never survive beside the real thing. But the truthful empty state is a
stopgap, not a feature: we render helms procedurally already and `tools/shoot.mjs`
has an `armoury` sheet that captures every slot. The slot should be filled by the
game's own render, and the empty state should be the thing nobody ever sees.

## 5. Not taken

**The `.dc.html` template format** — correctly cut. `<x-dc>`, `<sc-if>` and a
`DCLogic` class are a design-tool runtime and cannot run here.

**The dead-palette aliases** — correctly cut. Badge `brass`, Readout `amber` and
`cyan`, Rule `diamond` and `sunburst`, Panel `green`. Names kept alive for a
scrapped game's colours only invite their reuse.

**The runtime CDN map** — see above.

## 6. What cannot be imported, and this is the blocker

The review's deliverable is **`bretwalda-ui/` — a token layer plus 33 components,
React + CSS Modules, no dependency outside React, typechecked and render-proved.**

**I cannot reach it.** `DesignSync` needs `/design-login`, which requires an
interactive terminal this remote environment does not have; `WebFetch` on the
design project URL returns 403. The review artifact itself is readable — that is
where everything above came from — but it is a *review*, not the code.

To land the components, one of:
1. **"Send to Claude Code Web"** on the design project — seeds the files here.
2. Commit `bretwalda-ui/` into this repo and I take it from there.
3. Run a session from the desktop app, where `/design-login` has a TTY.

Nothing in this document is blocked on that. The thesis, the laws, the palette
decision and the corrections are all actionable now, and §2 and §4 mean the
components would need editing on arrival anyway.

## 7. Its six defects — all real, and one is a lesson

The review found six genuine bugs in the delivered system. Two are worth
recording here because they are *this repository's own recurring faults wearing
someone else's clothes*:

* **`var(--noise-url)` is declared nowhere.** The token was renamed
  `--grain-url` during the pivot and `Panel.jsx` and `Dialog.jsx` were never
  updated, so the material-law grain overlay **silently failed on every panel and
  every dialog in the system**. A CSS variable that does not resolve does not
  throw — it just does nothing. That is precisely why `tools/csscheck.mjs`
  exists here, and it is the same class of failure as the malformed comment that
  silently discarded a media query. **Extend `csscheck` to fail on any
  `var(--x)` with no declaration of `--x` reaching the build.** That is new work
  this document creates and it is worth more than the fix.
* **Faction theming never reached the components.** Every component hardcoded
  its colours, so `[data-faction]` worked in the hand-written templates and did
  nothing inside the component library — *a design system whose theming hook
  only works outside the design system.* That is the mirrored-definition fault
  this repo has now recorded five times, in a different file format.

The other four — the lockups still reading "THE EMPIRE NEVER FELL" in the
deleted Jost, the five-digit hex `#04060` that drops a whole declaration,
racing-green `#071812` residue in `Dialog.jsx`, and the `--radius-0` "no rounded
corner anywhere" law silently contradicted by `border-radius: 50%` on the touch
pads — are all straightforwardly right. On the last one I agree with both halves
of its ruling: **the round pads are correct, because a thumb pad is not a plate**,
and the law needed a stated carve-out rather than a silent contradiction.

## 8. "Mercy or Finish" is not a screen

The review calls it "the strongest screen in the bundle" and it is right about
the execution: the pressure is stated **socially** — seven men are watching —
rather than as a meter; the window **drains** instead of counting down, because a
number invites the player to watch the number instead of the man; and **letting
it run out is itself a choice, and a merciful one**, which the screen says out
loud.

But the game has no mercy mechanic. This is a **feature**, and a good one, and
it belongs in the backlog rather than in a UI import:

* It is the sharpest expression of `WHAT-THIS-GAME-IS.md` §5 item 4, "being
  seen" — the whole point is that seven men witness what you choose.
* It gives the war layer a moral texture nothing else in the backlog does.
* It has real cost: a downed-but-not-dead state, a decision window on an
  authoritative 20 Hz server, and an outcome that has to mean something
  afterwards — spared men remembering, a reputation, something.

Filed to `BACKLOG.md` Wave 3, next to the class rework, because it changes how a
fight ends and therefore how a fight is fought.

**BUILT, on the server, 13 Aug 2026 — and it is not a fifth state.** It reuses
the knockdown wholesale: a downed man IS `knocked`, so `isDown` already refuses
him his swing, his guard, his turn and his stride, `knockDown` already strips his
i-frames and slides him off the blow, and the client already animates the fall.
What was added is three fields and one rule — `mortal` (this fall does not end in
getting up), `mercyTimer` (the draining window), `mercyTo` (whose choice it is,
the same shape the riposte's `vulnerableTo` already uses). All three are on the
wire, because the whole point is that the room can see it.

All three of the properties above are gated by `tools/mercytest.mjs`, and the
social one is gated adversarially: the window is opened in rooms of two, four and
eight men and the witness count must come back 0, 2 and 6. A hard-coded seven
passes any single-room test and was tried against this gate on purpose — it
fails, which is the point of writing it that way.

The outcome is a **reputation**: two counters, `menSpared` and `menFinished`, on
the results table the whole room reads. That was chosen over the three
alternatives in the bullet above and the reasoning is in `engine.mjs` at
`buildLedger` — the short version is that a spared man remembering evaporates at
the bell, a war-layer consequence cannot be built because Wave 4 does not exist,
and a private profile mark is those seven watching men leaving the room.

**The screen is still not built, and this section's own argument says how it
must be.** The window is published as seconds remaining plus its full length, so
a client forms a ratio and draws a shrinking mark; the protocol deliberately
ships nothing that reads as a countdown, because a number invites the player to
watch the number instead of the man.

## 9. What it correctly left open

Four things it declined to invent, and declining was right: the ranked-title
plates and the season-crowning ceremony, the finisher and spectator layer,
per-ground palettes for the other maps, and the Steam capsule set. Guessing would
have put made-up design into a system whose entire value is that it is exact.

Three of those four are Wave 4 and 5 work in `BACKLOG.md` already. The season
crowning is the one to design first, because `WHAT-THIS-GAME-IS.md` makes the
Bretwalda title the top of the whole game and there is currently nothing at the
top of it.
