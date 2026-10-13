# Minimal MD3 reader: surfaces with tris, uvs and frame-0 verts; tags of frame 0.
import struct, sys, os

def read(path, frame=0):
    d = open(path, 'rb').read()
    ident, ver = struct.unpack_from('<4si', d, 0)
    assert ident == b'IDP3', path
    nf, nt, ns, nsk, of, ot, os_, oe = struct.unpack_from('<8i', d, 76)
    tags = []
    for i in range(nt):
        o = ot + (frame * nt + i) * 112
        name = d[o:o+64].split(b'\0')[0].decode()
        org = struct.unpack_from('<3f', d, o + 64); ax = struct.unpack_from('<9f', d, o + 76)
        tags.append((name, org, ax))
    surfs = []; o = os_
    for s in range(ns):
        name = d[o+4:o+68].split(b'\0')[0].decode()
        flags, snf, nsh, nv, ntri, otri, osh, ost, oxyz, oend = struct.unpack_from('<10i', d, o + 68)
        tris = [struct.unpack_from('<3i', d, o + otri + 12*i) for i in range(ntri)]
        st = [struct.unpack_from('<2f', d, o + ost + 8*i) for i in range(nv)]
        vs = []
        for i in range(nv):
            x, y, z, n = struct.unpack_from('<3hH', d, o + oxyz + (frame * nv + i) * 8)
            vs.append((x / 64, y / 64, z / 64))
        shader = d[o+osh:o+osh+64].split(b'\0')[0].decode() if nsh else ''
        surfs.append(dict(name=name, verts=vs, tris=tris, st=st, shader=shader, frames=snf))
        o += oend
    return dict(frames=nf, tags=tags, surfs=surfs)

if __name__ == '__main__':
    root = sys.argv[1]
    for ch in sorted(os.listdir(root)):
        p = os.path.join(root, ch)
        if not os.path.isdir(p): continue
        row = []
        for lod in ('', '_1', '_2'):
            tot = 0; parts = []
            for part in ('head', 'upper', 'lower'):
                f = os.path.join(p, f'{part}{lod}.md3')
                if not os.path.exists(f): parts.append('-'); continue
                m = read(f); t = sum(len(s['tris']) for s in m['surfs']); tot += t
                parts.append(f"{t}" + (f"[{len(m['surfs'])}s]" if len(m['surfs']) > 1 else ''))
            row.append(f"{tot:5d} ({'/'.join(parts)})")
        print(f"{ch:10s}", '  '.join(row))
