# WORLD.PY — a ground OBJ from exportworld.mjs, dressed in its maps and joined
# per material, out as glTF.   Blender -b -P tools/blender/world.py -- saxon_village
import bpy, os, sys, json
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GROUND = argv[0] if argv else "saxon_village"
D = os.path.join(os.path.expanduser("~/bretwalda-blood-moot"), "art", "blender")
STEM = f"ground-{GROUND}"
mats = json.load(open(os.path.join(D, f"{STEM}.materials.json")))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(D, f"{STEM}.obj"), forward_axis='NEGATIVE_Z', up_axis='Y')
parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
print(f"[world.py] imported {len(parts)} parts")
# Dress every material from the sidecar: base map x colour, normal, roughness, alpha cutout; UV repeat via a Mapping node.
for m in bpy.data.materials:
    info = mats.get(m.name) or mats.get(m.name.split(".")[0])
    if not info: continue
    m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf: continue
    bsdf.inputs["Base Color"].default_value = (*info["color"], 1.0)
    bsdf.inputs["Roughness"].default_value = min(1.0, float(info["roughness"])); bsdf.inputs["Metallic"].default_value = float(info["metalness"])
    if info.get("emissive") and sum(info["emissive"]) > 0:
        bsdf.inputs["Emission Color"].default_value = (*info["emissive"], 1.0); bsdf.inputs["Emission Strength"].default_value = float(info.get("emissiveIntensity", 1))
    coord = nt.nodes.new("ShaderNodeTexCoord"); mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-1000, 0)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"]); rep = info.get("repeat") or [1, 1]
    mapping.inputs["Scale"].default_value = (float(rep[0]), float(rep[1]), 1.0)
    def img(file, colorspace):
        if not file: return None
        path = os.path.join(D, "tex-world", GROUND, file)
        if not os.path.exists(path): return None
        im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = colorspace
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = im; n.location = (-700, 0); nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"]); return n
    base = img(info.get("map"), "sRGB")
    colour_out = None
    if base:
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = (*info["color"], 1.0); nt.links.new(base.outputs["Color"], mix.inputs[7]); colour_out = mix.outputs[2]
    if info.get("vertexColors"):
        # The tint the code wrote per vertex — turf, path, mud — rides the
        # mesh as a colour attribute and multiplies whatever the map gives.
        vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Color"
        vmix = nt.nodes.new("ShaderNodeMix"); vmix.data_type = 'RGBA'; vmix.blend_type = 'MULTIPLY'; vmix.inputs["Factor"].default_value = 1.0
        if colour_out is not None: nt.links.new(colour_out, vmix.inputs[6])
        else: vmix.inputs[6].default_value = (*info["color"], 1.0)
        nt.links.new(vc.outputs["Color"], vmix.inputs[7]); colour_out = vmix.outputs[2]
    if colour_out is not None: nt.links.new(colour_out, bsdf.inputs["Base Color"])
    nrm = img(info.get("normal"), "Non-Color")
    if nrm:
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    # three.js: roughness = scalar × map.g, metalness = scalar × map.b; the
    # scalars run above 1 here (1.04–1.11), which is how the maps' mid greys
    # come out matte. Blender clamps at 1; multiply before the clamp.
    rough = img(info.get("roughnessMap"), "Non-Color")
    if rough:
        sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(rough.outputs["Color"], sep.inputs["Color"])
        mul = nt.nodes.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'; mul.use_clamp = True; mul.inputs[1].default_value = float(info["roughness"])
        nt.links.new(sep.outputs["Green"], mul.inputs[0]); nt.links.new(mul.outputs[0], bsdf.inputs["Roughness"])
    metal = img(info.get("metalnessMap"), "Non-Color")
    if metal:
        sepm = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(metal.outputs["Color"], sepm.inputs["Color"])
        mulm = nt.nodes.new("ShaderNodeMath"); mulm.operation = 'MULTIPLY'; mulm.use_clamp = True; mulm.inputs[1].default_value = float(info["metalness"])
        nt.links.new(sepm.outputs["Blue"], mulm.inputs[0]); nt.links.new(mulm.outputs[0], bsdf.inputs["Metallic"])
    alpha = img(info.get("alphaMap"), "Non-Color")
    if alpha:
        nt.links.new(alpha.outputs["Color"], bsdf.inputs["Alpha"]); m.blend_method = 'CLIP' if hasattr(m, "blend_method") else m.blend_method
    elif info.get("transparent") and float(info.get("opacity", 1)) < 1:
        bsdf.inputs["Alpha"].default_value = float(info["opacity"])
# Join the parts per material so Unity gets tens of meshes, not thousands.
groups = {}
for o in parts:
    key = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else "none"
    groups.setdefault(key, []).append(o)
joined = []
for key, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = f"{GROUND}__{key}"
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.faces_shade_smooth(); bpy.ops.object.mode_set(mode='OBJECT')
    joined.append(o)
root = bpy.data.objects.new(f"Ground_{GROUND}", None); bpy.context.scene.collection.objects.link(root)
for o in joined:
    mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, f"{STEM}.blend"))
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
for o in joined: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"{STEM}.glb"), use_selection=True, export_format='GLB', export_apply=True, export_vertex_color='ACTIVE' if 'export_vertex_color' in bpy.ops.export_scene.gltf.get_rna_type().properties.keys() else 'MATERIAL')
print(f"[world.py] {GROUND}: {len(joined)} meshes -> {STEM}.glb")
