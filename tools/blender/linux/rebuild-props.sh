#!/bin/bash
# tools/blender/linux/rebuild-props.sh <class> [<class> ...]  -  thin wrapper over tools/blender/exportprops.mjs (~17 s per class).
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT"
export BLENDER="${BLENDER:-$HERE/blender}"
[ $# -gt 0 ] || { echo "usage: rebuild-props.sh <class>..." >&2; exit 2; }
for c in "$@"; do python3 "$HERE/tm.py" "exportprops:$c" node tools/blender/exportprops.mjs --class "$c"; done
