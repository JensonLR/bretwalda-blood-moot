# Two platforms, both first class

The owner, correcting a drift in how this project has been briefed:

> *"its not 100% phone first, since if we look to move to a different host or
> way of selling it etc. it may be the case that PC is used more than mobile so
> best solution is surely to be optimised for both?"*

He is right, and this file exists because the wrong version of this had been
written into the top of nearly every agent brief in this project.

---

## The claim that was never measured

Almost every wave has been briefed with **"most players are on a phone."**

That has never been measured. **This game has no analytics of any kind.** The
belief comes from the product pitch — a link dropped in a group chat — which is
evidence about how a player *arrives*, not about what they arrive on. A shared
link is opened on a phone *and* pasted into a desktop browser, and nothing in
this repo has ever counted which.

An unmeasured prior that appears at the top of every brief stops reading as an
assumption and starts reading as a requirement. That is what happened.

## Why the correction matters more now than it would have a month ago

The distribution work changed the odds. `docs/DISTRIBUTION.md` names the web
portals — Poki, CrazyGames — as the realistic revenue channel for a game of
this exact shape, and a large share of that traffic is **desktop browser**. If
the game goes anywhere near a portal, a PC-majority audience is not a
hypothetical, and a codebase that treats desktop as the thing that "inherits"
whatever the phone got will meet that audience with its second-best face.

## The rule, replacing "phone first"

**Design each platform properly. Neither inherits the other's compromises.**

- **Not** "phone first, desktop inherits" — that produces desktop screens laid
  out for a 390 px column.
- **Not** "PC controls adapted to mobile" — the owner's own gauntlet brief
  rejects this explicitly, and the soft lock-on exists because that adaptation
  had already failed once.
- **Both**, sharing one combat identity, one art direction, and one server.

A brief should say what the feature must do on a phone **and** what it must do
on a desktop, and a judgement needs a frame from each. A wave that captures one
viewport has evidence for half the product.

## Where "phone first" was right, and stays

This is a correction, not a reversal. These calls were made for phones and are
still correct:

- **Touch controls existing at all**, and the soft lock-on that freed the right
  thumb from doing two jobs. Desktop never had that problem.
- **The audio unlock on first gesture** — an iOS constraint, harmless elsewhere.
- **The quality tier floor**, which is measured on the owner's real hardware:
  phone `high` stutters, phone `medium` is smooth, desktop `high` is fine. Do
  not raise the phone ceiling on a hunch; it has been tried on a real device.
- **Zero binary assets.** This serves the instant link on every platform.

## Where the old rule cost us, and what to do about it

- **Desktop targeting is second class.** Lock-on is desktop-*optional*, default
  off, behind a keybinding. Mouse-look and lock fight each other in
  `GameCanvas` (recorded in `docs/MOBILE-CONTROLS.md`). A PC player deserves a
  targeting answer designed for a mouse, not a mobile feature he may opt into.
- **Draw calls are a desktop problem too.** The measured 3753 (medium) and 4252
  (high) were treated as "a phone concern". They are a frame-rate concern, and
  the owner reported lag on **both** desktop and mobile.
- **Screens are judged on one viewport.** The armoury was designed at 390×844
  with desktop inheriting; the desktop result happens to be good, but that was
  luck rather than intent, and the phone frame has now gone two waves uncaptured
  while desktop frames were plentiful. Both, every time.

## The thing that would settle it

Ship something that counts. A single anonymous, privacy-respecting count of
viewport class and pointer type at first load would replace this entire
argument with a number, and it costs almost nothing. Until then, **no brief in
this repository should assert a platform majority as fact** — including this
one.
