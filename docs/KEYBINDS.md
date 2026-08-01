# Hotkeys on desktop

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

## Things that will break

- **`npm run playtest` presses real keys** (`w`, `d`, space, `q`) and asserts on
  what reaches the server. Moving from `key` to `code` changes what the harness
  must send. Fix the harness to send physical codes; do not weaken its
  assertions.
- **The HUD's control reference** shows the bindings. It must read the table
  rather than repeating the literals, or it will lie the first time anyone
  remaps.
- **Mobile must not regress.** The touch path does not read `keys` at all, but
  it shares `sampleInput`. `npm run touchtest` is the guard at 19/19.
- **Crouch is desktop-only** and the touch path never sends it — that is
  deliberate and documented in the hit-zone work. A remap screen must not imply
  a phone player can crouch.

## How it gets judged

`playtest` already proves a key press reaches the server as the right intent.
Extend it: rebind an action, press the **new** key, and assert the server sees
the action; press the **old** key and assert it does not. That is the whole
feature stated as a test, and it is the only way to know a remap actually took
rather than merely being stored.
