# WORLDRENDER.PY — a judging frame of a ground .blend: sun, sky, a camera up
# and back over the fighting circle.   Blender -b <blend> -P worldrender.py -- out.png [dist]
import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]; out = argv[0]; dist = float(argv[1]) if len(argv) > 1 else 34.0
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, "SceneEEVEE") and 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, 100
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 5.5; sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35)); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("Sky") if sc.world is None else sc.world; sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.55, 0.65, 0.85, 1); bg.inputs[1].default_value = 0.9
# The game has no environment reflections at all — its sky lights, it does
# not mirror. Glossy rays see a dim sky so wet stone does not turn to chrome.
wt = w.node_tree; lp = wt.nodes.new("ShaderNodeLightPath"); dim = wt.nodes.new("ShaderNodeBackground"); dim.inputs[0].default_value = (0.2, 0.23, 0.3, 1); dim.inputs[1].default_value = 0.35
mixs = wt.nodes.new("ShaderNodeMixShader"); wout = wt.nodes.get("World Output")
wt.links.new(lp.outputs["Is Glossy Ray"], mixs.inputs[0]); wt.links.new(bg.outputs[0], mixs.inputs[1]); wt.links.new(dim.outputs[0], mixs.inputs[2]); wt.links.new(mixs.outputs[0], wout.inputs["Surface"])
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 28
pos = Vector((dist * 0.62, -dist * 0.62, dist * 0.42)); look = Vector((0, 0, 1.0))
cam.location = pos; cam.rotation_euler = (look - pos).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print(f"[worldrender] {out}")
