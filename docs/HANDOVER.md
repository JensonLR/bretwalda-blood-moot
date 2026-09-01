# SESSION HANDOVER — Bretwalda: Blood Moot

Rewritten 1 Sep 2026, on a Mac with a GPU and network. Read this, then
`docs/BACKLOG.md`, `docs/OPEN-DEFECTS.md`, `docs/ARMOURY-REVIEW-PLAN.md`.

## Standing instructions (the owner's, every session)

- **AAA quality** (`docs/VISUAL-BAR.md` 8+), harsh-critic discipline. R1 pull
  the lever, R2 photograph it, R4 the ruler must measure the right question,
  R8 correct your own record. "A gate green because the case is absent is not
  a gate."
- **Anglo-Saxon theming, never generic medieval fantasy.** Devices sourced to
  a real find or labelled an invention (`docs/FACTIONS.md` §9).
- **Merge to main** (Render deploys main) — explicitly authorized. **Push
  after every commit.**
- **Full autonomy; don't stop until everything is complete & merged.**
- **SECURITY (verbatim, preserve):** Database connection strings are
  credentials — never commit them, never put them in `drizzle.config.json`,
  keep them in the deployment environment only. **THE NEON PASSWORD WAS ROTATED
  BY THE OWNER ON 1 SEP 2026** — the credential half of `docs/BACKLOG.md` 6.4 is
  closed. The value is deliberately not reprinted here and never should be: a
  credential does not need to be quoted to be discussed, and redaction does not
  un-expose one, which is why rotation was the remedy. What remains of 6.4 is
  deleting the old Render Postgres, and that waits on the hosting move.

## The owner's rulings — these SUPERSEDE what is written elsewhere

1. **Alpha profiles are disposable** (1 Sep). *"any profiles will be fine to be
   lost, everyone understands this is just an alpha test on Render's hosting."*
   The ninety-day Render Postgres clock is NOT urgent; the hosting move is
   deprioritised. `fly.toml` is ready in the repo root; `README-deploy.md`
   Option A has the five commands.
2. **The destination is DOWNLOADABLE — Steam, and the iOS and Android stores**
   (1 Sep). *"Final solution I'd want to have as a downloadable game on steam &
   ios/android stores."* **This overrules `docs/MONETISATION.md`**, which argues
   "PWA, not app stores" on the 30% cut, the review queue, and this game's
   discovery being a group chat. That reasoning is not wrong — it is OVERRULED,
   and whoever edits that file next should say so there rather than delete it.
   iOS and Android stores are **not scoped anywhere yet**: a Capacitor-style
   wrapper, $99/yr Apple, $25 once Google, and a review queue. A new wave.
3. **The industrial beeping** (1 Sep). *"there is an awful sound playing randomly
   during matches that is really bad & awful playing experience sounds like an
   industrial beeping."* FIXED — see below.

## READ THIS BEFORE YOU PLAN ANYTHING — the board was badly stale

The previous handover's "remaining board" was wrong in five places, and four of
them said NOT STARTED about work that had SHIPPED. Every one was verifiable
against the tree in under a minute. **Verify a row before working it; this is
now the single most expensive defect in these ledgers.** Corrected in
`docs/BACKLOG.md` in place, with the correction marked:

| row | said | actually |
|---|---|---|
| **Wave E — the second ground** | *NOT STARTED... the biggest visible change per hour* | **DONE 24 Aug.** Its own postscript says so; only the heading was stale. **FIVE grounds ship** — `saxon_village`, `pict_moor` (which IS "cold, open, sky-lit"), `roman_fort`, `danelaw_camp`, `offa_dyke`. |
| **Rating** | *NOT STARTED — no `rating`/`elo` column* | **ANSWERED by 4.6, 24 Aug, deliberately:** *"the rating IS season points — a second rating would be a second truth."* There is no column BY DECISION. Adding one undoes a ruling. |
| **Hearths** | *NOT STARTED — no table, no reference* | **DONE 24 Aug** (row 4.4). `src/db/hearths.ts`, warsay 44/44. |
| **PWA** | *NOT STARTED — no manifest, no service worker* | **Shell DONE 27 Aug** (row 8.9): `app/manifest.ts`, `public/manifest.webmanifest`, `public/sw.js`, forged icons. Only the EARNED prompt was missing — built this session. |
| **The grade's cause** | `adaptBand` / the metered response | **Wrong stage.** Contrast has been luma-preserving since 22 Aug and removing the meter moves the board's hue the WRONG WAY. It was the anisotropic chroma skew. |

