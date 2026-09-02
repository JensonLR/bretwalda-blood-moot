# PROP.PY — a weapon or shield OBJ (fist frame) to glTF, name kept.
#   Blender -b -P tools/blender/prop.py -- weapon-dane_axe
import bpy, os, sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
STEM = argv[0]; D = os.path.join(os.path.expanduser("~/bretwalda-blood-moot"), "art", "blender")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(D, f"{STEM}.obj"), forward_axis='NEGATIVE_Z', up_axis='Y')
parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
root = bpy.data.objects.new(STEM, None); bpy.context.scene.collection.objects.link(root)
for o in parts:
    mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.faces_shade_smooth(); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"{STEM}.glb"), use_selection=True, export_format='GLB', export_apply=True)
print(f"[prop.py] {STEM}: {len(parts)} parts")
