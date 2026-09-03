# CLIPS.PY — the fight's motion, authored on the armature: idle, walk, run,
# attack, heavy, block, dodge, hit, die. Keyed in pose space on the bones
# rig.py built (limb bones point down the limb, local Z toward the face:
# +X swings a limb forward, an elbow bends on +X, a knee on -X; Hips and
# Spine point up, +X leans forward, Y twists). Exported as glTF animations
# so Unity plays them by name.
#   Blender -b art/blender/warrior-<cls>.blend -P tools/blender/clips.py -- <cls>
import bpy, os, sys, math
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CLS = argv[0] if argv else "huscarl"
D = os.path.join(os.path.expanduser("~/bretwalda-blood-moot"), "art", "blender")
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE')
FPS = 30; bpy.context.scene.render.fps = FPS
for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
if arm.animation_data is None: arm.animation_data_create()
R = math.radians

def key(action, frame, pose):
    """pose: {bone: (x, y, z) degrees, or {'rot':(x,y,z), 'loc':(x,y,z)}}"""
    bpy.context.scene.frame_set(frame)
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    for name, val in pose.items():
        pb = arm.pose.bones.get(name)
        if pb is None: continue
        rot = val["rot"] if isinstance(val, dict) else val
        pb.rotation_euler = (R(rot[0]), R(rot[1]), R(rot[2]))
        if isinstance(val, dict) and "loc" in val: pb.location = val["loc"]
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_euler", frame=frame); pb.keyframe_insert("location", frame=frame)

def fcurves_of(act):
    """Blender 5's layered actions keep F-curves in channel bags; 4.x on the action."""
    if hasattr(act, "fcurves"): return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags: out.extend(cb.fcurves)
    return out

def clip(name, frames, poses, loop=True):
    act = bpy.data.actions.new(name); arm.animation_data.action = act
    if hasattr(act, "slots"):
        slot = act.slots.new('OBJECT', arm.name) if len(act.slots) == 0 else act.slots[0]
        arm.animation_data.action_slot = slot
    for f, pose in poses: key(act, f, pose)
    if loop: key(act, frames, poses[0][1])
    act.frame_range = (0, frames)
    for fc in fcurves_of(act):
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
        if loop: fc.modifiers.new('CYCLES')
    # stash so every action exports (glTF exporter takes NLA tracks / all actions)
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 0, act); st.mute = True
    return act

# A stance every clip starts from: knees a touch soft, elbows carried.
S = {"RightThigh": (-4, 0, 0), "LeftThigh": (-4, 0, 0), "RightKnee": (-8, 0, 0), "LeftKnee": (-8, 0, 0),
     "RightUpperArm": (10, 0, -8), "LeftUpperArm": (10, 0, 8), "RightElbow": (35, 0, 0), "LeftElbow": (40, 0, 0), "Spine": (4, 0, 0)}
def m(*ds):
    out = dict(S)
    for d in ds: out.update(d)
    return out

# IDLE — a breath, the weight shifting a little.
clip("idle", 90, [(0, m()), (45, m({"Spine": (6, 2, 0), "Head": (0, -3, 0), "RightUpperArm": (12, 0, -9), "LeftUpperArm": (12, 0, 9)}))])
# WALK — 30 frames a cycle, legs opposed, arms counter, hips dipping.
def walkpose(t):
    a = math.sin(t * 2 * math.pi); b = math.sin(t * 2 * math.pi + math.pi)
    return m({"RightThigh": (28 * a, 0, 0), "LeftThigh": (28 * b, 0, 0),
              "RightKnee": (-12 - 26 * max(0.0, -a), 0, 0), "LeftKnee": (-12 - 26 * max(0.0, -b), 0, 0),
              "RightUpperArm": (10 - 14 * a, 0, -8), "LeftUpperArm": (10 - 14 * b, 0, 8),
              "Spine": (6, 4 * a, 0), "Hips": {"rot": (0, 0, 3 * a), "loc": (0, 0.012 * abs(math.sin(t * 4 * math.pi)), 0)}, "Head": (0, -3 * a, 0)})
clip("walk", 30, [(int(t * 30), walkpose(t)) for t in (0, 0.25, 0.5, 0.75)])
def runpose(t):
    a = math.sin(t * 2 * math.pi); b = -a
    return m({"RightThigh": (42 * a, 0, 0), "LeftThigh": (42 * b, 0, 0),
              "RightKnee": (-18 - 45 * max(0.0, -a), 0, 0), "LeftKnee": (-18 - 45 * max(0.0, -b), 0, 0),
              "RightUpperArm": (14 - 26 * a, 0, -10), "LeftUpperArm": (14 - 26 * b, 0, 10), "RightElbow": (70, 0, 0), "LeftElbow": (70, 0, 0),
              "Spine": (14, 6 * a, 0), "Hips": {"rot": (0, 0, 4 * a), "loc": (0, 0.03 * abs(math.sin(t * 4 * math.pi)), 0)}})
