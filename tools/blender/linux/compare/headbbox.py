#!/usr/bin/env python3
"""headbbox.py BASE.glb CHANGED.glb [--ymin 1.5]

Head-region R1 report for a warrior GLB: every mesh (primitive) whose bbox lies above --ymin (default 1.5 m: neck up), with its role node
name (skin part / helm_N / hair_N / beard_N), material, bbox extents (x width, y height, z depth in mm) before and after, and the max
bbox-corner move.  Also lists the skin meshes that did NOT move, so an edit that failed to reach the head is visible as 'moved 0'.
Positions are rest-pose POSITION accessor min/max (mesh space == world space for these skinned exports at bind)."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load

ymin = float(sys.argv[sys.argv.index('--ymin') + 1]) if '--ymin' in sys.argv else 1.5


def table(path):
    _, js, _ = load(path)
    t = {}
    for n in js['nodes']:
        if 'mesh' not in n:
            continue
        m = js['meshes'][n['mesh']]
        for p in m['primitives']:
            a = js['accessors'][p['attributes']['POSITION']]
            mat = js['materials'][p['material']]['name'] if 'material' in p else '-'
            t[n['name']] = (np.array(a['min']), np.array(a['max']), mat, a['count'])
    return t


A, B = table(sys.argv[1]), table(sys.argv[2])
rows = []
for k in A:
    mn, mx, mat, cnt = A[k]
    if mx[1] < ymin:
        continue
    if k not in B:
        rows.append((k, mat, 'MISSING in changed')); continue
    mn2, mx2, _, cnt2 = B[k]
    move = max(np.abs(mn - mn2).max(), np.abs(mx - mx2).max())
    w = lambda a, b: (b - a) * 1000
    rows.append((k, mat, f"x {w(mn[0], mx[0]):6.1f}->{w(mn2[0], mx2[0]):6.1f}  y {w(mn[1], mx[1]):6.1f}->{w(mn2[1], mx2[1]):6.1f}  z {w(mn[2], mx[2]):6.1f}->{w(mn2[2], mx2[2]):6.1f} mm   zmax {mx[2] * 1000:7.1f}->{mx2[2] * 1000:7.1f}   verts {cnt}->{cnt2}   MAX BBOX MOVE {move * 1000:6.1f} mm"))
role = lambda k: k.split('_')[0]
rows.sort(key=lambda r: (role(r[0]) == 'part', role(r[0]), r[0]))
moved = 0
for k, mat, s in rows:
    print(f"{k:10s} {mat:16s} {s}")
    if 'MAX BBOX MOVE' in s and float(s.split('MAX BBOX MOVE')[1].split('mm')[0]) > 0.5:
        moved += 1
print(f"HEAD-REGION MESHES: {len(rows)}; moved >0.5 mm: {moved}")
