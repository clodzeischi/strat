
# Posing and keying helpers for the 17-bone infantry rig, for Blender. Exec inside the unit's .blend:
#   exec(open('<repo>/.claude/skills/infantry-model/scripts/pose.py').read())
# Poses aim bones at world directions (X forward, Y left, Z up), parents first. Arms and legs are placed with
# two-bone solves. A pose is a function; key_action() samples it into an action at 15 fps.
import bpy, math
from mathutils import Vector, Matrix

rig = bpy.data.objects['rig']
BONES = [b.name for b in rig.data.bones]      # parents come before children
V = lambda *a: Vector(a).normalized()

def upd(): bpy.context.view_layer.update()

def rest():
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)

def aim(name, d):
    """Point a bone along world direction d. It keeps the twist it inherits, so yaw() only the extra per bone."""
    pb = rig.pose.bones[name]; upd()
    M = pb.matrix.copy(); cur = M.col[1].xyz.normalized()
    R = cur.rotation_difference(Vector(d).normalized()).to_matrix() @ M.to_3x3()
    N = R.to_4x4(); N.translation = M.translation; pb.matrix = N

def yaw(name, a):
    """Turn a bone about world Z (negative = clockwise seen from above: right shoulder back)."""
    pb = rig.pose.bones[name]; upd(); M = pb.matrix.copy()
    R = Matrix.Rotation(a, 4, 'Z') @ Matrix(M.to_3x3()).to_4x4(); R.translation = M.translation; pb.matrix = R

def move(name, delta):
    pb = rig.pose.bones[name]; upd()
    M = pb.matrix.copy(); M.translation += Vector(delta); pb.matrix = M

def _two_bone(a, b, target, pole):
    pa, pb_ = rig.pose.bones[a], rig.pose.bones[b]
    upd(); S = rig.matrix_world @ pa.head
    l1, l2 = pa.bone.length, pb_.bone.length
    d = target - S; n = d.normalized(); dist = min(d.length, (l1 + l2) * 0.999)
    ang = math.acos(max(-1, min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    p = Vector(pole); p = (p - n * p.dot(n)).normalized()
    mid = S + n * math.cos(ang) * l1 + p * math.sin(ang) * l1
    aim(a, mid - S); aim(b, target - mid)

def reach(side, wrist, pole):
    """Arm: the wrist (hand bone head) to a world point, the elbow bending toward pole."""
    _two_bone(f'upper_arm.{side}', f'forearm.{side}', Vector(wrist), pole)

def leg_reach(side, ankle, pole=(1, 0, 0)):
    """Leg: the ankle (foot bone head) to a world point, the knee toward pole."""
    _two_bone(f'thigh.{side}', f'shin.{side}', Vector(ankle), pole)

def _gun_centre_rest(name='weapons0'):
    pts = [v.co for v in bpy.data.objects[name].data.vertices]
    return Vector([(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)])

GUN_REST = _gun_centre_rest() if 'weapons0' in bpy.data.objects else None

def gun_centre():
    """Where the base weapon's centre is now (it's rigid on hand.R)."""
    upd(); pb = rig.pose.bones['hand.R']
    return rig.matrix_world @ (pb.matrix @ pb.bone.matrix_local.inverted() @ GUN_REST)

def hold_r(centre, along, pole=(-0.3, -0.5, -1)):
    """One-handed: the weapon's centre at `centre` (world), pointing along `along`. A few passes, since where the
    gun ends up depends on how the arm got there."""
    P = Vector(centre); t = Vector(along).normalized(); hl = rig.pose.bones['hand.R'].bone.length; g = P.copy()
    for _ in range(4):
        reach('R', g - t * hl * 0.5, pole); aim('hand.R', t)
        g += P - gun_centre()

def hold(centre, along, fore=0.09, drop=0.03, pole_r=(-0.3, -1, -0.6), pole_l=(-0.3, 1, -0.8)):
    """Two-handed: right hand on the grip as hold_r, left hand under the front, `fore` ahead of the centre."""
    hold_r(centre, along, pole_r)
    t = Vector(along).normalized(); hl = rig.pose.bones['hand.R'].bone.length
    fg = gun_centre() + t * fore + Vector((0, 0, -drop))
    reach('L', fg - V(0.2, -1, 0.3) * hl * 0.5, pole_l); aim('hand.L', V(0.2, -1, 0.3))

def _eval_low(verts=None, obj='body'):
    upd(); ob = bpy.data.objects[obj]
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    vs = me.vertices if verts is None else [me.vertices[i] for i in verts]
    low = min((ob.matrix_world @ v.co).z for v in vs)
    ev.to_mesh_clear(); return low

def ground():
    """For poses without planted-foot IK (kneeling, lying): shift the hips so the lowest point touches z = 0."""
    move('hips', (0, 0, -_eval_low()))

def foot_verts(side, obj='body'):
    ob = bpy.data.objects[obj]
    return {v.index for v in ob.data.vertices for g in v.groups
            if ob.vertex_groups[g.group].name == f'foot.{side}' and g.weight > 0.4}

def plant(pose, planted, iters=6):
    """Run pose(dz) until planted soles sit on z = 0 and no sole dips below it. pose takes {side: extra ankle
    height}; planted is the set of sides on the ground in this pose. (A toe-up heel strike or a toed-out foot
    otherwise sinks the boot several cm.)"""
    fv = {s: foot_verts(s) for s in 'LR'}; dz = {}
    for _ in range(iters):
        rest(); pose(dz); upd()
        for s in 'LR':
            low = _eval_low(fv[s])
            if s in planted or low < 0: dz[s] = dz.get(s, 0) - low

def key_action(name, keys, cyclic, linear=False):
    """keys: [(frame, pose_fn)]. Keys rotation on every bone and the hips' location. A cyclic action's last key
    must repeat its first; the range then spans 1..last and the loop is last-1 frames long."""
    bpy.context.scene.render.fps = 15
    act = bpy.data.actions.get(name) or bpy.data.actions.new(name)
    for fc in list(act.fcurves): act.fcurves.remove(fc)
    act.use_fake_user = True
    rig.animation_data_create(); rig.animation_data.action = act
    prev = {}
    for frame, pose in keys:
        rest(); pose(); upd()
        for bn in BONES:
            pb = rig.pose.bones[bn]
            e = pb.matrix_basis.to_quaternion().to_euler('XYZ', prev.get(bn, pb.rotation_euler))
            pb.rotation_euler = e; prev[bn] = e.copy()
            pb.keyframe_insert('rotation_euler', frame=frame, group=bn)
        rig.pose.bones['hips'].keyframe_insert('location', frame=frame, group='hips')
    for fc in act.fcurves:
        if linear:
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
        if cyclic and not fc.modifiers: fc.modifiers.new('CYCLES')
    act.frame_range = (keys[0][0], keys[-1][0]); act.use_frame_range = True; act.use_cyclic = cyclic
    sc = bpy.context.scene; sc.frame_start = keys[0][0]; sc.frame_end = keys[-1][0] - (1 if cyclic else 0); sc.frame_set(1)
    return act
