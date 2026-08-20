# Gates: how to get the quality without the five hours

Passes have been taking three to five hours while this container restarts every
one to three. That is a structural mismatch, and it has already destroyed whole
waves twice. This file is the fix, and it is built on measurements rather than
on a feeling that things should be quicker.

---

## What actually costs the time

Measured on this box, which has no GPU and rasterises in software:

| thing | cost |
|---|---|
| `cosmetictest` default (26 browser captures) | **1192 s** |
| `cosmetictest --no-render` (same 47 options, CPU) | **56 s** |
| the CPU silhouette rasteriser, 47 options × 2 lenses × 2 bearings | **15 s** |
| `headmeasure`, `wearmeasure` (CPU, 32 heads) | seconds |
| first browser frame (texture library + PMREM bake) | **8.4 s** |
| one armoury thumbnail | ~1.5 s |
| one `/shot` sheet | 2–3 min |
| `playtest` / `touchtest` | minutes, and **flaky 1 in 3** |

**The CPU instruments are twenty to forty times faster than the browser ones and
they catch most defects.** `cosmetictest --no-render` found four cloaks that were
one cloak. `wearmeasure` found helmets shearing through skulls. `headmeasure`
caught the muzzle that eight tuning passes missed. None of them opened a browser.

The browser is needed for one thing only: **the final look**. Everything else is
arithmetic.

## The three-tier gate

**INNER — every change, ~90 seconds, no browser.**
`npx tsc --noEmit`, `node tools/headmeasure.mjs`, `node tools/wearmeasure.mjs`,
`npm run cosmetictest -- --no-render`.
This is the loop. Iterate here. It catches type errors, geometry punching
through skin, silhouette failures, and cosmetics that do not differ.

**MIDDLE — once per unit before it reports, ~10–15 minutes, one browser.**
`npm run build`, then **one batched capture session** producing every sheet the
unit needs, then `playtest`, `touchtest`, `summaryflow`.
One session, not one per sheet — the 8.4 s first frame is paid once.

**OUTER — once before a merge, never per agent.**
The full eighteen-harness gate with a fresh postgres. It is the merge gate, not
the working gate. Running it per agent is where hours go.

## Five rules that cost nothing and save hours

1. **One concern per unit, merged on its own.** The face landed because it was
   judged and merged alone in twenty minutes. The wave around it died twice and
   delivered nothing. A unit that merges cannot be lost to a restart.
2. **Never poll for a capture.** `until [ -f … ]; sleep 20` has burned tens of
   minutes of pure wall clock in this project, and one agent spent forty
   `echo standby` turns waiting for a tool that had already died. Run captures
   synchronously with a real timeout, or batch them and do other work.
3. **Never run two capture tools at once.** Every frame is CPU-rasterised, so a
   second tool starves the first and looks exactly like a hang. This means **one
   capture-owning agent per wave**, not four — parallelism past that point is
   negative.
4. **Push every ten minutes.** Seven restarts. Non-negotiable.
5. **Pipeline, do not barrier.** A judge that waits for four agents inherits the
   slowest one plus its own hour. Let each unit verify and land as it finishes.

## The one fix that pays for itself immediately

`playtest` and `touchtest` flake one run in three, and they are the two slowest
browser harnesses. Every flake costs a full re-run, so the expected cost of the
pair is about 1.5× their runtime, and a wave that runs them four times pays it
four times. Making them deterministic is **backlog item zero** and it buys back
more wall clock than any other single change.

## The colour gates — `teamread` and `factionread`

Two harnesses, one instrument, one rule. `docs/FACTIONS.md` §8: **team colour
beats clan colour beats faction colour beats bought cosmetic** — and each of
these files gates one rung of that ladder at the distance a player fights.

| harness | costs | answers |
|---|---|---|
| `node tools/teamread.mjs` | ~1 min, no browser | can a stranger tell friend from foe at 6.8 m, over every finish × cloak × class × bearing, both sides |
| `node tools/teamread.mjs --off` | ~1 min | the control. Both sides with no team, i.e. the pre-override game. **Must fail** |
| `node tools/factionread.mjs` | ~3.5 min for §0–§5, then ~55 min for §6/§7 (165 captures at ~19 s on a GPU-less box at load 5) | are the four peoples four men at 6.8 m; does any of them cost a point of anything; is the paid ladder still a ladder after a man swears — **on the kit mean AND on every surface one at a time**; does anything a livery makes blow a channel under the fire; and what COLOUR is each of his surfaces on a graded frame |
| `node tools/factionread.mjs --off` | same | the control. All four peoples as the unsworn. **Must fail** |
| either, `--sheet` | +seconds | the flat-albedo contact sheet in `art/look/`, which is the thing to actually LOOK at |

**They share a rasteriser and a verdict quantity on purpose.** A warrior's
signature is his area-weighted mean albedo over the pixels he covers at the play
lens, averaged in linear light, converted to CIELAB, and gated on the CHROMA
PLANE with lightness dropped — because a cloaked man and a bare-backed man on
one side are 30 points apart in LIGHTNESS and nobody has ever confused them.
Both bars are borrowed from `cosmetictest`: ΔC 10 is `LADDER_DE`, "what a PAID
rung has to clear to be a different colour at a glance", and ΔC 2.3 is its JND.

