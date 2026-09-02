# WARRIOR.PY — the whole procedural warrior, into Blender and out as glTF.
#   Blender -b -P tools/blender/warrior.py -- huscarl 13
import bpy, os, sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CLS = argv[0] if argv else "huscarl"; SEED = argv[1] if len(argv) > 1 else "13"
ROOT = os.path.expanduser("~/bretwalda-blood-moot")
OBJ = os.path.join(ROOT, "art", "blender", f"warrior-{CLS}-{SEED}.obj")
BLEND = os.path.join(ROOT, "art", "blender", f"warrior-{CLS}.blend")
GLB = os.path.join(ROOT, "art", "blender", f"warrior-{CLS}.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=OBJ, forward_axis='NEGATIVE_Z', up_axis='Y')
parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
root = bpy.data.objects.new(f"Warrior_{CLS}", None); bpy.context.scene.collection.objects.link(root)
for o in parts:
    o.parent = root
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0002); bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.object.mode_set(mode='OBJECT')
    for slot in o.material_slots:
        m = slot.material
        if m and m.use_nodes:
            b = m.node_tree.nodes.get("Principled BSDF")
            if b and "Subsurface Weight" in b.inputs and ("skin" in m.name.lower() or "flesh" in m.name.lower()):
                b.inputs["Subsurface Weight"].default_value = 0.2
os.makedirs(os.path.dirname(BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_format='GLB', export_apply=True)
print(f"[warrior.py] {len(parts)} parts -> {GLB}")
