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

- **2 Sep 2026 (late): Steam, iOS and Android wait for the Unity + Blender
  rebuild.** "Steam/iOS/Android won't be ready until we start building in
  Unity & Blender for improved visuals & animations." So the store rows in
  BACKLOG stay parked and are not this codebase's next step; the web build
  and the Tauri wrapper remain the shipping surfaces until then. The
  monetisation and platform-path documents should be read with this on top.
- **2 Sep 2026 (late), four findings from the owner's phone and a touchscreen
  laptop:** touchscreen laptops loaded as mobile; the thumb on the fist reads
  wrong; beards read thin in parts and unnatural, with and without a helm
  (and the fix must not disturb armour or other cosmetics); and the graphics
  panel on the phone was shown at "Fast". All four are worked below.

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
`docs/BACKLOG.md` in place, with the correction marked.

Three more of the same kind turned up once the habit was on: **six gate counts**
in this file's own battery were stale (all but one of them LOW, so a green run
would have read as a regression); **the shipped manifest was a shadow copy**
contradicting an owner ruling; and **Wave E's own postscript** contradicted its
heading. The pattern is always two places holding one fact and one of them
edited.

| row | said | actually |
|---|---|---|
| **Wave E — the second ground** | *NOT STARTED... the biggest visible change per hour* | **DONE 24 Aug.** Its own postscript says so; only the heading was stale. **FIVE grounds ship** — `saxon_village`, `pict_moor`, `roman_fort`, `danelaw_camp`, `offa_dyke`. **But one piece of it is NOT built — see below.** |
| **Rating** | *NOT STARTED — no `rating`/`elo` column* | **ANSWERED by 4.6, 24 Aug, deliberately:** *"the rating IS season points — a second rating would be a second truth."* There is no column BY DECISION. Adding one undoes a ruling. |
| **Hearths** | *NOT STARTED — no table, no reference* | **DONE 24 Aug** (row 4.4). `src/db/hearths.ts`, warsay 44/44. |
| **PWA** | *NOT STARTED — no manifest, no service worker* | **Shell DONE 27 Aug** (row 8.9): `app/manifest.ts`, `public/sw.js`, forged icons. Only the EARNED prompt was missing — built and photographed this session. **And the manifest that shipped was the WRONG ONE** — see below. |
| **The grade's cause** | `adaptBand` / the metered response | **Wrong stage.** Contrast has been luma-preserving since 22 Aug and removing the meter moves the board's hue the WRONG WAY. It was the anisotropic chroma skew. |

### ~~The one piece of Wave E that is NOT built~~ — BUILT 2 Sep 2026: the cold key

**Done as a third `Mood`, `cold`, chosen by the ground's `climate`** (see the
Wave E row in BACKLOG for the tables and the two traps). The moor no longer
reads as orange sand; `gradesplit --gate` on the village was re-run after.
The camp is the obvious next ground to hand `climate: "cold"`. The section
below is kept as the argument it was.

### The one piece of Wave E that was NOT built, and it is the piece it argued for

`docs/MAPS.md` asked ground two for a **cold KEY LIGHT**, and the whole case for
building it second was that mechanism: *"A ground with a cold key and a wide
horizon changes every material in the game WITHOUT TOUCHING ONE OF THEM, and it
is the cheapest way to make map two feel like a different game."*

The moor is cold, open and unmistakable — but it gets there the other way round.
`render/moor.ts` says so in its own header: *"the arena's rig is a low sun and it
multiplies a warm albedo twice over"*, and its first cut *"read as ORANGE SAND,
not moor"*, so **every material was pulled cold and dark by hand** to survive the
warm key. `render/camp.ts` inherits the finding verbatim — *"Winter fen under the
dusk rig. The moor's lesson stands."*

So all five grounds share one warm dusk rig, and the cheapest lever this wave
named has never been pulled. That matters twice now: it is still the largest
untested change to the look, and **it is the change most likely to disturb the
grade that landed today** — a cold key moves the white balance's illuminant,
which moves the opponent axis the chroma stage expands across.
`tools/gradesplit.mjs --gate` is the instrument for that question, and it did
not exist this morning.

