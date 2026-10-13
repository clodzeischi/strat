
# Pre-export checks for an infantry .blend. Exec in Blender, then call check_all() (or the pieces).
# The game culls back faces and Blender draws both sides by default, so a face pointing the wrong way is invisible
# in Blender but a hole in game.
import bpy, bmesh
from mathutils import Vector, kdtree

def _islands(bm):
    bm.faces.ensure_lookup_table(); seen, out = set(), []
    for f0 in bm.faces:
        if f0.index in seen: continue
        st, isl = [f0], []; seen.add(f0.index)
        while st:
            f = st.pop(); isl.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); st.append(g)
        out.append(isl)
    return out

def normals(names=None):
    """Per connected piece: faces should point away from its centre on average (catches inside-out pieces), and
    flat tops and bottoms must face up and down (catches a single flipped cap, which barely moves the average)."""
    bad = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith('_') or (names and o.name not in names): continue
        bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
        for isl in _islands(bm):
            if len(isl) < 3: continue
            cen = sum((f.calc_center_median() for f in isl), Vector()) / len(isl)
            area = sum(f.calc_area() for f in isl)
            score = sum(f.normal.dot(f.calc_center_median() - cen) * f.calc_area() for f in isl)
            if score < -0.02 * area * area ** 0.5:
                bad.append((o.name, 'inside-out piece', tuple(round(x, 3) for x in cen)))
            zs = [v.co.z for f in isl for v in f.verts]; z0, z1 = min(zs), max(zs)
            for f in isl:
                c = f.calc_center_median()
                if abs(f.normal.z) < 0.7 or (c.xy - cen.xy).length > 0.6 * max(1e-6, (z1 - z0)): continue
                if c.z > z1 - 0.15 * (z1 - z0) and f.normal.z < 0: bad.append((o.name, 'top face points down', f.index))
                if c.z < z0 + 0.15 * (z1 - z0) and f.normal.z > 0 and c.z > 0.01: bad.append((o.name, 'bottom face points up', f.index))
        bm.free()
    return bad

def weights():
    """Every vertex of every skinned mesh weighted; weights mirror left/right where the geometry does."""
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith('_'): continue
        un = sum(1 for v in o.data.vertices if not v.groups)
        if un: out.append((o.name, f'{un} unweighted verts'))
        names = [g.name for g in o.vertex_groups]
        kd = kdtree.KDTree(len(o.data.vertices))
        for v in o.data.vertices: kd.insert(v.co, v.index)
        kd.balance(); asym = 0
        for v in o.data.vertices:
            if v.co.y <= 1e-4: continue
            m = v.co.copy(); m.y = -m.y; co, j, d = kd.find(m)
            if d > 1e-4: continue
            a = {names[g.group].replace('.L', '.X'): round(g.weight, 2) for g in v.groups}
            b = {names[g.group].replace('.R', '.X'): round(g.weight, 2) for g in o.data.vertices[j].groups}
            asym += a != b
        if asym: out.append((o.name, f'{asym} mirrored verts with different weights'))
    return out

def frames_on_ground(action, frames=None, tol=0.005):
    """Lowest body point per frame of an action: should be ~0 (above = floating, below = sinking)."""
    rig = bpy.data.objects['rig']; body = bpy.data.objects['body']
    rig.animation_data.action = bpy.data.actions[action]
    a, b = bpy.data.actions[action].frame_range
    out = []
    for f in frames or range(int(a), int(b) + 1):
        bpy.context.scene.frame_set(f)
        ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        low = min((body.matrix_world @ v.co).z for v in me.vertices); ev.to_mesh_clear()
        if abs(low) > tol: out.append((action, f, round(low, 4)))
    return out

def frame_budget(limit=90):
    tot = sum(int(a.frame_range[1] - a.frame_range[0] + 1) for a in bpy.data.actions)
    return tot, tot <= limit

def tris():
    return {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons)
            for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('_')}

def check_all():
    r = dict(tris=tris(), normals=normals(), weights=weights(), frames=frame_budget())
    for k, v in r.items(): print(k, v)
    return r
