# BLENDLIB — what warrior.py and rig.py share: the axis swap from the code's
# Y-up world to Blender's Z-up, and the texture wiring off the surface:hex
# material names.
import bpy, os, json
from mathutils import Vector, Quaternion, Matrix

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
            # Density: object-space projection at the world tile, or UV repeat.
            tiles = json.load(open(os.path.join(tex_dir, "tiles.json"))) if os.path.exists(os.path.join(tex_dir, "tiles.json")) else {}
            tinfo = tiles.get(surface, {"repeat": 1, "worldTile": None})
            coord = nt.nodes.new("ShaderNodeTexCoord"); mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-1000, 0)
            # glTF carries UVs and nothing else, so a world-tiled substance gets
            # its density BAKED: every part wearing it is cube-projected at the
            # tile size (metres), and the map then reads at 1:1 over those UVs.
            if tinfo.get("worldTile"):
                tile = float(tinfo["worldTile"])
                for o2 in parts:
                    if any(sl.material is m for sl in o2.material_slots):
                        bpy.ops.object.select_all(action='DESELECT'); o2.select_set(True); bpy.context.view_layer.objects.active = o2
                        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
                        bpy.ops.uv.cube_project(cube_size=tile, correct_aspect=False, scale_to_bounds=False)
                        bpy.ops.object.mode_set(mode='OBJECT'); o2.select_set(False)
                nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"]); k = 1.0
            else:
                nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"]); k = float(tinfo.get("repeat") or 1)
            mapping.inputs["Scale"].default_value = (k, k, k)
            def img(kind, colorspace):
                path = os.path.join(tex_dir, f"{surface}-{kind}.png")
                if not os.path.exists(path): return None
                im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = colorspace
                n = nt.nodes.new("ShaderNodeTexImage"); n.image = im; n.location = (-700, 0)
                nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
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

