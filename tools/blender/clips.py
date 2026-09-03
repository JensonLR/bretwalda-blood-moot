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
if arm.animation_data is None: arm.animation_data_create()
for tr in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(tr)
for act in list(bpy.data.actions): bpy.data.actions.remove(act)
R = math.radians

# WORLD-TERM POSES. A pose entry is (pitch, yaw, roll) in degrees about the
# man's own axes — pitch about his side axis (+ swings the bone's far end
# FORWARD, toward the face), yaw about up (+ turns to his left), roll about
# forward — and is converted into each bone's local frame at key time from
# its rest matrix. That way the clips read as motion, not as bone rolls,
# and the same numbers serve every class whatever roll rig.py gave a bone.
# A "loc" is metres in world axes (right, forward, up).
from mathutils import Vector, Quaternion, Matrix
FWD = Vector((0, -1, 0)); UP = Vector((0, 0, 1)); SIDE = FWD.cross(UP)   # the man's left
REST = {pb.name: (arm.matrix_world @ pb.bone.matrix_local).to_3x3() for pb in arm.pose.bones}
def local_quat(name, pitch, yaw, roll):
    M = REST[name]; Mi = M.inverted()
    q = Quaternion(Mi @ SIDE, R(pitch)) @ Quaternion(Mi @ UP, R(yaw)) @ Quaternion(Mi @ FWD, R(roll))
    return q
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'

def key(action, frame, pose):
    """pose: {bone: (pitch, yaw, roll) degrees, or {'rot':(p,y,r), 'loc':(right, forward, up)}}"""
    bpy.context.scene.frame_set(frame)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    for name, val in pose.items():
        pb = arm.pose.bones.get(name)
        if pb is None: continue
        rot = val["rot"] if isinstance(val, dict) else val
        pb.rotation_quaternion = local_quat(name, *rot)
        if isinstance(val, dict) and "loc" in val:
            r, f, u = val["loc"]; world = SIDE * -r + FWD * f + UP * u
            pb.location = REST[name].inverted() @ world
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame); pb.keyframe_insert("location", frame=frame)

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

# A stance every clip starts from: knees a touch soft, elbows carried, a
# forward lean. Angles are pitch/yaw/roll in the man's own axes.
S = {"RightThigh": (4, 0, 0), "LeftThigh": (4, 0, 0), "RightKnee": (-8, 0, 0), "LeftKnee": (-8, 0, 0),
     "RightUpperArm": (-8, 0, -6), "LeftUpperArm": (-8, 0, 6), "RightElbow": (35, 0, 0), "LeftElbow": (40, 0, 0), "Spine": (4, 0, 0)}
def m(*ds):
    out = dict(S)
    for d in ds: out.update(d)
    return out

# IDLE — a breath, the weight shifting a little.
clip("idle", 90, [(0, m()), (45, m({"Spine": (6, 2, 0), "Head": (0, -3, 0), "RightUpperArm": (-10, 0, -7), "LeftUpperArm": (-10, 0, 7)}))])
# WALK — 30 frames a cycle, legs opposed, arms counter, hips dipping.
def walkpose(t):
    a = math.sin(t * 2 * math.pi); b = -a
    return m({"RightThigh": (28 * a, 0, 0), "LeftThigh": (28 * b, 0, 0),
              "RightKnee": (-12 - 30 * max(0.0, -a), 0, 0), "LeftKnee": (-12 - 30 * max(0.0, -b), 0, 0),
              "RightUpperArm": (-8 - 16 * a, 0, -6), "LeftUpperArm": (-8 - 16 * b, 0, 6),
              "Spine": (6, 4 * a, 0), "Hips": {"rot": (0, 0, 3 * a), "loc": (0, 0, 0.012 * abs(math.sin(t * 4 * math.pi)))}, "Head": (0, -3 * a, 0)})
clip("walk", 30, [(int(t * 30), walkpose(t)) for t in (0, 0.25, 0.5, 0.75)])
def runpose(t):
    a = math.sin(t * 2 * math.pi); b = -a
    return m({"RightThigh": (44 * a, 0, 0), "LeftThigh": (44 * b, 0, 0),
              "RightKnee": (-18 - 50 * max(0.0, -a), 0, 0), "LeftKnee": (-18 - 50 * max(0.0, -b), 0, 0),
              "RightUpperArm": (-10 - 28 * a, 0, -8), "LeftUpperArm": (-10 - 28 * b, 0, 8), "RightElbow": (70, 0, 0), "LeftElbow": (70, 0, 0),
              "Spine": (14, 6 * a, 0), "Hips": {"rot": (0, 0, 4 * a), "loc": (0, 0, 0.03 * abs(math.sin(t * 4 * math.pi)))}})
