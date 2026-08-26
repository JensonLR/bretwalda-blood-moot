# The armoury fitting review — state and continuation plan

Written 2026-08-26, mid-review, at the owner's instruction: *"if usage runs
out make sure a plan is prepared."* This file is the plan. A fresh session
should be able to pick the review up from here without re-deriving anything.

The owner's request, verbatim, in two messages:

> "Amoury fitting, shape etc. on player needs full review. long hair on
> huscarl still sticks out the back of the chain mail and looks ugly, the
> back has those weird squares under the cape and when theres no cape just
> the squares or rectangle aspects on the back. Everything needs a polish &
> upgrade for a more premium and defined feel if that makes sense."

> "Armoury should also upgrade & improve the look & feel of the items. the
> 2nd last helmet option has a floating top piece."

## Done and merged (commit `dc56f9d`, pushed to the designated branch)

1. **The baldric** ("weird squares/rectangles on the back") — was a chain of
   seven boxes; is now one swept ribbon, per-station solved on the garment
   standing furthest out at the strap's own azimuth, section reprojected onto
   the garment, per-span `fitTell` registration so `bodyFitProbe` keeps the
   case. wearmeasure fittings 16/16.
2. **The coifed mane** ("hair sticks out the back of the chain mail") — the
   fall now releases at the coif's hem into a 45–70 mm band above the station
   table (the hood's settled standoff class), no parting trough on the bagged
   route, cloak-capped at the cloth's lining. Ten failed constructions are in
   `art/backreview/` (helmed → hair11c); the working one is `hair12`.
   cosmetictest §3 paid cells back at main's numbers (1.51/1.41/1.23 vs the
   1% bar).
3. **The Wyrm-Crest floating top piece** — the serpent's rise never reached
   zero and the base offset was flat, so the tail "anchor" hovered 23 mm off
   the cap. Rise now dies at exactly t=0, base blends from the tail's own
   half-height: the first sixth crawls on the iron. `art/backreview/wyrm3`,
   `wyrm4`.

**Reproduction commands** (the review's own lens):

    npm run shots -- kitcard --cls huscarl --helm helm_nasal --hair hair_long --cloak cloak_none --turn 180 --out art/backreview/X
    npm run shots -- kitcard --cls huscarl --helm helm_nasal --hair hair_long --cloak cloak_red  --turn 180 --out art/backreview/X
    npm run shots -- facecard --helm helm_wyrm --turn 145 --out art/backreview/X

Gate battery for anything touching `characters.ts`: `npx tsc --noEmit`,
`node tools/wearsweep.mjs` (54/54), `node tools/hairmail.mjs` (6/6),
`node tools/hoodfall.mjs`, `node tools/cosmetictest.mjs --no-render`
(15/16 — the one red is the nape-guard flare main already ships red),
`node tools/wearmeasure.mjs` (fittings 16/16; helm §2 carries the same
standing nape-flare FAIL as main), `node tools/helmclash.mjs` (long; ships
red on main — compare counts against a baseline worktree, not against zero).

## Open, in priority order

1. ~~**helmclash regression check**~~ — DONE 26 Aug: baseline worktree at
   `cf9279e` read LAYERS 19 / FLESH 24 / WRAP 6 / CREST 16 / PELT 77 /
   SEAM 13; the new tree reads the same except PELT **74**. Strictly better,
   no section worse. Main still ships this ruler red — always compare against
   a baseline, never against zero.
2. **Premium polish sub-items found during the review** (each reproduced in
   `art/backreview/`):
   - The **bracer's pale upper cuff** reads as flat plastic tan from behind
     (`hair10b/zoom-blob.png`, every back capture). Deliberate design (the
     pushed-up-sleeve band of bare forearm) — the sleeve-cuff hems (`5280f5e`)
     improved the top of it; what remains is owner-level taste.
   - The **bell/collar seam nick** — a small dark dagger at the coif bell's
     midline where it meets the collar band, visible on a SHAVED control
     (`shaved/zoom.png`), so it is garment geometry, not hair.
   - ~~The **baldric's top tip** above the cloak's collar roll~~ — DONE
     (`85faf95`): the strap's garment contest skips the cloak's roll ring.
   - A small **mail wedge at the mane's root** where the release quads cross
     the bell hem (`hair12-pair.png`, left panel, top of the fall). Invisible
     at fight distance; visible at kitcard zoom.
   - The **grey sliver at the cloak's hem edge** at the left hip (down from
     the original capture but check `redcloak/zoom-sliver.png` against the
     current build).
   - ~~The **scabbard teardrop** below the warden's skirt hem~~ — DONE
     (`c1612af`): throat at the belt line, body outside the skirt.
   - The **warden's bare nape column** reads waxwork between crop hair and
     byrnie collar (`sv-warden2`). Careful: the neck is measured by the helm
     rulers — any collar or hairline change must re-run wearmeasure §2/§3.
