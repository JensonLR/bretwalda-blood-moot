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