## Landed this session

- **THE BEEP.** `score.ts`'s lyre is a Karplus-Strong string and `damp.Q` was
  never set, so it took Web Audio's default of 1 — which for a `lowpass` is
  **+1 dB of resonance**, not a flat response. Loop gain 0.965 x 1.2533 =
  **1.2095**: it oscillated. Rendered offline, one note peaked at **19,080**
  (86 dB over full scale) and was heard at 1290 Hz where 294 Hz was written.
  Fired every 6-20 s of every fight and at every match end. Fixed with Q at
  -3 dB (flat, peak 1.0) and feedback 0.94. A second defect fell out of it: a
  DelayNode in a cycle is clamped to one render quantum, so every note above
  ~375 Hz — the whole small-speaker range — played at the same wrong pitch.
  **`scoretest` 16/16 -> 19/19**: it was green because every claim in it was
  about the PLAN and the defect was in the BINDING.
- **THE GRADE.** Four OPEN defects, one cause, and it was one line:
  `offset += (offset - along) * uChromaOpponent` lengthens the chroma AND TURNS
  IT. Board hue 12.4° against a pigment of 26.5°; with that line a scale rather
  than a skew, 33.8°. `GAMUT_KEEP` is the other half — the guard used to land
  the weakest channel on exactly zero. Dead-channel pixels over 20 frames:
  **1668 -> 0**. `factionread` **27/34** (baseline 27/34); §7.1's worst rose
  reading **+12.956 -> +2.754**, a 4.7x fall on the identical loadout.
  **§7.1 still FAILS** and the entry says so.
- **THE INSTRUMENTS.** `?grade=` — a capture-only door in `postfx.ts`, honoured
  on `/shot` only — and `tools/gradesplit.mjs`, which photographs one man with
  one stage of the grade removed and prints HUE DRIFT off his own pigment.
  **`gradesplit --gate` is the gate that would have caught this**, and nothing
  in the drawer measured its quantity: the grade's OWN rotation, shipped against
  the same frame ungraded. It gates dH\* and not the raw angle — the first run
  proved the angle wrong, calling a C\* 3 neutral swinging 51° the same finding
  as the magenta board. Standing worst **6.7–7.3 dH\*** (the Danelaw's tunic at
  90°, the same red arc §7.1 is still red about) against a bar of 10 and a
  defect that read 15.8. **It cannot see the board** — the shield is not in
  `buildCharacter`'s group — and it says so on its own verdict line.
- **THE GPU.** `tools/lib/browser.mjs` puts the rasteriser in one place.
  `BRETWALDA_GPU=1` opts in; **software stays the default**. `factionread` went
  **8704 s -> 828 s**. The board's mean is identical to the byte across the two.
  **TWO LIMITS, both measured, both in that file:** a THRESHOLD COUNT is only
  comparable within one rasteriser, and **the GPU is not bit-deterministic** —
  cosmetictest's "two captures of one subject are byte-identical" FAILS on it
  (mean 1.53%, worst pixel 27.19%) and holds exactly in software. A suite whose
  claim is repeatability or a byte diff must run software; a suite reading a
  mean or a share may take the GPU.
- **THE EARNED INSTALL PROMPT** (`client/install.ts` + `InstallInvite`): after a
  won match and never at first load, one ask ever, with an iOS arm because
  Safari has no `beforeinstallprompt` and never will. New storage seam,
  registered in `platformcheck`.
- **`platformcheck` law 4 was imprecise** — `\b(?:window\.)?(alert|confirm|prompt)\(`
  matches after a dot, so it convicted any object with a method of that name.
  Tightened to the three globals, and proven to still convict a real offender.

## The board, verified against the tree on 1 Sep

### 1. What is genuinely open and worth doing next

- **The Tauri build for Steam (7.2).** The scaffold, the CI workflow
  (`.github/workflows/desktop.yml`) and `platformcheck` all exist; **no tag has
  ever fired and the build has never been judged**. Rust is now installed on
  this Mac. This is the Steam path.
- **`factionread` §7.1's residue.** A fifth of what it was, still red. Start
  from `tools/gradesplit.mjs`, not from a vat.
- **Splintering shields.** *NOT STARTED, verified* — `vfx.ts` has a splinter
  particle and nothing else. Blocks are already typed on the wire.
