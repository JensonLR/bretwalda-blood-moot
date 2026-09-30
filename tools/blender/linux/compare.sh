#!/bin/bash
# tools/blender/linux/compare.sh [REBUILT_DIR]      default REBUILT_DIR = art/blender
# Classify every rebuilt GLB against the SHIPPED originals (git HEAD:public/authored) as
#   IDENTICAL / STRUCTURALLY-IDENTICAL / NOISE-ONLY (hair strands) / DIFFERS (with the exact how).
# Read-only. Tools in compare/: cmpall (md5 -> generator/signed-zero tiers), cornercmp (per-triangle-corner attribute compare, exporter
# vertex-split independent), strandstat (strand count/roots/area), bpyimportcmp (import both into Blender, world-space verts + weights).
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT"
PY="${BW_BPY_PYTHON:-$ROOT/.venv-bpy/bin/python}"
BUILT="${1:-art/blender}"
SHIPPED="$(mktemp -d)"; trap 'rm -rf "$SHIPPED"' EXIT
git archive HEAD public/authored | tar -x -C "$SHIPPED"
"$PY" "$HERE/compare/classify68.py" "$SHIPPED/public/authored" "$BUILT"
