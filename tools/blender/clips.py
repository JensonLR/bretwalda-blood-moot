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
# "Pitch forward" means the bone's FAR END goes forward. A world rotation
# about the side axis does that for a bone pointing down (a limb) and the
# opposite for one pointing up (Hips, Spine), so the sign follows the
# bone's rest direction. Measured the hard way: the first death fell on
# its back and the heavy blow leaned away from the target.
UPWARD = {n: (REST[n] @ Vector((0, 1, 0))).z > 0 for n in REST}
def local_quat(name, pitch, yaw, roll):
    M = REST[name]; Mi = M.inverted()
    p = -pitch if UPWARD[name] else pitch
    q = Quaternion(Mi @ SIDE, R(p)) @ Quaternion(Mi @ UP, R(yaw)) @ Quaternion(Mi @ FWD, R(roll))
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
        # A dict may carry "loc" alone: a hip that drops without turning is a
        # real pose, and demanding a rotation nobody wanted is the helper
        # inventing a requirement. Absent means identity.
        rot = (val.get("rot", (0, 0, 0)) if isinstance(val, dict) else val)
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
DRAPES = [pb.name for pb in arm.pose.bones if pb.name.startswith("Drape")]
def drape(lift, sway=0.0, ripple=0.0):
    """The cloak's drape chain: every ring pitched back by `lift` (a run lifts
    the hem), swung sideways by `sway`, with a ripple down the rings."""
    out = {}
    for i, n in enumerate(DRAPES):
        ring = (int("".join(ch for ch in n if ch.isdigit()) or 1) - 1) % 4
        out[n] = (-lift * (0.6 + 0.4 * ring / 3) + ripple * math.sin(ring * 1.7), sway, 0)
    return out
def m(*ds):
    out = dict(S)
    for d in ds: out.update(d)
    return out

# IDLE — a breath, the weight shifting a little.
clip("idle", 90, [(0, m(drape(2, 0, 1))), (45, m({"Spine": (6, 2, 0), "Head": (0, -3, 0), "RightUpperArm": (-10, 0, -7), "LeftUpperArm": (-10, 0, 7)}, drape(3, 1.5, -1)))])
# WALK — 30 frames a cycle, legs opposed, arms counter, hips dipping.
def walkpose(t):
    a = math.sin(t * 2 * math.pi); b = -a
    return m({"RightThigh": (28 * a, 0, 0), "LeftThigh": (28 * b, 0, 0),
              "RightKnee": (-12 - 30 * max(0.0, -a), 0, 0), "LeftKnee": (-12 - 30 * max(0.0, -b), 0, 0),
              "RightUpperArm": (-8 - 16 * a, 0, -6), "LeftUpperArm": (-8 - 16 * b, 0, 6),
              "Spine": (6, 4 * a, 0), "Hips": {"rot": (0, 0, 3 * a), "loc": (0, 0, 0.012 * abs(math.sin(t * 4 * math.pi)))}, "Head": (0, -3 * a, 0)}, drape(10, 3 * a, 3 * math.sin(t * 4 * math.pi)))
clip("walk", 30, [(int(t * 30), walkpose(t)) for t in (0, 0.25, 0.5, 0.75)])
def runpose(t):
    a = math.sin(t * 2 * math.pi); b = -a
    return m({"RightThigh": (44 * a, 0, 0), "LeftThigh": (44 * b, 0, 0),
              "RightKnee": (-18 - 50 * max(0.0, -a), 0, 0), "LeftKnee": (-18 - 50 * max(0.0, -b), 0, 0),
              "RightUpperArm": (-10 - 28 * a, 0, -8), "LeftUpperArm": (-10 - 28 * b, 0, 8), "RightElbow": (70, 0, 0), "LeftElbow": (70, 0, 0),
              "Spine": (14, 6 * a, 0), "Hips": {"rot": (0, 0, 4 * a), "loc": (0, 0, 0.03 * abs(math.sin(t * 4 * math.pi)))}}, drape(26, 4 * a, 5 * math.sin(t * 4 * math.pi)))
