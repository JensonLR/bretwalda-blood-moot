# CLIPRENDER — one frame of one clip, for judging.  Blender -b <blend> -P cliprender.py -- <clip> <frame> <out.png>
import bpy, sys
argv = sys.argv[sys.argv.index("--") + 1:]; name, frame, out = argv[0], int(argv[1]), argv[2]; lens = argv[3] if len(argv) > 3 else "85"
# The camera angle and how much of the man to frame, so a swing can be judged
# from where the arm is actually visible. 50 degrees hides the weapon arm
# behind the body on a mailed huscarl, which is no way to check a swing.
ang = argv[4] if len(argv) > 4 else "50"; frame_m = argv[5] if len(argv) > 5 else "0"
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
act = bpy.data.actions[name]; arm.animation_data.action = act
if hasattr(act, "slots") and len(act.slots): arm.animation_data.action_slot = act.slots[0]
for tr in arm.animation_data.nla_tracks: tr.mute = True
bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
sys.argv = [sys.argv[0], "--", arm.name, out, ang, lens, frame_m]
exec(open(__file__.replace("cliprender.py", "render.py")).read())