3. **The rest of the "premium & defined" pass** — the owner asked for the
   whole armoury: run the four class kitcards front and back, all helms via
   `helmcards`, and judge each against `docs/VISUAL-BAR.md` 8+. The berserker
   baldric is invisible under his pelt (arguably correct dress; judge it).
4. **Standing ledger items** (pre-existing, in `docs/OPEN-DEFECTS.md`):
   nape-guard flare (wyrm 40.5°, suttonhoo 23.0° — rounds one to nine are
   written up; round ten was to instrument the skinGap march), the held-back
   coif taper (80cd595 — refused because it deletes paid hair; any new
   attempt must hold cosmetictest's swallow count at 2), board pigment,
   faction §1.2/§1.3, §5.1b/5.2b.

## Branch topology (unchanged)

Work on local `helm-land`; push `helm-land:main` (Render deploys),
`helm-land:claude/bretwalda-bloot-moot-aaa-9th390` (designated), and
`helm-land:helm-land`. Push after every commit — container rollbacks have
destroyed unpushed work more than once (this session started on a container
309 commits behind main).


## State after 26 Aug 2026, fourth wave — the first all-green sheet

Every tracked gate is green at once, for the first time: wearmeasure all
sections (round ten closed the nape-guard flare — the last standing red),
cosmetictest 16/16, warsay 48/48, wartest 82/82, protocoltest 81/81,
playtest 38/38 at three desktop widths, touchtest 32/32 at four device
shapes, moottest 25/25, weightprobe 24/24, soundtest 46/46, goretest 36/36.

Shipped this wave: THE FIRST MOOT (rite + doors + oath mirror), WAR PARTY
(4.7b), ability lore on every class surface, the Z Fold hitbox fix + device
matrix, mobile scene-content parity (5.2), the weapon item-cards, per-ground
hero fire (lag + feature parity), and round ten.

## State after 26 Aug 2026, fifth wave — 5.5 landed, and two saves' worth of defects with it

Shipped: the EARNED HALF OF 5.5 (ten sourced marks, the Saga picker, the
mark beside the name in lobby/ledger/landing, server-side earned narrowing
— see BACKLOG 5.5 and `tools/marktest.mjs`, 25/25), plus Offa's Dyke
earlier in the day. Found under 5.5's stone and fixed in the same wave:
the 3.3 PAID WEAPON FINISH never persisted to the server row
(`SLOT_FIELD` had no weapon slot — charged, unlocked, dropped), and EVERY
LOCAL-MODE BOOT WIPED THE SAVE (the profile mirror effect fired on mount
with defaults before the boot reader ran; masked in server mode). Both
ledgered in OPEN-DEFECTS with measurements; the wipe fix is
`diskReadRef` in `page.tsx`, proven by seed-load-read.

The fifth-wave sheet: marktest 25/25, cosmetictest 19/19 (full render),
warsay 49/49, wartest 82/82, protocoltest 81/81, solidtest 12/12 (its
standing deferral), moottest 25/25, soundtest 46/46, goretest 36/36,
locktest 6/6, weightprobe 24/24, profiletest 22/0 (degraded paths — no
DB in this box, per the credentials rule), wearmeasure every section
(its standing 5-window deferral), playtest 38/38 at 1280/1024/1920,
touchtest 32/32 at phone, fold, cover — and at the tablet shape after a
harness correction that is its own commit: the committed-swing stage
could fail to produce the super-cap sweep its claim needs (a red
indicting the stage, not the cap) and now draws harder. One residual
honesty note: the "lock holds facing" claim flickers ONLY on runs whose
own printout reports 3.6-4.9 s main-thread stalls on this GPU-less
container (5 of 7 tablet runs green, every red stall-marked, engine
untouched by the wave); it is left as-is deliberately — softening a
ruler to fit a bad box is how wrong questions start. Re-measure on
quiet hardware before ever believing that red.

**The owner's word arrived, 26 Aug 2026 — two question rounds, every
open decision ruled.** The programme is BACKLOG WAVE 7: marks stay
earned-only (5.5 closed), TWO new modes (Tournament Moot + a horde mode
pending its Anglo-Saxon name), banners in the grounds, Steam scaffold
now then mobile with everything dual-platform from here, war seasons +
leaderboards, forged dynamic score, executions + weapon choice +
directional guard (gated on the mobile attack-controls review — the
owner reports spamming heavy and never using the red attack), and
clips-then-spectate with camera angles as the explicit quality gate.
Also ledgered, engineering: 11 pre-existing
`react-doctor` lint errors (set-state-in-effect and purity, across
`page.tsx`, `factions`, `shot`, `GameHud`) predate this wave — the same
rule family whose earlier fix bred the save-wipe, so they deserve a
deliberate pass, not a drive-by.
(ongoing), the First Moot's further cinematics (music sting, per-kingdom
ground flythroughs), and the sixteen-territory ground build-out per the
5.7b archetype table (dyke-and-march first — it covers three border
territories).
