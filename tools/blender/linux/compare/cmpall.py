#!/usr/bin/env python3
"""cmpall.py SHIPPED_DIR REBUILT_DIR [glob-substring ...]

For every GLB name present in both dirs (optionally filtered by substrings), classify the rebuilt file against the shipped one:

  BYTE-IDENTICAL         md5 equal
  IDENTICAL-BUT-GEN      bytes equal once asset.generator is normalised (same-length string swap)
  GEOM-EQ(<tol)          every attribute (POSITION/NORMAL/TEXCOORD/JOINTS/WEIGHTS/COLOR), indices, skin IBM and animation samplers
                         equal within 1e-5 (quaternions compared sign-invariantly), same node/mesh/material/accessor counts
  DIFF                   anything else, with the first reasons

Prints one line per file plus a summary. Pure read-only.
"""
import sys, os, json, hashlib, re
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load, summary, acc_bytes
from glbdeep import arr, prims

TOL = 1e-5


def norm_generator(b):
    return re.sub(rb'Khronos glTF Blender I/O v\d+\.\d+\.\d+', b'Khronos glTF Blender I/O vX.Y.Z', b)


def compare(pa, pb):
    A = open(pa, 'rb').read()
    B = open(pb, 'rb').read()
    if A == B:
        return 'BYTE-IDENTICAL', {}
    # generator-normalised: the JSON chunk length can differ if the strings differ in length; compare after normalising both
    if norm_generator(A)[:0] == b'' and len(norm_generator(A)) == len(norm_generator(B)) and norm_generator(A) == norm_generator(B):
        return 'IDENTICAL-BUT-GEN', {}
    sa, ja, ba = summary(pa)
    sb, jb, bb = summary(pb)
    # Tier 2b: JSON identical apart from generator, BIN differs only in words that are +0.0 vs -0.0
    import copy
    ja2, jb2 = copy.deepcopy(ja), copy.deepcopy(jb)
    ja2['asset'].pop('generator', None)
    jb2['asset'].pop('generator', None)
    if ja2 == jb2 and len(ba) == len(bb) and len(ba) % 4 == 0:
        wa = np.frombuffer(ba, dtype=np.uint32)
        wb = np.frombuffer(bb, dtype=np.uint32)
        dif = np.nonzero(wa != wb)[0]
        if len(dif) and all(((int(wa[i]) | int(wb[i])) == 0x80000000 and (int(wa[i]) & int(wb[i])) == 0) for i in dif):
            return f'IDENTICAL-BUT-GEN+SIGNED-ZERO({len(dif)} words)', {}
    why = []
    for k in ('nodes', 'meshes', 'prims', 'skins', 'joints', 'animations', 'accessors', 'materials', 'textures', 'images', 'verts', 'tris', 'anim_names', 'mat_names', 'node_names', 'mat_md5'):
        if sa[k] != sb[k]:
            why.append(f"{k}:{sa[k] if not isinstance(sa[k], list) or len(sa[k]) < 4 else len(sa[k])}->{sb[k] if not isinstance(sb[k], list) or len(sb[k]) < 4 else len(sb[k])}")
    stats = {'maxattr': 0.0, 'worst': None}
    if not why:
        PA, PB = prims(ja, ba), prims(jb, bb)
        for name in sorted(set(PA) & set(PB)):
            ma, pa_ = PA[name]
            mb, pb_ = PB[name]
            for attr in pa_['attributes']:
                if attr not in pb_['attributes']:
                    why.append(f"{name}:{attr} missing")
                    continue
                xa = arr(ja, ba, pa_['attributes'][attr]).astype(np.float64)
                xb = arr(jb, bb, pb_['attributes'][attr]).astype(np.float64)
                if xa.shape != xb.shape:
                    why.append(f"{name}:{attr} shape")
                    continue
                d = float(np.abs(xa - xb).max()) if xa.size else 0.0
                if d > stats['maxattr']:
                    stats['maxattr'] = d
                    stats['worst'] = f"{name}:{attr}"
            if 'indices' in pa_:
                ia = arr(ja, ba, pa_['indices'])
                ib = arr(jb, bb, pb_['indices'])
                if ia.shape != ib.shape or not np.array_equal(ia, ib):
                    why.append(f"{name}:indices differ")
        for sk_a, sk_b in zip(ja.get('skins', []), jb.get('skins', [])):
            d = float(np.abs(arr(ja, ba, sk_a['inverseBindMatrices']).astype(np.float64) - arr(jb, bb, sk_b['inverseBindMatrices']).astype(np.float64)).max())
            stats['maxattr'] = max(stats['maxattr'], d)
        ana = {a['name']: a for a in ja.get('animations', [])}
        anb = {a['name']: a for a in jb.get('animations', [])}
        for nm in ana:
            a, b = ana[nm], anb.get(nm)
            if b is None:
                why.append(f"clip {nm} missing")
                continue
            key = lambda js, ch: (js['nodes'][ch['target']['node']].get('name'), ch['target']['path'])
            ca = {key(ja, c): c for c in a['channels']}
            cb = {key(jb, c): c for c in b['channels']}
            if set(ca) != set(cb):
                why.append(f"clip {nm} channel set")
                continue
            for k in ca:
                sa_ = a['samplers'][ca[k]['sampler']]
                sb_ = b['samplers'][cb[k]['sampler']]
                ti, tj = arr(ja, ba, sa_['input']).astype(np.float64), arr(jb, bb, sb_['input']).astype(np.float64)
                vi, vj = arr(ja, ba, sa_['output']).astype(np.float64), arr(jb, bb, sb_['output']).astype(np.float64)
                if ti.shape != tj.shape or vi.shape != vj.shape:
                    why.append(f"clip {nm} {k} shape")
                    continue
                if k[1] == 'rotation':
                    dv = float(np.minimum(np.abs(vi - vj).max(axis=1), np.abs(vi + vj).max(axis=1)).max())
                else:
                    dv = float(np.abs(vi - vj).max())
                stats['maxattr'] = max(stats['maxattr'], dv, float(np.abs(ti - tj).max()))
        if stats['maxattr'] > TOL:
            why.append(f"max attr diff {stats['maxattr']:.2e} at {stats['worst']}")
    else:
        # counts differ: report bbox delta too
        stats['bbox'] = (sa['pos_bbox_min'], sb['pos_bbox_min'], sa['pos_bbox_max'], sb['pos_bbox_max'])
    if not why:
        return f'GEOM-EQ(<{TOL:g}, max {stats["maxattr"]:.1e})', stats
    return 'DIFF', {'why': why, **stats}


if __name__ == '__main__':
    ship, built = sys.argv[1], sys.argv[2]
    subs = sys.argv[3:]
    names = sorted(f for f in os.listdir(built) if f.endswith('.glb') and os.path.exists(os.path.join(ship, f)) and (not subs or any(s in f for s in subs)))
    counts = {}
    for f in names:
        v, info = compare(os.path.join(ship, f), os.path.join(built, f))
        key = v.split('(')[0]
        counts[key] = counts.get(key, 0) + 1
        extra = ''
        if v == 'DIFF':
            extra = '  ' + '; '.join(info['why'][:4])
            if 'bbox' in info:
                extra += f"  bbox(min,max) ship={info['bbox'][0]}{info['bbox'][2]} rebuilt={info['bbox'][1]}{info['bbox'][3]}"
        print(f"{f:34s} {v}{extra}")
    print("SUMMARY", counts, "of", len(names))