**`factionread` is two gates in one file and the second matters more.** §1 asks
whether four peoples are told apart; §3 asks whether any of them is told apart
by anything a fight reads, and it runs the real `engine.mjs` twice — one room
where every man declares a people in his appearance and one where none does —
and requires every published field of every man to come out identical over a
played match. A harness that only measured §1 would go green on a build that
gave the Picts more health, because more health is invisible in an albedo
buffer.

**§2 is where the two files meet.** Four peoples on ONE side must collapse to a
single colour at ΔC 0.00 — not to a tolerance — because the precedence
resolvers return on the team before a people is consulted. The reason the bar is
zero rides the same output line: garnet sits ΔC 7.3 from madder and the Pictish
woad ΔC 15.4 from the team's woad. They are the same two dyestuffs, so a leak
here is a man who cannot tell an enemy from a countryman.

**§5 and §6 were added after this file passed 15/15 with three defects live in
it**, and both are about a question that was being asked NEXT TO the one that
mattered.

§5 gates the PAID LADDER through the shipped resolvers —
`kitFor(finishKit(value), team, people)` — instead of through the stored hex.
`cosmetictest` §2 already gates this ladder, on this constant, and could not
have seen the defect: the seven stored numbers are the same seven numbers
whatever a man swore to, and it was the RESOLVER that flattened them. Rough Iron
at 0 gold and Blackened Steel at 110 returned the identical hex on every dyed
surface under a Saxon livery. `rungcensus` could not see it either, and for the
more instructive reason: it counts connected components and triangles, and
nothing was deleted. The colour was flattened. A census of parts cannot see a
flattened colour, and this project's signature failure is a measurement
answering the wrong question.

§5 gates `cosmetictest`'s own two rules on the resolved kit — NO TWINS (no two
rungs are one swatch) and NO REFUND (no paid finish reads as the free one) — and
**reports the stricter `LADDER_DE` reading with its number on every run rather
than gating it**. The file carries the whole argument and the five
configurations it was measured on: the shop's own tightest pair is ΔE 11.85
apart unsworn, so a livery has 1.85 points of room and would have to be nearly
an isometry, and every configuration that recovered the ladder to ΔE 8–9 let a
160-gold finish out-vote a people — §1.3 at **-173°**, the identity read
inverted. A bar is never moved to buy a pass; adopting one the game cannot meet
and then not printing the shortfall is the same offence facing the other way.

**AND BOTH OF THOSE RULES ARE ASKED TWICE — once on the kit mean and once per
surface — because the mean divides by six.** §5.1/§5.2 average ΔE over the six
dyed surfaces, so a byrnie that collapses all the way to ΔE 0.00 costs the mean
at most a sixth of what it was worth, against a bar the unsworn shop clears by
1.85 points. §5.0b is the proof and it is a control, not a claim: give the
shop's dearest finish the cheapest one's byrnie and the mean still reads ΔE
18.77 over a bar of 10 while the mail reads 0.00. §5.1b and §5.2b ask the same
two rules of one surface at a time, and the UNSWORN column is printed beside
every livery so the floor is visible rather than asserted — `main`'s own shop
has **no** pair of finishes within a JND on any single dyed surface and its
worst single-surface pair anywhere is ΔE 7.18.

§6 and §7 are **the lit sections**, and they exist because three
rounds of this feature shipped a defect past a harness with no light in it. It
boots the app, drives the real renderer at the play lens, and counts pixels at a
fully clipped channel inside the warrior's own coverage mask — the mask, not the
frame, because the bonfire is behind him and contributes about a tenth of a
percent of every capture including the unsworn ones. The bar is the UNSWORN man
in the 400 gold Gilded War Cloak and the 160 gold Bretwalda Gold finish: the
brightest dress a player can buy, so the bar cannot be moved without brightening
something people own. §6.0 proves the counter can count and §6.2 proves the
capture repeats, because a clip count is exactly the statistic a moving fire
moves. **§6.0c proves the mask is the man**: `/shot` publishes the appearance it
staged and the mask is built from that, checked slot for slot on every capture
in the run. It used to be built from `defaultAppearance` — for a huscarl a nasal
helm and a red cloak the card does not stage — and was 20.3% / 25.8% / 32.8%
larger than the man in the frame at the plan's three bearings.

**§7 asks what colour he is, and §7.1b asks it one surface at a time.** §7.1
counts the share of the man inside `roseband`'s pink band against the SAME MAN
IN THE SAME KIT sworn to nobody. Over the whole warrior mask that dilutes: a
byrnie is about half of him and the other five surfaces are not pink, so a
byrnie 19% inside the band moved the shipped whole-man figure by 0.391 points
and was called noise. §7.1b cuts the frame into the surfaces the vat dyes —
`tools/lib/surfacemask.mjs`, off the client's own scene graph at the capture's
lens, the sworn frame and its control read through the same array — and §7.1c
gates the LIFT in value where the surface lands on the red arc, which is where
`docs/FACTIONS.md` says lifting is the defect rather than the design.