clip("run", 22, [(int(t * 22), runpose(t)) for t in (0, 0.25, 0.5, 0.75)])
# ATTACK and HEAVY — rewritten, because four keyframes is a diagram of a swing
# and not a swing. The owner: "attack animations feel clunky & basic barely any
# depth to them." They were four poses with linear-ish travel between them, and
# the last key sat at frame 16 of 24 — a THIRD of every blow spent holding
# perfectly still while the engine was still counting recovery.
#
# What is here now, in the order a real blow does it:
#   ANTICIPATION   before a stroke goes anywhere it goes the other way. Weight
#                  settles back, the hips turn a few degrees AWAY from the cut.
#                  Its absence is the single loudest thing that reads as basic.
#   THE COIL       arm back and high, trunk wound off it, weight on the back leg,
#                  head already looking where the blow will land.
#   HIPS FIRST     the trunk comes round while the arm is STILL BEHIND, dragged
#                  after it. A swing driven from the shoulder is a slap; one
#                  driven from the ground is a blow, and this overlap is the only
#                  thing that shows a viewer which he is watching.
#   CONTACT        the frame the engine lands the blow on, and nowhere else.
#   FOLLOW-THROUGH a blow does not stop at the man it hits. The arm carries past
#                  and the trunk over-rotates with it.
#   SETTLE         back PAST neutral and then to it. Nothing alive returns to
#                  where it started in a straight line.
#
# The cloak is keyed through all of it. It was not before, so every stroke
# snapped the drape to rest and held it there.
#
# FRAME COUNTS AND CONTACT FRAMES ARE A CONTRACT: tools/cliptime.mjs checks that
# the frame ClipDriver calls contact is a real key in the clip Blender builds,
# and that the clip's length is what the driver thinks. 24/11 and 36/19.
clip("attack", 24, [
    (0, m(drape(4))),
    # ANTICIPATION — the hand has barely moved; the weight has.
    (3, m({"RightUpperArm": (-24, 0, -10), "RightElbow": (48, 0, 0),
           "Spine": (1, -8, 0), "Hips": {"rot": (0, -5, 0), "loc": (0, 0, -0.018)},
           "RightThigh": (10, 0, 0), "RightKnee": (-18, 0, 0), "Head": (0, 5, 0)}, drape(2, -3))),
    # THE COIL.
    (7, m({"RightUpperArm": (-98, 0, -38), "RightElbow": (104, 0, 0), "RightWrist": (-24, 0, 0),
           "LeftUpperArm": (-14, 0, 18), "LeftElbow": (54, 0, 0),
           "Spine": (-8, -26, 0), "Hips": {"rot": (0, -14, 0), "loc": (0, -0.02, -0.012)},
           "RightThigh": (14, 0, 0), "RightKnee": (-26, 0, 0), "LeftThigh": (-6, 0, 0),
           "Head": (0, 13, 0)}, drape(1, -9))),
    # HIPS FIRST — the arm is still behind the trunk here, on purpose.
    (9, m({"RightUpperArm": (-62, 0, -22), "RightElbow": (76, 0, 0), "RightWrist": (-10, 0, 0),
           "LeftUpperArm": (-10, 0, 14), "LeftElbow": (46, 0, 0),
           "Spine": (2, -2, 0), "Hips": {"rot": (0, 6, 0), "loc": (0, 0.012, -0.006)},
           "RightThigh": (2, 0, 0), "LeftThigh": (10, 0, 0), "LeftKnee": (-16, 0, 0),
           "Head": (0, 6, 0)}, drape(6, 4))),
    # CONTACT.
    (11, m({"RightUpperArm": (68, 0, 20), "RightElbow": (4, 0, 0), "RightWrist": (32, 0, 0),
            "LeftUpperArm": (-2, 0, 10), "LeftElbow": (30, 0, 0),
            "Spine": (16, 26, 0), "Hips": {"rot": (0, 18, 0), "loc": (0, 0.05, -0.014)},
            "RightThigh": (16, 0, 0), "LeftThigh": (-16, 0, 0), "LeftKnee": (-26, 0, 0),
            "Head": (0, -10, 0)}, drape(12, 11))),
    # FOLLOW-THROUGH.
    (14, m({"RightUpperArm": (46, 0, 34), "RightElbow": (26, 0, 0), "RightWrist": (18, 0, 0),
            "LeftUpperArm": (4, 0, 6), "LeftElbow": (38, 0, 0),
            "Spine": (18, 34, 0), "Hips": {"rot": (0, 24, 0), "loc": (0, 0.03, -0.022)},
            "RightThigh": (10, 0, 0), "LeftThigh": (-10, 0, 0), "LeftKnee": (-34, 0, 0),
            "Head": (0, -14, 0)}, drape(9, 15))),
    # SETTLE, past neutral.
    (19, m({"RightUpperArm": (-2, 0, -2), "RightElbow": (44, 0, 0),
            "Spine": (5, 6, 0), "Hips": {"rot": (0, 3, 0), "loc": (0, 0, -0.004)},
            "Head": (0, -3, 0)}, drape(5, 3))),
    (23, m(drape(4))),
], loop=False)
# THE OTHER THREE CUTS. The engine has always resolved FOUR — SWING_HEIGHT in
# engine.mjs gives overhead 0.88, left and right 0.70, stab 0.66, and each bites
# at its own height with its own geometry — and this client threw one of them and
# drew one of them. The owner: "no variation in them either, looks unnatural
# completely." It was not a want of polish; it was three quarters of the game's
# swordplay missing from the picture.
#
# All four share 24 frames and contact at 11, so ClipDriver's timing contract and
# tools/cliptime.mjs hold for every one of them without a special case. What
# differs is the LINE the blade travels, which is the whole point.
#
# LEFT — the backhand. He crosses his own body to wind, and the cut comes back
# across from his left to his right: the exact opposite line to the forehand, so
# two blows in a row never look like one blow twice.
clip("attackLeft", 24, [
    (0, m(drape(4))),
    (3, m({"RightUpperArm": (-18, 0, 22), "RightElbow": (62, 0, 0),
           "Spine": (2, 9, 0), "Hips": {"rot": (0, 6, 0), "loc": (0, 0, -0.016)},
           "LeftThigh": (10, 0, 0), "LeftKnee": (-18, 0, 0), "Head": (0, -5, 0)}, drape(2, 4))),
    (7, m({"RightUpperArm": (-74, 0, 74), "RightElbow": (96, 0, 0), "RightWrist": (-18, 0, 0),
           "LeftUpperArm": (-20, 0, -8), "LeftElbow": (58, 0, 0),
           "Spine": (-6, 28, 0), "Hips": {"rot": (0, 15, 0), "loc": (0, -0.018, -0.012)},
           "LeftThigh": (14, 0, 0), "LeftKnee": (-26, 0, 0), "RightThigh": (-6, 0, 0),
           "Head": (0, -13, 0)}, drape(1, 9))),
    (9, m({"RightUpperArm": (-46, 0, 44), "RightElbow": (72, 0, 0),
           "Spine": (2, 6, 0), "Hips": {"rot": (0, -5, 0), "loc": (0, 0.012, -0.006)},
           "RightThigh": (10, 0, 0), "RightKnee": (-16, 0, 0), "Head": (0, -6, 0)}, drape(6, -4))),
    (11, m({"RightUpperArm": (62, 0, -26), "RightElbow": (8, 0, 0), "RightWrist": (26, 0, 0),
            "LeftUpperArm": (-4, 0, -12), "LeftElbow": (32, 0, 0),
            "Spine": (14, -24, 0), "Hips": {"rot": (0, -17, 0), "loc": (0, 0.048, -0.012)},
            "LeftThigh": (16, 0, 0), "RightThigh": (-16, 0, 0), "RightKnee": (-26, 0, 0),
            "Head": (0, 10, 0)}, drape(12, -11))),
    (14, m({"RightUpperArm": (42, 0, -40), "RightElbow": (28, 0, 0),
            "Spine": (16, -32, 0), "Hips": {"rot": (0, -23, 0), "loc": (0, 0.028, -0.02)},
            "RightThigh": (-10, 0, 0), "RightKnee": (-34, 0, 0), "Head": (0, 14, 0)}, drape(9, -15))),
    (19, m({"RightUpperArm": (-2, 0, 2), "RightElbow": (44, 0, 0),
            "Spine": (5, -6, 0), "Hips": {"rot": (0, -3, 0)}, "Head": (0, 3, 0)}, drape(5, -3))),
    (23, m(drape(4))),
], loop=False)
# OVERHEAD — straight up and straight down, and almost no yaw in it at all. The
# reach comes from the spine folding forward over the blow rather than from the
# trunk turning, which is what makes it read as a different weapon of a blow
# from either of the horizontals.
clip("attackOverhead", 24, [
    (0, m(drape(4))),
    (3, m({"RightUpperArm": (-34, 0, -8), "RightElbow": (56, 0, 0),
           "Spine": (-4, 0, 0), "Hips": {"rot": (0, 0, 0), "loc": (0, -0.01, -0.022)},
           "RightKnee": (-20, 0, 0), "LeftKnee": (-20, 0, 0), "Head": (-6, 0, 0)}, drape(2))),
    (7, m({"RightUpperArm": (-142, 0, -14), "RightElbow": (86, 0, 0), "RightWrist": (-26, 0, 0),
           "LeftUpperArm": (-26, 0, 10), "LeftElbow": (56, 0, 0),
           "Spine": (-22, -6, 0), "Hips": {"rot": (0, -4, 0), "loc": (0, -0.03, -0.014)},
           "RightThigh": (12, 0, 0), "RightKnee": (-24, 0, 0), "Head": (-14, 2, 0)}, drape(0, -3))),
    (9, m({"RightUpperArm": (-96, 0, -8), "RightElbow": (68, 0, 0),
           "Spine": (-2, -2, 0), "Hips": {"rot": (0, 0, 0), "loc": (0, 0.014, -0.02)},
           "LeftThigh": (10, 0, 0), "LeftKnee": (-18, 0, 0), "Head": (-4, 0, 0)}, drape(5))),
    (11, m({"RightUpperArm": (96, 0, 4), "RightElbow": (4, 0, 0), "RightWrist": (30, 0, 0),
            "LeftUpperArm": (10, 0, -6), "LeftElbow": (26, 0, 0),
            "Spine": (30, 4, 0), "Hips": {"rot": (0, 2, 0), "loc": (0, 0.045, -0.04)},
            "RightThigh": (20, 0, 0), "LeftThigh": (-16, 0, 0), "RightKnee": (-34, 0, 0),
            "Head": (14, -2, 0)}, drape(14, 2))),
    (14, m({"RightUpperArm": (78, 0, 10), "RightElbow": (26, 0, 0),
            "Spine": (34, 6, 0), "Hips": {"rot": (0, 3, 0), "loc": (0, 0.026, -0.055)},
            "RightKnee": (-42, 0, 0), "LeftKnee": (-38, 0, 0), "Head": (16, -3, 0)}, drape(11, 3))),
    (19, m({"RightUpperArm": (-4, 0, -3), "RightElbow": (46, 0, 0),
            "Spine": (8, 1, 0), "Hips": {"loc": (0, 0, -0.014)},
            "RightKnee": (-16, 0, 0), "LeftKnee": (-16, 0, 0), "Head": (3, 0, 0)}, drape(5))),
    (23, m(drape(4))),
], loop=False)
# STAB — the point, not the edge. The hand draws back to the hip and goes
# STRAIGHT, and the distance is bought with the legs: a long step and the hips
# driving through, which is why its reach is the lowest of the four and its
# recovery the most exposed.
clip("attackStab", 24, [
    (0, m(drape(4))),
    (3, m({"RightUpperArm": (-16, 0, -14), "RightElbow": (72, 0, 0), "RightWrist": (-10, 0, 0),
           "Spine": (0, -10, 0), "Hips": {"rot": (0, -7, 0), "loc": (0, -0.02, -0.012)},
           "RightThigh": (12, 0, 0), "RightKnee": (-22, 0, 0), "Head": (0, 5, 0)}, drape(2, -3))),
    (7, m({"RightUpperArm": (-24, 0, -20), "RightElbow": (108, 0, 0), "RightWrist": (-16, 0, 0),
           "LeftUpperArm": (-16, 0, 14), "LeftElbow": (66, 0, 0),
           "Spine": (-6, -18, 0), "Hips": {"rot": (0, -12, 0), "loc": (0, -0.035, -0.01)},
           "RightThigh": (16, 0, 0), "RightKnee": (-28, 0, 0), "LeftThigh": (-8, 0, 0),
           "Head": (0, 9, 0)}, drape(1, -6))),
    (9, m({"RightUpperArm": (-6, 0, -12), "RightElbow": (72, 0, 0),
           "Spine": (6, -6, 0), "Hips": {"rot": (0, -3, 0), "loc": (0, 0.02, -0.01)},
           "LeftThigh": (16, 0, 0), "LeftKnee": (-24, 0, 0), "Head": (0, 3, 0)}, drape(6, -2))),
    (11, m({"RightUpperArm": (48, 0, -4), "RightElbow": (2, 0, 0), "RightWrist": (6, 0, 0),
            "LeftUpperArm": (-16, 0, 20), "LeftElbow": (48, 0, 0),
            "Spine": (20, 6, 0), "Hips": {"rot": (0, 5, 0), "loc": (0, 0.085, -0.03)},
            "LeftThigh": (34, 0, 0), "LeftKnee": (-30, 0, 0), "RightThigh": (-26, 0, 0), "RightKnee": (-10, 0, 0),
            "Head": (2, -4, 0)}, drape(15, 3))),
    (14, m({"RightUpperArm": (52, 0, -2), "RightElbow": (6, 0, 0),
            "Spine": (22, 8, 0), "Hips": {"rot": (0, 6, 0), "loc": (0, 0.075, -0.038)},
            "LeftThigh": (30, 0, 0), "LeftKnee": (-34, 0, 0), "RightThigh": (-24, 0, 0),
            "Head": (3, -5, 0)}, drape(13, 4))),
    (19, m({"RightUpperArm": (-6, 0, -6), "RightElbow": (48, 0, 0),
            "Spine": (6, 2, 0), "Hips": {"loc": (0, 0.01, -0.008)},
            "LeftThigh": (8, 0, 0), "Head": (0, -2, 0)}, drape(5, 1))),
    (23, m(drape(4))),
], loop=False)
clip("heavy", 36, [
    (0, m(drape(4))),
    # ANTICIPATION — both hands settle, the knees take the weight.
    (4, m({"RightUpperArm": (-26, 0, -12), "LeftUpperArm": (-24, 0, 12),
           "RightElbow": (58, 0, 0), "LeftElbow": (60, 0, 0),
           "Spine": (2, -6, 0), "Hips": {"rot": (0, -4, 0), "loc": (0, -0.01, -0.03)},
           "RightKnee": (-24, 0, 0), "LeftKnee": (-24, 0, 0), "Head": (-4, 3, 0)}, drape(2, -3))),
    # THE COIL — over the head, back arched, and it is HELD, which is what makes
    # a heavy readable at range and worth its damage.
    (12, m({"RightUpperArm": (-124, 0, -24), "LeftUpperArm": (-116, 0, 24),
            "RightElbow": (98, 0, 0), "LeftElbow": (90, 0, 0), "RightWrist": (-18, 0, 0),
            "Spine": (-16, -22, 0), "Hips": {"rot": (0, -12, 0), "loc": (0, -0.03, -0.018)},
            "RightThigh": (16, 0, 0), "RightKnee": (-26, 0, 0), "LeftThigh": (-8, 0, 0), "LeftKnee": (-22, 0, 0),
            "Head": (-12, 10, 0)}, drape(0, -10))),
    # HIPS FIRST — the trunk drops and turns; the arms have not caught up.
    (16, m({"RightUpperArm": (-70, 0, -12), "LeftUpperArm": (-64, 0, 12),
            "RightElbow": (72, 0, 0), "LeftElbow": (68, 0, 0),
            "Spine": (6, -2, 0), "Hips": {"rot": (0, 4, 0), "loc": (0, 0.02, -0.03)},
            "RightThigh": (6, 0, 0), "LeftThigh": (8, 0, 0), "LeftKnee": (-26, 0, 0),
            "Head": (-2, 4, 0)}, drape(4, 3))),
    # CONTACT.
    (19, m({"RightUpperArm": (94, 0, 6), "LeftUpperArm": (86, 0, -6),
            "RightElbow": (6, 0, 0), "LeftElbow": (6, 0, 0), "RightWrist": (26, 0, 0),
            "Spine": (28, 22, 0), "Hips": {"rot": (0, 14, 0), "loc": (0, 0.06, -0.05)},
            "RightThigh": (22, 0, 0), "LeftThigh": (-20, 0, 0), "RightKnee": (-34, 0, 0), "LeftKnee": (-30, 0, 0),
            "Head": (10, -8, 0)}, drape(14, 9))),
    # FOLLOW-THROUGH — a two-handed blow buries itself; the man ends up low.
    (24, m({"RightUpperArm": (74, 0, 18), "LeftUpperArm": (68, 0, -14),
            "RightElbow": (30, 0, 0), "LeftElbow": (32, 0, 0),
            "Spine": (32, 28, 0), "Hips": {"rot": (0, 20, 0), "loc": (0, 0.03, -0.07)},
            "RightThigh": (14, 0, 0), "LeftThigh": (-12, 0, 0), "RightKnee": (-44, 0, 0), "LeftKnee": (-40, 0, 0),
            "Head": (12, -12, 0)}, drape(10, 14))),
    # SETTLE — he has to pick himself up out of it, which is the price of it.
    (30, m({"RightUpperArm": (-4, 0, -4), "LeftUpperArm": (-4, 0, 4),
            "RightElbow": (48, 0, 0), "LeftElbow": (50, 0, 0),
            "Spine": (8, 6, 0), "Hips": {"rot": (0, 3, 0), "loc": (0, 0, -0.016)},
            "RightKnee": (-16, 0, 0), "LeftKnee": (-16, 0, 0), "Head": (2, -3, 0)}, drape(5, 3))),
    (35, m(drape(4))),
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
# THE FLINCHES — four of them, because a man struck from his left does not fold
# the way a man struck from his right does, and the engine has always said which
# it was: the `hit` frame carries `direction`, the attacker's own attackDir. One
# flinch for every blow from every quarter is a large part of why the fighting
# reads as unnatural — it is the same body, jolted the same way, whatever
# happened to it.
#
# All four run 14 frames with the recoil at 4, so the driver needs no special
# case. What differs is WHERE the body goes: away from the blow, which is what a
# body does. The head leads, because the head always leads.
clip("hit", 14, [   # the forehand, arriving on his right
    (0, m()),
    (4, m({"Spine": (-16, 10, -12), "Head": (-15, 14, 8), "RightUpperArm": (12, 0, -24), "LeftUpperArm": (8, 0, 18),
           "Hips": {"rot": (0, 8, -5), "loc": (0, -0.07, -0.035)}, "RightKnee": (-20, 0, 0)}, drape(3, 6))),
    (8, m({"Spine": (-6, 4, -4), "Head": (-5, 5, 3), "Hips": {"loc": (0, -0.02, -0.012)}}, drape(4, 2))),
    (13, m()),
], loop=False)
clip("hitLeft", 14, [   # arriving on his left; everything goes the other way
    (0, m()),
    (4, m({"Spine": (-16, -10, 12), "Head": (-15, -14, -8), "LeftUpperArm": (12, 0, 24), "RightUpperArm": (8, 0, -18),
           "Hips": {"rot": (0, -8, 5), "loc": (0, -0.07, -0.035)}, "LeftKnee": (-20, 0, 0)}, drape(3, -6))),
    (8, m({"Spine": (-6, -4, 4), "Head": (-5, -5, -3), "Hips": {"loc": (0, -0.02, -0.012)}}, drape(4, -2))),
    (13, m()),
], loop=False)
clip("hitOverhead", 14, [   # from above: the knees take it and the head drops
    (0, m()),
    (4, m({"Spine": (18, 0, 0), "Head": (22, 0, 0), "RightUpperArm": (16, 0, -10), "LeftUpperArm": (16, 0, 10),
           "Hips": {"rot": (0, 0, 0), "loc": (0, -0.02, -0.085)}, "RightKnee": (-34, 0, 0), "LeftKnee": (-34, 0, 0),
           "RightThigh": (14, 0, 0), "LeftThigh": (14, 0, 0)}, drape(6))),
    (8, m({"Spine": (7, 0, 0), "Head": (9, 0, 0), "Hips": {"loc": (0, 0, -0.03)},
           "RightKnee": (-16, 0, 0), "LeftKnee": (-16, 0, 0)}, drape(4))),
    (13, m()),
], loop=False)
clip("hitStab", 14, [   # a point going in: he folds over it and is driven back
    (0, m()),
    (4, m({"Spine": (24, 0, 0), "Head": (16, 0, 0), "RightUpperArm": (26, 0, -14), "LeftUpperArm": (26, 0, 14),
           "RightElbow": (72, 0, 0), "LeftElbow": (72, 0, 0),
           "Hips": {"rot": (0, 0, 0), "loc": (0, -0.11, -0.03)}, "RightThigh": (-10, 0, 0)}, drape(7))),
    (8, m({"Spine": (10, 0, 0), "Head": (6, 0, 0), "Hips": {"loc": (0, -0.04, -0.012)}}, drape(5))),
    (13, m()),
], loop=False)
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
bpy.ops.export_scene.gltf(filepath=os.path.join(D, f"warrior-{CLS}.glb"), use_selection=True, export_format='GLB', export_image_format='NONE', export_apply=False, export_skins=True, export_def_bones=False, export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=True, export_frame_range=False)
print(f"[clips.py] {CLS}: {len(bpy.data.actions)} clips -> warrior-{CLS}.glb")
