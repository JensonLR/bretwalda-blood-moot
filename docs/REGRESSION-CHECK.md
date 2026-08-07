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

TODO — captures running.

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
