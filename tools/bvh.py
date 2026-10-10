"""Minimal BVH reader + forward kinematics (numpy). Returns world joint positions per frame."""
import numpy as np, re

def _rot(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    n = len(a); R = np.zeros((n, 3, 3)); R[:, 0, 0] = R[:, 1, 1] = R[:, 2, 2] = 1
    i, j = {'X': (1, 2), 'Y': (2, 0), 'Z': (0, 1)}[axis]
    R[:, i, i] = c; R[:, j, j] = c; R[:, i, j] = -s; R[:, j, i] = s
    return R

def load(path):
    tok = open(path).read().split()
    joints = []  # dict name, parent, offset, channels
    stack, i = [], 0
    while tok[i] != 'MOTION':
        t = tok[i]
        if t in ('ROOT', 'JOINT'):
            joints.append({'name': tok[i + 1], 'parent': stack[-1] if stack else -1, 'ch': [], 'end': False}); i += 2
        elif t == 'End':
            joints.append({'name': joints[stack[-1]]['name'] + '_end', 'parent': stack[-1], 'ch': [], 'end': True}); i += 2
        elif t == '{': stack.append(len(joints) - 1); i += 1
        elif t == '}': stack.pop(); i += 1
        elif t == 'OFFSET': joints[-1 if not stack or stack[-1] != len(joints) - 1 else stack[-1]]['off'] = np.array(list(map(float, tok[i + 1:i + 4]))); i += 4
        elif t == 'CHANNELS':
            n = int(tok[i + 1]); joints[stack[-1]]['ch'] = tok[i + 2:i + 2 + n]; i += 2 + n
        else: i += 1
    i += 1
    nf = int(tok[i + 1]); ft = float(tok[i + 4]); i += 5
    nch = sum(len(j['ch']) for j in joints)
    data = np.array(list(map(float, tok[i:i + nf * nch]))).reshape(nf, nch)
    # FK
    R = [None] * len(joints); P = [None] * len(joints); c = 0
    for k, j in enumerate(joints):
        loc = np.repeat(np.eye(3)[None], nf, 0); tr = np.repeat(j['off'][None], nf, 0).copy()
        for ch in j['ch']:
            v = data[:, c]; c += 1
            if ch.endswith('position'): tr[:, 'XYZ'.index(ch[0])] = v
            else: loc = loc @ _rot(ch[0], v)
        if j['parent'] < 0: R[k] = loc; P[k] = tr
        else:
            pr = R[j['parent']]; R[k] = pr @ loc; P[k] = P[j['parent']] + np.einsum('nij,nj->ni', pr, tr)
    return {j['name']: P[k] for k, j in enumerate(joints)}, ft, nf
