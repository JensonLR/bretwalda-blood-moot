# Hotkeys on desktop

> **2026-08-07 — the two faults the owner reported, and what they actually were.**
>
> **"Custom keybinds do not bind in game."** Not the table. **A race with the
> sign-in.** The landing screen is interactive the instant it paints and the
> profile POST runs behind it; a remap made inside that window was written to
> localStorage and then hydrated straight over by the row when the request
> answered. On the live free-tier dyno the window is a cold start, so nearly
> every remap made in the first minute of a session was silently erased.
> Measured on `95c27f0` with `/api/profile/me` held eight seconds: the Forward
> caps read `["T","↑","Y"]` with the request in flight and `["T","↑"]` after.
> Fixed by `bindingsTouchedHere()` — a table the player has changed on this
> device goes UP instead of being overwritten. Four typed words still win.
>
> **"Ctrl to crouch does not work on a MacBook."** Ctrl is the right-click
> modifier on macOS; the browser takes the chord before the page sees a
> keydown. Crouch moves to **C**, and `PLATFORM_MODIFIER_CODES` +
> `defaultsRuleViolations()` are the rule that stops the next one: no default
> may be a bare Ctrl/Alt/Cmd or a browser function key, and the remap screen
> refuses those codes with the reason. Legacy tables carrying `ControlLeft` are
> stripped and healed by `coerce()` rather than rejected, because
> `src/db/bindings.ts` validates against `RESERVED_CODES` and would have thrown
> a whole stored table away.
>
> **`bindsynctest` was 8/8 through both.** It graded the round trip to the
> database. It now taps the game socket and grades what the server was told.

The owner asked for *"option to add hotkeys / change on Desktop version."*

Worth doing, and it fixes a bug nobody has reported yet.

---

## What exists

Every binding is a string literal, scattered across ten sites in
`src/game/client/input.ts`:

```js
if (keys.has("w") || keys.has("arrowup")) mz = -1;
sprint: keys.has("shift"),  dodge: hit(" "),  crouch: keys.has("control"),
ability: hit("q"),          heavy: hit("e") || hit("v"),
```

Block is the right mouse button. Nothing is configurable and nothing is
displayed anywhere a player could check.

## The bug underneath it

`keys` holds `event.key` — the **character produced**, not the physical key
pressed. On an **AZERTY** keyboard the keys in the WASD positions produce
`z q s d`, so a French or Belgian player pressing the shape everyone knows
walks nowhere. Dvorak and Colemak are wrong in different ways.

So this is not only a comfort feature. A whole set of locales cannot currently
play with the layout the game silently assumes.

**Use `event.code`, not `event.key`.** `code` is the physical position —
`KeyW` is the same key on every layout — which is what a movement cluster
actually wants. Where a label must be shown, `navigator.keyboard.getLayoutMap()`
gives the character that key produces on *this* keyboard, so an AZERTY player is
shown Z and a QWERTY player is shown W for the same physical key.

## The decision

**One binding table, defaults by physical position, remappable, and remembered.**

- Every action gets a named binding: forward, back, left, right, sprint, dodge,
  crouch, block, attack, heavy, ability, and the four swing directions if they
  are ever split from movement.
- Defaults reproduce today's behaviour exactly, expressed as `code`
  (`KeyW`/`ArrowUp`, `ShiftLeft`, `Space`, `ControlLeft`, `KeyQ`, `KeyE`/`KeyV`).
- More than one binding per action, because the arrow keys are already an
  alternate for WASD and that must survive.
- **Persist to the profile.** Server-side profiles exist now and already hold
  cosmetics; bindings belong with them, so they follow a player to a new device
  through the same four-word recovery code. Fall back to localStorage when
  there is no database, exactly as the profile layer already does.
  **Done.** `players.bindings jsonb` (nullable — see below), `bindings?` on
  `POST /api/profile/equip`, validated server-side against the real action list
  and refused rather than repaired, and the two client calls at boot. The null
  matters: it means "this player never saved any", which is what tells the
  client to send the table already on his device up instead of handing him
  defaults and losing a remap he made before the column existed. localStorage
  is still written on every change and is still the whole store with no
  database.
- **Mouse buttons are bindings too.** Block is right-mouse today and a player
  who wants it on a key should be able to say so.

## The UI

A settings screen listing every action with its current key, click-to-rebind,
and a live "press a key" state. It should look like the rest: gilt on near
black, Cinzel, the knot band.

Three things it has to handle or it is worse than no settings screen at all:

1. **Conflicts.** Binding a key that is already used must say so and offer to
   take it, not silently produce two actions on one press.
2. **Reserved keys.** `Escape` closes menus, `F5`/`F12`/`Ctrl-W` belong to the
   browser and cannot be captured meaningfully. Refuse them with a reason
   rather than appearing to accept and then not working.
3. **Reset to defaults**, prominently. A player who has bound movement to
   something unreachable needs a way back that does not involve clearing site
   data.

