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

- **The Steam store page and app id.** The BUILD is no longer the blocker —
  **7.2's Tauri wrapper was compiled, bundled, verified and RUN on this Mac on
  1 Sep**: release profile in 1m 48s, a 5.3 MB arm64 `.app` and a 2.3 MB `.dmg`
  that `hdiutil verify` calls VALID, and it held a window for ten seconds at
  91 MB RSS with nothing on stderr. What is left is not code: a Steam app id
  (which the ticket-verify route deliberately waits for — "a door that cannot
  check tickets must not open"), the store page, and firing
  `.github/workflows/desktop.yml` for the Windows and Linux installers. **That
  workflow has never run — this repo has no tags** — and it fires on a
  `desktop-v*` tag or by hand from the Actions tab. Naming a release is the
  owner's call. One CI trap is ledgered in 7.2: the first `tauri build` fails in
  `bundle_dmg.sh` and the retry works once the stale `rw.*.dmg` is deleted.
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
- **Wave D, draw calls — HALF unblocked, and the half matters.** The matrix ran
  on real hardware for the first time (`BRETWALDA_GPU=1 node tools/fpstest.mjs`).
  Tier high, eight-man brawl: **p50 13.70 ms, p99 22.00 ms, worst 56.60 ms,
  1465 draws, 2843k tris**. The server tick is healthy — p50 51.27 ms against a
  50 ms target, 1 of 388 ticks more than 25 ms late.

  **AND THE ABLATION RANKS — the first time it ever has.** It took TWO things,
  not one, and the difference is the correction worth carrying: a GPU alone did
  NOT fix it. At the default `--secs=14` the noise floor was −4.20 ms against a
  best cut of 7.40 and `fpstest` correctly refused; at `--secs=60` it is −0.50
  against 10.40, a twentieth, and it ranks. **The GPU bought the frames; the
  seconds bought the ranking.** `fpstest`'s refusal used to blame SwiftShader
  unconditionally — a lie on a GPU run, and one that would send the next round
  to buy hardware it already had; it now says which of the two is the problem.

  The full table is in `docs/PERFORMANCE.md`. The four that matter:

  | removed | ms@p50 | draws |
  |---|---|---|
  | the whole post chain | **10.40** | 809 |
  | shadows | **9.40** | 756 |
  | props (density 0) | **8.50** | 309 |
  | AO (GTAO alone) | **8.10** | 617 |

  **AO is 8.1 ms of the post chain's 10.4** — 78% of everything the chain costs,
  and 617 of the 809 draws it adds. Props are 8.5 ms for only 309 draws, a worse
  ratio than either and the cheapest thing on the list to make a setting. The
  audio engine (−0.40) and the torch lights (−0.50) are AT THE FLOOR and are not
  findings.

  **A stall worth its own look: the summary stage reads `worst 7705 ms`** at
  tier high — three orders of magnitude over its own p50 of 21.60 ms. That is
  not a rendering cost, it is something blocking; nothing in this session
  touched it and nothing has explained it.

### 2. Carrying a measured blocker — do not restart from zero

- **The beards read as a blade in profile.** Lever FOUND: `skin` is the depth
  the face leg stands off the face; 19 mm is a shave, 32 mm reads as a beard.
  **Blocked because `beardShell` is handed a skull and nothing else** — hair has
  `hairCeil` reading the whole head stack and the beard has no equivalent. Four
  other levers measured INERT and are named in `docs/OPEN-DEFECTS.md`.
- **The helmet flank gap (5.15) is CLOSED BY RULING**, not by a fix: closing it
  costs 89% of the Braided War-locks' silhouette and the owner chose the hair.

## The gate battery (run what the diff touches)

**THE COUNTS BELOW WERE RE-MEASURED ON 1 SEP, NOT COPIED.** Six of them were
stale in the previous handover — every one had gone UP, so a green run would
have read as a regression to anyone checking against the old number. Corrected
counts are marked (was N).

tsc --noEmit · npm run lint (0/0) · npm run build ·
scoretest **19/19** (was 16/16) · platformcheck **6/6** ·
warsay **54/54** (was 52) · wartest 82/82 · protocoltest 81/81 ·
moottest **41/41** (was 25) · marktest **38/38** (was 25) ·
burhtest **24/24** (was 19) · tourneytest **39/39** (was 38) ·
goretest **35/35** (was 36) · locktest 6/6 · weightprobe 24/24 ·
fighttest 23/23 · benchtest 23/23 · rejointest 12/12 · armsprobe 16/16 ·
bottest 11/11 (240 bouts a rung, seed 20260813) · cardgate 17/17 ·
solidtest **16/16 with 1 deferral** (was "12/12") ·
soundtest 46/46 · playtest **38/38 — BUT SEE THE BROWSER-BINARY LAW BELOW** ·
touchtest 32/32 (x4 shapes) · clipseen PASS · wearmeasure ·
helmclash (COMPARES ITS OWN BASELINE — exits 1 when a section gets worse) ·
cosmetictest (see above; software for a verdict) · profiletest 22/0
(degraded; no DB here by the credentials rule) · classmatrix (~3 min, balance
only) ·
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
3. **Wave D's draw calls** — it was blocked on "get the matrix onto hardware
   with a GPU" and that block is gone; `fpstest`'s ablation can rank again.
4. Then splintering shields, then taking a dead man's weapon.
5. Routing the other 32 browser tools through `tools/lib/browser.mjs` is
   mechanical and worth a lot of wall clock.
