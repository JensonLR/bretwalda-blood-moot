# WARRIOR.PY — the whole procedural warrior, assembled as a posable hierarchy.
#   Blender -b -P tools/blender/warrior.py -- huscarl 13
# Reads warrior-<cls>-<seed>.obj (parts named <Pivot>__<part>) and the sockets
# sidecar, parents every part under an Empty at its pivot's world position —
# Torso > {Head, RightArm, LeftArm, Cloak}, Root > {RightLeg, LeftLeg} — puts
# HandR/HandL Empties at the fist mounts' world transforms, and exports glTF
# with that hierarchy. Node names are what the Unity pose driver looks up.
import bpy, os, sys, json
from mathutils import Vector, Quaternion, Matrix
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CLS = argv[0] if argv else "huscarl"; SEED = argv[1] if len(argv) > 1 else "13"
ROOT = os.path.expanduser("~/bretwalda-blood-moot")
D = os.path.join(ROOT, "art", "blender")
OBJ = os.path.join(D, f"warrior-{CLS}-{SEED}.obj"); SOCK = os.path.join(D, f"warrior-{CLS}-{SEED}.sockets.json")
BLEND = os.path.join(D, f"warrior-{CLS}.blend"); GLB = os.path.join(D, f"warrior-{CLS}.glb")
sock = json.load(open(SOCK))
# The OBJ importer maps the file's Y-up to Blender's Z-up: (x, y, z) -> (x, -z, y).
def to_b(v): return Vector((v[0], -v[2], v[1]))
def q_to_b(q):
    # rotate the quaternion into Blender's frame: conjugate by the Y-up -> Z-up change of basis
    R = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
    m = Quaternion((q[3], q[0], q[1], q[2])).to_matrix()
    return (R @ m @ R.transposed()).to_quaternion()

# THE SURFACE MAPS: a material named "<surface>:<hex>" gets the surface's
# dumped maps (tools/blender/exporttextures.mjs) — the base map multiplied by
# the MTL colour (the game tints its maps the same way), the normal map, the
# roughness map, the metalness map. Missing files are simply skipped.
def attach_textures(parts, tex_dir):
    done = set()
    for o in parts:
        for slot in o.material_slots:
            m = slot.material
            if not m or m.name in done or ":" not in m.name: continue
            done.add(m.name)
            surface = m.name.split(":")[0].split(".")[0]
            m.use_nodes = True
            nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
            if not bsdf: continue
            def img(kind, colorspace):
                path = os.path.join(tex_dir, f"{surface}-{kind}.png")
                if not os.path.exists(path): return None
                im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = colorspace
                n = nt.nodes.new("ShaderNodeTexImage"); n.image = im; n.location = (-700, 0)
                return n
            base = img("map", "sRGB")
            if base:
                mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1.0
                mix.inputs[6].default_value = tuple(bsdf.inputs["Base Color"].default_value)
                nt.links.new(base.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
            nrm = img("normal", "Non-Color")
            if nrm:
                nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
            rough = img("roughness", "Non-Color")
            if rough: nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
            metal = img("metalness", "Non-Color")
            if metal: nt.links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=OBJ, forward_axis='NEGATIVE_Z', up_axis='Y')
parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
scene = bpy.context.scene
def empty(name, pos, parent=None, quat=None):
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.05
    scene.collection.objects.link(e)
    if parent is not None: e.parent = parent
    e.matrix_world = Matrix.Translation(pos) @ (quat.to_matrix().to_4x4() if quat else Matrix.Identity(4))
    return e
root = empty(f"Warrior_{CLS}", Vector((0, 0, 0)))
torso = empty("Torso", to_b(sock["pivots"]["Torso"]["position"]), root)
nodes = {"Torso": torso}
for name, parent in (("Head", torso), ("RightArm", torso), ("LeftArm", torso), ("Cloak", torso), ("RightLeg", root), ("LeftLeg", root)):
    if name in sock["pivots"]: nodes[name] = empty(name, to_b(sock["pivots"][name]["position"]), parent)
for hand, arm in (("HandR", "RightArm"), ("HandL", "LeftArm")):
    h = sock["hands"][hand]; nodes[hand] = empty(hand, to_b(h["position"]), nodes[arm], q_to_b(h["quaternion"]))
for o in parts:
    piv = o.name.split("__")[0] if "__" in o.name else "Torso"
    parent = nodes.get(piv, torso)
    mw = o.matrix_world.copy()
    o.parent = parent; o.matrix_world = mw     # keep the world transform, hang from the pivot
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0002); bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
attach_textures(parts, os.path.join(D, 'tex'))
os.makedirs(D, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.object.select_all(action='DESELECT')
for o in [root] + list(nodes.values()) + parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_format='GLB', export_apply=True)
print(f"[warrior.py] {CLS}: {len(parts)} parts under {len(nodes)} nodes -> {GLB}")
