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
  keep them in the deployment environment only. **THE NEON PASSWORD WAS ROTATED
  BY THE OWNER ON 1 SEP 2026** — the credential half of `docs/BACKLOG.md` 6.4 is
  closed. The value is deliberately not reprinted here and never should be: a
  credential does not need to be quoted to be discussed, and redaction does not
  un-expose one, which is why rotation was the remedy. What remains of 6.4 is
  deleting the old Render Postgres, and that waits on the hosting move.

## The owner's rulings, 1 Sep 2026 — these SUPERSEDE what is written elsewhere

1. **Alpha profiles are disposable.** *"any profiles will be fine to be lost,
   everyone understands this is just an alpha test on Render's hosting."* So the
   ninety-day Render Postgres clock is NOT urgent and the hosting move is
   deprioritised. No dump, no restore. `fly.toml` is written and ready in the
   repo root for whenever it is wanted; `README-deploy.md` Option A has the
   five commands.
2. **The destination is DOWNLOADABLE — Steam, and the iOS and Android stores.**
   *"Final solution I'd want to have as a downloadable game on steam &
   ios/android stores."*

   **THIS CONTRADICTS A RECORDED DECISION AND THE OWNER'S RULING WINS, but the
   contradiction must not be silently buried.** `docs/MONETISATION.md` argues
   "PWA, not app stores" on three grounds: the 30% cut, a review queue on every
   update, and that this game's real discovery is a group chat rather than store
   search. That reasoning is not wrong — it is now OVERRULED, and whoever edits
   that file next should say so there rather than delete the argument.

   What it changes in practice:
   - **Steam** is already scaffolded and its blocker is named: backlog 7.2 says
     the Tauri build *"deliberately did NOT land from this container (cannot be
     compiled or judged here) ... it is §7 step 6, on a machine that can run
     it."* A Mac is that machine.
   - **iOS and Android stores are NOT planned anywhere yet.** A PWA does not
     get you into them. That wants a Capacitor (or equivalent) wrapper, an
     Apple developer account at $99/yr, a Google Play account at $25 once, and
     a review queue. Nobody has scoped it. It is a new wave, not a checkbox.
   - **PWA is still worth building** and is not wasted: it is the cheapest
     retention win on the board, it ships today with no review queue, and the
     same service worker and manifest are what a Capacitor shell wraps.

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

## The remaining board (in order) — rebuilt 1 Sep 2026 off the ledgers

**74 of 87 numbered backlog rows are closed.** What is left:

### 1. THE GRADE — four open defects with ONE cause. Start here.

`docs/OPEN-DEFECTS.md` carries five open sections. **Four of them are the same
bug and nobody has framed it that way**, which is why three separate attempts
have each fixed a symptom:

- the Danelaw's shield board renders `#a7043d` hot magenta where the material
  is `--garnet` (`#7c1420`) exactly;
- the Danelaw reads ROSE at the sleeves and the byrnie (reopened — it was once
  closed without a capture);
- the Danelaw's rose §1, cause proven and not fixed;
- the brightness ceiling bounds ONE channel and not the distance between three,
  and the Saxon's leg wraps are where it shows.

The common cause is already written down in the shield-board entry and it is
not the albedo: **`adaptBand` in `postfx.ts` meters each frame and stretches
contrast about that frame's own pivot, and `--garnet` is the most saturated dark
colour in the game — 1.84 points of chroma per point of value — so it has the
least headroom, and green is the channel with the least of it.** The albedo is
correct at every stage this repo owns; the shift happens downstream of all of
them.

**Judge it on captures with the grade ON and OFF, not on the material.** The
fifth open section (the nape-guard flare, round three) is unrelated geometry and
should not be bundled in.

### 2. THE SECOND GROUND — Wave E. Unblocked, cheap, biggest visible change.

*NOT STARTED, but NOT BLOCKED.* The seam exists; `GROUND_BY_TERRITORY` and
`groundForTerritory` are the resolver every later ground rides, and Offa's Dyke
proved it. `docs/MAPS.md` designed three and one exists. Build **map two: cold,
open, sky-lit** — a tidal flat, a frozen fen, a moor under low cloud.

### 3. RATING, then PWA. Both touch the profile that already exists.

- **Rating** — no `rating`/`elo` column and no reference in `src/`. Cheap: the
  DB exists, `matchHistory` already stores results, and the summary screen
  already has somewhere to put it.
- **PWA** — no manifest, no service worker. The install prompt is **earned**:
  never at first load, after a won match. See the ruling above on why this is
  still worth doing even though the destination is now the app stores.

### 4. Also unstarted, in rough order of value per hour

