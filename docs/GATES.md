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

## What this does not mean

It does not mean lowering the bar. `docs/VISUAL-BAR.md` still says 8+ on every
axis, and *better than before is not a pass*. The point is to spend the
expensive resource — a browser frame on a machine with no GPU — on the judgement
that needs eyes, and to spend arithmetic on everything that can be measured.
