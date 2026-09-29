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

**BUILT on the server 13 Aug 2026, PLAYED, AND REMOVED 20 Aug 2026.** The full
record is `docs/MERCY-REMOVED.md` and it must be read before anyone acts on the
paragraphs above, which are a review of a screen and not of a fight.

Two reasons, and the owner found both by playing:

1. **It froze men in the middle of live rounds.** `goDown` fired on ANY player
   reaching 0 health — not the last man standing, not the end of a round — and
   parked the floor clock for 2.5 s so the client drew him standing bolt
   upright while seven other men fought around him. `gravitytest` §1 measured
   159 of 159 frames under 37° from upright, 2.65 s unbroken, then 73.8° of
   trunk in ONE frame at 60 fps when the window shut.
2. **It is Roman, not Anglo-Saxon.** Spare-or-kill over a downed fighter on a
   crowd's signal is *missio* and *pollice verso* — arena procedure. The nearest
   English thing, `grið` / `feorhgrið`, is quarter **granted by a lord** or
   **asked by a man who yields**, settled afterwards in law and *wergild*. It is
   not a timed choice mid-melee, and this game is a moot, not an amphitheatre.

**What survives, because none of it depended on mercy:** state the pressure
socially rather than as a meter; a window DRAINS rather than counting down (the
riposte's `vulnerableTimer` already does, see `docs/WEIGHT.md`); and the absence
of an act can itself be an act the game names out loud. That last one is the
idea worth rescuing, and `grið` — a beaten man **asks**, a lord **grants** — is
the honest shape for it, because it is player-initiated and parks nobody's
body.

## 9. What it correctly left open

Four things it declined to invent, and declining was right: the ranked-title
plates and the season-crowning ceremony, the finisher and spectator layer,
per-ground palettes for the other maps, and the Steam capsule set. Guessing would
have put made-up design into a system whose entire value is that it is exact.

Three of those four are Wave 4 and 5 work in `BACKLOG.md` already. The season
crowning is the one to design first, because `WHAT-THIS-GAME-IS.md` makes the
Bretwalda title the top of the whole game and there is currently nothing at the
top of it.

---

## 10. The type ramp — 9 September 2026

The interface looked like it was ignoring this document. Counted across the two
largest UI files, `page.tsx` and `GameHud.tsx`: **178 raw hex literals against 3
`var()` reads.**

It was not indiscipline, and the count is the wrong way to read it. **133 of the
178 were six values, every one of them a text colour, and not one had ever been
declared.** The token block covered the faction fields, the two metals and
fifteen thumb pads. The workaday ink that carries nearly every word in the
interface had no name — so there was nothing to reach for, and a literal was the
only thing anybody could write. (The remainder was mostly `#f6dda0`, which is
`--gilt-lit` spelled out by hand. *That* was the discipline problem, and it was
three sites.)

So the fix was a missing layer:

```css
--ink-bright: #f3ecdc;   /* headings; the emphasised word inside a line */
--ink:        #d9cdb2;   /* body copy */
--ink-soft:   #b6a888;   /* supporting copy that still reads easily */
--ink-dim:    #a89a7c;   /* the most common voice — labels, units, captions */
--ink-faint:  #7d7057;   /* present but receded — hints, disabled, metadata */
--ink-ghost:  #5b5140;   /* structural traces; the quietest thing still ink */
```

**Named by role, not by material.** The material story — limewash over bone,
with the ink's top end kept short of white so the fall down a letter has
somewhere to go — is real and is told in `globals.css` and in `hud3d.ts`. But a
ramp's job is to carry hierarchy: a screen has to answer *what matters here*
before it answers *what colour is this*, and `--limewash` cannot be stepped up
or down while `--ink-dim` can.

145 sites converted, values unchanged, so nothing moved on screen.

*(The three lowest steps above were re-based on 29 Sep 2026 because the bottom
one was under the contrast floor. Current values, and why, are in section 11.)*

### Two things worth keeping

**Verify tokens in the compiled sheet, not the source.** Eleven of the
converted sites carried opacity modifiers (`text-[var(--ink)]/90`) and there was
no precedent anywhere in this codebase for `var()` under a Tailwind opacity
modifier. It compiles: a plain-colour fallback rule, then
`color-mix(in oklab, var(--ink) 90%, transparent)`. `hover:`, `!important`,
`border-` and `decoration-` variants all resolve. None of that is visible from
the JSX.

**`csscheck` gained a sixth check, and it is a ratchet rather than a bar.**
Check 5 catches a `var()` with no declaration — the opposite fault — and is
blind to a hardcoded colour by construction. "Zero literals" would be a lie that
invites suppression: the 28 that remain are genuine one-off accents that earn a
literal. So the rule is *no more than today* (15 in `page.tsx`, 13 in
`GameHud.tsx`, down from 136 and 42), plus one thing forbidden at any ceiling —
**a literal spelling out a colour that already has a token**, which is the one
fault the gate can name the fix for. A new colour either belongs to the ramp, or
is worth naming and raising the ceiling for in the same commit.

### Closed: the two health bars now speak one language

The local warrior's health was drawn twice and the two disagreed about what
*wounded* looks like — `GameHud.tsx` in green → amber → red at 0.50/0.25,
`hud3d.ts` in sage → brass → oxblood at 0.55/0.28. One of those palettes is this
game's and the other is any game's, and a player looking from his own bar to a
foe's plate was reading two answers to one question. `hud3d.ts` knew, and its
only mitigation was to dim the local plate to `alpha *= 0.86`.

The DOM bar now takes `hud3d`'s three colours to the byte, at `hud3d`'s
thresholds, as `--hp-healthy` / `--hp-wounded` / `--hp-critical` and their lit
ends. Those three were each argued in that file — brass because the old amber
"is not brass, it is the yellow the review called out"; oxblood because "dried
blood has brown in it" — and there was never a reason for a second set. The bar
keeps its gradient, because a flat fill reads as a sticker at that size.

**Two moves were considered and one was wrong.** Dropping the local 3D plate
would have removed the duplication too, and it loses information: the grace gild
— *this man cannot be struck yet* — rides the bar's own frame in the shader
(`col += uGuard * GUARD_GILT * rim * bevel * 0.28`) and that plate is the only
place a player learns he is still un-strikeable.

**And losing the red loses no warning.** The alarm was never in the bar:
`postfx.setPressure` closes the frame in over the last 35% of health as a ramp,
which is the read `hud3d.ts` describes as one "you get pre-attentively without
decoding a colour code". What went is a redundant second colour language.

---

## 11. The cold palette is built — F1, 29 September 2026

Section 1 adopted Trewhiddle as the thesis and `grep niello src/` found nothing.
The overhaul's first landing that touches the stylesheet (`UI-PLAN.md` section 3,
F1) is the missing vocabulary and the one mechanism that moves about 300 call
sites onto it without editing them. What it is, and what it deliberately is not.

