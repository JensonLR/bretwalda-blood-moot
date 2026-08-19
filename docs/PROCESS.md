# How we work

Written 12 Aug 2026, because the owner asked:

> "I think we need to review & improve our overall process of working to get the
> highest possible quality outputs but also being as token & usage efficient as
> possible without it damaging the output."

This is not a statement of good intentions. Every rule below is here because
something specific went wrong, and the incident is named. A rule without an
incident behind it is a rule nobody follows.

---

## Part 1 — Why work has failed here before

Four failure modes, all of them recorded more than once in this repository.

### 1. The ruler measures the wrong quantity — **ten instances**

The signature failure of this project. A harness is written, it passes, the
defect is still there, and the harness was never capable of seeing it.

Recorded instances include: `beardcount` welds triangles and counts islands, so
a beard that is a flat sheet passes; `beardseat` measures how far the beard sits
inside the neck, so a sheet that intersects nothing passes; `faceseam` v1 built
its centroid from mixed local and world coordinates and reported 22–29% of every
head inside-out; `beardvolume` gated on p10, which doubling `cut.thick` left
completely unchanged; `facecover` measured by part, then by colour, then by
amount, and all three answered a different question from the one asked.

**Instance ten was found today and it is the clearest of the lot.** Hair and
beard were dressed in `wool` for the entire life of the project. The owner
reported them flat four separate times. Four passes answered with *geometry* —
new shells, new hems, new hank profiles — because a beard looks like it is made
of the shape it is. Every harness this repo owns measures a **position** or a
**volume**, and not one of them could see that the surface had no **direction**
in it. The fix was one substance and two repeat values. Four passes of geometry
work were spent because no ruler existed for the property that was actually
wrong.

**Why it keeps happening:** *the harness is written by whoever is fixing the
defect, so it encodes that person's current hypothesis.* If the hypothesis is
wrong, the harness is wrong in exactly the same direction, and it then certifies
the wrong fix.

### 2. Deferred carve-outs — a measurement nobody has to look at is a measurement nobody looks at

Three found in one day: `cosmetictest` carved the Shadow Hood out of its hair
assertion; `wearmeasure` reported seven ungated flank windows under a line that
said `PASS`; `beardvolume` declined to gate at all. In each case the harness
*knew* and printed a note above a green verdict. The owner then reported all
three from screenshots, against tooling that had been calling itself green for
weeks.

### 3. Mirrored definitions — **four instances in `characters.ts` alone**

The same constant written twice, so editing one does nothing. Today added a
fifth variant of the same disease: `cheekOut` carries a long comment explaining
in detail why it must be `1.52`, and the code says `1.10`. The comment describes
an approach that was tried, reverted, and never un-documented — so the file
confidently asserts a fix that is not present.

### 4. Work lost to unverified agent claims

Sub-agents report success. Three times this session an agent's claim was wrong
and only independent re-measurement caught it. Relaying an agent's summary to
the owner without re-running the harness is how a defect gets marked closed
while it is still on screen.

---

## Part 2 — The rules

### R1. Pull the lever

> Change the constant you believe controls the number, **by a lot**, and check
> the number **MOVES**. If it does not move, you are not editing the thing you
> think you are editing — stop and find the real one.

Non-negotiable, and it is cheap. It caught `beardvolume`'s inert p10 and it
caught the `hairCeil` misdiagnosis. It would have caught the `cheekOut` comment
in seconds.

### R2. A new harness must be shown FAILING first

Proof-of-failure. Run the new harness against the build that still has the
defect and show it going red. A harness that has only ever been seen green is a
harness that has never been tested.

### R3. The fixer does not certify the fix — an adversary does

New this session, and it is the direct answer to failure mode 1. After a fix
lands, an **independent** pass must try to **break the verdict**: can the gate be
passed *without* fixing the defect? Can the defect be reintroduced while the gate
stays green? If either is yes, the ruler is wrong and the fix is unproven.

### R4. Every deferral rides the verdict line

If a harness measures something and declines to gate on it, the count goes on
the `PASS` line, in the same sentence, in the words a person will read:

```
PASS: the openings — WITH 6 ungated window(s) reported above,
      which is a deferral and not a clean sheet
```

Declining to rule is often correct. Hiding that you declined never is.

### R5. Open the render

Three of the four defects the owner reported on 8 Aug were invisible to every
number in the repository and obvious in one PNG. **Before telling the owner
anything is fixed, look at it** — at portrait range, front and three-quarter, at
fight distance. The owner's instrument is his eyes, so ours has to be too.

### R6. The owner's words become a named check

When the owner reports a defect, the fix is not complete until some harness
would have caught it. Name the check after the report. `wearmeasure`'s window
note quotes the owner verbatim; that is the pattern.

### R7. Comment and code are one artefact

A comment that describes a value the code does not have is a defect, and it is
worse than no comment because it is trusted. When a value is reverted, the
comment is reverted with it or rewritten to say it was tried and rejected.

### R8. Never relay an unverified agent claim