**Both files record a ruler they had to correct, in the file, with the reading
that forced it.** `teamread` first gated on full ΔE and called two red-team men
opposite sides for being 30 apart in lightness. `factionread` first asked which
field a man's chroma was NEAREST and called a Saxon in Blackened Steel a Briton,
at -27.66, for being DARK — the chroma plane's RADIUS, not its angle, and moss
is the least chromatic of the four fields. Both corrections are strictly
tighter, both print the old quantity beside the new one, and neither is a bar
that moved.

## Two gates that carry their own proof — `classmatrix` and `gorestat`

Added 2026-08-13, because two existing rulers were caught not discriminating and
the repository now has **thirteen** recorded measurements that answered the wrong
question. Both of these run their own falsification on every invocation, which is
the only arrangement that has ever survived an adversary here.

| harness | costs | answers |
|---|---|---|
| `node tools/classmatrix.mjs` | ~4 min, one dev server, one browser | do the class cards DRAW four different numbers as four different bars — measured in pixels, at 390 px and 1440 px |
| `node tools/gorestat.mjs` | ~6 min, no browser | can the pulse gate rank two known-different sprays, and is the bystander cell a property or a coin |
| `node tools/gorestat.mjs --quick` | ~2 min | the same, at a third of the sample, for iterating |

### What "carries its own proof" means, concretely

**`classmatrix` mutates the thing it measures, twice, on every run.** The gate it
replaces read `page.tsx` for typed maxima; an adversary changed the drawn geometry
and the scan never moved. So this one:

* takes a real screenshot, decodes it, and measures each bar as a **run of
  saturated pixels** from the left end of its track — the rect is used only to
  find the bar, and claim 2 gates rect against pixels so that a clip or a
  transform between the two is a finding rather than a silence;
* injects a stylesheet that pins every fill to 100% and **requires its own
  discrimination claim to go from 0 faults to 24**, while printing that the source
  scan's verdict is unchanged, because it cannot see pixels;
* rewrites the served module in flight to make one class faster and **requires
  the drawn bar to move** — R1, inside the harness, with a control class proving
  the injection landed.

**`gorestat` builds its ladder out of the real module.** `vfx.ts` is transpiled
and the EMITTED javascript is rewritten — pulse floor, throw speed, and a counter
beside the emitter — so six known pulse depths can be measured on the real
emitter, real ballistics, real budget, without a single `src/` file changing. The
new metric is then gated against the depth that is **known in closed form** at
each rung, not merely against the ordering.

### The rule both of them encode

> **A statistic that is gated must also be shown to be finer than the thing it
> is measuring.**

Both incidents were the same shape underneath. The pulse metric's spread from
wound to wound was ten points while the difference it was asked to report was one
and a half, so the ranking was decided by which wound came up. The bystander cell
averaged six draws against a bar sitting on the mode, and fired about one run in
nine on an unchanged tree. Neither was wrong about the physics; both were rulers
with a scale coarser than the effect.

So `gorestat` gates its own stability: every bar it holds is resampled from the
pool it was computed on, and **a bar the sample cannot hold is reported as a
failure of the harness, in those words**. If `--quick` is too small for a bar, the
run says so and names the flag to raise rather than passing quietly.

### What each one says today, 2026-08-13

`gorestat` is **green, 19/19**, and every one of its proof-of-failure claims
reproduces: the old pulse metric cannot resolve a ladder it should walk up, and
the old bystander cell fires on an unchanged tree in most draws at 2.0 m.

`classmatrix` is **RED, 12 of 17**, and deliberately so. Three claims fail at each
width plus one shared:

* `5b` and `5c` — the runekeeper's speed bar does not move when the runekeeper is
  made 12% faster, and a 5.6 and a 5.0 draw the identical full bar;
* `7` — the card's stat table disagrees with `engine.mjs` on `moveSpeed` for all
  four classes.

Both are live defects in `src/`, both are written up in `docs/OPEN-DEFECTS.md`
with the fix named, and neither belongs to the unit that built the ruler. **A red
gate with a written defect behind it is the correct state**; a green one would
have required either fixing somebody else's file or moving a bar.

### Where they sit in the three tiers

`gorestat` is CPU-only and belongs in the **MIDDLE** tier, next to `goretest`,
whenever anything under `vfx.ts` moves. `classmatrix` needs a browser and a dev
server; it belongs in the **MIDDLE** tier for any change to the class roster,
`StatBar`, or `WARRIOR_STATS`, and in the **OUTER** gate otherwise. Neither is an
inner-loop instrument.

## What this does not mean

It does not mean lowering the bar. `docs/VISUAL-BAR.md` still says 8+ on every
axis, and *better than before is not a pass*. The point is to spend the
expensive resource — a browser frame on a machine with no GPU — on the judgement
that needs eyes, and to spend arithmetic on everything that can be measured.
