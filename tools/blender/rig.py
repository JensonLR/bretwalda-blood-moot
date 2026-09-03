# RIG.PY — the warrior with the game's skeleton, in Blender: an armature
# built from warrior-<cls>.rig.json (anim.ts's bones, named), every part
# bound by the weights the game paints (or rigidly to the bone it rides),
# textures attached, hand mounts as bone-parented empties, saved and
# exported as a skinned glTF.
#   Blender -b -P tools/blender/rig.py -- huscarl
import bpy, os, sys, json
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blendlib import to_b, q_to_b, attach_textures
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CLS = argv[0] if argv else "huscarl"
ROOT = os.path.expanduser("~/bretwalda-blood-moot"); D = os.path.join(ROOT, "art", "blender")
rig = json.load(open(os.path.join(D, f"warrior-{CLS}.rig.json")))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(D, f"warrior-{CLS}.rig.obj"), forward_axis='NEGATIVE_Z', up_axis='Y')
parts = {o.name: o for o in bpy.context.selected_objects if o.type == 'MESH'}
print(f"[rig.py] {len(parts)} parts imported")
attach_textures(list(parts.values()), os.path.join(D, "tex"))

# THE ARMATURE. Bone head = the node's world position; tail toward its first
# child (or 8 cm down the node's own -Y, the limb's direction in the code);
# roll so the bone's Z faces the node's forward.
arm_data = bpy.data.armatures.new(f"Warrior_{CLS}_Armature"); arm = bpy.data.objects.new(f"Warrior_{CLS}", arm_data)
bpy.context.scene.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bones = {b["name"]: b for b in rig["bones"]}
children = {}
for b in rig["bones"]:
    if b["parent"]: children.setdefault(b["parent"], []).append(b["name"])
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for b in rig["bones"]:
    e = arm_data.edit_bones.new(b["name"]); head = to_b(b["position"]); q = q_to_b(b["quaternion"])
    down = q @ Vector((0, 0, -1))                       # the node's -Y (Blender -Z after the swap)
    kids = children.get(b["name"], [])
    if kids:
        tail = to_b(bones[kids[0]]["position"])
        if (tail - head).length < 0.02: tail = head + down * 0.08
    else: tail = head + down * 0.08
    if b["name"] in ("Hips", "Spine"): tail = head + Vector((0, 0, 0.12))
    e.head = head; e.tail = tail
    fwd = q @ Vector((0, -1, 0))                        # the node's +Z is Blender -Y: the face
    try: e.align_roll(fwd)
    except Exception: pass
    eb[b["name"]] = e
for b in rig["bones"]:
    if b["parent"] and b["parent"] in eb: eb[b["name"]].parent = eb[b["parent"]]; eb[b["name"]].use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# BINDING: vertex groups per bone; the game's weights, or rigid.
for part in rig["parts"]:
    o = parts.get(part["obj"]) or parts.get(part["obj"] + ".001")
    if o is None: print("[rig.py] missing", part["obj"]); continue
    nverts = len(o.data.vertices)
    if part.get("skin"):
        groups = {}
        for i, row in enumerate(part["skin"]):
            if i >= nverts: break
            for k in range(0, len(row), 2):
                groups.setdefault(row[k], []).append((i, row[k + 1]))
        for bone, entries in groups.items():
            vg = o.vertex_groups.new(name=bone)
            for i, w in entries: vg.add([i], w, 'REPLACE')
    else:
        vg = o.vertex_groups.new(name=part["bone"]); vg.add(list(range(nverts)), 1.0, 'REPLACE')
    mod = o.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    o.parent = arm
# HAND MOUNTS: empties parented to the wrist bones, at the game's mount frames.
for name, bone in (("HandR", "RightWrist"), ("HandL", "LeftWrist")):
    h = rig["hands"][name]; e = bpy.data.objects.new(name, None); e.empty_display_size = 0.05; e.empty_display_type = 'ARROWS'
    bpy.context.scene.collection.objects.link(e); e.matrix_world = Matrix.Translation(to_b(h["position"])) @ q_to_b(h["quaternion"]).to_matrix().to_4x4()
    if bone in arm_data.bones:
        mw = e.matrix_world.copy(); e.parent = arm; e.parent_type = 'BONE'; e.parent_bone = bone; e.matrix_world = mw
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, f"warrior-{CLS}.blend"))
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
for o in arm.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"warrior-{CLS}.glb"), use_selection=True, export_format='GLB', export_image_format='NONE', export_apply=False, export_skins=True, export_def_bones=False)
print(f"[rig.py] {CLS}: {len(arm_data.bones)} bones, {len(parts)} parts -> warrior-{CLS}.glb")
