#!/usr/bin/env python3
"""jsondiff.py A.glb B.glb - first differences between the two glTF JSON chunks (after dropping asset.generator), and whether the BIN chunks are equal."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load
_, ja, ba = load(sys.argv[1])
_, jb, bb = load(sys.argv[2])
ja['asset'].pop('generator', None); jb['asset'].pop('generator', None)
print("BIN chunk equal:", ba == bb, len(ba), len(bb))
out = []
def walk(a, b, path):
    if len(out) >= 12:
        return
    if type(a) != type(b):
        out.append((path, str(a)[:80], str(b)[:80])); return
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a: out.append((path + '/' + k, '<missing>', str(b[k])[:80]))
            elif k not in b: out.append((path + '/' + k, str(a[k])[:80], '<missing>'))
            else: walk(a[k], b[k], path + '/' + k)
    elif isinstance(a, list):
        if len(a) != len(b): out.append((path + '[len]', len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)): walk(x, y, f"{path}[{i}]")
    elif a != b:
        out.append((path, a, b))
walk(ja, jb, '')
print("JSON differences (first 12):" if out else "JSON identical apart from generator")
for o in out:
    print("  ", o)
