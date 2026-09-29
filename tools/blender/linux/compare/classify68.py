#!/usr/bin/env python3
"""classify68.py SHIPPED_DIR REBUILT_DIR  -> TSV: file, class, detail   (class in the taxonomy the owner asked for)

  IDENTICAL                 md5 equal
  STRUCTURALLY-IDENTICAL    bytes differ only in ways proven benign (generator string; +0.0 vs -0.0 words; exporter vertex-split
                            differences with every triangle corner equal within 1e-5)
  NOISE-ONLY                hair/beard STRANDS: same strand count, same roots, same total ribbon area (+-0.5%); only the time-seeded
                            turbulence of mathutils.noise differs (unreproducible by construction, see BPY-PIPELINE.md)
  DIFFERS                   anything else, stated exactly (beard shell drift in mm; ...)
"""
import sys, os, subprocess, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import cmpall, cornercmp, strandstat
from glbinfo import load
from glbdeep import arr, prims

ship, built = sys.argv[1], sys.argv[2]
rows = []
for f in sorted(os.listdir(built)):
    if not f.endswith('.glb') or not os.path.exists(os.path.join(ship, f)):
        continue
    pa, pb = os.path.join(ship, f), os.path.join(built, f)
    v, info = cmpall.compare(pa, pb)
    if v == 'BYTE-IDENTICAL':
        rows.append((f, 'IDENTICAL', 'md5 equal')); continue
    if v.startswith('IDENTICAL-BUT-GEN'):
        extra = v.replace('IDENTICAL-BUT-GEN', '').strip('+') or 'generator string only'
        rows.append((f, 'STRUCTURALLY-IDENTICAL', f'JSON equal, BIN equal apart from {extra}')); continue
    why, worst = cornercmp.compare(pa, pb)
    if not why:
        rows.append((f, 'STRUCTURALLY-IDENTICAL', f'every triangle corner, skin, node, material, clip equal <1e-5 (worst {worst[0]:.1e}); vertex count differs ({v.split("(")[0]})')); continue
    if f.startswith(('hair-', 'beard-')):
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = strandstat.main(pa, pb)
        line = buf.getvalue().strip()
        if line.startswith('NOISE-ONLY') or ('NOISE-ONLY' in line and 'DIFF' not in line.replace('NOISE-ONLY', '')):
            rows.append((f, 'NOISE-ONLY', line)); continue
        rows.append((f, 'DIFFERS', line)); continue
    if f.startswith('warrior-'):
        why2, worst2 = cornercmp.compare(pa, pb, ignore=('beard_',))
        _, ja, ba = load(pa); _, jb, bb = load(pb)
        PA, PB = prims(ja, ba), prims(jb, bb)
        bn = [n for n in PA if n.startswith('beard_')][0]
        A = arr(ja, ba, PA[bn][1]['attributes']['POSITION']).astype(np.float64)
        B = arr(jb, bb, PB[bn][1]['attributes']['POSITION']).astype(np.float64)
        UA = np.unique(np.round(A, 6), axis=0); UB = np.unique(np.round(B, 6), axis=0)
        dn = np.sqrt(((UA[:, None, :] - UB[None, :, :]) ** 2).sum(-1)).min(axis=1)
        moved = int((dn > 1e-5).sum())
        if not why2:
            rows.append((f, 'DIFFERS', f'ONLY the baked default beard ({bn}): {moved}/{len(UA)} unique verts moved, max {dn.max() * 1000:.1f} mm; all other 45 meshes + skin + nodes + materials + 15 clips equal <1e-5 (worst {worst2[0]:.1e})')); continue
        rows.append((f, 'DIFFERS', '; '.join(why2[:4]))); continue
    rows.append((f, 'DIFFERS', '; '.join(why[:4])))
for r in rows:
    print('\t'.join(r))
from collections import Counter
print('#SUMMARY\t' + str(dict(Counter(r[1] for r in rows))) + f'\tof {len(rows)}')
