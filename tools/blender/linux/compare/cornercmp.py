#!/usr/bin/env python3
"""cornercmp.py A.glb B.glb [--tol 1e-5] [--quiet]

Exporter-independent geometry equality. A glTF exporter splits vertices wherever (position, normal, uv, joints, weights) differ,
so two exporter versions can write DIFFERENT vertex counts for the SAME surface. This tool therefore expands every primitive
to its triangle CORNERS (attribute[index[k]] for k in 0..nidx) and compares corner k of A to corner k of B:

  POSITION, NORMAL, TEXCOORD_0/1, COLOR_0   max abs difference
  JOINTS_0 + WEIGHTS_0                      compared as a DENSE per-joint weight vector (order of the 4 influences is irrelevant
                                            and a zero-weight slot's joint id is irrelevant)
  index topology                            implied: corner k must match, so triangles + winding match

Also compares the parts that are not vertex data: skin joint list + IBM, node hierarchy + TRS, material factors, animation
samplers (rotation sign-invariant), mesh->material assignment, and glTF extras.

--ignore p1,p2   skip primitives whose name starts with p1/p2 (e.g. `--ignore beard_` to prove everything ELSE in a warrior is equal)

Prints  CORNER-EQ  when every difference is <= tol, else DIFF with the worst offender.  Exit 0/1.
"""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load
from glbdeep import arr, prims

TOL = 1e-5


def corners(js, bin_, p):
    idx = arr(js, bin_, p['indices']).astype(np.int64) if 'indices' in p else np.arange(js['accessors'][p['attributes']['POSITION']]['count'])
    out = {}
    for k, ai in p['attributes'].items():
        if k in ('JOINTS_0', 'WEIGHTS_0'):
            continue
        out[k] = arr(js, bin_, ai).astype(np.float64)[idx]
    if 'JOINTS_0' in p['attributes']:
        J = arr(js, bin_, p['attributes']['JOINTS_0']).astype(np.int64)
        W = arr(js, bin_, p['attributes']['WEIGHTS_0']).astype(np.float64)
        n = int(max(J.max(), 0)) + 1
        dense = np.zeros((J.shape[0], 64))
        for c in range(J.shape[1]):
            np.add.at(dense, (np.arange(J.shape[0]), J[:, c]), W[:, c])
        out['SKINW'] = dense[idx]
    return idx, out


def qsign_diff(a, b):
    return np.minimum(np.abs(a - b).max(axis=-1), np.abs(a + b).max(axis=-1)).max() if a.size else 0.0