## Landed 3 Sep 2026 — the rebuild's grounds, and Unity lit at dusk

- **Three first-experience findings from the owner (3 Sep, evening), web
  first.** (1) THE TOUR SCROLLS TO ITS STOP: the third act measured its
  doors but never moved the page, so on a desktop a door below the fold
  was ringed off-screen while the scrim held the page still — each stop is
  now scrolled to the middle of the window before it is measured. (2) THE
  RITE PAUSES: a new wire message `hold_bots {hold}` (solo rooms only, for
  the reason `arm_bots` has no way back) holds every bot while a phase's
  card is up in an armed phase and drops the hold on "I AM READY" — the
  fight physically stops while the card is read. Sent after the arming so
  the arming cannot drop it. (3) WHO IS WHO: `warRoster()` (db/war.ts) lists
  every sworn man by allegiance and hearth with the season's points; the
  API returns it on `roster: true`; `Roster.tsx` on /factions reads it BY
  KINGDOM (four columns in the kingdoms' colours, houses as cards, free
  swords beneath) or BY HEARTH (every house across the kingdoms, largest
  first, wearing its kingdom's swatch), with a search box and the viewer's
  row and house marked. Unity has the roster too (`RosterPanel`, off the
  same API, from the menu's WHO IS WHO) and THE FIRST MOOT (`FirstMoot.cs`:
  a first arrival's TRAIN is the rite — empty ring, the foe walked in held,
  four phases with their cards, `hold_bots` while a card is up, beats read
  off the snapshot; REPLAY THE FIRST MOOT afterwards). The web's third-act
  tour has no Unity counterpart because the Unity menu is one screen with
  nothing below the fold. Gates: moottest 41/41, protocoltest 85/85 (four
  `hold_bots` claims, solo-only), warsay's three roster claims on a local
  Postgres, warshot of /factions judged (four columns, free swords carded).
- **Mouse right turns right (owner's finding, both clients).** The web rig's
  yaw grows toward the man's LEFT (forward is (sin yaw, cos yaw) in a
  right-handed Y-up world), and the mouse path was adding the mouse's
  rightward motion to it — inverted for as long as it existed. Negated at
  the source (`GameCanvas.tsx`, the one `rig.look` call for the mouse), so
  the lock's flick-to-switch reads the same sign; the touch path is left
  alone on purpose. Unity's yaw runs the other way (left-handed), so its
  sign is right by the maths and stays; the menu carries INVERT MOUSE X
  (PlayerPrefs) for the hand that still finds it wrong — unseen, like the
  rest of the Unity client.

- **The five grounds are out of the code as glTF.** `tools/blender/exportworld.mjs
  --ground <id>` builds a ground exactly as GameCanvas does and writes OBJ+MTL
  with every map and a `materials.json` sidecar; `tools/blender/world.py`
  dresses and joins it (1656 village parts → 36 meshes) and exports
  `art/blender/ground-<id>.glb`; `worldrender.py` frames a judging shot. Four
  faults found and fixed on the way, each recorded in REBUILD-PLAN: the
  per-vertex tint the OBJ never carried (turf, path, mud were missing — the
  village rendered as snow), material colours above 1 (baked into vertex
  colour or map), roughness read as luminance instead of scalar × map.g
  (stone came out as chrome), and the other four grounds registering
  themselves in modules the exporter never imported (every ground was the
  village). Numbers and two honest gaps (plain banner cloth, static flame)
  are in `docs/REBUILD-PLAN.md`.
- **Unity loads the real ground and lights it the game's way.** `GroundView`
  loads `ground-<arena>.glb` on join and re-dresses vertex-tinted meshes in
  `Bretwalda/Ground` (the ground fragment of `render/world.ts` as a URP
  shader). `MoodLighting` is the dusk rig and cold override of `lighting.ts`
  over π, sky.ts's FogExp2, ACES + bloom through a runtime Volume.
  `HearthFire` stands a particle fire and the rig's hearth light where the
  bonfire is. SceneBuilder version 13 by the end of the day (the version is
  bumped whenever the scene's wiring changes, or a stale scene is not rebuilt).
- **Reference frames of the moor, fort, camp and village** were shot off the
  real `/shot` route (a scratch script over `tools/lib/browser.mjs`) and read
  against the Blender renders: geometry and materials match; the darkness
  of the moor and camp under a flat sun is the game's dusk missing, not a
  fault in the export. Do not "fix" the moor's peat tint — it is 0.07 in the
  game too, lit by the hearth.
- **The men now leave the code with the game's own skeleton.**
  `tools/blender/exportrig.mjs` calls `createWarriorRig` on a stand-in
  player and writes bones (named by identity) and the game's own weights;
  `rig.py` builds the armature and exports a skinned glTF (25 joints, ~46
  skinned meshes, ~31k triangles before strands and ~45k after); `strands.py`
  grows on it; `clips.py`
  authors nine clips (idle, walk, run, attack, heavy, block, dodge, hit, die)
  in the man's own terms and exports them as glTF animations; Unity's
  `ClipDriver` plays them by fight state. Judged frame by frame in
  `cliprender.py` renders, five rounds; REBUILD-PLAN has each round.
  **The finding that cost the most:** the rigged men rendered white — the
  game's `rig:shadow` proxies (colorWrite off, there only to cast) came
  through the OBJ as an opaque white shell; the exporter skips anything
  that does not write colour. Second finding: the Hips bone's head is the
  body's origin at the FEET, not the waist, so a hip pitch is a plank
  fall about the ankles.
- **Law: every Blender tool in `tools/blender/` saves to
  `art/blender/warrior-<cls>.blend` BY CLASS NAME, whatever file it was
  opened on.** Running `strands.py` on the scratch pivot-generation files
  to render portraits overwrote all four rigged files (their glTFs were
  recovered from Unity's copies; the .blend files were rebuilt from the
  `.rig.obj/.json` in ten minutes). Rebuild order when that happens:
  `rig.py` → `strands.py` → `clips.py`, per class.
- **Laws paid for today:** a Blender script variable named `out` shadowed the
  output path and cost a render round; a shared `tex-world/` directory had the
  dyke's turf overwrite the village's under the same file name — maps now go
  to `tex-world/<ground>/`.

## Landed 2 Sep 2026 (the session after the one below)

- **Hearth standards — the Flags row.** `src/game/standards.mjs` (thirteen
  §9 devices, each tagged FIND/TEXT/INVENTION in the UI, none from the AVOID
  list), `hearths.standard`, `act: "standard"`, the picker on /factions, the
  glyph beside names in the lobby and the summary ledger, narrowed at every
  appearance door like `mark`. standardtest 11/11, warsay 64/64 on a real
  Postgres.
- **The handover hitch, closed.** Shader compilation after all; the countdown
  now compiles the tableau's programs. `tools/hitchprobe.mjs` is the ruler:
  22–36 ms where it was 268–337. Three dead ends ledgered in PERFORMANCE.
- **Every browser tool through `tools/lib/browser.mjs`** (40 more) and every
  spawning tool (50) guarded by `watchBoot` — which only works because BOTH
  servers now exit 1 on a held port instead of idling on their engine tick.
  Proven: a stranger on the port makes `hudshot` exit 2 with the reap line.
- **A local Postgres for the database halves** (recipe in the laws): warsay's
  hearth block and profiletest's 78/78 ran on a machine for the first time.
- **Three instrument fixes**: spectatetest's emitted copy resolves the
  `@/game` alias (its node half had not loaded since 8.7); touchtest's look-side
  sweep knows the TAKE pad (it ate 102 points when a drop lay near); bindsync
  forces its canvas clicks (a fight canvas under shake is never "stable") and
  closes its browser on failure (it used to hang, twice read as "hung").
- **The TAKE labels no longer say "the THE GAR".**
- **A3's helm reprice, against a ruler** (`tools/helmrungs.mjs`, mm of outline
  over the spangenhelm): Spectacle 280→150, Jarl's Crowned 570→340, Shadow
  Hood 120→200; the bowls and crests turned out to be built already.
- **The mute follows the player, proven** on real rows (profiletest 82/82), and
  the stale "bloom is unreachable" entry closed — the thresholds have been
  under the clip points for some time.
- **The cold key on the moor and the camp** (Wave E's unpulled lever): `Mood` `cold`,
  chosen by `grounds.mjs`'s `climate`; one entry in each of the three mood
  tables. Before/after in `art/look/cold-*`.
- **The whole procedural warrior exports as a mesh** (`tools/blender/exportwarrior.mjs`, all four classes, 46 parts on the huscarl) and the Unity client draws those instead of capsules.
- **The Unity client's first milestone is written** (in the owner's project
  repository, not this one): socket, snapshot switch, input, capsule warriors
  with the code's head, a code-built duel scene. See REBUILD-PLAN.
- **The rebuild's first asset exists**: the game's head as a real mesh, out
  of the code by `headMesh` → OBJ → Blender (`tools/blender/`), all four
  classes exported, the huscarl rendered with subsurface skin. Blender is
  driven headless in the background (`Blender -b -P`); the MCP add-on takes
  one client at a time and another session held it.
- **The fist's thumb crosses the fingers** and the palm block is rounder
  (the owner's "thumb looks wrong"). **The beards are fuller, plumb on the
  throat, thicker-walled and broken at the hem** (three rounds, every seat and
  clash gate green) — and honestly still one shell: a strand system is a
  Unity/Blender item, and OPEN-DEFECTS says so.
- **Touchscreen laptops are desktops again** (`isTouchPrimary`: coarse
  primary pointer and no hover, not touch merely present) — tier probe, HUD
  mode, quality ceiling and speaker guess all follow it.
- **The per-frame garbage halved** (148 → 86 GC/min at low): three was
  re-resolving programs every frame — materials shared between skinned and
  plain meshes (`materials.twin`), and transparent double-sided quads drawn
  twice with `needsUpdate` (`forceSinglePass`). `fpstest --phases=alloc` and
  `tools/rekeyprobe.mjs` are the new rulers.
- **The shield board is dished** (70 mm, planks turned to the dome; edge-on a
  bow, not a plank) — A4's one live fault, the rest of the row was stale.
- **A taken Dane axe is carried over the shoulder on every body**, and a
  borrowed rest is lifted by the reach the arm lacks; the huscarl's own carry
  had the head in the turf too, hidden behind his board.

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
  registered in `platformcheck`. **SEEN, not asserted** — `tools/installseen.mjs`
  fights a real duel, wins it, and photographs the summary
  (`art/shots/install-offer-won.png`), with a control that already answered and
  is correctly not asked again. 12/12.
- **AND THE MANIFEST THAT SHIPPED WAS NOT THE ONE THE CODE DOCUMENTS.**
  `installseen` found it on its first run. `public/manifest.webmanifest` existed
  as a hand-written copy of `src/app/manifest.ts`, and **a file in `public/`
  SHADOWS the route an `app/manifest.ts` generates** — both are
  `/manifest.webmanifest`, and the static one wins. So the served manifest said
  **`"orientation": "landscape"`** while the typed source said `"any"` and
  carried the owner's own ruling — *"This game for mobile should be supported to
  be played both landscape & portrait hand held positions"* — plus the whole
  touchtest round that found and fixed the two landscape collisions. **An
  installed phone got a landscape-locked app, which is the exact thing the
  ruling forbids.** The static copy is deleted, the route is the one source, and
  `installseen` gates that there is never a second one again.
- **`platformcheck` law 4 was imprecise** — `\b(?:window\.)?(alert|confirm|prompt)\(`
  matches after a dot, so it convicted any object with a method of that name.
  Tightened to the three globals, and proven to still convict a real offender.
- **WAVE D'S FIRST CUT — the occlusion pass was drawing the whole scene twice.**
  617 of the frame's draws were `GTAOPass`'s own depth/normal prepass, filling a
  buffer the beauty pass had computed one pass earlier and discarded. The
  composer's buffers now carry a depth TEXTURE and `setGBuffer` hands it over.
  Controlled A/B, one session, `--secs=25`, tier high, eight-man brawl:
  **10.10 → 7.60 ms, 1229 → 922 draws, 2764k → 1897k triangles.** Occlusion
  measured unchanged (mean luma +0.15 of 255 over 20 frames), cosmetictest 19/19
  in software, and the suite itself went 3176 s → 2384 s.
- **AND DEPTH OF FIELD HAS NEVER RENDERED A FRAME.** `BokehPass` has the same
  defect and the same fix was written — then the caller was looked for and there
  is not one. Nothing calls `setDepthOfField`, so `bokeh.enabled` is false for
  the life of every session. The optimisation was **reverted rather than
  shipped**: optimising a pass that never runs is the same mistake as fixing a
  gate that cannot fail. See the board below — it is a design call now.
- **DEPTH OF FIELD — the pass that never ran, now on the two authored shots.**
  The design call was mine under full reign: on for the deathcam replay and the
  victory tableau, off in the fight. The rig writes `ctx.focus` to its own aim
  in the photo/summary branches (the deathcam rides that branch), so the sharp
  plane sits on the face; blur ceiling 0.0045 not 0.006 (palisade smear, a halo
  on the victor). Seen in `art/shots/dof/` as a high-vs-medium A/B. And the
  measured BokehPass cut is taken with it — one full-screen quad packs the beauty
  depth into the pass's target instead of a third scene draw; reads `sceneDepth`,
  not `read`, because `AoComposite` swaps.
- **TAKING A DEAD MAN'S WEAPON — the second gameplay feature.** Every death
  leaves his effective arms on the floor (`room.drops`, capped at 8, cleared
  each round); `take` (`KeyG`, or a TAKE pad that exists only while something
  is at his feet) inside 1.5 m puts them in his hands as `taken: {cls, arms}`,
  and the delta rides the WEAPON — a runekeeper with a Dane axe has the axe's
  reach and the haft's guard. A sword comes with its board, an axe slings it.
  Rig rebuilt holding it, prop on the ground, HUD names it, the take-up voiced.
  Bots never take. `taketest` 18/18. **The fixture's lesson**: a kill leaves the
  killer in hitstop and `processInput` returns before it reaches anything — a
  man cannot bend for an axe in the frame his sword stopped.
- **SPLINTERING SHIELDS — the first gameplay feature of the session, and the
  owner's first-ranked unstarted row.** A huscarl's board is a consumable now:
  integrity 100, worn by every turned blow (light 9, heavy 24, wrong line ×1.5,
  nothing under SHIELD WALL), bursting at zero with a `shield_burst` wire event
  after the blow that broke it, a 1.5× stagger, the board dropped off the rig,
  and a haft's guard (×0.5) until he respawns. Cracks at a third, six tenths and
  85% gone; splinters off every block past half; a graded crack-split-rattle
  sound; a strip under stamina. Bots stop turtling behind splinters. `SHIELD`
  lives in `engine.mjs` and is mirrored in `types.ts` with the mirror gated in
  `shieldtest`. **classmatrix 6/6 in band** — with its standing caveat that the
  bot brain lets only 6.6% of duel damage meet a raised guard, so what this
  does to a HUMAN turtle is the thing to watch in play. Everything
  photographed in `art/shots/shield/`.
- **The "multi-second stall" was the ruler**, and this file said otherwise
  earlier in the day. Measured without `fpstest` in the way: 18 ms worst frame on
  the phone preset, ~350 ms at tier high, one frame, LOCATED to the
  replay→tableau handover. Do not read `fpstest`'s `worst` column.

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
- ~~**A3: the ten helm bowls and §5's reprice.**~~ **DONE 2 Sep 2026, and the
  row was NOT honest** — its line range pointed at the hair table, the bowls
  and crests were already built, and the colour reprice had already happened.
  What remained was the helm reprice, now done against `tools/helmrungs.mjs`
  (mm of outline over the spangenhelm): Spectacle 280→150, Jarl's Crowned
  570→340, Shadow Hood 120→200. See the row for the numbers.
- **Flags.** **DONE 2 Sep 2026 — hearth standards** (`src/game/standards.mjs`,
  `hearthStandard`, the picker in `factionMap/Hearth.tsx`, the glyph beside
  names; standardtest 11/11, warsay 64/64 on a real Postgres). Was: constrained presets, a moderation
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

  **AND THE FIRST CUT IS TAKEN — the AO pass was drawing the whole scene twice.**
  617 of the frame's draws were `GTAOPass`'s own depth/normal prepass, filling a
  buffer the beauty pass had already computed one pass earlier and discarded.
  `postfx.ts` had this written down as a known trade and left it *"not worth
  doing blind"*; the ablation is what made it not blind. The composer's buffers
  now carry a depth TEXTURE and `setGBuffer` hands it to the pass, which drops
  the prepass. Same session, same `--secs=25`, tier high, eight-man brawl:

  | | frame p50 | draws | triangles |
  |---|---|---|---|
  | as it shipped | 10.10 ms | 1229 | 2764k |
  | **reusing the beauty depth** | **7.60 ms** | **922** | **1897k** |
  | | **−25%** | **−25%** | **−31%** |

  Quality held and was measured, not asserted: over 20 frames mean luma moved
  **+0.15 of 255** and the dark-pixel share **+0.58 points** — the occlusion is
  if anything a fraction stronger — `gradesplit --gate` holds at 6.1 dH\*, and
  the close lenses keep their contact shading with no silhouette haloing. The
  cost is honest and stated in `docs/PERFORMANCE.md`: with no normal buffer the
  shader reconstructs normals from depth, which is a worse normal at a
  silhouette.

  **BOTH ARMS MUST BE MEASURED AT ONE RUN LENGTH.** The baseline moves with
  `--secs` (14.90 at 14 s, 18.70 at 60 s, 10.10 at 25 s), so a number from one
  length says nothing against another. A first draft of this compared 7.60
  against 18.70 and would have claimed a 60% cut.

  The full table is in `docs/PERFORMANCE.md`. The four that mattered before that
  cut:

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

  **AND THE "MULTI-SECOND STALL" WAS THE INSTRUMENT — I said otherwise earlier
  today and it was wrong.** `fpstest`'s summary row reads `worst 7705 ms` and
  the ablation baseline `11240 ms`, and a first draft of this file called that
  "something a player would report". A dedicated probe then fought real matches
  with none of `fpstest`'s instrumentation in the way: **18 ms worst frame on
  the phone preset, ~400 ms at tier high, one frame.** No multi-second anything.
  Two candidates are dead and named in `docs/PERFORMANCE.md` so nobody spends
  them again — it is NOT shader compilation (14 ms of blocking link queries in a
  whole session) and NOT the clip recorder (removing `MediaRecorder` made the
  worst frame WORSE, 671 vs 376 ms). **Three candidates are dead** — not shader
  compilation, not the clip recorder, and not DoF (`high` 348 ms vs `medium`
  318 ms, and DoF is the thing that differs between them). **And it is LOCATED:**
  match_end at frame 466, the hitch at frame 704, the summary mounting at frame
  714 — the replay holds 240 frames, so the hitch is neither in the replay nor
  in the summary but in the HANDOVER between them, where the victory tableau is
  staged. `render/summary.ts` is where the next round should point its profile.
  A fixed ~0.3–0.4 s stutter at a scene change, on `medium` and `high`. **Do not read `fpstest`'s `worst` column as a
  player-visible stall**; its p50/p95/p99 agree with an independent measurement
  and its `worst` is out by an order of magnitude. **CLOSED 2 Sep 2026 — see
  "Immediate next actions" 4 and `docs/PERFORMANCE.md`: it was shader
  compilation, and the countdown now compiles it.**

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
scoretest **19/19** (was 16/16) · platformcheck **6/6** · **shieldtest 18/18** (new) · **taketest 18/18** (new) ·
**standardtest 11/11** (new, 2 Sep) ·
warsay **64/64 with `WAR_TEST_DB` on a local Postgres** (52 with no database; was 54) · wartest 82/82 · protocoltest 85/85 ·
moottest **41/41** (was 25) · marktest **38/38** (was 25) ·
burhtest **24/24** (was 19) · tourneytest **39/39** (was 38) ·
goretest **35/35** (was 36) · locktest 6/6 · weightprobe 24/24 ·
fighttest 23/23 · benchtest 23/23 · rejointest 12/12 · armsprobe 16/16 ·
bottest 11/11 (240 bouts a rung, seed 20260813) · cardgate 17/17 ·
**installseen 12/12** · summaryflow 18/18 ·
solidtest **16/16 with 1 deferral** (was "12/12") ·
soundtest 46/46 · playtest **38/38 — BUT SEE THE BROWSER-BINARY LAW BELOW** ·
touchtest **33/33** (x4 shapes; was 32/32 — the TAKE pad is in its cluster) ·
**bindsynctest 21/21 with `BRETWALDA_GPU=1 PROFILE_TEST_DB=…`** (first time on a
workstation: forced canvas clicks, waits for the respawn, declines the tuition
card) · clipseen PASS · wearmeasure ·
helmclash (COMPARES ITS OWN BASELINE — exits 1 when a section gets worse) ·
cosmetictest (see above; software for a verdict) · profiletest 22/0
(degraded; no DB here by the credentials rule) — **82/82 with `PROFILE_TEST_DB`
on the local cluster** (four mute checks added 2 Sep) · classmatrix (~3 min, balance only) ·
**rekeyprobe 3/3** (new, 2 Sep; no material re-keys its program between frames) ·
**hitchprobe** (new, 2 Sep; `BRETWALDA_GPU=1`, worst frame after the verdict
22–36 ms at high and medium; a reading over 100 ms with links in it is the
handover hitch back) · spectatetest 12/14 (the ledgered count; its node half
loads again after the `@/game` alias fix in the emitted copy) ·
**gradesplit --gate PASS** (worst 6.7 dH\* against a bar of 10) ·
**cosmetictest 18/19 on the GPU — the one FAIL is its byte-identical claim,
which is the GPU and not the game; the same claim reads 0.0000% in software** ·
**factionread 27/34 —
NOT green and not expected to be**; §7.1 has a written defect behind it
(2 Sep, GPU arm: worst +2.475, the residue is the leg wraps' lifted value under
the fire — the owner-ruled mechanisms; the table in OPEN-DEFECTS carries the
GPU column).

**`BRETWALDA_GPU=1` works on `factionread`, `cosmetictest` and `vatprobe`.**
~~The other 32 browser tools still hard-code SwiftShader~~ — **DONE 2 Sep 2026:
every browser tool in the drawer (40 more) now launches through
`tools/lib/browser.mjs`, so `BRETWALDA_GPU=1` reaches all of them, and every
tool that spawns a server (50) guards it with `watchBoot`.**

## Hard-won laws (do not relearn these)

- **The Unity client's C# can be compiled HERE, without the editor:
  `tools/unitycheck.sh`** (Roslyn from the .NET SDK against Unity's own
  engine/editor modules, its netstandard 2.1 reference set, and the package
  assemblies the owner's last editor compile left in
  `Library/ScriptAssemblies`). Run it after every C# change; it is the only
  compile you will get until the owner's editor regains focus. It cannot
  run the scene — a clean compile says nothing about what Play shows.

- **A red on an INPUT claim is probably the wrong BROWSER BINARY.** `playtest`
  reads **35/38** on Playwright's headless SHELL and **38/38** on the full
  browser, same tree, same commit: the shell has no real pointer-lock, so its
  three mouse-look claims fail with `WrongDocumentError`. The container had a
  full browser at `/opt/pw-browsers/chromium`; a workstation running `npx
  playwright install chromium` gets the shell. **On a workstation, run playtest
  with `BRETWALDA_GPU=1`** — that arm asks for `channel: "chromium"`, which is
  the one with pointer lock. Check the binary before you check the diff.
- **REBUILD BEFORE BELIEVING PLAYTEST.** It starts `custom-server.mjs` on the
  PRODUCTION bundle whenever `.next/BUILD_ID` exists, and that bundle is
  whatever `npm run build` last made — on 3 Sep it was a day old, and the
  suite "passed" the mouse-look fix while running the code before it (the
  turn's sign in its own PASS line said so: rotation rising on a rightward
  sweep). `npm run build` first, then `BRETWALDA_GPU=1 npm run playtest`, and
  read the numbers in the PASS lines, not just the word.
- **REAP STALE SERVERS BEFORE BELIEVING A BROWSER SUITE.** Every tool here picks
  a port off its own pid and then waits for `/api/health`. If a server from an
  earlier killed run still holds that port, the spawn dies with EADDRINUSE **and
  the health check answers anyway, from the stranger** — so the suite measures
  an OLD BUILD with a live room already in it. Fourteen had accumulated in one
  session. The failures read as "the manifest 500s" and "the mode menu never
  opened" and neither had anything to do with the tree. `pkill -f
  custom-server.mjs` between runs — **BUT ONLY WHEN NOTHING IS RUNNING** (see
  the next law). **Since 2 Sep every tool in the drawer refuses rather than
  adopts** (`watchBoot` in `tools/lib/browser.mjs`), and that took a fix at the
  source: **the servers used to log EADDRINUSE and stay alive on their engine
  tick**, so no exit-based guard — `installseen`'s included — had ever fired.
  `custom-server.mjs` and `dev-server.mjs` now exit 1 on a listen error, which
  is also what production wants (die and be restarted, not idle). Proven: a
  stranger on the port makes `hudshot` exit 2 with the reap command on its
  second line.
- **`pkill -f custom-server.mjs` KILLS THE SERVER OF WHATEVER SUITE IS RUNNING.**
  Broken twice now (a playtest on 1 Sep, a bindsync on 2 Sep — exit 144, a
  run thrown away). Kill by the PID you started, and reap the drawer only when
  `ps` shows no suite alive.
- **The database halves run locally.** `brew install postgresql@16`, then
  `LC_ALL=C initdb`/`pg_ctl -o "-p 54329 -h 127.0.0.1"` into the scratchpad
  (the socket path must stay short, and without `LC_ALL=C` the postmaster
  aborts "became multithreaded during startup"). Then `WAR_TEST_DB=…` for
  warsay (a bare `DATABASE_URL` trips its no-database claims), `PROFILE_TEST_DB=…`
  for profiletest and bindsynctest. warsay's whole hearth block had never run
  on a machine before this.
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

## Immediate next actions (rewritten 3 Sep 2026, end of session)

1. Read this, then `docs/REBUILD-PLAN.md` (the rebuild's own ledger, step by
   step with what each render said), then `docs/BACKLOG.md` and
   `docs/OPEN-DEFECTS.md`, and **verify every row against the tree before
   working it.**
2. **The Unity client is the work now** (`BRETWALDA - Blood Moot/`, its own
   repo, main pushed through the cut-out strands). It has: the wire, menu
   with the four portraits, HUD, hit feedback, the five real grounds under
   the game's dusk rig with a particle hearth, four skinned men with the
   game's skeleton, strand beards and hair, nine clips driven by fight
   state, weapons on the wrist mounts, and sound made in code. **None of
   today's C# has been seen running** — it compiles (`tools/unitycheck.sh`,
   21 scripts, 0 errors — plus `npm run unitywire`, 10/10, which reads the
   Unity client against the engine and fails on any word it waits for that the
   server never says), but the owner's editor is the only Play there is.
   First thing when it has focus: press Play, TRAIN, and judge — the ground
   under the dusk, the men moving, the sound. Expect tuning, not surprises.
3. **Open on the men:** cosmetics over the wire are BUILT (64 props,
   `Cosmetics.cs`; REBUILD-PLAN's last section) but unseen; the props' size
   (42.4 MB across the 64, GEOMETRY not textures since the images were
   stripped — the strand ribbons are what is heavy) is a budget line; the
   strand count is unbudgeted in a sixteen-man moot; the walk's stride rate and the clip
   speeds are guesses until seen.
4. **Open on the grounds:** the banners fly plain cloth (the painted devices
   are drawn with canvas paths the byte-buffer stand-in cannot take); the
   bonfire's static flame is hidden under the particle fire.
5. **Owner-bound, parked by ruling:** the Steam app id and store page, the
   desktop tag, the iOS/Android wave — all wait for the rebuild. Still the
   owner's: Neon's clock half, the §7.1 mechanisms.
6. The laws above are the ones this session paid for; today's two are the
   Blender tools saving by class name, and the `cd` before every git.