And it must be **reachable from the pause/HUD**, not only from the main menu —
the moment a player wants to rebind is the moment a key did not do what they
expected, which is mid-fight.

### Reachable costs one press of Escape, and the button now says so

The in-fight KEYS control cannot be a single click and no amount of code makes
it one. While the pointer is locked there is **no cursor**: the canvas is handed
every mouse event in the document, so a click aimed at KEYS lands on the canvas
as a swing, and the `document.exitPointerLock()` that sat in the button's
`onClick` was code that could never run. Leaving the lock is Escape, and Escape
is the browser's — the page is not consulted and cannot fake it.

So the control has two faces, and this is the rule for any HUD control that
lives behind pointer lock:

- **Locked** — it is not a button. It renders as a note reading `[ESC] FOR KEYS`,
  dimmed, `pointer-events-none`, out of the tab order. It states its own
  precondition instead of pretending to be pressable.
- **Free** — it is a live button lit in gilt, so a player who has just pressed
  Escape can see where he was sent.

This is the crouch-on-a-Mac failure in a different costume: *a control that
appears to exist and does not*. A control that cannot work yet must say what it
needs, not look identical to one that works.

`bindsynctest`'s `openKeysInFight()` is the witness — it calls
`document.exitPointerLock()` and only then clicks `Key bindings`, so a button
that stops appearing when the cursor is free fails the gate.

## Things that will break

- **`npm run playtest` presses real keys** (`w`, `d`, space, `q`) and asserts on
  what reaches the server. Moving from `key` to `code` changes what the harness
  must send. Fix the harness to send physical codes; do not weaken its
  assertions.
- **The HUD's control reference** shows the bindings. It must read the table
  rather than repeating the literals, or it will lie the first time anyone
  remaps.
- **Mobile must not regress.** The touch path does not read `keys` at all, but
  it shares `sampleInput`. `npm run touchtest` is the guard at 19/19. Every
  action in the table above has a touch equivalent except crouch — including
  the shove, which is a 56 px pad inside the thumb band (`docs/MOBILE-CONTROLS.md`).
- **Crouch is desktop-only** and the touch path never sends it — that is
  deliberate and documented in the hit-zone work. A remap screen must not imply
  a phone player can crouch.

## The table as it stands, 12 August 2026

`src/game/client/bindings.ts` is the authority; this is what it holds, and the
list is here because a document that describes bindings and does not name them
is a document nobody can check.

| Action | Default | Notes |
|---|---|---|
| Forward / back / left / right | `KeyW` `KeyS` `KeyA` `KeyD` + arrows | Physical codes; AZERTY and Dvorak get the same shape. |
| Sprint | `ShiftLeft` | Held. |
| Dodge | `Space` | One-shot, `DODGE_COOLDOWN` 0.8 s. |
| Crouch | `KeyC` | **Desktop only.** Was `ControlLeft`; macOS ate the chord. |
| Attack | left mouse | |
| Heavy | right mouse / `KeyE` / `KeyV` | |
| Block | right mouse (hold) | The parry is a **timed raise**, not a held state — see below. |
| Ability | `KeyQ` | |
| **Take up** | **`KeyG`** | One-shot. Takes up a dead man's weapon from where he fell, when within a step (`TAKE.range` 1.5 m). Free; not while committed. A sword comes with its board, an axe slings it. |
| **Shove** | **`KeyF`** | One-shot. Beats a raised shield; a dodge beats it; costs 25 stamina and 1.5 s of cooldown. |

**The parry needs no binding of its own, and that is a decision rather than an
omission.** It is the block, raised inside the 150 ms before a blow lands
(`PARRY_WINDOW`, 3 ticks at 20 Hz — `tools/weightprobe.mjs` sweeps it). Giving
it a separate key would make it a *different act* from guarding, and the reason
a parry is skilful is precisely that it is the same act performed at the right
moment. A player who holds block gets a block; a player who taps it on the beat
gets a parry, staggers the man, and opens a 0.90 s riposte window on him — see
`docs/WEIGHT.md`.

What that costs the remap screen: nothing today, and one thing to remember. If
block is ever moved off the mouse, the parry moves with it, because they are one
binding. The screen must not grow a second row called "parry".

## How it gets judged

`playtest` already proves a key press reaches the server as the right intent.
Extend it: rebind an action, press the **new** key, and assert the server sees
the action; press the **old** key and assert it does not. That is the whole
feature stated as a test, and it is the only way to know a remap actually took
rather than merely being stored. `npm run playtest` does this, at 11/11.

Persistence gets the same treatment, because a stored blob is not the feature
either. `PROFILE_TEST_DB=postgres://… node tools/bindsynctest.mjs` remaps
Forward onto T through the settings screen in one browser context, reads the
four words off the profile screen, types them into a **second** context with
its own localStorage, and asserts the remapped key moves the warrior there and
the old one does not. It also seeds a pre-column remap in a third context and
asserts first sign-in carries it up rather than overwriting it. The wire itself
— what `/equip` will take and what it refuses — is guarded in the database half
of `npm run profiletest`.
