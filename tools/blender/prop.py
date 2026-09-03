# PROP.PY — a weapon or shield OBJ (fist frame) to glTF, name kept.
#   Blender -b -P tools/blender/prop.py -- weapon-dane_axe
import bpy, os, sys, json
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
STEM = argv[0]; D = os.path.join(os.path.expanduser("~/bretwalda-blood-moot"), "art", "blender")

# ONE COPY OF THE TEXTURE WIRING, and this file kept a second. It was forked
# from `warrior.py` before that moved into `blendlib.py`, and it never took the
# change that mattered: blendlib BAKES a surface's UV repeat into the mesh,
# because an image-less glTF carries no texture transform and Unity's
# SurfaceLibrary rebuilds the material from shared maps with none. This copy
# left the repeat on a Mapping node, so every helm and every weapon built here
# would have rendered at the wrong texture density in Unity while the men
# beside them were right. Shared now, and there is one definition again.
import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blendlib import attach_textures


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(D, f"{STEM}.obj"), forward_axis='NEGATIVE_Z', up_axis='Y')
parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
root = bpy.data.objects.new(STEM, None); bpy.context.scene.collection.objects.link(root)
for o in parts:
    mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.faces_shade_smooth(); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
attach_textures(parts, os.path.join(D, 'tex'))
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"{STEM}.glb"), use_selection=True, export_format='GLB', export_image_format='NONE', export_apply=True)
print(f"[prop.py] {STEM}: {len(parts)} parts")
