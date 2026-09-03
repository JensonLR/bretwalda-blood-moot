# CLIPRENDER — one frame of one clip, for judging.  Blender -b <blend> -P cliprender.py -- <clip> <frame> <out.png>
import bpy, sys
argv = sys.argv[sys.argv.index("--") + 1:]; name, frame, out = argv[0], int(argv[1]), argv[2]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
act = bpy.data.actions[name]; arm.animation_data.action = act
if hasattr(act, "slots") and len(act.slots): arm.animation_data.action_slot = act.slots[0]
for tr in arm.animation_data.nla_tracks: tr.mute = True
bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
sys.argv = [sys.argv[0], "--", arm.name, out, "50"]
exec(open(__file__.replace("cliprender.py", "render.py")).read())
