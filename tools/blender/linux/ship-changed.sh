#!/bin/bash
# tools/blender/linux/ship-changed.sh [--dry]     copy ONLY the rebuilt GLBs that really changed into public/authored
#
# WHY NOT `npm run authored`: it copies all 68 files, and a rebuild is never byte-equal to the Mac's export even when nothing changed
# (36 helms differ in a few +0.0/-0.0 words), so every ship shows 68 modified files and, committed, adds another 43 MB to the history.
# This ships the files whose compare.sh class is DIFFERS or NOISE-ONLY and leaves IDENTICAL / STRUCTURALLY-IDENTICAL ones alone.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT"
n=0
while IFS=$'\t' read -r file cls detail; do
  case "$file" in \#*|"") continue;; esac
  case "$cls" in
    DIFFERS|NOISE-ONLY)
      n=$((n+1)); echo "ship  $file  ($cls)"
      [ "${1:-}" = "--dry" ] || cp "art/blender/$file" "public/authored/$file";;
  esac
done < <(bash "$HERE/compare.sh")
echo "ship-changed: $n file(s)${1:+ (dry run)}"
