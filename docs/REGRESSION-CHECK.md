# Regression check — three checkable claims

The owner looked at the live game on 2026-08-07 and made three statements that
can be settled with evidence rather than opinion. This file settles them.

Method: build a commit in a worktree, capture the same screen with the same
tool, look at the frames. Nothing here is asserted from a diff.

All three are answered. Gate at the live tip when this was written: `npm run
build` exit 0, `npx tsc --noEmit` exit 0, `npm run lint` 11 problems (bar is
12). No file in `src/` was touched by this work.

**A note on the frames.** `art/` is in `.gitignore`, so the PNGs cited here are
not in the repo. Every one of them has the exact command that regenerates it
beside it, and historical ones were built in `git worktree` checkouts — each
needs `cp -al ../node_modules node_modules` in the worktree, because Turbopack
rejects a symlinked `node_modules` that points outside the project root.

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

**Two answers, and both matter.**

**(a) No commit in this repository has ever rendered that character.** The head
in that image has never existed here.

**(b) But the owner is right that something was lost, and my first instinct
about what was wrong.** The *staging* in that image is this codebase's own
armoury preview as it stood until 2026-08-05. We replaced a full-body warrior
standing in a lit ring with a head-and-shoulders crop of our weakest asset.

### (a) The character

Frames, oldest to newest, all of the armoury with the default profile:

| Commit | Date | Frame | Regenerate |
|---|---|---|---|
| `6321e56` | 2026-07-30 | `art/shots/portrait.png` | `node tools/shoot.mjs portrait closeup` |
| `f74c669` | 2026-08-01 | `art/ui/armoury-desktop.png`, `armoury-phone.png` | `node tools/uishots.mjs` |
| `cfb49fc` | 2026-08-05 | `art/ui/yday-helmets-desktop.png` | `node tools/armourycard.mjs --name yday-helmets` |
| `07dd3de` | 2026-08-07 (live) | `art/ui/live-helmets-desktop.png`, `live-fullkit-desktop.png` | `node tools/armourycard.mjs --name live-helmets` |

Note the tooling changes under you as you go back: `armourycard.mjs` does not
exist before 2026-08-05 and `uishots.mjs` does not exist before 2026-08-01, so
the earliest era has to be shot with `shoot.mjs` against the arena instead.

Nothing in any of them has short individually-modelled curly hair, a plain
silver circlet, or a naturalistic face with eyelids and lips. At `6321e56` the
face is painted-on features on a smooth head — no beard, no sculpted brow, no
lids. At `f74c669` it is a crude bobble. Today it is a crude sculpted mask. It
gets *more* detailed over time, never less — so there is no earlier, better head
to have lost.

That is not just an eyeball verdict; the primitives are not there, and a search
over **all** commits on **all** branches confirms it:

- **Hair cannot curl.** `characters.ts:8414` builds hair as a single displaced
  parametric shell over the skull. The "fourteen locks" in its own comment are
  cosine harmonics on a lift function — `0.20*cos(7u) + 0.14*cos(13u) +
  0.10*cos(9v+3u)` — not geometry. There are four styles ever: shaved, crop,
  mane, braids. No per-lock or per-curl primitive has existed in any commit.
- **There is no circlet.** `git log --all -S'circlet'` returns four commits, all
  of them the *Jarl's Crowned Helm*, where `crown: "circlet"` is a band welded
  onto a helmet bowl. A silver circlet worn on bare hair has never been buildable.
- **There are no cobblestones.** `git log --all -S'cobble' -- src/` returns two
  commits, and in both, "cobble" appears only inside a *comment* describing how
  the muddy arena ground unintentionally read. No cobbled surface was ever
  authored.

So: a spear, a red cloak, dark hose, white leg-wraps, brown boots, a mailed
shoulder and a bracer are all real things this game builds. A curly-haired,
circleted, naturalistically-sculpted head is not, and never was. **That image
was not produced by this codebase.** Most likely it is our staging described
from memory, with the face filled in by expectation — which is a completely
normal thing for a person to do, and is not the owner being careless.