- **Taking a dead man's weapon.** *NOT STARTED, verified* — `grep -rin pickup
  src/` is empty.
- **A3: the ten helm bowls and §5's reprice.** *NOT STARTED, and that row is
  honest* — it re-verified itself against `characters.ts:191-285`.
- **Flags.** *NOT STARTED, verified.* Constrained presets, a moderation
  decision as much as an art one.
- **Wave D, draw calls.** Was blocked on "get the matrix onto hardware with a
  GPU". That block is gone.

### 2. Carrying a measured blocker — do not restart from zero

- **The beards read as a blade in profile.** Lever FOUND: `skin` is the depth
  the face leg stands off the face; 19 mm is a shave, 32 mm reads as a beard.
  **Blocked because `beardShell` is handed a skull and nothing else** — hair has
  `hairCeil` reading the whole head stack and the beard has no equivalent. Four
  other levers measured INERT and are named in `docs/OPEN-DEFECTS.md`.
- **The helmet flank gap (5.15) is CLOSED BY RULING**, not by a fix: closing it
  costs 89% of the Braided War-locks' silhouette and the owner chose the hair.

## The gate battery (run what the diff touches)

tsc --noEmit · npm run lint (0/0) · npm run build · **scoretest 19/19** ·
**platformcheck 6/6** · playtest 38/38 (x3 widths for layout work) ·
cosmetictest (full render) · wearmeasure · helmclash (COMPARES ITS OWN
BASELINE — exits 1 when a section gets worse) · warsay 52/52 · wartest 82/82 ·
protocoltest 81/81 · solidtest 12/12 · touchtest 32/32 · moottest 25/25 ·
marktest 25/25 · burhtest 19/19 · clipseen PASS · soundtest 46/46 ·
goretest 36/36 · locktest 6/6 · weightprobe 24/24 · profiletest 22/0
(degraded; no DB here by the credentials rule) · classmatrix (~3 min, balance
only) · fighttest 23/23 · benchtest 23/23 · rejointest 12/12 ·
tourneytest 38/38 · armsprobe 16/16 · bottest 11/11 ·
**gradesplit --gate PASS** (worst 6.7 dH\* against a bar of 10) ·
**cosmetictest 18/19 on the GPU — the one FAIL is its byte-identical claim,
which is the GPU and not the game; the same claim reads 0.0000% in software** ·
**factionread 27/34 —
NOT green and not expected to be**; §7.1 has a written defect behind it.

**`BRETWALDA_GPU=1` works on `factionread`, `cosmetictest` and `vatprobe`.**
The other 32 browser tools still hard-code SwiftShader; routing them through
`tools/lib/browser.mjs` is a cheap, mechanical, large win.

## Hard-won laws (do not relearn these)

- **A red on an INPUT claim is probably the wrong BROWSER BINARY.** `playtest`
  reads **35/38** on Playwright's headless SHELL and **38/38** on the full
  browser, same tree, same commit: the shell has no real pointer-lock, so its
  three mouse-look claims fail with `WrongDocumentError`. The container had a
  full browser at `/opt/pw-browsers/chromium`; a workstation running `npx
  playwright install chromium` gets the shell. **On a workstation, run playtest
  with `BRETWALDA_GPU=1`** — that arm asks for `channel: "chromium"`, which is
  the one with pointer lock. Check the binary before you check the diff.
- **Never run two heavy things concurrently.** Broken once this session, and
  it produced a red playtest that vanished on a clean re-run. Serialize; re-run
  a red alone before believing it.
- **Never rebuild while a browser suite is running** — the suite is serving out
  of `.next` and you have just replaced it under it. One factionread run was
  thrown away for this.
- **Look at the pictures.** Two full debugging days were once lost arguing with
  numbers while the captures showed the wrong scene.
- **A field added to `Appearance` must reach every comparator**: the
  CharacterPreview destructure, armouryStage `sameAppearance`, server
  `SLOT_FIELD`, and `signatureOf`.
- **Child effects run before parent effects** — anything a canvas mount reads
  from `window` must be written in a lazy initializer.
- **A client-only value belongs in `useSyncExternalStore`**, not in an effect
  that calls setState (the react gate forbids it) and not in render (hydration).
- **The engine stays headless** — `platformcheck` enforces it.
- Evidence dirs under `art/` are gitignored per-directory.
- node BLOCK-BUFFERS to pipes: `stdbuf -oL` into a file or a long run looks hung.

## Immediate next actions

1. Read this, then `docs/BACKLOG.md` and `docs/OPEN-DEFECTS.md`.
2. **Verify every row against the tree before working it.** Five were stale.
3. Take the **Tauri build** — it is the Steam path and the toolchain is here.
4. Then Wave D's draw calls (a GPU exists now), then splintering shields.
