#!/bin/bash
# One-time (per checkout): a Python 3.13 venv holding the `bpy` module that matches the Mac's Blender 5.1.2.
#   bash tools/blender/linux/setup.sh            (~1 min, 391 MB wheel, needs python3.13 and network)
# The venv lands in <repo>/.venv-bpy (git-ignored). Override the interpreter with PYTHON=python3.13.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
PY="${PYTHON:-python3.13}"
command -v "$PY" >/dev/null || { echo "need python3.13: the bpy 5.1.x wheels are cp313 (bpy 5.0.1 is cp311; see README)" >&2; exit 2; }
"$PY" -m venv "$ROOT/.venv-bpy"
"$ROOT/.venv-bpy/bin/python" -m pip install --quiet "bpy==${BPY_VERSION:-5.1.2}" numpy
"$ROOT/.venv-bpy/bin/python" - <<'PY'
import bpy, io_scene_gltf2
print("bpy", bpy.app.version_string, "| glTF exporter", ".".join(map(str, io_scene_gltf2.bl_info["version"])))
PY
echo "ok: BLENDER=$HERE/blender"
