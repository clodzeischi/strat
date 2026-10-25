
# Low-poly character shells (docs/low-poly-style.md), for Blender. Exec inside a unit's .blend after its kit.py:
#   exec(bpy.data.texts['kit.py'].as_string()); exec(open('<repo>/.claude/skills/infantry-model/scripts/shells.py').read())
# Build the left side in plain lists with ring/band/poke/cap/fan/prism_*, call mirror(m), then build_object(m, name, coll).
# Numbers are human scale (about 1.8-2 m tall); build_object scales by H to game size. Faces +X, left = +Y.
# Every vertex carries its bone weights from the start, so the result is rigged as soon as it exists.
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.geometry import intersect_point_line

H = 0.75 / 1.8
CLOTH = 'CLOTH'     # the darker team shade, (1, 0) on the team material
SPICE = dict(O=('P2', 0, 1), H=('P2', 0, 2), L=('P2', 0, 3))   # spice oranges on palette2.png, darkest first
BROWN = dict(O=('P2', 1, 1), H=('P2', 1, 2), L=('P2', 1, 3))   # leather browns on palette2.png, darkest first
FLESH = dict(O=('P2', 2, 1), H=('P2', 2, 2), L=('P2', 2, 3))   # the worm's flesh on palette2.png, darkest first

class Mesh:
    """Plain lists: verts (co, weights), faces (vert ids, swatch), shells (face ids, axis polyline or None = closed),
    facing (face id -> the direction that face must point; for caps, whose centre sits on the shell axis)."""
    def __init__(self): self.V, self.W, self.F, self.S, self.facing = [], [], [], [], {}
    def v(self, co, w):
        self.V.append(Vector(co)); self.W.append(dict(w)); return len(self.V) - 1
    def f(self, ids, sw): self.F.append((list(ids), sw)); return len(self.F) - 1
    def shell(self, faces, axis=None): self.S.append((faces, axis))

def frame(d):
    """Ring frame round axis d: f = forward-ish, s = d x f (for an upright axis s is +Y, left)."""
    d = Vector(d).normalized(); f = Vector((1, 0, 0)); f = f - d * f.dot(d)
    if f.length < 1e-4: f = Vector((0, 0, 1)) - d * d.z
    f.normalize(); return f, d.cross(f)

def ring(m, c, d, pts, w):
    """Irregular ring round axis d through c: pts are (forward, side) offsets. 4-6 points, a ridge on the silhouette."""
    f, s = frame(d); c = Vector(c)
    return [m.v(c + f * a + s * b, w) for a, b in pts]

def band(m, A, B, sw, over=None, skip=()):
    """Quads between two rings of equal size. over: {quad index: swatch} puts colours on edges the shape already has."""
    out, n = [], len(A)
    for i in range(n):
        if i in skip: continue
        j = (i + 1) % n
        out.append(m.f((A[i], A[j], B[j], B[i]), (over or {}).get(i, sw)))
    return out

def poke(m, A, B, i, P, sw):
    """Replace quads i and i+1 of a band by a fan round point P: the kneecap or elbow point (skip them in band())."""
    n = len(A); a, b, c = i % n, (i + 1) % n, (i + 2) % n
    loop = [A[a], A[b], A[c], B[c], B[b], B[a]]
    return [m.f((P, loop[k], loop[(k + 1) % 6]), sw) for k in range(6)]

def cap(m, R, sw, facing=(0, 0, 1)):
    """Close a ring. Its centre is on the shell axis, where the outward test can't decide, so it's told which way to face."""
    fi = m.f(R, sw); m.facing[fi] = Vector(facing); return [fi]

def fan(m, R, P, sw):
    n = len(R); return [m.f((R[i], R[(i + 1) % n], P), sw) for i in range(n)]

def prism_x(m, outline, x0, x1, w, sw, side_sw=None, lean=0.0):
    """Closed slab, outline in the YZ plane (cloth: tabards, capes), shifted lean*(z - top) in x."""
    top = max(z for _, z in outline)
    A = [m.v((x0 + lean * (z - top), y, z), w) for y, z in outline]
    B = [m.v((x1 + lean * (z - top), y, z), w) for y, z in outline]
    fs = [m.f(A[::-1], sw), m.f(B, sw)] + band(m, A, B, side_sw or sw)
    m.shell(fs); return fs

def prism_y(m, outline, y0, y1, w, sw, over=None):
    """Closed slab, outline in the XZ plane (weapons: one side profile is the whole gun)."""
    A = [m.v((x, y0, z), w) for x, z in outline]; B = [m.v((x, y1, z), w) for x, z in outline]
    fs = [m.f(A[::-1], sw), m.f(B, sw)] + band(m, A, B, sw, over)
    m.shell(fs); return fs

