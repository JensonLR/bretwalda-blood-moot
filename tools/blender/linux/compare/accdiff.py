#!/usr/bin/env python3
"""accdiff.py A.glb B.glb - classify every accessor by who references it, so an accessor-count difference can be explained."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load


def classify(js):
    use = collections.defaultdict(list)
    for m in js['meshes']:
        for p in m['primitives']:
            for k, i in p['attributes'].items():
                use[i].append('mesh:' + k)
            if 'indices' in p:
                use[p['indices']].append('mesh:INDICES')
            for t in p.get('targets', []):
                for k, i in t.items():
                    use[i].append('target:' + k)
    for sk in js.get('skins', []):
        if 'inverseBindMatrices' in sk:
            use[sk['inverseBindMatrices']].append('skin:IBM')
    for an in js.get('animations', []):
        for s in an['samplers']:
            use[s['input']].append('anim:input')
            use[s['output']].append('anim:output')
    cat = collections.Counter()
    for i in range(len(js['accessors'])):
        cat[tuple(sorted(set(use.get(i, ['UNREFERENCED']))))] += 1
    multi = sum(1 for i, u in use.items() if len(u) > 1)
    return cat, multi


for tag, p in (('A', sys.argv[1]), ('B', sys.argv[2])):
    _, js, _ = load(p)
    cat, multi = classify(js)
    print(tag, os.path.basename(p), 'accessors', len(js['accessors']), 'shared-by->1-user', multi)
    for k, v in sorted(cat.items()):
        print('   ', v, k)
    ns = sum(len(a['samplers']) for a in js.get('animations', []))
    nc = sum(len(a['channels']) for a in js.get('animations', []))
    print('    samplers', ns, 'channels', nc)
