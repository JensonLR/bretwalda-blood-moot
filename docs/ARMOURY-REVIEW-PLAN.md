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

1. **helmclash regression check** — a baseline run against `origin/main` was
   in flight in `../clashbase` when this file was written. Compare per-section
   red counts (LAYERS/FLESH/WRAP/CREST/PELT/SEAM) between main and the new
   tree before trusting the hair-route change fully. Main is NOT green on
   this ruler; the question is whether any section got WORSE.
2. **Premium polish sub-items found during the review** (each reproduced in
   `art/backreview/`):
   - The **bracer's pale upper cuff** reads as flat plastic tan from behind
     (`hair10b/zoom-blob.png`, every back capture). Wants leather texture,
     a strap or edge-roll, and a tone nearer the lower bracer.
   - The **bell/collar seam nick** — a small dark dagger at the coif bell's
     midline where it meets the collar band, visible on a SHAVED control
     (`shaved/zoom.png`), so it is garment geometry, not hair.
   - The **baldric's top tip** peeks above the cloak's collar roll at the
     left shoulder in cloaked back views (`final-cloak`). The strap should
     duck under the roll's registry ring near the shoulder crest.
   - A small **mail wedge at the mane's root** where the release quads cross
     the bell hem (`hair12-pair.png`, left panel, top of the fall). Invisible
     at fight distance; visible at kitcard zoom.
   - The **grey sliver at the cloak's hem edge** at the left hip (down from
     the original capture but check `redcloak/zoom-sliver.png` against the
     current build).
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