def compare(pa, pb, tol=TOL, ignore=()):
    _, ja, ba = load(pa)
    _, jb, bb = load(pb)
    why = []
    worst = (0.0, None)
    PA, PB = prims(ja, ba), prims(jb, bb)
    if set(PA) != set(PB):
        why.append(f"primitive names differ: onlyA={sorted(set(PA) - set(PB))[:3]} onlyB={sorted(set(PB) - set(PA))[:3]}")
    for name in sorted(set(PA) & set(PB)):
        if any(name.startswith(p) for p in ignore):
            continue
        ma, pa_ = PA[name]
        mb, pb_ = PB[name]
        ia, ca = corners(ja, ba, pa_)
        ib, cb = corners(jb, bb, pb_)
        if len(ia) != len(ib):
            why.append(f"{name}: corner count {len(ia)}->{len(ib)}")
            continue
        if set(ca) != set(cb):
            why.append(f"{name}: attribute set {sorted(ca)}->{sorted(cb)}")
            continue
        for k in ca:
            d = float(np.abs(ca[k] - cb[k]).max()) if ca[k].size else 0.0
            if d > worst[0]:
                worst = (d, f"{name}:{k}")
            if d > tol:
                why.append(f"{name}:{k} corner max diff {d:.2e}")
        if pa_.get('material') is not None and pb_.get('material') is not None:
            if ja['materials'][pa_['material']]['name'] != jb['materials'][pb_['material']]['name']:
                why.append(f"{name}: material {ja['materials'][pa_['material']]['name']}->{jb['materials'][pb_['material']]['name']}")
    # skin
    for sa, sb in zip(ja.get('skins', []), jb.get('skins', [])):
        na = [ja['nodes'][j]['name'] for j in sa['joints']]
        nb = [jb['nodes'][j]['name'] for j in sb['joints']]
        if na != nb:
            why.append("skin joint order differs")
        d = float(np.abs(arr(ja, ba, sa['inverseBindMatrices']).astype(np.float64) - arr(jb, bb, sb['inverseBindMatrices']).astype(np.float64)).max())
        if d > worst[0]:
            worst = (d, 'skin:IBM')
        if d > tol:
            why.append(f"skin IBM diff {d:.2e}")
    # nodes
    NA = {n.get('name'): n for n in ja['nodes']}
    NB = {n.get('name'): n for n in jb['nodes']}
    if set(NA) != set(NB):
        why.append(f"node names differ: {sorted(set(NA) ^ set(NB))[:4]}")
    for nm in set(NA) & set(NB):
        for key, dflt in (('translation', [0, 0, 0]), ('rotation', [0, 0, 0, 1]), ('scale', [1, 1, 1])):
            a, b = np.array(NA[nm].get(key, dflt), float), np.array(NB[nm].get(key, dflt), float)
            d = float(np.minimum(np.abs(a - b).max(), np.abs(a + b).max())) if key == 'rotation' else float(np.abs(a - b).max())
            if d > worst[0]:
                worst = (d, f"node {nm}:{key}")
            if d > tol:
                why.append(f"node {nm}:{key} diff {d:.2e}")
        ca = sorted(NA[nm].get('children', [])) and sorted(ja['nodes'][c]['name'] for c in NA[nm].get('children', []))
        cb = sorted(NB[nm].get('children', [])) and sorted(jb['nodes'][c]['name'] for c in NB[nm].get('children', []))
        if ca != cb:
            why.append(f"node {nm} children differ")
        if NA[nm].get('extras') != NB[nm].get('extras'):
            why.append(f"node {nm} extras differ")
    # materials
    MA = {m['name']: m for m in ja.get('materials', [])}
    MB = {m['name']: m for m in jb.get('materials', [])}
    if MA != MB:
        why.append("materials JSON differs: " + ", ".join(sorted(k for k in set(MA) | set(MB) if MA.get(k) != MB.get(k))[:4]))
    # animations
    ana = {a['name']: a for a in ja.get('animations', [])}
    anb = {a['name']: a for a in jb.get('animations', [])}
    if set(ana) != set(anb):
        why.append(f"clip set differs {sorted(set(ana) ^ set(anb))}")
    for nm in set(ana) & set(anb):
        a, b = ana[nm], anb[nm]
        key = lambda js, ch: (js['nodes'][ch['target']['node']].get('name'), ch['target']['path'])
        ca = {key(ja, c): c for c in a['channels']}
        cb = {key(jb, c): c for c in b['channels']}
        if set(ca) != set(cb):
            why.append(f"clip {nm} channel set differs")
            continue
        for k in ca:
            sa_, sb_ = a['samplers'][ca[k]['sampler']], b['samplers'][cb[k]['sampler']]
            ti, tj = arr(ja, ba, sa_['input']).astype(np.float64), arr(jb, bb, sb_['input']).astype(np.float64)
            vi, vj = arr(ja, ba, sa_['output']).astype(np.float64), arr(jb, bb, sb_['output']).astype(np.float64)
            if ti.shape != tj.shape or vi.shape != vj.shape:
                why.append(f"clip {nm} {k} sampler shape")
                continue
            dv = float(np.minimum(np.abs(vi - vj).max(axis=1), np.abs(vi + vj).max(axis=1)).max()) if k[1] == 'rotation' else float(np.abs(vi - vj).max())
            dt = float(np.abs(ti - tj).max())
            if max(dv, dt) > worst[0]:
                worst = (max(dv, dt), f"clip {nm} {k}")
            if max(dv, dt) > tol:
                why.append(f"clip {nm} {k} diff {max(dv, dt):.2e}")
    return why, worst


if __name__ == '__main__':
    a, b = sys.argv[1], sys.argv[2]
    tol = TOL
    if '--tol' in sys.argv:
        tol = float(sys.argv[sys.argv.index('--tol') + 1])
    ign = tuple(sys.argv[sys.argv.index('--ignore') + 1].split(',')) if '--ignore' in sys.argv else ()
    why, worst = compare(a, b, tol, ign)
    if not why:
        print(f"CORNER-EQ(<{tol:g}, worst {worst[0]:.1e} at {worst[1]})")
        sys.exit(0)
    print("DIFF " + "; ".join(why[:6]) + (f" (+{len(why) - 6} more)" if len(why) > 6 else ""))
    sys.exit(1)