clip("run", 22, [(int(t * 22), runpose(t)) for t in (0, 0.25, 0.5, 0.75)])
# ATTACK — the sword arm winds up over the shoulder (back and high), cuts
# down and across the body, recovers. 24 frames; contact at 11.
clip("attack", 24, [
    (0, m()),
    (6, m({"RightUpperArm": (-95, 0, -40), "RightElbow": (100, 0, 0), "RightWrist": (-20, 0, 0), "Spine": (-6, -22, 0), "Head": (0, 10, 0)})),
    (11, m({"RightUpperArm": (42, 0, 20), "RightElbow": (4, 0, 0), "RightWrist": (30, 0, 0), "Spine": (14, 24, 0), "RightThigh": (14, 0, 0), "LeftThigh": (-14, 0, 0), "Head": (0, -8, 0)})),
    (16, m({"RightUpperArm": (22, 0, 14), "RightElbow": (25, 0, 0), "Spine": (10, 16, 0)})),
], loop=False)
# HEAVY — both hands, a bigger wind over the head, a slower fall. 36 frames; contact at 19.
clip("heavy", 36, [
    (0, m()),
    (12, m({"RightUpperArm": (-120, 0, -25), "LeftUpperArm": (-110, 0, 25), "RightElbow": (95, 0, 0), "LeftElbow": (85, 0, 0), "Spine": (-14, -20, 0), "RightKnee": (-20, 0, 0), "LeftKnee": (-20, 0, 0), "Head": (-10, 0, 0)})),
    (19, m({"RightUpperArm": (55, 0, 5), "LeftUpperArm": (48, 0, -5), "RightElbow": (6, 0, 0), "LeftElbow": (6, 0, 0), "Spine": (26, 22, 0), "RightThigh": (20, 0, 0), "LeftThigh": (-20, 0, 0), "RightKnee": (-30, 0, 0), "Head": (8, 0, 0)})),
    (28, m({"RightUpperArm": (40, 0, 10), "LeftUpperArm": (35, 0, -5), "RightElbow": (30, 0, 0), "LeftElbow": (30, 0, 0), "Spine": (12, 12, 0)})),
], loop=False)
# BLOCK — the shield arm up and across the chest, a brace. Looping 20 frames.
clip("block", 20, [(0, m({"LeftUpperArm": (40, 0, 45), "LeftElbow": (95, 0, 0), "LeftWrist": (0, 30, 0), "RightUpperArm": (-20, 0, -20), "RightElbow": (60, 0, 0), "Spine": (10, -10, 0), "RightKnee": (-18, 0, 0), "LeftKnee": (-18, 0, 0), "Head": (8, 0, 0)})),
                   (10, m({"LeftUpperArm": (43, 0, 47), "LeftElbow": (97, 0, 0), "LeftWrist": (0, 30, 0), "RightUpperArm": (-22, 0, -20), "RightElbow": (60, 0, 0), "Spine": (12, -10, 0), "RightKnee": (-20, 0, 0), "LeftKnee": (-20, 0, 0), "Head": (8, 0, 0)}))])
# DODGE — a crouch and a sidestep, 16 frames.
clip("dodge", 16, [
    (0, m()),
    (6, m({"Spine": (26, 0, 12), "RightThigh": (30, 0, 0), "LeftThigh": (-10, 0, 0), "RightKnee": (-60, 0, 0), "LeftKnee": (-30, 0, 0), "Hips": {"rot": (0, 0, 8), "loc": (0, 0, -0.18)}, "RightUpperArm": (-30, 0, -30), "LeftUpperArm": (-30, 0, 30)})),
    (12, m({"Spine": (10, 0, 4), "Hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.05)}})),
], loop=False)
# HIT — a flinch back and to the side, 14 frames.
clip("hit", 14, [(0, m()), (4, m({"Spine": (-16, 8, -10), "Head": (-14, 0, 6), "RightUpperArm": (10, 0, -20), "LeftUpperArm": (10, 0, 20), "Hips": {"rot": (0, 0, -4), "loc": (0, -0.06, -0.03)}})), (12, m())], loop=False)
# DIE — the knees go, then the body pitches forward and lies. 40 frames.
clip("die", 40, [
    (0, m()),
    (10, m({"RightKnee": (-70, 0, 0), "LeftKnee": (-70, 0, 0), "RightThigh": (30, 0, 0), "LeftThigh": (30, 0, 0), "Spine": (20, 0, 0), "Hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.35)}, "RightUpperArm": (20, 0, -30), "LeftUpperArm": (20, 0, 30)})),
    # The fall. The Hips bone's head is the body's origin — the FEET, not the
    # waist (measured: Hips at z=0, Spine at 1.17) — so a pitch there swings
    # the whole man about his ankles: a plank fall, and no drop wanted. The
    # knees give first, then he goes over, arms out, and lies along the ground.
    (24, m({"RightKnee": (-45, 0, 0), "LeftKnee": (-35, 0, 0), "RightThigh": (12, 0, 0), "LeftThigh": (8, 0, 0), "Spine": (14, 0, 0), "Head": (-16, 0, 0), "Hips": {"rot": (48, 0, 3), "loc": (0, 0, -0.06)}, "RightUpperArm": (-45, 0, -40), "LeftUpperArm": (-45, 0, 40), "RightElbow": (50, 0, 0), "LeftElbow": (50, 0, 0)})),
    (40, m({"RightKnee": (-12, 0, 0), "LeftKnee": (-6, 0, 0), "RightThigh": (4, 0, 0), "LeftThigh": (0, 0, 0), "Spine": (2, 0, 0), "Head": (-22, 0, 14), "Hips": {"rot": (88, 0, 6), "loc": (0, 0, -0.02)}, "RightUpperArm": (-62, 0, -50), "LeftUpperArm": (-58, 0, 48), "RightElbow": (55, 0, 0), "LeftElbow": (55, 0, 0)})),
], loop=False)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, f"warrior-{CLS}.blend"))
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
for o in arm.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"warrior-{CLS}.glb"), use_selection=True, export_format='GLB', export_apply=False, export_skins=True, export_def_bones=False, export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=True, export_frame_range=False)
print(f"[clips.py] {CLS}: {len(bpy.data.actions)} clips -> warrior-{CLS}.glb")