### (b) What we actually lost — and this is the real finding

Compare `armoury-phone.png` @ `f74c669` with `live-helmets-desktop.png` @ tip.

**On 2026-08-01 the armoury opened on a whole man**: full body, facing front, lit
by a soft key on a dark ground, standing inside a **thin orange ring**, wearing a
**red cloak**, holding a **spear**, with **white leg-wraps** and **brown boots**
below dark hose, and mail at the shoulders. Read that list against the owner's
description of his reference image. It matches on every point except the head.

**Today the armoury opens on `PORTRAIT`** — a head-and-shoulders crop. The
armoury switched from `CharacterPreview.tsx` to `armouryStage.ts` on 2026-08-05
and made the head crop the default lens.

That single change is most of the owner's complaint:

1. It fills the screen with **the face and beard**, which are the weakest things
   we own, and hides the kit, which is the strongest.
2. It is why "the outfits are barely affected by armour finish" reads so loudly
   — at PORTRAIT you can barely see an outfit at all.
3. Every helmet thumbnail became a head crop too, which is why they read as
   "pointed dark shapes with odd wing-like flares".

And the fallback is broken: **the `FULL KIT` lens photographs the man's back.**
`live-fullkit-desktop.png` is a red cloak filling the frame with a spear beside
it and the head tiny at the top. So a player who goes looking for the old view
cannot get it.

**Verdict for the owner, in one line:** we did not lose a better character — we
lost the shot that made the character look good, and replaced it with a close-up
of the part that needed the most work.

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

## What this means for the next wave

Ranked by how much visible change each buys per unit of work.

1. **Open the armoury on the whole man again**, in the ring, front-on — the
   `f74c669` framing. This is the single largest visible win available and it is
   a camera change, not an art change. Fix `FULL KIT` to face him while you are
   there.
2. **Put the default beard back**, by splitting the shared block at
   `characters.ts:8659-8660` so `short` keeps its pre-`e101cab` lift and
   thickness and the paid beards keep the widened margins.
3. **Give `.tab-strip` an affordance.** Three of eight tabs are unreachable on
   desktop. Cheapest honest fix is to let it wrap to two rows at desktop widths
   and keep the scroll only on phone.
4. **Then** the armour-finish problem the owner named, which is the real content
   work: `const mail = M.armour(ap.armorColor)` tints mail only, and tunic,
   trousers and leather are hard-coded — which is why the Runekeeper and
   Berserker barely change and why the Warden's lower half is permanently green.
   Note the green is visible as far back as `f74c669`; it is long-standing, not
   new.

Items 1–3 are all small, all visible, and none of them is new art.

## Captures

| Path | What it is |
|---|---|
| `art/ui/live-helmets-phone.png` | live tip `07dd3de`, armoury Helmets, 390×844 |
| `art/ui/live-helmets-desktop.png` | live tip `07dd3de`, armoury Helmets, 1440×900 |
| `art/ui/live-beards-desktop.png` | live tip, BEARDS tab — the heavy default beard |
| `art/ui/live-cleanshaven-desktop.png` | live tip, Clean Shaven staged — proves the jaw is fine |
| `art/ui/live-fullkit-desktop.png` | live tip, FULL KIT lens — pointed at his back |
| `art/ui/yday-helmets-desktop.png` | `cfb49fc`, what was live yesterday |
| `art/ui/yday-beards-desktop.png` | `cfb49fc`, BEARDS tab — stubble, before the wave |
| `art/ui/yday-helmets-phone.png` | `cfb49fc`, phone |
| `art/ui/aug01-armoury-{desktop,phone}.png` | `f74c669`, the full-body-in-the-ring staging |
| `art/shots/jul30-portrait.png` | `6321e56`, the earliest capturable character |

All of the above have been copied into this checkout's `art/` so they sit
together, under the `aug01-` / `jul30-` / `yday-` / `live-` prefixes. They are
still gitignored — they exist on this container only, and the regenerate
commands above are the durable record.
