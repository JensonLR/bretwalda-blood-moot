# Steam store assets — what lives here, what Steam demands, what is owner-side

The Steam-prep wave's asset ledger. Steam's graphical asset sizes are exact
and rejected when wrong, so they are written down here once, beside the
files that satisfy them.

## Required graphical assets (Steamworks "store graphical assets")

| Asset | Size (px) | State |
|---|---|---|
| Header capsule | 460×215 | OWNER-SIDE — needs the title lettering pass |
| Small capsule | 231×87 | OWNER-SIDE — same art, cropped for legibility |
| Main capsule | 616×353 | OWNER-SIDE |
| Vertical capsule | 374×448 | OWNER-SIDE |
| Library capsule | 600×900 | OWNER-SIDE |
| Library hero | 3840×1240 | OWNER-SIDE — a wide arena frame can seed it |
| Library logo | 1280×720, transparent PNG | OWNER-SIDE |
| Screenshots | 1920×1080 minimum, at least 5 | `screenshots/` — captured from the live renderer by `tools/storeshots.mjs` |

Capsules are marketing art with mandatory title lettering — a raw
screenshot is rejected by Valve's review for the capsule slots, so those
wait on a lettering/logo pass with the owner's eye. Screenshots must show
actual gameplay (Valve policy since 2022: no concept art, no pre-rendered
frames), which is exactly what the capture harness produces.

## Text

`copy.md` — short description, about, tags, requirements. DRAFT until the
owner rules on it; the fenced section lists claims the page must not make
yet and why.

**`npm run storeclaims` holds the page to the game.** The first draft of
`copy.md` claimed five warrior classes and named a "Burhweard" — there are
four and no Burhweard has ever existed — and used the retired internal ids
"Warden" and "Runekeeper" (the shipped names are WEARD and WRECCA, and
"Runekeeper" was retired under this project's standing rule against another
game's vocabulary). All four errors would have been permanent and public.
The tool reads the copy and asks the modules that own each noun: the class
roster and its count off `WARRIOR_STATS`, the display names off the shipped
`WARRIOR_INFO`, the arms off `ARMS`, the peoples off `PEOPLES`, the grounds
off `GROUNDS`. It also guards the honesty fence itself, because a deleted
fence silently frees the page to promise Steam relay play. It says plainly
what it cannot check — prose, tone, pricing, character counts.

## Achievements

`node tools/steamsheet.mjs` prints the paste-ready achievement table,
derived live from the profile-mark rules (one rule, two readers — see
`src/game/achievements.mjs`). Icons: render each mark's own 24 px glyph at
256 px, achieved jade-on-iron, unachieved grey-on-iron.

## The app id

Everything above is inert until the owner registers the app on Steamworks
(the $100 fee, the owner's account). The moment it exists:
1. `desktop/src-tauri/` gains the Steamworks integration (relay + auth
   ticket verify per docs/PLATFORM-PATH.md §8.2 — the door stays unstubbed
   until it can check tickets).
2. The achievement table is pasted from `steamsheet`.
3. These assets upload to the store page and wishlists open.
