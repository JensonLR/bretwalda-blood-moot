# SESSION HANDOVER — Bretwalda: Blood Moot

Written 27 Aug 2026 at a context boundary. A fresh session should be able to
continue from this file alone. Read it, then `docs/BACKLOG.md` (waves 7–8),
`docs/OPEN-DEFECTS.md`, and `docs/ARMOURY-REVIEW-PLAN.md` for depth.

## Standing instructions (the owner's, every session)

- **AAA quality** (`docs/VISUAL-BAR.md` 8+), harsh-critic discipline. R1 pull
  the lever, R2 photograph it, R4 the ruler must measure the right question,
  R8 correct your own record. "A gate green because the case is absent is not
  a gate."
- **Anglo-Saxon theming, never generic medieval fantasy.** Devices sourced to
  a real find or labelled an invention (`docs/FACTIONS.md` §9).
- **Merge to main** (Render deploys main) — explicitly authorized. **Push
  after every commit** — container rollbacks have destroyed unpushed work
  repeatedly (twice more this session; push-discipline saved everything).
- **Full autonomy; don't stop until everything is complete & merged.**
- **SECURITY (verbatim, preserve):** Database connection strings are
  credentials — never commit them, never put them in `drizzle.config.json`,
  keep them in the deployment environment only. **The Neon password was
  exposed in chat and MUST STILL BE ROTATED** — it is the one item on this
  page only the owner can close (Neon console; then delete the old Render
  Postgres). `docs/BACKLOG.md` 6.4 is the row.
  THE VALUE IS DELIBERATELY NOT REPRINTED HERE. It used to be, inside this
  very instruction — so the note telling everyone to rotate the secret was
  handing the secret to every reader of the repository, and to every clone
  and fork of it. A credential does not need to be quoted to be rotated.
  (Redacting it here does NOT un-expose it: git history still holds it,
  which is exactly why rotation, not redaction, is the remedy.)
  Also: **"Don't use a connector"** (direct user instruction).
- Every GitHub comment/PR body ends with the Claude Code attribution footer;
  **no model identifiers** in commits/PRs (use
  `Co-Authored-By: Claude <noreply@anthropic.com>`).
- Commit messages via `git commit -qF - << 'MSG'` heredoc (backticks in `-m`
  get shell-substituted).

## Branch topology

Work on local `helm-land`. Push after every commit to all three:
`helm-land:main` (deploys), `helm-land:claude/bretwalda-bloot-moot-aaa-9th390`
(designated), `helm-land:helm-land`. On a container rollback:
`git reset --hard origin/main` and rebuild — origin holds everything.

## State at handover

**Main is current through the 7.9a clips half** — the gating browser pair
came back green (playtest 38/38, touchtest 32/32) at the very end of the old
session and everything was merged. Main, the designated branch and
helm-land are identical at handover.

## Landed this session (all merged, all gated)

- **5.5 marks** (earned-only per ruling) + the **save-wipe** and
  **paid-weapon-finish** defects found under it, fixed and measured.
- **7.1** heavy rebalanced to 30 stamina, chain multiplier drawn; classmatrix
  6/6 in band.
- **Owner's screenshot round**: floating cloak clasp reseated on the cloth
  itself (all four cuts), shield rim crescents boarded, cape rear gathered,
  victory-screen volume toggle moved, oath mirror rebuild gate fixed
  (`sameAppearance` never learned weapon/people — third comparator defect).
- **8.5** First Moot staged: empty ring, foe walks in at STRIKE (`add_bot`
  mid-match spawns lawfully via `dealLateSpawn`), pips + LEARNED flash.
- **8.8** react-doctor: enforced eslint gate 0/0; the capture-harness saga
  (three instruments, one ordering law) ledgered in OPEN-DEFECTS — /shot's
  framing globals now write in the lazy initializer BEFORE any child mounts.
- **cosmetictest hardened**: pins `quality=high` (the instrument was demoting
  itself), keeps every capture PNG in `.cosmetictest/caps/`.
- **7.5 banners**: §9-sourced devices planted on all five grounds
  (`banners.ts`); the Dyke flies both sides; village palisade banners carry
  the holder's device.
- **8.6** boundary audit: all five grounds have diegetic edges — closed.
- **8.4** menu sweep: two corner collisions fixed (armoury sticky label,
  lobby invite measure); capture-timing artifacts documented.
- **7.8 forged score** (`score.ts` + `scoretest` 16/16): drone/war-drum/lyre
  in D dorian pentatonic, scene-driven, drone runs only while audible
  (soundtest 46/46 restored after the node-budget lesson).
- **7.6**: `seasonName()` twelve-name cycle on the war map (warsay 52/52);
  Roll of Honour chips — DEEDS (banner + THIS WEEK filters) and lifetime
  WINS/KILLS/HONOUR boards (`statRoll`).
