#!/usr/bin/env python3
"""bboxmoved.py BASE.glb CHANGED.glb - R1 'did the number move?' report.

Prints: whole-model POSITION bbox for both; every mesh whose own bbox moved by >1 mm (biggest first);
joint world positions for the shoulder/upper-arm bones and the LEFT-RIGHT UpperArm span (the quantity a shoulder-width edit controls).
The whole-model bbox is printed FIRST on purpose: it is the wrong ruler for a shoulder edit (cloak/hands set its X extremes)."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def world_positions(js):
    parent = {}
    for i, n in enumerate(js['nodes']):
        for c in n.get('children', []):
            parent[c] = i
    cache = {}

    def M(i):
        if i in cache:
            return cache[i]
        n = js['nodes'][i]
        m = np.eye(4)
        if 'matrix' in n:
            m = np.array(n['matrix']).reshape(4, 4).T
        else:
            R = qmat(n.get('rotation', [0, 0, 0, 1])) @ np.diag(n.get('scale', [1, 1, 1]))
            m[:3, :3] = R
            m[:3, 3] = n.get('translation', [0, 0, 0])
        cache[i] = (M(parent[i]) @ m) if i in parent else m
        return cache[i]
    return {n.get('name'): M(i)[:3, 3] for i, n in enumerate(js['nodes'])}


def mesh_bboxes(js):
    out = {}
    for m in js['meshes']:
        mn = np.full(3, 1e9); mx = np.full(3, -1e9)
        for p in m['primitives']:
            a = js['accessors'][p['attributes']['POSITION']]
            mn = np.minimum(mn, a['min']); mx = np.maximum(mx, a['max'])
        out[m['name']] = (mn, mx)
    return out


_, ja, _ = load(sys.argv[1]); _, jb, _ = load(sys.argv[2])
A, B = mesh_bboxes(ja), mesh_bboxes(jb)
allmn = lambda d: np.min([v[0] for v in d.values()], axis=0); allmx = lambda d: np.max([v[1] for v in d.values()], axis=0)
f = lambda v: [round(float(x), 4) for x in v]
print("WHOLE-MODEL bbox  base   ", f(allmn(A)), f(allmx(A)))
print("WHOLE-MODEL bbox  changed", f(allmn(B)), f(allmx(B)), " <- moved" if (np.abs(allmn(A) - allmn(B)).max() > 1e-3 or np.abs(allmx(A) - allmx(B)).max() > 1e-3) else " <- DID NOT MOVE (wrong ruler for this edit)")
moved = []
for k in A:
    if k in B:
        d = max(np.abs(A[k][0] - B[k][0]).max(), np.abs(A[k][1] - B[k][1]).max())
        if d > 1e-3:
            moved.append((d, k))
moved.sort(reverse=True)
print(f"meshes whose own bbox moved >1 mm: {len(moved)} of {len(A)}")
for d, k in moved[:8]:
    print(f"   {k:14s} moved {d*1000:6.1f} mm   base x[{A[k][0][0]:.3f},{A[k][1][0]:.3f}] -> x[{B[k][0][0]:.3f},{B[k][1][0]:.3f}]  width {1000*(A[k][1][0]-A[k][0][0]):.0f} -> {1000*(B[k][1][0]-B[k][0][0]):.0f} mm")
WA, WB = world_positions(ja), world_positions(jb)
for nm in ('RightShoulder', 'LeftShoulder', 'RightUpperArm', 'LeftUpperArm', 'RightElbow', 'LeftElbow'):
    print(f"   joint {nm:14s} world x {WA[nm][0]:+.4f} -> {WB[nm][0]:+.4f}")
sa = abs(WA['LeftUpperArm'][0] - WA['RightUpperArm'][0]); sb = abs(WB['LeftUpperArm'][0] - WB['RightUpperArm'][0])
print(f"SHOULDER SPAN (Left-Right UpperArm joints): {sa*1000:.1f} mm -> {sb*1000:.1f} mm  (x{sb/sa:.4f})")
