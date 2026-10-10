"""Minimal glTF/GLB node-animation sampler (numpy): world positions of named nodes over time."""
import json, struct, numpy as np

def _q2m(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def _slerp(a, b, t):
    d = np.dot(a, b)
    if d < 0: b = -b; d = -d
    if d > 0.9995: r = a + t * (b - a); return r / np.linalg.norm(r)
    th = np.arccos(d); return (np.sin((1-t)*th)*a + np.sin(t*th)*b) / np.sin(th)

class GLB:
    def __init__(self, path):
        b = open(path, 'rb').read(); l = struct.unpack('<I', b[12:16])[0]
        self.j = json.loads(b[20:20+l]); o = 20 + l
        bl = struct.unpack('<I', b[o:o+4])[0]; self.bin = b[o+8:o+8+bl]
        self.nodes = self.j['nodes']
        self.parent = [-1] * len(self.nodes)
        for i, n in enumerate(self.nodes):
            for c in n.get('children', []): self.parent[c] = i
    def acc(self, i):
        a = self.j['accessors'][i]; bv = self.j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        assert a['componentType'] == 5126
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(self.bin, np.float32, a['count'] * n, off).reshape(a['count'], n).astype(float)
    def clip(self, name):
        an = next(a for a in self.j['animations'] if name in a['name'])
        ch = {}
        for c in an['channels']:
            s = an['samplers'][c['sampler']]
            ch[(c['target']['node'], c['target']['path'])] = (self.acc(s['input'])[:, 0], self.acc(s['output']), s.get('interpolation', 'LINEAR'))
        dur = max(v[0][-1] for v in ch.values())
        return ch, dur
    def world(self, ch, t):
        loc = []
        for i, n in enumerate(self.nodes):
            T = np.array(n.get('translation', [0, 0, 0]), float); Q = np.array(n.get('rotation', [0, 0, 0, 1]), float); S = np.array(n.get('scale', [1, 1, 1]), float)
            for path in ('translation', 'rotation', 'scale'):
                k = ch.get((i, path))
                if not k: continue
                tt, vv, ip = k
                if ip == 'CUBICSPLINE': vv = vv.reshape(len(tt), 3, -1)[:, 1]
                j = np.searchsorted(tt, t) 
                if j <= 0: v = vv[0]
                elif j >= len(tt): v = vv[-1]
                else:
                    u = (t - tt[j-1]) / (tt[j] - tt[j-1]); u = 0 if ip == 'STEP' else u
                    v = _slerp(vv[j-1], vv[j], u) if path == 'rotation' else vv[j-1] + (vv[j] - vv[j-1]) * u
                if path == 'translation': T = v
                elif path == 'rotation': Q = v
                else: S = v
            M = np.eye(4); M[:3, :3] = _q2m(Q) * S; M[:3, 3] = T; loc.append(M)
        W = [None] * len(self.nodes)
        def w(i):
            if W[i] is None: W[i] = loc[i] if self.parent[i] < 0 else w(self.parent[i]) @ loc[i]
            return W[i]
        return {n.get('name', str(i)): w(i)[:3, 3] for i, n in enumerate(self.nodes)}