Re-run the harness yourself. Report the number you saw, not the number you were
told.

### R9. Run the whole battery, not the one that moved

A fix is judged on every harness the area owns, not on the one it was aimed at.
Half the regressions recorded in Part 1 were bought by a number that went green
while the one next to it went red and was never run.

### R10. When the brief and the code disagree, say so

A brief is written by someone who read the code earlier than you did. Twice now
a round has opened with a briefed premise the code did not support — a frame
INTERVAL briefed as a frame WORKLOAD, and an overlap figure briefed at a
magnitude that would not reproduce. Both were caught by an agent who checked
rather than complied. Report the disagreement in the deliverable, with the
reading that settles it. Complying with a wrong brief is not obedience, it is a
defect with a citation.

### R11. Name the stage of every performance fix, and do not reach for stage 6

Every way of making a frame cheaper sits somewhere on this ladder. Stages 1-5
leave the picture the player sees **identical**. Stage 6 changes it.

| stage | what it does | example |
|---|---|---|
| 1 | draw nothing that is not seen | frustum and edge culling, retiring a quad at zero opacity |
| 2 | do the same work fewer times | cache a glyph texture instead of rebuilding it per spawn |
| 3 | do the work off the hot path | build a warrior's geometry once at spawn, not per frame |
| 4 | make the same work cheaper | tighter maths, fewer allocations, no per-frame garbage |
| 5 | draw the SAME pixels in fewer calls | merge by material, instance repeats, atlas textures |
| 6 | draw fewer or worse pixels | render scale, resolution, blur, LOD, killing lights, dropping shadow casters |

Name the stage in the commit message. A stage-6 change is sometimes the right
answer — but it is a **design decision about what the game looks like**, it
belongs to the owner, and it must never be reached for because it is the
quickest way to move a number that a reviewer will read. If the honest answer is
that the stage-5 fix is expensive, say that and cost it. Refusing stage 6 in
writing, with the two easy levers named, is a result and should be reported as
one.

---

## Part 3 — Token and usage efficiency

The owner's constraint: *highest quality output, least usage, and efficiency
must not cost quality.* These are the levers that save tokens **without**
weakening any rule above.

### E1. Delegate reading; keep deciding

`characters.ts` is 16,800 lines. Pulling it into the orchestrator's context to
find one constant is the single largest avoidable cost in this project.
Sub-agents read; they return **the conclusion and the line number**, not the
file. The orchestrator decides.

### E2. The orchestrator stays under half its context

The owner's own instruction, and it matches what has been observed: past ~50%
the output pads and drifts. Practical consequences — read *slices* of large
files, never whole ones; grep for the line, then read ±20 lines; never re-read a
file just edited; hand long harness output to `grep` before reading it.

### E3. Measure with the cheapest instrument that can see the defect

The instruments, in ascending cost:

| Instrument | Cost | Sees |
|---|---|---|
| `tsc` / `eslint` / `csscheck` | seconds | syntax, types, CSS structure |
| substance and geometry probes (`hairmap`, `beardvolume`) | ~30 s | material and mesh properties, no GL |
| headless harnesses (`cosmetictest --no-render`, `wearmeasure`) | 1–15 min | coverage, fit, stack |
| `shoot` renders | 2–20 min | **what it actually looks like** |
| a full gauntlet | an hour+ | regression across the whole game |

Go **down** this table for iteration and **up** it for verdicts. Today's hair
work took four iterations on a 30-second probe and one render — rather than four
renders, which is roughly an hour saved with no loss of rigour.

### E4. Write the probe before the fix when the property is new

A probe that runs in 30 seconds and answers one question pays for itself on the
second iteration. `hairmap.mjs` caught two of my own errors — a Nyquist fault and
a warp-amplitude fault — that a render would have shown only as "still looks
wrong", with no indication of which of eleven constants to move.

### E5. Batch renders; never re-shoot the whole armoury for one slot

`shoot` takes named sheets. Shoot `beards`, not `armoury`.

### E6. Parallel agents need *disjoint* files

The one hard constraint on fan-out. Two agents editing `characters.ts` in
separate worktrees produce a merge conflict in a 16,800-line file, which costs
more than doing the work serially. Partition by **file**, not by feature.

### E7. Fail fast on limits

A workflow that dies on a usage limit loses everything its agents had done —
this happened today, six agents and 478k tokens returned nothing. Prefer several
small workflows whose results land and commit, over one large one that must
survive to the end.

---

## Part 4 — The shape of a piece of work

1. **Read the owner's words.** Quote them into the brief verbatim. They are the
   acceptance criteria.
2. **Find the cheapest instrument that can see it.** If none exists, write one
   (E4) and show it failing (R2).
3. **Fix, pulling the lever** (R1) at every step.
4. **Re-measure**, and **open the render** (R5).
5. **Adversarially verify** (R3): try to pass the gate without the fix.
6. **Put deferrals on the verdict line** (R4).
7. **Commit with the incident in the message**, so the next person inherits the
   reasoning and not just the diff.
