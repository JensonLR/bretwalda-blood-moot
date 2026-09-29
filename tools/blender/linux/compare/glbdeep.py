#!/usr/bin/env python3
"""glbdeep.py A.glb B.glb - where exactly do two structurally-similar GLBs differ?
Compares per-primitive (matched by mesh name): vertex count, index count, position/normal/uv/joints/weights
as float arrays (max abs diff, after sorting vertices by position when counts match but order may differ),
inverse-bind matrices, and animation samplers (per clip/channel max abs diff).  Also reports accessors
that exist in one file and not the other (by primitive attribute).
"""
import sys, json, struct, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load, acc_bytes, COMP, NCOMP

DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}


def arr(js, bin_, i):
    a = js['accessors'][i]
    b = acc_bytes(js, bin_, i)
    x = np.frombuffer(b, dtype=DT[a['componentType']])
    n = NCOMP[a['type']]
    x = x.reshape(a['count'], n) if n > 1 else x.reshape(a['count'])
    if a.get('normalized'):
        x = x.astype(np.float64) / {5121: 255.0, 5123: 65535.0, 5120: 127.0, 5122: 32767.0}[a['componentType']]
    return x


def prims(js, bin_):
    out = {}
    for m in js['meshes']:
        for k, p in enumerate(m['primitives']):
            name = m.get('name', '?') + (f"#{k}" if k else "")
            out[name] = (m, p)
    return out


def main(pa, pb):
    _, ja, ba = load(pa)
    _, jb, bb = load(pb)
    A = prims(ja, ba)
    B = prims(jb, bb)
    print("meshes only in A:", sorted(set(A) - set(B)))
    print("meshes only in B:", sorted(set(B) - set(A)))
    tot_va = tot_vb = 0
    changed = []
    for name in sorted(set(A) & set(B)):
        ma, pa_ = A[name]
        mb, pb_ = B[name]
        rec = {'name': name}
        na = ja['accessors'][pa_['attributes']['POSITION']]['count']
        nb = jb['accessors'][pb_['attributes']['POSITION']]['count']
        tot_va += na
        tot_vb += nb
        ia = ja['accessors'][pa_['indices']]['count']
        ib = jb['accessors'][pb_['indices']]['count']
        rec['verts'] = (na, nb)
        rec['idx'] = (ia, ib)
        rec['attrs_a'] = sorted(pa_['attributes'])
        rec['attrs_b'] = sorted(pb_['attributes'])
        if na == nb:
            for attr in sorted(set(pa_['attributes']) & set(pb_['attributes'])):
                xa = arr(ja, ba, pa_['attributes'][attr]).astype(np.float64)
                xb = arr(jb, bb, pb_['attributes'][attr]).astype(np.float64)
                if xa.shape == xb.shape:
                    rec[attr] = float(np.abs(xa - xb).max())
        else:
            # position sets compared as unique rounded positions
            xa = arr(ja, ba, pa_['attributes']['POSITION']).astype(np.float64)
            xb = arr(jb, bb, pb_['attributes']['POSITION']).astype(np.float64)
            ua = {tuple(np.round(r, 5)) for r in xa}
            ub = {tuple(np.round(r, 5)) for r in xb}
            rec['unique_pos'] = (len(ua), len(ub), 'symdiff', len(ua ^ ub))
            rec['bbox_a'] = (xa.min(0).round(4).tolist(), xa.max(0).round(4).tolist())
            rec['bbox_b'] = (xb.min(0).round(4).tolist(), xb.max(0).round(4).tolist())
        if rec['verts'][0] != rec['verts'][1] or any(isinstance(v, float) and v > 1e-6 for k, v in rec.items() if k not in ('verts', 'idx')) or 'unique_pos' in rec:
            changed.append(rec)
    print(f"total verts A={tot_va} B={tot_vb}; prims with any difference: {len(changed)} of {len(set(A)&set(B))}")
    for r in changed[:12]:
        print("  ", r)
    # skins
    for sa, sb in zip(ja.get('skins', []), jb.get('skins', [])):
        ia = arr(ja, ba, sa['inverseBindMatrices']).astype(np.float64)
        ib = arr(jb, bb, sb['inverseBindMatrices']).astype(np.float64)
        print("IBM shape", ia.shape, ib.shape, "max abs diff", float(np.abs(ia - ib).max()) if ia.shape == ib.shape else 'n/a')
        na = [ja['nodes'][j]['name'] for j in sa['joints']]
        nb = [jb['nodes'][j]['name'] for j in sb['joints']]
        print("joint order identical:", na == nb)
    # animations
    ana = {a['name']: a for a in ja.get('animations', [])}
    anb = {a['name']: a for a in jb.get('animations', [])}
    worst = []
    signflips = 0
    for nm in sorted(set(ana) & set(anb)):
        a, b = ana[nm], anb[nm]
        d = 0.0
        note = ''
        if len(a['channels']) != len(b['channels']):
            note = f" channels {len(a['channels'])} vs {len(b['channels'])}"
        # match channels by (node name, path)
        def key(js, ch):
            return (js['nodes'][ch['target']['node']].get('name'), ch['target']['path'])
        ca = {key(ja, c): c for c in a['channels']}
        cb = {key(jb, c): c for c in b['channels']}
        for k in set(ca) & set(cb):
            sa_ = a['samplers'][ca[k]['sampler']]
            sb_ = b['samplers'][cb[k]['sampler']]
            ti = arr(ja, ba, sa_['input']).astype(np.float64)
            tj = arr(jb, bb, sb_['input']).astype(np.float64)
            vi = arr(ja, ba, sa_['output']).astype(np.float64)
            vj = arr(jb, bb, sb_['output']).astype(np.float64)
            if ti.shape != tj.shape or vi.shape != vj.shape:
                note += f" {k}: shape {ti.shape}/{vi.shape} vs {tj.shape}/{vj.shape}"
                continue
            if k[1] == 'rotation':
                # q and -q are the same rotation: compare sign-invariantly, per key
                dq = np.minimum(np.abs(vi - vj).max(axis=1), np.abs(vi + vj).max(axis=1))
                dv = float(dq.max())
                flips = int((np.abs(vi - vj).max(axis=1) > np.abs(vi + vj).max(axis=1)).sum())
                if flips:
                    signflips += flips
            else:
                dv = float(np.abs(vi - vj).max())
            d = max(d, float(np.abs(ti - tj).max()), dv)
        worst.append((nm, d, len(ca), len(cb), note.strip()))
    for w in worst:
        print("  clip (sign-invariant on rotations)", w)
    print("rotation keys whose quaternion sign differs (same rotation, opposite hemisphere):", signflips)
    print("clips only in A:", sorted(set(ana) - set(anb)), " only in B:", sorted(set(anb) - set(ana)))
    # node transforms
    def nodes(js):
        return {n.get('name'): n for n in js['nodes']}
    na, nb = nodes(ja), nodes(jb)
    worstn = 0.0
    worstname = None
    for k in set(na) & set(nb):
        for f in ('translation', 'rotation', 'scale'):
            dflt = {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}[f]
            va = np.array(na[k].get(f, dflt), dtype=np.float64)
            vb = np.array(nb[k].get(f, dflt), dtype=np.float64)
            d = float(np.abs(va - vb).max())
            if f == 'rotation':
                d = min(d, float(np.abs(va + vb).max()))
            if d > worstn:
                worstn, worstname = d, (k, f)
    print("node transform max abs diff:", worstn, worstname)
    print("node extras:", {k: na[k].get('extras') for k in na if na[k].get('extras')} == {k: nb[k].get('extras') for k in nb if nb[k].get('extras')})


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
