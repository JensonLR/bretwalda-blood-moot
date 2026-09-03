# RENDER.PY — a judging frame of whatever head.py made, headless.
#   Blender -b art/blender/bretwalda.blend -P tools/blender/render.py -- Head_huscarl art/blender/head-huscarl.png [angle] [lens] [frame_m] [res]
import bpy, sys, math, os
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
NAME = argv[0] if argv else "Head_huscarl"
OUT = argv[1] if len(argv) > 1 else os.path.expanduser("~/bretwalda-blood-moot/art/blender/render.png")
obj = bpy.data.objects[NAME]
scene = bpy.context.scene
# A parent Empty (the warrior) is measured through its mesh children, in world space.
class _Wrap:
    def __init__(self, meshes): self.meshes = meshes
def _world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]
_meshes = [obj] if obj.type == 'MESH' else [c for c in obj.children_recursive if c.type == 'MESH']
_all_verts = [v for m in _meshes for v in _world_verts(m)]
for o in list(scene.objects):
    if o.type in {"CAMERA", "LIGHT"}: bpy.data.objects.remove(o, do_unlink=True)
# Three-quarter portrait. The OBJ importer (forward -Z, up Y) turns the file's
# Y-up frame into Blender's Z-up: file +Y -> Blender +Z, file +Z (the face) ->
# Blender -Y. So: up is Z, the length axis is Y with the face toward -Y, and
# breadth is X. The sharp-end test below is kept as a printed check on that.
import mathutils
vs = _all_verts
lo = [min(v[i] for v in vs) for i in range(3)]; hi = [max(v[i] for v in vs) for i in range(3)]
ext = [hi[i] - lo[i] for i in range(3)]; c = [(hi[i] + lo[i]) / 2 for i in range(3)]
up, length, breadth = 2, 1, 0
# A PORTRAIT frames the top FRAME metres instead of the whole subject: the
# camera looks at the middle of that band and stands off from its height, so
# the same script gives a whole man at 4 m and a head-and-shoulders at 1.3 m.
FRAME = float(argv[4]) if len(argv) > 4 else 0.0
frame_h = FRAME if FRAME > 0 else ext[up]
if FRAME > 0: c[up] = hi[up] - FRAME / 2
# The face is the SHARP end: a nose tip has few vertices within a centimetre
# of its extreme along the length axis, the occiput's broad curve has many.
plus = max(v[length] for v in vs); minus = min(v[length] for v in vs)
near_plus = sum(1 for v in vs if plus - v[length] < 0.012)
near_minus = sum(1 for v in vs if v[length] - minus < 0.012)
face_sign = -1
if (near_plus < near_minus) != (face_sign > 0): print("[render.py] WARNING: the sharp-end test disagrees with the importer mapping — look at the frame before believing it")
print(f"[render.py] sharp-end test: +{'XYZ'[length]} has {near_plus} vertices within 12 mm of its extreme, -{'XYZ'[length]} has {near_minus}")
def pt(along, side, height):
    p = [0.0, 0.0, 0.0]; p[length] = c[length] + face_sign * along; p[breadth] = c[breadth] + side; p[up] = c[up] + height
    return p
upv = [0.0, 0.0, 0.0]; upv[up] = 1.0
def aim(o, target):
    # A look-at with the world's up given explicitly (this scene's up is the
    # code's Y, not Blender's Z): forward, right, up as the camera's columns.
    f = (mathutils.Vector(target) - o.location).normalized()
    r = f.cross(mathutils.Vector(upv)).normalized()
    u = r.cross(f).normalized()
    m = mathutils.Matrix((r, u, -f)).transposed()
    o.rotation_euler = m.to_euler()
    # Measured, not trusted: if the camera's own up ends pointing down, roll it.
    world_up = (o.matrix_basis if hasattr(o, "matrix_basis") else m.to_4x4()).to_3x3() @ mathutils.Vector((0, 1, 0))
    if world_up.dot(mathutils.Vector(upv)) < 0:
        o.rotation_euler = (m @ mathutils.Matrix.Rotation(math.pi, 3, 'Z')).to_euler()
    print(f"[render.py] {o.name}: forward {tuple(round(x,2) for x in f)}, camera-up {tuple(round(x,2) for x in world_up)}")
ang = math.radians(float(argv[2]) if len(argv) > 2 else 35)
nose = max(vs, key=lambda v: face_sign * v[length])
print(f"[render.py] centre {[round(x,3) for x in c]}, sharp vertex {[round(x,3) for x in nose]}, camera angle {math.degrees(ang):.0f}°")
cam_data = bpy.data.cameras.new("Cam"); cam_data.lens = float(argv[3]) if len(argv) > 3 else 85
cam = bpy.data.objects.new("Cam", cam_data); scene.collection.objects.link(cam)
dist = max(0.9, 2.4 * frame_h)   # a head at 0.9 m, a whole man at about 4 m
cam.location = pt(dist * math.cos(ang), dist * math.sin(ang), 0.02 * frame_h / 0.27); aim(cam, c); scene.camera = cam
key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", 'AREA')); key.data.energy = 18; key.data.size = 0.6
key.location = pt(0.7 * dist / 0.9, -0.5 * dist / 0.9, 0.6 * dist / 0.9); key.data.energy = 18 * (dist / 0.9) ** 2; aim(key, c); scene.collection.objects.link(key)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", 'AREA')); fill.data.energy = 5; fill.data.size = 1.2; fill.data.color = (0.75, 0.85, 1.0)
fill.location = pt(0.4 * dist / 0.9, 0.8 * dist / 0.9, 0.2 * dist / 0.9); fill.data.energy = 5 * (dist / 0.9) ** 2; aim(fill, c); scene.collection.objects.link(fill)
scene.view_settings.view_transform = 'Standard'
print(f"[render.py] axes: up {'XYZ'[up]}, length {'XYZ'[length]} face toward {'+' if face_sign > 0 else '-'}{'XYZ'[length]}, breadth {'XYZ'[breadth]}")
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderSettings') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
RES = int(argv[5]) if len(argv) > 5 else 900
scene.render.resolution_x, scene.render.resolution_y = RES, RES
scene.render.filepath = OUT
scene.world = scene.world or bpy.data.worlds.new("World")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg: bg.inputs[0].default_value = (0.05, 0.045, 0.04, 1); bg.inputs[1].default_value = 1.0
print(f"[render.py] engine {scene.render.engine}, {len(_meshes)} mesh(es), extents {[round(x,3) for x in ext]}")
bpy.ops.render.render(write_still=True)
print(f"[render.py] {OUT}")
