#!/usr/bin/env python3
"""strandstat.py A.glb B.glb - are two hair/beard GLBs the SAME STRANDS up to the (time-seeded) turbulence?

strands.py grows each ribbon as 5 segments of fixed length, direction re-normalised every step, and the only turbulence is
mathutils.noise.noise_vector (time-seeded on stock Blender, so unreproducible across runs and machines).  Consequences that a
noise-only difference must satisfy, and a real geometry change would break:
  * shell primitive `<name>_1`  (the underfur, from the JS shell): identical positions (hair) - reported as max |dP|
  * strand primitive `<name>_1__strands`:
      - strand count (indices / 30) equal                       (random.seed stream + shell face areas)
      - root ring identical (10% of verts = 2 of 20 per strand) (roots come from the random stream, not from noise)
      - total ribbon AREA equal within 0.5%                      (segment length is fixed; noise only bends it)
      - bbox within 1.5 cm, per-vertex |dP| max <= 1.5 cm, mean <= 5 mm
Prints one line; exit 0 when all hold, 1 otherwise.  When the SHELL differs (beards: the JS shell drifted) the strand count/area
legitimately differ too; the line says SHELL-DRIFT and only reports the shell delta + strand-count ratio.
"""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbinfo import load
from glbdeep import arr, prims


def tri_area(P, I):
    T = P[I.reshape(-1, 3)]
    return float(np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1).sum() * 0.5)


def main(a, b):
    _, ja, ba = load(a)
    _, jb, bb = load(b)
    PA, PB = prims(ja, ba), prims(jb, bb)
    names = sorted(PA)
    shell = [n for n in names if not n.endswith('__strands')]
    strand = [n for n in names if n.endswith('__strands')]
    if sorted(PA) != sorted(PB):
        print("DIFF primitive names differ")
        return 1
    out, ok = [], True
    shell_d = 0.0
    for n in shell:
        pa = arr(ja, ba, PA[n][1]['attributes']['POSITION']).astype(np.float64)
        pb = arr(jb, bb, PB[n][1]['attributes']['POSITION']).astype(np.float64)
        if pa.shape == pb.shape:
            shell_d = max(shell_d, float(np.abs(pa - pb).max()))
        else:
            shell_d = float('inf')
    shell_same = shell_d < 1e-5
    for n in strand:
        pa = arr(ja, ba, PA[n][1]['attributes']['POSITION']).astype(np.float64)
        pb = arr(jb, bb, PB[n][1]['attributes']['POSITION']).astype(np.float64)
        ia = arr(ja, ba, PA[n][1]['indices']).astype(np.int64)
        ib = arr(jb, bb, PB[n][1]['indices']).astype(np.int64)
        sa_, sb_ = len(ia) // 30, len(ib) // 30
        areaA, areaB = tri_area(pa, ia), tri_area(pb, ib)
        if not shell_same:
            out.append(f"SHELL-DRIFT shell max|dP|={shell_d * 1000:.1f}mm strands {sa_}->{sb_} ({100 * (sb_ - sa_) / sa_:+.1f}%) area {100 * (areaB - areaA) / areaA:+.1f}%")
            continue
        if sa_ != sb_:
            ok = False
            out.append(f"COUNT-DIFF strands {sa_}->{sb_}")
            continue
        if pa.shape != pb.shape:
            # same strands, but the exporter split a couple of vertices differently (noise made two normals coincide):
            # per-vertex alignment is impossible, so hold the invariants that do not need it.
            bbA, bbB = np.array([pa.min(0), pa.max(0)]), np.array([pb.min(0), pb.max(0)])
            dbb = float(np.abs(bbA - bbB).max()); dA = abs(areaB - areaA) / areaA
            good = dA < 0.005 and dbb < 0.015
            ok &= good
            out.append(f"{'NOISE-ONLY' if good else 'DIFF'}(area+bbox only; verts {len(pa)}->{len(pb)}) strands={sa_} area{100 * (areaB - areaA) / areaA:+.2f}% bbox-d={dbb * 1000:.1f}mm shell-d={shell_d:.1e}")
            continue
        d = np.linalg.norm(pa - pb, axis=1)
        roots = float((d < 1e-6).mean())
        dA = abs(areaB - areaA) / areaA
        bbA, bbB = np.array([pa.min(0), pa.max(0)]), np.array([pb.min(0), pb.max(0)])
        dbb = float(np.abs(bbA - bbB).max())
        good = dA < 0.005 and dbb < 0.015 and d.max() < 0.015 and d.mean() < 0.005 and abs(roots - 2.0 / (len(pa) // sa_)) < 0.02
        ok &= good
        out.append(f"{'NOISE-ONLY' if good else 'DIFF'} strands={sa_} roots-identical={roots:.3f} area{100 * (areaB - areaA) / areaA:+.2f}% bbox-d={dbb * 1000:.1f}mm |dP| mean={d.mean() * 1000:.2f}mm max={d.max() * 1000:.1f}mm shell-d={shell_d:.1e}")
    print("; ".join(out) if out else "no strand primitive")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