- **Splintering shields** — blocks are already typed on the wire
  (`blocked` / `blocked_heavy`); a shield that visibly wears and finally bursts
  turns turtling into a decision. All procedural, inside the existing hit pipe.
- **Taking a dead man's weapon** — `grep -rin pickup src/` is empty. The corpse
  persists and the sim knows what he carried.
- **Hearths** (clans) — first cut is a name, a member list, a tag by your name
  in the kill feed. Not territory, not chat, not war declarations.
- **A3: the ten helm bowls and §5's reprice** — several waves, untouched.
- **Flags** — constrained presets, not free-drawn; that is a moderation
  decision as much as an art one.

### 5. Carrying a measured blocker, do not restart from zero

- **The beards read as a blade in profile.** Lever FOUND: `skin` is the depth
  the face leg stands off the face, and 19 mm is a shave — 32 mm reads as a
  beard at profile without becoming a bush at three-quarter, captures in the
  ledger. **Blocked because `beardShell` is handed a skull and nothing else** —
  hair has `hairCeil` reading the whole head stack and the beard has no
  equivalent. A ceiling was built and is necessary but not sufficient; the
  numbers are in `docs/OPEN-DEFECTS.md`. Four other levers measured INERT and
  are named there so nobody spends them again.
- **The helmet flank gap (5.15)** is CLOSED BY RULING, not by a fix: closing it
  costs 89% of the Braided War-locks' silhouette, and the owner chose the paid
  hair. Reopen only with a plan that re-roots the braids off that arc.

## WHAT ONLY A LOCAL MACHINE CAN DO — read this before choosing where to run

Three items on this board are blocked on hardware this cloud container does not
have, and a Mac closes all three:

1. **The Tauri build (Steam).** Backlog 7.2, verbatim: the build *"deliberately
   did NOT land from this container (cannot be compiled or judged here — the
   'asserted, never judged' trap); it is §7 step 6, on a machine that can run
   it."* This is the whole Steam path and it is waiting on exactly that.
2. **Wave D, draw calls and allocation.** Blocked on Wave C, whose remaining
   half is *"get the matrix onto hardware with a GPU"*. This box has none — it
   rasterises through SwiftShader, one frame takes seconds, and `fpstest`'s
   ablation now REFUSES to rank because of it (2-11 frames a row, and a
   -4660 ms "cost" that is the noise floor in the ranking's own units).
3. **Honest performance numbers at all.** Every fps figure measured here is
   SwiftShader's fill rate and says nothing about a phone.

And two things simply get faster: the browser suites (`cosmetictest` takes ~22
minutes here and would be minutes on a GPU), and network-dependent work — every
Neon host, including `mcp.neon.tech`, is refused by this container's egress
policy with a 403 to CONNECT, and Postgres on 5432 times out with no route.

## The gate battery (run what the diff touches; all green at handover)

tsc --noEmit · npm run lint (0/0) · npm run build · wearmeasure (all
sections; standing 5-window deferral) · cosmetictest (full render; PASS) ·
helmclash (THE TOOL COMPARES ITS OWN BASELINE SINCE 31 Aug — it exits 1 when a
section gets worse and prints what to tighten when one gets better; the counts
below are kept as the human-readable copy only) (LAYERS 19/FLESH 24/WRAP 6/CREST 8/PELT 73 (tightened 31 Aug)/
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

1. Read this file, then `docs/BACKLOG.md` and `docs/OPEN-DEFECTS.md`.
2. **Start on THE GRADE** (section 1 of the board above). Four open defects,
   one cause, and the cause is already identified — it needs captures with
   `adaptBand` on and off, not another material change. Three previous attempts
   each moved a symptom.
3. Then the second ground, then rating and PWA.
4. Do not spend a turn re-deriving any of the following; they are measured and
   written down: the beard's `skin` lever and its four inert siblings; the flank
   gap's 89% cost; the Wyrm guard's hem/edge separation; that `cheekIn` was one
   constant moving two things.

## Also true, and easy to trip on

- **Three stale rows were found this session** (A1, A2's aim, Wave C's premise,
  4.8b) — each asserted work as NOT STARTED that was in fact done, or done that
  was in fact stale. **Verify a row against the tree before working it.** That
  is now the single most common defect in these ledgers.
- The `neon` and `neon-postgres` skills are installed in `.claude/skills/`; they
  carry the vendor's checklist and were used to find three real DB defects.
- `.github/workflows/neon_workflow.yml` makes the per-PR Neon branch run
  `profiletest` against a real, empty Postgres — the first time that gate's
  database half has ever run in CI. It works on GitHub's runners even though
  this container cannot reach Neon.
