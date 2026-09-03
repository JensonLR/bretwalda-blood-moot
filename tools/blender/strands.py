# STRANDS.PY — a beard and a head of hair grown as strands, in Blender, from
# the shells the code exports. The shell (a closed surface in the hair
# material) becomes a growth surface: strands root on its faces, fall with
# gravity, sway, taper, and ride as ribbons — a few thousand vertices that
# read as hair where the shell read as a helmet of felt. The shell stays as
# an underfur, shrunk 2 mm in and darkened, so nothing shows through.
#   Blender -b art/blender/warrior-<cls>.blend -P tools/blender/strands.py -- <cls> [seed]
import bpy, bmesh, os, sys, math, random
from mathutils import Vector, noise
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CLS = argv[0] if argv else "huscarl"; SEED = int(argv[1]) if len(argv) > 1 else 7
D = os.path.join(os.path.expanduser("~/bretwalda-blood-moot"), "art", "blender")
random.seed(SEED)
# Two kinds of file: the pivot build (an Empty named Head with the parts
# under it) and the rigged build (an armature with a Head bone; the parts
# are the armature's children, bound by vertex group).
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
head = bpy.data.objects.get("Head") if arm is None else arm
def is_hair(c): return c.type == 'MESH' and c.material_slots and c.material_slots[0].material and c.material_slots[0].material.name.startswith("hair:")
if arm is None: hairparts = [c for c in head.children_recursive if is_hair(c)]
else: hairparts = [c for c in arm.children_recursive if is_hair(c) and any(g.name == "Head" for g in c.vertex_groups)]
if not hairparts: print("[strands] no hair parts"); sys.exit(0)
face = bpy.data.objects.get("Warrior_" + CLS)
# The beard is the hair part whose top sits below the eye line; the pelt is the other.
def zrange(o): return (min((o.matrix_world @ v.co).z for v in o.data.vertices), max((o.matrix_world @ v.co).z for v in o.data.vertices))
parts = sorted(hairparts, key=lambda o: zrange(o)[1])
beard = parts[0]; pelt = parts[-1] if len(parts) > 1 else None
hexcol = beard.material_slots[0].material.name.split(":")[1]
base = Vector((int(hexcol[0:2], 16), int(hexcol[2:4], 16), int(hexcol[4:6], 16))) / 255.0
lin = Vector(tuple((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in base))

def strand_mesh(src, kind):
    """Grow strands off every face of `src` (world space); return a mesh object."""
    bm = bmesh.new(); bm.from_mesh(src.data); bm.faces.ensure_lookup_table()
    mw = src.matrix_world; nm = mw.to_3x3().inverted().transposed()
    zlo, zhi = zrange(src); span = max(1e-3, zhi - zlo)
    ys = [(mw @ v.co).y for v in src.data.vertices]; ylo, yhi = min(ys), max(ys)
    front_y = ylo + 0.42 * (yhi - ylo)                  # the face is -Y: roots forward of this line are over the brow
    verts, faces, cols, uvs = [], [], [], []
    gravity = Vector((0, 0, -1))
    density = 11000.0 if kind == "beard" else 5200.0     # strands per m² of shell
    # Clumps: strands near a shared centre share a sway, so hair falls in locks
    # rather than as an even brush. Centres are seeded per face patch.
    clumps = {}
    def clump_sway(pt):
        key = (int(pt.x * 45), int(pt.y * 45), int(pt.z * 45))
        if key not in clumps: clumps[key] = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 0.1))) * 0.16
        return clumps[key]
    for f in bm.faces:
        area = f.calc_area() * (mw.to_scale().x ** 2)
        n = (nm @ f.normal).normalized(); c = mw @ f.calc_center_median()
        if kind == "beard" and n.z > 0.35: continue          # the top of the beard shell is inside the face
        k = area * density; count = int(k) + (1 if random.random() < k - int(k) else 0)
        for _ in range(count):
            # a random point on the face, by barycentric of a random triangle fan
            vs = [mw @ v.co for v in f.verts]; a, b = random.random(), random.random()
            if a + b > 1: a, b = 1 - a, 1 - b
            i = random.randrange(1, len(vs) - 1) if len(vs) > 3 else 1
            p = vs[0] + (vs[i] - vs[0]) * a + (vs[i + 1] - vs[0]) * b
            depth = (zhi - p.z) / span                       # 0 at the top of the shell, 1 at its bottom
            # The root direction lies along the shell: gravity projected onto the
            # tangent plane, lifted a little off the surface, jittered.
            tang = gravity - n * gravity.dot(n)
            tang = tang.normalized() if tang.length > 1e-4 else Vector((0, 0, -1))
            # The face is -Y. A pelt strand rooted on the brow would fall over the
            # eyes; it is swept back instead, and the fringe is cut short. Beard
            # strands on the cheeks (normals sideways) are kept short so they do
            # not stand out as whiskers.
            if kind == "hair" and (p.y < front_y or n.y < -0.25):
                if random.random() < 0.7: continue                       # a fringe, thinned
                tang = (tang + Vector((0, 1.3, 0))).normalized()          # swept back over the crown
            if kind == "beard":
                length = 0.014 + 0.058 * depth ** 1.3 + random.uniform(-0.005, 0.007)
                if abs(n.x) > 0.6: length *= 0.55
                d = (tang * 0.8 + n * 0.1 + Vector((random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12), 0))).normalized()
                w0 = 0.0011
            else:
                length = 0.025 + 0.045 * depth + random.uniform(-0.006, 0.010)
                if p.y < front_y or n.y < -0.25: length *= 0.5
                d = (tang * 0.85 + n * 0.06 + Vector((random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), 0))).normalized()
                w0 = 0.0013
            segs = 5; seg = length / segs; pts = [p.copy()]; dirs = [d]
            sway = clump_sway(p) + Vector((random.uniform(-1, 1), random.uniform(-1, 1), 0)) * 0.04
            for s in range(segs):
                turb = noise.noise_vector(p * 60 + Vector((SEED, s, 0))) * 0.14
                d = (d + gravity * 0.22 + sway + turb).normalized()
                p = p + d * seg; pts.append(p.copy()); dirs.append(d)
            side = n.cross(d); side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
            shade = random.uniform(0.55, 1.1)
            b0 = len(verts)
            for s, q in enumerate(pts):
                t = s / segs; w = w0 * (1 - 0.72 * t); sd = dirs[s].cross(n).normalized() if dirs[s].cross(n).length > 1e-4 else side
                verts.append(q + sd * w); verts.append(q - sd * w); uvs.append((0.0, t)); uvs.append((1.0, t))
                dark = 0.45 + 0.5 * t                        # roots in shadow, tips lit
                cols.append(shade * dark); cols.append(shade * dark)
            for s in range(segs):
                i = b0 + s * 2; faces.append((i, i + 1, i + 3, i + 2))
    bm.free()
    me = bpy.data.meshes.new(f"{src.name}__strands"); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    col = me.color_attributes.new("Color", 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols): col.data[i].color = (lin.x * c, lin.y * c, lin.z * c, 1.0)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices: uv.data[li].uv = uvs[me.loops[li].vertex_index]
    ob = bpy.data.objects.new(f"{src.name}__strands", me); bpy.context.scene.collection.objects.link(ob)
    return ob

