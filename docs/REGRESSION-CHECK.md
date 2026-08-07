# Regression check — three checkable claims

The owner looked at the live game on 2026-08-07 and made three statements that
can be settled with evidence rather than opinion. This file settles them.

Method: build a commit in a worktree, capture the same screen with the same
tool, look at the frames. Nothing here is asserted from a diff.

**Status: IN PROGRESS — draft committed early so a container rebuild cannot eat
it. Sections marked TODO are not yet answered.**

---

## The deploy timeline, which changes how all three read

This was not known when the wave was briefed and it matters for every answer
below.

| When | `main` tip | What it contains |
|---|---|---|
| 2026-08-05 19:56 UTC → 2026-08-07 00:57 UTC | `cfb49fc` | everything up to the armoury-on-game-lights merge |
| 2026-08-07 00:57 UTC → now | `07dd3de` | the above **plus all of 2026-08-06's work** |

The live site deploys from `main`. So:

- What the owner's friend saw **yesterday** was `cfb49fc`.
- Everything landed on 2026-08-06 — the ear pass, the face/vault work, and
  **both beard commits** (`e101cab` "Widen the beard margins", `40821a8` "The
  paid beards were hanging inside the man") — was on the branch and **went live
  for the first time today**, inside `07dd3de`.

That is why the owner is complaining about beards today and was not yesterday.
It also means "74+ commits ahead and I'm not seeing improvement" is partly a
deploy-lag artefact: for two days the branch was well ahead of what was served.

---

## Q1 — did we regress and lose the design in the owner's reference image?

TODO — captures running.

---

## Q2 — did the beard wave make beards worse?

**Yes. Confirmed regression, and it is mine. The default beard every player
wears got visibly heavier last night and went live this morning.**

Two frames, same tool, same tab, same viewport, same default profile:

| Frame | Commit | Regenerate with |
|---|---|---|
| `yday-beards-desktop.png` | `cfb49fc` — what was live yesterday | `node tools/armourycard.mjs --tab BEARDS --name yday-beards --desktop-only` in a worktree at `cfb49fc` |
| `live-beards-desktop.png` | `07dd3de` — live now | `node tools/armourycard.mjs --tab BEARDS --name live-beards --desktop-only` |

What the two frames show, on the **equipped default** card (the middle one — the
Warden's `beardStyle: "short"`, which every non-berserker starts with):

- **Yesterday** it read as *stubble*. The jaw, chin and mouth were all legible
  through it; the beard was a tonal shading on the lower face, not an object.
  The card was even labelled "Stubble".
- **Today** it reads as a solid dark wedge running from under the cheekbone,
  across the jaw, and down into the neck. The mouth and chin are gone. The card
  is now labelled "Close Crop", which is a rename in the same window and makes
  an A/B by eye harder, not easier.

The owner's description — "an enormous black mass that swallows the lower face
and neck", "a dark smear with pale patches" — is accurate for today's frame and
not for yesterday's.

### The line that did it

`e101cab` "Widen the beard margins" was tuning the **Forked → Ringed Braid**
separation at fight distance, which had landed on exactly 1.00%. It moved
numbers in the *shared* beard block, above the `if (full)` branches, so the
default short beard was enlarged as collateral. `characters.ts:8659-8660`:

```
-  : 0.0012 + 0.0078 * Math.pow(Math.sin(...), 1.1)),
-  thick: full ? 0.005 : 0.0028,
+  : 0.0014 + 0.0096 * Math.pow(Math.sin(...), 1.1)),
+  thick: full ? 0.005 : 0.0032,
```

`const full = ap.beardStyle !== "short"` (line 8585), so the `:` branch of that
ternary and the `: 0.0032` are **exactly and only the default beard**. Lift
amplitude +23%, thickness +14%, on the one beard nobody chose and everybody
sees.

The second commit, `40821a8` "The paid beards were hanging inside the man", is
a genuine fix and is not implicated in this — it moved the paid hanging masses
forward out of the torso (`z` 0.036 → 0.036 + 0.100·t^1.15) and does not touch
the short beard.

### What must not be concluded from this

**The mass is the beard, and only the beard.** I checked, because "the head was
rebuilt in the same merge" was a live alternative explanation and would have
sent the fix to the wrong file. Staging Clean Shaven and photographing the large
portrait — `live-cleanshaven-desktop.png`, `node tools/armourycard.mjs --tab
BEARDS --item "Clean Shaven" --name live-cleanshaven --desktop-only` — gives a
clean tan lower face with no dark mass at all. The jaw geometry is fine. Shrink
the beard, not the head.

**Do not simply revert `e101cab`.** It was solving a real measured problem. The
fix is to split the shared block so the short beard keeps its old lift and
thickness while the paid beards keep the widened margins.

---

## Q3 — the cloak

**Answered. The CLOAKS tab exists, and it is clipped off the right-hand edge of
the tab strip at *both* viewports, with no scrollbar and no arrow to say so.**

The catalogue is not missing anything. `src/db/catalogue.ts` has a `cloak` slot,
and `ARMOURY` in `characters.ts` carries five cloak options including
`cloak_none` / "No Cloak" at 0 gold, which every profile owns from minting.
`armourycard.mjs` reads the live DOM and finds all eight tabs at both sizes:

```
[card] phone   tabs: ["HELMETS","HAIR","HAIR COLOUR","BEARDS","BEARD COLOUR","CLOAKS","ARMOUR FINISH","WAR PAINT"]
[card] desktop tabs: ["HELMETS","HAIR","HAIR COLOUR","BEARDS","BEARD COLOUR","CLOAKS","ARMOUR FINISH","WAR PAINT"]
```

They are in the DOM. They are not on the screen.

- **Desktop 1440×900** — `art/ui/live-helmets-desktop.png`. The strip is inside
  the right-hand "ladder" column, and it cuts **mid-word at "CLO…"**. CLOAKS is
  truncated; ARMOUR FINISH and WAR PAINT are not visible at all. Three of eight
  tabs are off-screen.
- **Phone 390×844** — `art/ui/live-helmets-phone.png`. The strip cuts at
  "BEAR…". CLOAKS is tab 6 of 8 and is far off the right edge.

The cause is in `src/app/globals.css`:

```css
.tab-strip {
  overflow-x: auto;
  scrollbar-width: none;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 2.25rem), transparent 100%);
}
.tab-strip::-webkit-scrollbar { display: none; }
```

The strip scrolls, but the scrollbar is deliberately hidden on both axes of the
platform question and there is no chevron, no arrow, no second row. The only
cue that anything follows BEARD COLOUR is a 2.25rem fade — which on desktop
lands *on top of* the truncated word and reads as a styling flourish, not as an
affordance.

This is worse on **desktop than on phone**, which is the opposite of the usual
direction and is exactly the failure `docs/PLATFORMS.md` warns about. A phone
user can swipe the strip and will discover the rest by accident. A mouse user
has no swipe: he gets shift+wheel, which is undiscoverable, or a drag on a
strip that gives no sign it is draggable. The owner is on desktop. He looked
for a cloak option, saw the word "CLO" fade into the background, and reported
that there is no cloak option. He is describing the screen accurately.

Note also `defaultAppearance` gives every class a cloak already — Warden and
Huscarl red, Runekeeper blue, Berserker brown. So the owner is wearing a cloak
he cannot see the tab for and cannot take off.

**This is a UI defect, not a content gap. The fix is an affordance on
`.tab-strip`, not new cloak art.**

---

## Captures

| Path | What it is |
|---|---|
| `art/ui/live-helmets-phone.png` | live tip `07dd3de`, armoury Helmets, 390×844 |
| `art/ui/live-helmets-desktop.png` | live tip `07dd3de`, armoury Helmets, 1440×900 |
