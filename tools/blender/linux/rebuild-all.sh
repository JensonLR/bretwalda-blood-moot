#!/bin/bash
# tools/blender/linux/rebuild-all.sh [--ship] [--no-textures] [--no-props] [class ...]     (any cwd; acts on the checkout it lives in)
#
# The whole authored-asset chain, in the only order that works, on Linux (bpy shim; see README.md):
#   1. exporttextures.mjs  MUST come first on a cold tree. rig.py / strands.py / prop.py bake the UV repeat and the world-tile cube
#                          projection from art/blender/tex/tiles.json; if it is missing they SILENTLY skip it (exit 0, "success") and a
#                          huscarl comes out with 40 of 46 meshes carrying different UVs and 5,400 fewer vertices.
#                          (--no-textures skips it when art/blender/tex/ is already there: warrior-only edits do not change textures.)
#   2. exportmen.mjs       exportrig (node + tsc) -> rig.py -> clips.py -> checks -> copies warrior-<cls>.glb INTO public/authored.
#   3. rebuild-props.sh    exportcosmetics -> prop.py x9 helms -> strands.py x4 beards + x3 hair, per class   (--no-props skips)
#   4. --ship              `npm run authored`: cp art/blender/{warrior,helm,hair,beard}-*.glb -> public/authored. THIS COPIES ALL 68 and a rebuild is
#                          never byte-equal to the Mac export, so all 68 show modified. Prefer `ship-changed.sh` (what `npm run authored:rebuild` runs).
# Sequential on purpose: exportrig.mjs does rmSync(.exportrig) at start, so two rebuilds in one checkout race; a flock refuses the second.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT"
export BLENDER="${BLENDER:-$HERE/blender}"
TM="python3 $HERE/tm.py"
SHIP=0; TEX=1; PROPS=1; CLASSES=()
for a in "$@"; do case "$a" in --ship) SHIP=1;; --no-textures) TEX=0;; --no-props) PROPS=0;; -*) echo "unknown flag $a" >&2; exit 2;; *) CLASSES+=("$a");; esac; done
[ ${#CLASSES[@]} -eq 0 ] && CLASSES=(huscarl warden runekeeper berserker)
exec 9>"$ROOT/.rebuild.lock"; flock -n 9 || { echo "another rebuild is running in this checkout ($ROOT/.rebuild.lock)" >&2; exit 3; }
LOG="$(mktemp)"; trap 'rm -f "$LOG"' EXIT
step() { local label="$1"; shift; $TM "$label" "$@" >"$LOG" 2>&1 || { echo "FAILED: $label"; tail -n 20 "$LOG"; exit 1; }; }
[ -x "$BLENDER" ] || { echo "no BLENDER at $BLENDER - run tools/blender/linux/setup.sh" >&2; exit 2; }
if [ "$TEX" = 1 ] || [ ! -f art/blender/tex/tiles.json ]; then step "1-exporttextures" node tools/blender/exporttextures.mjs; fi
[ -f art/blender/tex/tiles.json ] || { echo "exporttextures did not write art/blender/tex/tiles.json" >&2; exit 1; }
for c in "${CLASSES[@]}"; do step "2-exportmen:$c" node tools/blender/exportmen.mjs --cls "$c"; done
if [ "$PROPS" = 1 ]; then "$HERE/rebuild-props.sh" "${CLASSES[@]}"; fi
if [ "$SHIP" = 1 ]; then step "4-ship-cp" npm run authored --silent; fi
echo "rebuild-all: done (${CLASSES[*]})  timings: $ROOT/.rebuild-timings.tsv"