mat = bpy.data.materials.new("hairStrand:" + hexcol); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Color"; nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
# A 16×4 alpha across the width: full in the middle, falling off to the
# edges, thinning toward the tip, so a ribbon reads as a strand and its edge
# as hair. Cut out at 0.5 rather than blended: no sorting for thousands of
# ribbons, in Blender or in Unity.
W, H = 16, 4
img = bpy.data.images.new("strandAlpha", W, H, alpha=True); px = [0.0] * (W * H * 4)
for y in range(H):
    for x in range(W):
        u = (x + 0.5) / W; v = (y + 0.5) / H
        edge = min(u, 1 - u) * 2
        a = min(1.0, edge * 1.8) * (1.0 - 0.35 * v)
        i = (y * W + x) * 4; px[i:i + 4] = (1.0, 1.0, 1.0, a)
img.pixels[:] = px; img.pack()
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = 'Linear'; tex.extension = 'EXTEND'
# The glTF exporter writes alphaMode MASK (with the cutoff) when the alpha
# reaches the BSDF through a greater-than; a bare link exports as BLEND.
cut = nt.nodes.new("ShaderNodeMath"); cut.operation = 'GREATER_THAN'; cut.inputs[1].default_value = 0.5
nt.links.new(tex.outputs["Alpha"], cut.inputs[0]); nt.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
if hasattr(mat, "surface_render_method"): mat.surface_render_method = 'DITHERED'
if hasattr(mat, "blend_method"): mat.blend_method = 'CLIP'
if hasattr(mat, "alpha_threshold"): mat.alpha_threshold = 0.5
# No sheen and a low specular: ribbons sit edge-on to every light, and a
# sheen there turns dark hair to frost.
bsdf.inputs["Roughness"].default_value = 0.72
if "Specular IOR Level" in bsdf.inputs: bsdf.inputs["Specular IOR Level"].default_value = 0.25
if "Sheen Weight" in bsdf.inputs: bsdf.inputs["Sheen Weight"].default_value = 0.0
mat.use_backface_culling = False
made = []
for src, kind in ([(beard, "beard")] + ([(pelt, "hair")] if pelt else [])):
    ob = strand_mesh(src, kind); ob.data.materials.append(mat)
    ob.parent = head; ob.matrix_parent_inverse = head.matrix_world.inverted()
    if arm is not None:
        vg = ob.vertex_groups.new(name="Head"); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
        mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    # the shell stays as underfur: pushed 2 mm in, darkened
    under = src.material_slots[0].material.copy(); under.name = "hairUnder:" + hexcol
    und = under.node_tree.nodes.get("Principled BSDF") if under.use_nodes else None
    if und:
        for inp in ("Base Color",):
            v = und.inputs[inp].default_value; und.inputs[inp].default_value = (v[0] * 0.55, v[1] * 0.55, v[2] * 0.55, 1)
        for l in list(under.node_tree.links):
            if l.to_socket == und.inputs["Base Color"]: under.node_tree.links.remove(l)
    src.material_slots[0].material = under
    bpy.context.view_layer.objects.active = src; bpy.ops.object.select_all(action='DESELECT'); src.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.transform.shrink_fatten(value=-0.001); bpy.ops.object.mode_set(mode='OBJECT')
    made.append(ob); print(f"[strands] {kind}: {len(ob.data.polygons)} ribbons off {src.name}")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, f"warrior-{CLS}.blend"))
root = bpy.data.objects["Warrior_" + CLS]
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
for o in root.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"warrior-{CLS}.glb"), use_selection=True, export_format='GLB', export_apply=(arm is None), export_skins=True, export_def_bones=False)
print(f"[strands] warrior-{CLS}.glb rewritten")