**Tokens.** `niello`, `niello-raised`, `niello-line`; `silver`, `silver-lit`,
`silver-dim`; `pewter` (non-text only); `--hall` for the page ground; `blood`,
`madder`, `woad-team`; the four peoples' fields and their `-lit` text steps
(declared for the war layer, read by nothing yet); the type scale and its
`.t-*` classes; `.nums` for figures. **Gilt is declared reserved** (the helm's
crown, the Bretwalda title, a won-season plate, the season leader's coast) and
none of the existing sites was moved, because they belong to the units that own
the components.

**The ink ramp was re-based.** `--ink-faint` was `#7d7057`, which is 2.78:1 on
the lit top of a card, 3.60:1 on niello-raised and 3.90:1 on the page. 44 sites
set words in it. The steps are now `#c6b999` / `#b5a788` / `#a39679` (9.0, 7.4
and 6.0:1 on niello-raised; 6.9, 5.7 and 4.6:1 on the card top), chosen so that
soft, dim and faint stay three steps and do not collapse into one. `--ink-ghost`
is for rules, never for words.

**The remap.** Tailwind's amber, yellow, orange, purple, emerald, sky, cyan and
red, every shade 50 to 950, resolve through three ramps declared on `:root`
(`--ramp-warm-*`, `--ramp-cold-*`, `--ramp-blood-*`), each entry another palette
token. It is a top-level `@theme inline`. Three things about it are not obvious:

* A shade left undefined does not fall back, it makes the utility vanish, so all
  88 are defined rather than resetting the namespace.
* The ramps are ordered by lightness like the scales they replace, so `hover:`
  and `/40` mean what they meant. Chroma is what is lost, on purpose.
* Purple is not "removed": the plan said so, and a removed hue silently makes
  `text-purple-300` inherit whatever is around it. It maps to the warm ramp, which
  is where its one use (the ability name) will end up in any case.

**What it costs, said plainly.** Two of the class card's four stat bars
(`bg-emerald-500`, `bg-sky-400`) are now near-neutral silver. `tools/cardgate.mjs`
and `classmatrix` read those bars as runs of SATURATED pixels against a neutral
track, so they will see fewer bars than they used to. That is unit L's to fix
(`UI-PLAN` D05: "land `cardgate` first"); F1 does not fix it and says so here.

**Hover and zoom.** Hand-written `:hover` rules and `hover:` utilities are behind
`(hover: hover) and (pointer: fine)`. `maximum-scale=1, user-scalable=no` are
gone, `.shell` no longer forbids pinch, and the fight carries `.fight-root`
(`touch-action: none`) so a pinch cannot fire mid-fight. `forced-colors` and
`prefers-contrast: more` have blocks.

**And it is held by a gate, not by this paragraph.** `palettecheck`,
`csscheck` checks 7-13 and `numeralprobe` are in `docs/GATES.md`; the one lesson
worth repeating here is that the first draft of the hover override compiled
cleanly and deleted every `hover:` utility in the app, and only a gate that reads
the **compiled** sheet noticed.

---

## 12. The plate is built: F2, 29 September 2026

Section 11 built the cold palette and left the material. Every panel, chip and
control was still a rounded brown gradient with a 6px blur behind it and a glow
on it (`UI-PLAN` D02: "a settings dialog with a warm border"), the primary was
an orange gradient under a comment that said "gilded bronze", and a disabled
button was the same orange at `opacity: .55`. F2 replaces the recipe. What it is,
what it is not, and what the other units get.

**Two faces of one metal, and a track.** A NIELLO plate (dark ground, a hairline,
type in the ink ramp) is the default for every panel, chip and control. A SILVER
plate (ink `#111013` on `#d5d6d3` to `#b9bab6`, a 6% sheet and not a bevel) is the
one hero a screen has: its primary action, or its item plaque. A TRACK is a
niello plate that holds others (the tab strip, the segmented control). Silver is
`.plate-silver` and `.btn-primary`; niello is `.plate` and every other class in
the table below. A screen that wants to say "this one" says it with luminance,
because there is no second accent.

**Cut, not rounded.** The shape is a `clip-path` polygon with the four corners
taken off at 45 degrees: 8px for a panel, button and field; 6px for a track; 4px
for a chip; 5px for a combat plate (`.plate-hud`). There is no `border-radius` on
a plate. Round survives only where this document already allowed it: a thumb pad,
the mark roundel (`.medallion`), a pip, and a keycap's 2px.

**How it is drawn**, because a clip-path forces the whole recipe. It clips
everything outside the polygon, including an outline and a shadow on the same
element, so: the four straight edges are a real 1px `border` (a call site's
own border colour, `border-l-4` and `divide-x` keep working); the four diagonals
are corner tiles at the head of the `background`, a 1px stripe on each cut in the
colour of the edge it continues (the top edge and its two diagonals catch the
light, `--edge-lit`); the inlay is a chamfered ring 5px inside the edge, a polygon
with a hole in it on `::after` at `z-index: -1`, its own cut 2.93px smaller than
the outer so that all four diagonals stay parallel and equidistant; the grain is a
160px inline-SVG tile of `feTurbulence` at about 7% alpha (white on niello, black
on silver), zero requests. Inputs and selects cannot have pseudo-elements, so a
field gets the corner tiles and no inlay. Focus is an outline at offset -4px in the
plate's own `--focus-ring`, inside the cut, so it is not clipped away; its four
corners are cut by the chamfer, which is the look. Lift is a `drop-shadow` on a
WRAPPER (`.plate-lift`), because a shadow on the plate is clipped by the plate.

**What a plate never has:** a radius, a `backdrop-filter` (switched off with
`!important` so that a call site's `backdrop-blur` cannot put glass back), a glow,
a `text-shadow`, or `opacity` to say disabled.

**Disabled is a different plate.** Niello, type at `--ink-faint` (6:1), no lit
edge, no grain, a not-allowed cursor; `[aria-disabled="true"]` draws the same
plate, because a control that must stay focusable so a screen reader can reach
the reason it is unavailable cannot use the attribute. The reason is printed under
it in `.plate-reason` (14px, `--ink-soft`). Never a tooltip, never colour alone.

**Selected is luminance.** A selected tab or segment is a `--silver-dim` fill with
ink on it (5.65:1); a selected card is a 2px silver inlay on a plate one step
lighter. The second orange is gone.

**Type on silver.** Custom properties inherit and can be overridden per element,
so `.plate-silver`, an enabled `.btn-primary` and `.kbd` turn the ink ramp, and the
three Tailwind ramps that `@theme` remapped, over: `text-[var(--ink-dim)]`,
`text-amber-300` and an icon on `currentColor` all come out as dark ink on the
metal without a call site changing. A primary inside a silver plate would be silver
on silver, so inside one it is the plate turned over (niello, silver type).

**Ornament.** Compartmented and dark on metal (UI-PLAN 1.6). Rules are runs of 42px
cells with 6px between them (`--rule-cells`), never a line to the edge of a panel:
`.section-title::after`, `.rule-label`, `.divider`. `.ornament-line` is one cell
between two solid end caps. `.knot-band` is a plait between end caps with a
ring-and-dot pellet in the middle, and the plait now has its gap: the strand that
goes under is cut where it meets the one that goes over (4.15px of arc each side,
computed from the crossing angle, not judged by eye), which is the whole difference
between a plait and a chain. `.card-noble` wears four ring-and-dot pellets in place
of the four garnet studs. `.cabochon` keeps its domed highlight and loses its glow.
`.label-overline` is 12px at .22em in silver-dim (it was 10px at .42em in gilt with
a shadow). `.section-title` is 1.5rem (it was 11px).

**What each unit gets.** Every class name still works. New: `.plate`, `.plate-silver`,
`.plate-hud`, `.plate-lift`, `.plate-reason`. `.warcode-frame` stays niello for now:
its contents are light type on dark and turning the frame silver would strand them,
so unit L opts in with `plate-silver` when it re-marks that block (the flip above
makes the change safe). `.card-glow` and `.card-glow-green` are kept as names for
their call sites and mean only "one step lighter in the face"; L deletes the
uses.

**Held by** `tools/platecheck.mjs` (the compiled sheet, then every control rendered
and driven through every state) and the plate census in `tools/uishots.mjs` (the
same computed-style audit over every real screen). See `docs/GATES.md`.
