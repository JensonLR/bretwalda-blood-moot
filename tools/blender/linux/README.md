# tools/blender/linux - rebuild the authored GLBs on Linux (no Blender install)

`public/authored/*.glb` (68 files: 4 warriors, 36 helms, 12 hair, 16 beards) are exports of `tools/blender/*.py`. On a Linux box the
"Blender" is the `bpy` PyPI module behind a small CLI shim, so `BLENDER=... node tools/blender/exportmen.mjs` works unchanged.

    bash tools/blender/linux/setup.sh                      # once: .venv-bpy with bpy==5.1.2 (= the Mac's Blender 5.1.2; needs python3.13). ~1 min
    bash tools/blender/linux/rebuild-all.sh --ship         # everything, cold, and copy into public/authored. ~2.3 min
    bash tools/blender/linux/compare.sh                    # classify art/blender/*.glb against git HEAD's public/authored
    bash tools/blender/linux/ship-changed.sh [--dry]       # copy only the GLBs that really changed (not all 68) into public/authored

## Which command for which edit  (measured, docs/BPY-PIPELINE.md section 2)

| you edited | moves | run | cost |
|---|---|---|---|
| a BODY dial (BUILD.*.shoulder/bulk/limb/stature ...) | warrior-<cls>.glb only (props 16/16 unchanged) | `node tools/blender/exportmen.mjs --cls <cls>` (copies into public/authored itself) | ~13 s / class |
| a FACE feature (RELIEF rows, traits) | warrior + the helms (hair/beard did not move for a nose edit) | exportmen + `bash tools/blender/linux/rebuild-props.sh <cls>` + `npm run authored` | ~31 s / class |
| the SKULL (headR, MANDIBLE, ...) | warrior + all 16 props | same as above; skeleton() is shared, so all four classes | ~125 s |
| a helm / hair / beard builder | the 16 props (+ the baked default in the warrior) | same as above | ~31 s / class |
| a texture / surface (exporttextures) | UVs of everything | `rebuild-all.sh --ship` (textures FIRST) | ~2.3 min |
| clips.py | warriors | exportmen | ~13 s / class |

Prop GLBs are written to `art/blender/`; only `npm run authored` / `rebuild-all.sh --ship` (all 68) or `ship-changed.sh` (only the changed ones; `npm run authored:rebuild` = rebuild-all + ship-changed) copies them to `public/authored`. Prefer ship-changed: a rebuild is never byte-equal to the Mac export, so `npm run authored` shows 68 modified files and a commit re-adds 43 MB to the history.
exportmen ships the WARRIOR itself (it copies straight into public/authored).

## Sharp edges (each one cost something, all measured)

* ORDER: `exporttextures.mjs` first on a cold tree. Without `art/blender/tex/tiles.json` rig.py/prop.py/strands.py exit 0 and SKIP the
  UV baking: a huscarl loses ~5,400 vertices, 40 of 46 meshes get different UVs, and he still ships. exportmen/exportprops now refuse.
* RACE: `exportrig.mjs` does `rmSync(.exportrig)`; two rebuilds in one checkout corrupt each other. rebuild-all.sh takes a flock.
* NOISE: stock Blender's `mathutils.noise` is seeded from the wall clock; `strands.py` seeded only `random`, so the 28 hair/beard strand
  GLBs differed on every run (and can never be reproduced from the shipped ones). strands.py now calls `noise.seed_set(SEED)`.
* The shim exits 1 when a script raises (real Blender exits 0 and writes nothing). `BLENDER_SHIM_LENIENT=1` restores Blender's behaviour.
* Gates read two directories: gltftest/authoredtest read `art/blender`, severauthored/cliptest/authoredweight read `public/authored`.
* Timings above are on 4 shared cores; bpy 5.1.2 peaks at ~470 MB RSS per process.

## What "identical" means here (compare.sh)

Against the shipped (Mac) set, a rebuild gives: helms STRUCTURALLY-IDENTICAL (only +0.0/-0.0 words differ), hair NOISE-ONLY (same strands,
roots and area; only the wall-clock-seeded turbulence differs), beards and the warriors' baked beard DIFFER by up to 8 mm at the lower front
(HEAD's JS beard builder is newer than the shipped export), everything else in the warriors equal to <1e-5 (45 of 46 meshes, skin,
weights exact, 15 clips). A second cold rebuild is byte-identical to the first (68/68), in another directory and cwd.