- **7.2 Steam scaffold**: `tools/platformcheck.mjs` (6/6) holds the
  dual-platform laws mechanically; `steam_id` column + unique index land via
  `ensureSchema`; door design in `docs/PLATFORM-PATH.md` §8. The Tauri build
  deliberately does NOT land from a container that can't judge it.
- **7.4 The Burh** (`burhtest` 19/19): 1–4 defenders vs waves of the here;
  mode string finally validated; waves via `dealLateSpawn`; fallen rise at
  62%; wave on every snapshot and the verdict; HUD + summary surfaces.
- **7.9a clips**: kill replay records itself to WebM through the deathcam
  lens; SAVE THE CLIP on the summary; feature-detected, low-tier policy with
  `__forceClip` harness door; `clipseen` PASS (36,829 bytes vp9). **On work
  branches, merge gated as above.**

## The remaining board (in order)

1. ~~7.9b spectate seats~~ — LANDED after this handover was written (the
   mead-bench; benchtest 23/23, benchseen 4/4). 7.3 is unblocked.
2. **7.3 Tournament Moot** — bracketed 1v1s, 4–8 men, on honour_duel; the
   hall watches the final (sequenced after spectate by the owner's ruling).
3. **7.7 fight depth** — executions (build on gore + kill-cam), weapon choice
   per class (2–3 historically right weapons with trade-offs), then
   directional guard (the 7.1 rebalance was its prerequisite, done).
4. **8.7 AAA smoothness** — frame-pacing/hitch audit, measured not vibes.
   The react-doctor CLI's advisory findings (will-change, render-time
   rebuilds, response-status checks) are folded in here.
5. **8.9 nothing-left-behind sweep** — reconnect mid-fight, settings surface
   (sensitivity/shake/colour-blind), loading polish, PWA shell, error-toast
   language, bot curve sanity.
6. **Owner-pending**: The Burh's NAME (id `the_burh` is stable; put
   alternatives to the owner); cloak-rear premium design (taste item,
   ledgered); the 11-error react-doctor… no — that's done; the Tauri build
   (needs the owner's machine or CI).

## The gate battery (run what the diff touches; all green at handover)

tsc --noEmit · npm run lint (0/0) · npm run build · wearmeasure (all
sections; standing 5-window deferral) · cosmetictest (full render; PASS) ·
helmclash (compare vs baseline LAYERS 19/FLESH 24/WRAP 6/CREST 8/PELT 74/
SEAM 13 — never vs zero) · warsay 52/52 · wartest 82/82 · protocoltest 81/81
· solidtest 12/12 (standing deferral) · playtest 38/38 (×3 widths for layout
work) · touchtest 32/32 (×4 shapes; tablet's "lock holds facing" claim
flickers ONLY with self-reported multi-second stalls — re-measure on quiet
hardware before believing a red) · moottest 25/25 · marktest 25/25 ·
scoretest 16/16 · burhtest 19/19 · platformcheck 6/6 · clipseen PASS ·
soundtest 46/46 · goretest 36/36 · locktest 6/6 · weightprobe 24/24 ·
profiletest 22/0 (degraded; no DB here by the credentials rule) ·
classmatrix (~3 min, only for balance changes) · fighttest 23/23 ·
benchtest 23/23 · rejointest 12/12 · tourneytest 38/38 · armsprobe 16/16
· bottest 11/11 · benchseen/tourneyseen/armshot (browser probes) ·
factionread — NOT green and not expected to be: 26/34 is the rose
settlement's clocked baseline (see OPEN-DEFECTS), the walk costs ~101
min, and node BLOCK-BUFFERS to pipes: `stdbuf -oL` into a file or the
run is silent and looks hung. Two healthy runs were killed for that.

## Hard-won laws (do not relearn these)

- **Never run two heavy browser suites concurrently** on this box — capture
  verdicts flicker (paint flat, locks stall). Serialize; re-run a red alone
  before believing it.
- **Look at the pictures.** Two full debugging days were lost to arguing
  with numbers while the captures showed the wrong scene. cosmetictest keeps
  its PNGs now; probes must view their own screenshots.
- **A field added to `Appearance` must reach every comparator**: the
  CharacterPreview destructure, armouryStage `sameAppearance`, server
  `SLOT_FIELD`, and `signatureOf` (note: signatureOf still omits
  weapon/people — worth checking whether rig caching needs them).
- **Child effects run before parent effects** — anything a canvas mount
  reads from `window` must be written in a lazy initializer or before the
  child renders, never in a parent effect.
- **The engine stays headless** — platformcheck enforces it; `tuition.mjs`
  is the one named storage seam in the sim.
- Evidence dirs under `art/` are gitignored per-directory; ledgers point at
  them. Scratch capture scripts live in the session scratchpad.

## Immediate next actions for the new session

1. `git fetch origin && git status` — confirm/recover local vs origin/main.
2. Begin 7.3, the Tournament Moot (7.9b landed; the bench is its seat).
