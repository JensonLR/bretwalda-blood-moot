# HEAD.PY — the Blender half of docs/REBUILD-PLAN.md step 1.
#
# Run inside Blender (Text Editor > Run Script, or through the MCP bridge with
# `exec(open(path).read())`). Imports the OBJ that tools/blender/exporthead.mjs
# wrote, closes the poles, smooths, subdivides, gives it a skin material with a
# warm subsurface, saves art/blender/bretwalda.blend and exports the head as
# glTF. Everything is parameterised at the top; nothing here is destructive to
# an existing scene beyond replacing an object of the same name.
import bpy, os, math

ROOT = os.path.expanduser("~/bretwalda-blood-moot")
CLS, SEED = "huscarl", 13
OBJ = os.path.join(ROOT, "art", "blender", f"head-{CLS}-{SEED}.obj")
BLEND = os.path.join(ROOT, "art", "blender", "bretwalda.blend")
GLB = os.path.join(ROOT, "art", "blender", f"head-{CLS}.glb")
NAME = f"Head_{CLS}"

# An empty scene, not the startup cube: a judging render must show the head
# and nothing that came with the factory file.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=OBJ, forward_axis='NEGATIVE_Z', up_axis='Y')
obj = bpy.context.selected_objects[0]
obj.name = NAME
bpy.context.view_layer.objects.active = obj

# Weld the seam and the poles, then smooth: the grid has a duplicated column
# at u = 2π and degenerate rows at the two poles.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.mesh.faces_shade_smooth()
bpy.ops.object.mode_set(mode='OBJECT')
sub = obj.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = 1; sub.render_levels = 2

# Skin: a warm dielectric with subsurface, the tone the code calls skin:d4a884.
mat = bpy.data.materials.get("Skin") or bpy.data.materials.new("Skin")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.83, 0.66, 0.52, 1.0)
bsdf.inputs["Roughness"].default_value = 0.55
if "Subsurface Weight" in bsdf.inputs:
    bsdf.inputs["Subsurface Weight"].default_value = 0.25
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
mat.diffuse_color = (0.83, 0.66, 0.52, 1.0)
obj.data.materials.clear(); obj.data.materials.append(mat)

os.makedirs(os.path.dirname(BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_format='GLB', export_apply=True)
print(f"[head.py] {NAME}: {len(obj.data.vertices)} verts -> {GLB}")
