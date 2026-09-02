# PROP.PY — a weapon or shield OBJ (fist frame) to glTF, name kept.
#   Blender -b -P tools/blender/prop.py -- weapon-dane_axe
import bpy, os, sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
STEM = argv[0]; D = os.path.join(os.path.expanduser("~/bretwalda-blood-moot"), "art", "blender")

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
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"{STEM}.glb"), use_selection=True, export_format='GLB', export_apply=True)
print(f"[prop.py] {STEM}: {len(parts)} parts")
