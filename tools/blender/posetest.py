# POSETEST — bend the rig and look: an elbow, a knee, the spine and the head,
# so the weights are judged in a render and not assumed.
#   Blender -b art/blender/warrior-<cls>.blend -P tools/blender/posetest.py -- out.png
import bpy, sys, math
argv = sys.argv[sys.argv.index("--") + 1:]; out = argv[0]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
def bend(name, x=0, y=0, z=0):
    pb = arm.pose.bones.get(name)
    if pb: pb.rotation_mode = 'XYZ'; pb.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
bend("RightElbow", x=-70); bend("RightUpperArm", x=-40, z=20); bend("LeftElbow", x=-35)
bend("RightKnee", x=45); bend("RightThigh", x=-30); bend("Spine", y=15, x=8); bend("Head", z=25, x=-10)
bpy.ops.object.mode_set(mode='OBJECT')
sys.argv = [sys.argv[0], "--", f"Warrior_{arm.name.split('_')[1]}", out, "50"]
exec(open(__file__.replace("posetest.py", "render.py")).read())