def mirror(m):
    """Copy every shell whose centroid is on the left (+Y) to the right, renaming .L weights to .R."""
    for faces, axis in list(m.S):
        ids = sorted({i for fi in faces for i in m.F[fi][0]})
        if sum(m.V[i].y for i in ids) / len(ids) < 0.05: continue
        mp = {}
        for i in ids:
            c = m.V[i].copy(); c.y = -c.y
            mp[i] = m.v(c, {k.replace('.L', '.R'): x for k, x in m.W[i].items()})
        nf = []
        for fi in faces:
            nf.append(m.f([mp[i] for i in m.F[fi][0]][::-1], m.F[fi][1]))
            if fi in m.facing: d = m.facing[fi].copy(); d.y = -d.y; m.facing[nf[-1]] = d
        m.shell(nf, [Vector((p[0], -p[1], p[2])) for p in axis] if axis else None)

def build_object(m, name, coll, rig, mats, M=None):
    """Make (or refill) object `name`: triangulated, faces outward, weighted, parented and skinned to rig.
    M: a matrix placing the verts instead of scaling by H (weapons built in the hand.R grip frame, game metres)."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.verify(); dl = bm.verts.layers.deform.verify()
    groups = sorted({g for w in m.W for g in w}); gi = {g: i for i, g in enumerate(groups)}
    place = (lambda co: M @ co) if M else (lambda co: co * H)
    vs = []
    for co, w in zip(m.V, m.W):
        v = bm.verts.new(place(co))
        for g, x in w.items(): v[dl][gi[g]] = x
        vs.append(v)
    bf = []
    for ids, sw in m.F:
        f = bm.faces.new([vs[i] for i in ids]); bf.append(f)
        mat, s = 0, sw
        if sw == CLOTH: mat, s = 1, (1, 0)
        elif sw == 'TEAM': mat, s = 1, TEAM
        elif sw[0] == 'P2': mat, s = 2, sw[1:]          # palette2.png swatch: needs mats[2] = the palette2 material
        f.material_index = mat; f.smooth = False
        for l in f.loops: l[uv].uv = uv_of(s)
    bm.normal_update()
    for fi, d in m.facing.items():                      # caps: told which way to face
        f = bf[fi]; dd = (M.to_3x3() @ d) if M else d
        if f.normal.dot(dd) < 0: f.normal_flip()
    for faces, axis in m.S:                             # the rest: closed shells recalculated, open ones away from their axis
        fl = [bf[i] for i in faces if i not in m.facing]
        if axis is None:
            bmesh.ops.recalc_face_normals(bm, faces=fl); continue
        ax = [place(Vector(p)) for p in axis]
        for f in fl:
            c = f.calc_center_median(); best = None
            for a, b in zip(ax, ax[1:]):
                q, t = intersect_point_line(c, a, b); t = min(max(t, 0), 1); q = a + (b - a) * t
                if best is None or (c - q).length < (c - best).length: best = q
            if f.normal.dot(c - best) < 0: f.normal_flip()
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    # Order matters: groups before to_mesh (clearing groups afterwards wipes the weights), materials before to_mesh
    # (clearing materials afterwards resets every face's material index).
    ob.vertex_groups.clear()
    for g in groups: ob.vertex_groups.new(name=g)
    me.materials.clear()
    for mt in mats: me.materials.append(mt)
    bm.to_mesh(me); bm.free()
    ob.parent = rig; ob.matrix_parent_inverse.identity(); ob.matrix_world = Matrix()
    ob.modifiers.clear(); ob.modifiers.new('rig', 'ARMATURE').object = rig
    return ob

def hand_frame(rig, bone='hand.R'):
    """Grip frame in the A pose: x along the hand bone (the barrel), z = the gun's top, facing forward."""
    hb = rig.data.bones[bone]
    h, t = rig.matrix_world @ hb.head_local, rig.matrix_world @ hb.tail_local
    x = (t - h).normalized(); up = Vector((1, 0, 0)); up = (up - x * up.dot(x)).normalized(); y = up.cross(x)
    g = h + (t - h) * 0.5
    return Matrix(((x.x, y.x, up.x, g.x), (x.y, y.y, up.y, g.y), (x.z, y.z, up.z, g.z), (0, 0, 0, 1)))

def muzzle(rig, coll, M, at, name='muzzle', bone='hand.R'):
    """The muzzle empty, bone-parented, at a point given in the grip frame."""
    e = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    if e.name not in coll.objects: coll.objects.link(e)
    e.empty_display_type = 'SINGLE_ARROW'; e.empty_display_size = 0.02
    e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = bone
    e.matrix_world = M @ Matrix.Translation(at)
    return e