clip("run", 22, [(int(t * 22), runpose(t)) for t in (0, 0.25, 0.5, 0.75)])
# ATTACK — wind up over the shoulder, cut down and across, recover. 24 frames.
clip("attack", 24, [
    (0, m()),
    (6, m({"RightUpperArm": (-70, 0, -35), "RightElbow": (95, 0, 0), "Spine": (-6, -18, 0), "RightWrist": (-20, 0, 0)})),
    (11, m({"RightUpperArm": (55, 0, 10), "RightElbow": (15, 0, 0), "Spine": (14, 22, 0), "RightWrist": (25, 0, 0), "RightThigh": (12, 0, 0), "LeftThigh": (-16, 0, 0)})),
    (16, m({"RightUpperArm": (40, 0, 20), "RightElbow": (30, 0, 0), "Spine": (10, 16, 0)})),
], loop=False)
# HEAVY — a bigger wind, both hands, slower. 36 frames.
clip("heavy", 36, [
    (0, m()),
    (12, m({"RightUpperArm": (-95, 0, -20), "LeftUpperArm": (-80, 0, 20), "RightElbow": (90, 0, 0), "LeftElbow": (80, 0, 0), "Spine": (-12, -24, 0), "RightKnee": (-20, 0, 0), "LeftKnee": (-20, 0, 0)})),
    (19, m({"RightUpperArm": (70, 0, 5), "LeftUpperArm": (60, 0, -5), "RightElbow": (10, 0, 0), "LeftElbow": (10, 0, 0), "Spine": (24, 26, 0), "RightThigh": (18, 0, 0), "LeftThigh": (-20, 0, 0), "RightKnee": (-30, 0, 0)})),
    (28, m({"RightUpperArm": (45, 0, 10), "LeftUpperArm": (40, 0, -5), "RightElbow": (30, 0, 0), "LeftElbow": (30, 0, 0), "Spine": (12, 12, 0)})),
], loop=False)
# BLOCK — the shield arm up and across, a brace. Held (looping) 20 frames.
clip("block", 20, [(0, m({"LeftUpperArm": (45, 0, 40), "LeftElbow": (95, 0, 0), "LeftWrist": (0, 30, 0), "RightUpperArm": (20, 0, -20), "RightElbow": (60, 0, 0), "Spine": (10, -10, 0), "RightKnee": (-18, 0, 0), "LeftKnee": (-18, 0, 0), "Head": (8, 0, 0)})),
                   (10, m({"LeftUpperArm": (48, 0, 42), "LeftElbow": (97, 0, 0), "LeftWrist": (0, 30, 0), "RightUpperArm": (22, 0, -20), "RightElbow": (60, 0, 0), "Spine": (12, -10, 0), "RightKnee": (-20, 0, 0), "LeftKnee": (-20, 0, 0), "Head": (8, 0, 0)}))])
# DODGE — a crouch and a sidestep, 16 frames.
clip("dodge", 16, [
    (0, m()),
    (6, m({"Spine": (26, 0, 12), "RightThigh": (30, 0, 0), "LeftThigh": (-10, 0, 0), "RightKnee": (-60, 0, 0), "LeftKnee": (-30, 0, 0), "Hips": {"rot": (0, 0, 8), "loc": (0, -0.18, 0)}, "RightUpperArm": (30, 0, -30), "LeftUpperArm": (30, 0, 30)})),
    (12, m({"Spine": (10, 0, 4), "Hips": {"rot": (0, 0, 0), "loc": (0, -0.05, 0)}})),
], loop=False)
# HIT — a flinch back and to the side, 14 frames.
clip("hit", 14, [(0, m()), (4, m({"Spine": (-16, 8, -10), "Head": (-14, 0, 6), "RightUpperArm": (-10, 0, -20), "LeftUpperArm": (-10, 0, 20), "Hips": {"rot": (0, 0, -4), "loc": (0, -0.03, -0.06)}})), (12, m())], loop=False)
# DIE — the knees go, then the body, face down. 40 frames.
clip("die", 40, [
    (0, m()),
    (10, m({"RightKnee": (-70, 0, 0), "LeftKnee": (-70, 0, 0), "RightThigh": (30, 0, 0), "LeftThigh": (30, 0, 0), "Spine": (20, 0, 0), "Hips": {"rot": (0, 0, 0), "loc": (0, -0.35, 0)}, "RightUpperArm": (-20, 0, -30), "LeftUpperArm": (-20, 0, 30)})),
    (24, m({"RightKnee": (-120, 0, 0), "LeftKnee": (-115, 0, 0), "RightThigh": (70, 0, 0), "LeftThigh": (65, 0, 0), "Spine": (60, 0, 0), "Head": (-30, 0, 0), "Hips": {"rot": (55, 0, 0), "loc": (0, -0.75, 0.15)}, "RightUpperArm": (60, 0, -40), "LeftUpperArm": (60, 0, 40), "RightElbow": (60, 0, 0), "LeftElbow": (60, 0, 0)})),
    (40, m({"RightKnee": (-120, 0, 0), "LeftKnee": (-115, 0, 0), "RightThigh": (75, 0, 0), "LeftThigh": (70, 0, 0), "Spine": (62, 0, 0), "Head": (-34, 0, 4), "Hips": {"rot": (60, 0, 0), "loc": (0, -0.8, 0.2)}, "RightUpperArm": (66, 0, -44), "LeftUpperArm": (64, 0, 44), "RightElbow": (62, 0, 0), "LeftElbow": (62, 0, 0)})),
], loop=False)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, f"warrior-{CLS}.blend"))
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
for o in arm.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"warrior-{CLS}.glb"), use_selection=True, export_format='GLB', export_apply=False, export_skins=True, export_def_bones=False, export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=True, export_frame_range=False)
print(f"[clips.py] {CLS}: {len(bpy.data.actions)} clips -> warrior-{CLS}.glb")
