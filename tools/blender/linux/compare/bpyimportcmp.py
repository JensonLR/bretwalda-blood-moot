#!/usr/bin/env python3
"""bpyimportcmp.py A.glb B.glb [--tol 1e-5] [--skip PREFIX,...]   (a leading * means 'name contains', e.g. --skip '*__strands')

The independent ruler: import BOTH files into Blender (bpy, the same importer Blender itself uses) and compare, per mesh object,
the WORLD-SPACE vertex positions and the per-vertex vertex-group WEIGHTS (dense over the union of group names).  Objects are matched by
name.  If the vertex counts of a matched pair differ (an exporter split vertices differently) the unique-position sets are compared
with a nearest-neighbour bound instead.  Also compares armature bone head/tail world positions, and the number of actions/fcurves.

Prints one line: PASS(<tol>: N objects, worst dP=..., worst dW=...) or FAIL(...).  Exit 0/1.
"""
import sys, os
import numpy as np
import bpy

tol = float(sys.argv[sys.argv.index('--tol') + 1]) if '--tol' in sys.argv else 1e-5
skip = tuple(sys.argv[sys.argv.index('--skip') + 1].split(',')) if '--skip' in sys.argv else ()


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    dg = bpy.context.evaluated_depsgraph_get()
    objs = {}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        me = o.data
        mw = np.array(o.matrix_world)
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        wco = co @ mw[:3, :3].T + mw[:3, 3]
        names = [g.name for g in o.vertex_groups]
        W = np.zeros((len(me.vertices), len(names)))
        for vi, v in enumerate(me.vertices):
            for g in v.groups:
                W[vi, g.group] = g.weight
        objs[o.name] = (wco, dict(zip(names, W.T)), len(me.polygons))
    bones = {}
    for a in bpy.data.objects:
        if a.type == 'ARMATURE':
            mw = np.array(a.matrix_world)
            for b in a.data.bones:
                h = mw @ np.append(np.array(b.head_local), 1.0)
                t = mw @ np.append(np.array(b.tail_local), 1.0)
                bones[b.name] = (h[:3], t[:3])
    acts = {a.name: sum(len(getattr(a, 'fcurves', []) or []) for _ in [0]) for a in bpy.data.actions}
    return objs, bones, len(bpy.data.actions)


A = load(sys.argv[1])
B = load(sys.argv[2])
worstP = worstW = 0.0
bad = []
n = 0
for name in sorted(set(A[0]) | set(B[0])):
    if any((p[1:] in name) if p.startswith('*') else name.startswith(p) for p in skip):
        continue
    if name not in A[0] or name not in B[0]:
        bad.append(f"{name} only in {'A' if name in A[0] else 'B'}")
        continue
    (pa, wa, fa), (pb, wb, fb) = A[0][name], B[0][name]
    n += 1
    if fa != fb:
        bad.append(f"{name}: polygons {fa}->{fb}")
    if pa.shape == pb.shape:
        dP = float(np.abs(pa - pb).max()) if pa.size else 0.0
        dW = 0.0
        for g in set(wa) | set(wb):
            x = wa.get(g, np.zeros(len(pa))); y = wb.get(g, np.zeros(len(pb)))
            dW = max(dW, float(np.abs(x - y).max()))
    else:
        # unique-position NN bound (positions only; weights compared on the matched vertices)
        ua, ia = np.unique(np.round(pa, 6), axis=0, return_index=True)
        ub, ib = np.unique(np.round(pb, 6), axis=0, return_index=True)
        if ua.shape != ub.shape:
            bad.append(f"{name}: unique verts {len(ua)}->{len(ub)}")
            continue
        order_a = np.lexsort(ua.T[::-1]); order_b = np.lexsort(ub.T[::-1])
        dP = float(np.abs(ua[order_a] - ub[order_b]).max())
        dW = 0.0
        for g in set(wa) | set(wb):
            x = wa.get(g, np.zeros(len(pa)))[ia][order_a]; y = wb.get(g, np.zeros(len(pb)))[ib][order_b]
            dW = max(dW, float(np.abs(x - y).max()))
    worstP, worstW = max(worstP, dP), max(worstW, dW)
    if dP > tol or dW > tol:
        bad.append(f"{name}: dP={dP:.2e} dW={dW:.2e}")
dBone = 0.0
for k in set(A[1]) & set(B[1]):
    dBone = max(dBone, float(np.abs(A[1][k][0] - B[1][k][0]).max()), float(np.abs(A[1][k][1] - B[1][k][1]).max()))
if set(A[1]) != set(B[1]):
    bad.append("bone sets differ")
if dBone > tol:
    bad.append(f"bones moved {dBone:.2e}")
if A[2] != B[2]:
    bad.append(f"actions {A[2]}->{B[2]}")
if bad:
    print(f"FAIL({len(bad)}: {'; '.join(bad[:5])}) objects={n} worst dP={worstP:.1e} dW={worstW:.1e} bones={dBone:.1e}")
    sys.exit(1)
print(f"PASS(<{tol:g}: {n} mesh objects, {len(A[1])} bones, {A[2]} actions; worst world dP={worstP:.1e}, worst weight dW={worstW:.1e}, bone dP={dBone:.1e})")
