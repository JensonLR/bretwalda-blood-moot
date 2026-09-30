#!/usr/bin/env python3
"""glbinfo.py - parse a GLB container and print / compare structural facts.
usage: glbinfo.py a.glb            -> summary
       glbinfo.py a.glb b.glb      -> summary of both + structural diff verdict
Pure stdlib. Not a Blender script.
"""
import sys, json, struct, hashlib

COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def load(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF' and ver == 2 and length == len(b), (magic, ver, length, len(b))
    off = 12
    js = None
    bin_ = b''
    while off < len(b):
        clen, ctype = struct.unpack('<I4s', b[off:off + 8])
        data = b[off + 8:off + 8 + clen]
        off += 8 + clen
        if ctype == b'JSON':
            js = json.loads(data.rstrip(b' \0').decode())
        elif ctype.startswith(b'BIN'):
            bin_ = data
    return b, js, bin_


def acc_bytes(js, bin_, i):
    a = js['accessors'][i]
    if 'bufferView' not in a:
        return b''
    bv = js['bufferViews'][a['bufferView']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride')
    esz = NCOMP[a['type']] * COMP[a['componentType']]
    if stride and stride != esz:
        out = bytearray()
        for k in range(a['count']):
            out += bin_[o + k * stride:o + k * stride + esz]
        return bytes(out)
    return bin_[o:o + a['count'] * esz]


def summary(path):
    b, js, bin_ = load(path)
    s = {}
    s['file'] = path
    s['bytes'] = len(b)
    s['md5'] = hashlib.md5(b).hexdigest()
    s['bin_bytes'] = len(bin_)
    s['generator'] = js['asset'].get('generator')
    s['ext_used'] = js.get('extensionsUsed', [])
    for k in ('nodes', 'meshes', 'skins', 'animations', 'accessors', 'bufferViews', 'materials', 'textures', 'images', 'samplers', 'scenes'):
        s[k] = len(js.get(k, []))
    s['joints'] = [len(sk['joints']) for sk in js.get('skins', [])]
    s['prims'] = sum(len(m['primitives']) for m in js.get('meshes', []))
    tris = 0
    verts = 0
    for m in js.get('meshes', []):
        for p in m['primitives']:
            verts += js['accessors'][p['attributes']['POSITION']]['count']
            if 'indices' in p:
                tris += js['accessors'][p['indices']]['count'] // 3
    s['verts'] = verts
    s['tris'] = tris
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for m in js.get('meshes', []):
        for p in m['primitives']:
            a = js['accessors'][p['attributes']['POSITION']]
            if 'min' in a:
                for k in range(3):
                    mn[k] = min(mn[k], a['min'][k])
                    mx[k] = max(mx[k], a['max'][k])
    s['pos_bbox_min'] = [round(x, 4) for x in mn]
    s['pos_bbox_max'] = [round(x, 4) for x in mx]
    s['anim_names'] = sorted(a.get('name', '?') for a in js.get('animations', []))
    s['mat_names'] = sorted(m.get('name', '?') for m in js.get('materials', []))
    s['node_names'] = sorted(n.get('name', '?') for n in js.get('nodes', []))
    per = []
    for m in js.get('meshes', []):
        for p in m['primitives']:
            per.append((m.get('name', '?'), js['accessors'][p['attributes']['POSITION']]['count'],
                        js['accessors'][p['indices']]['count'] if 'indices' in p else 0,
                        js['materials'][p['material']].get('name', '?') if 'material' in p else None))
    s['per_prim'] = sorted(per, key=lambda t: tuple(str(x) for x in t))
    dur = {}
    for an in js.get('animations', []):
        mxt = 0.0
        for smp in an['samplers']:
            a = js['accessors'][smp['input']]
            if 'max' in a:
                mxt = max(mxt, a['max'][0])
        dur[an.get('name', '?')] = round(mxt, 4)
    s['anim_dur'] = dur
    # geometry hash, in mesh/prim order, over every vertex attribute + indices
    hs = hashlib.md5()
    for m in js.get('meshes', []):
        for p in m['primitives']:
            for name in sorted(p['attributes']):
                hs.update(name.encode())
                hs.update(acc_bytes(js, bin_, p['attributes'][name]))
            if 'indices' in p:
                hs.update(acc_bytes(js, bin_, p['indices']))
    s['geom_md5'] = hs.hexdigest()
    # animation payload hash (samplers input+output), in animation order by name
    ha = hashlib.md5()
    for an in sorted(js.get('animations', []), key=lambda x: x.get('name', '')):
        ha.update(an.get('name', '').encode())
        for smp in an['samplers']:
            ha.update(acc_bytes(js, bin_, smp['input']))
            ha.update(acc_bytes(js, bin_, smp['output']))
    s['anim_md5'] = ha.hexdigest()
    # skin payload (inverseBindMatrices)
    hk = hashlib.md5()
    for sk in js.get('skins', []):
        if 'inverseBindMatrices' in sk:
            hk.update(acc_bytes(js, bin_, sk['inverseBindMatrices']))
    s['ibm_md5'] = hk.hexdigest()
    # material scalar params
    s['mat_params'] = json.dumps([{k: v for k, v in m.items() if k != 'name'} for m in sorted(js.get('materials', []), key=lambda m: m.get('name', ''))], sort_keys=True)
    s['mat_md5'] = hashlib.md5(s['mat_params'].encode()).hexdigest()
    return s, js, bin_


def show(s):
    keys = ['file', 'bytes', 'md5', 'generator', 'nodes', 'meshes', 'prims', 'skins', 'joints', 'animations', 'accessors',
            'bufferViews', 'materials', 'textures', 'images', 'verts', 'tris', 'pos_bbox_min', 'pos_bbox_max', 'geom_md5',
            'anim_md5', 'ibm_md5', 'mat_md5']
    for k in keys:
        print(f"  {k:14s} {s[k]}")
    print(f"  anim_names     {len(s['anim_names'])}: {' '.join(s['anim_names'])}")


CMP = ('nodes', 'meshes', 'prims', 'skins', 'joints', 'animations', 'accessors', 'bufferViews', 'materials', 'textures', 'images',
       'verts', 'tris', 'pos_bbox_min', 'pos_bbox_max', 'anim_names', 'mat_names', 'node_names', 'per_prim', 'anim_dur',
       'ext_used', 'geom_md5', 'anim_md5', 'ibm_md5', 'mat_md5')

if __name__ == '__main__':
    if len(sys.argv) == 2:
        s, js, _ = summary(sys.argv[1])
        show(s)
    else:
        a, ja, ba = summary(sys.argv[1])
        b, jb, bb = summary(sys.argv[2])
        show(a)
        print()
        show(b)
        print()
        if a['md5'] == b['md5']:
            print("VERDICT: BYTE-IDENTICAL")
        else:
            diffs = [k for k in CMP if a[k] != b[k]]
            print("VERDICT:", "STRUCTURALLY IDENTICAL (bytes differ)" if not diffs else "DIFFERENT in: " + ", ".join(diffs))
            if a['generator'] != b['generator']:
                print("  generator differs:", a['generator'], '|', b['generator'])
            if a['bytes'] != b['bytes']:
                print("  size differs:", a['bytes'], b['bytes'])
