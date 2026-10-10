#!/usr/bin/env python3
"""Bake real motion data into a tiny, offline JS table (lib/motion_data.js).

Sources (see README):
  * CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion from
    github.com/una-dinosauria/cmu-mocap:  07_01 (walk), 16_35 (jog), 09_01 (run)
  * Quaternius "Animated Women Pack" (CC0): Female_Idle, Female_Death  (motion only; the mesh is never used)
Output: per clip, joint positions in the character frame (x = character's left, y = up from ground,
z = forward), normalised by standing height (1.0 = top of head). Loops are cut to exactly one gait
cycle starting at left-foot-forward (left heel strike) and made seamless.
"""
import json, os, sys, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import bvh, gltf_anim

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = ['hips', 'lHip', 'lKnee', 'lAnkle', 'lToe', 'rHip', 'rKnee', 'rAnkle', 'rToe', 'chest', 'neck', 'head',
     'lSh', 'lEl', 'lWr', 'rSh', 'rEl', 'rWr']
CMU = {'hips': 'Hips', 'lHip': 'LeftUpLeg', 'lKnee': 'LeftLeg', 'lAnkle': 'LeftFoot', 'lToe': 'LeftToeBase_end',
       'rHip': 'RightUpLeg', 'rKnee': 'RightLeg', 'rAnkle': 'RightFoot', 'rToe': 'RightToeBase_end',
       'chest': 'Spine1', 'neck': 'Neck1', 'head': ('Head', 'Head_end'),
       'lSh': 'LeftArm', 'lEl': 'LeftForeArm', 'lWr': 'LeftHand', 'rSh': 'RightArm', 'rEl': 'RightForeArm', 'rWr': 'RightHand'}
QUA = {'hips': 'Hips', 'lHip': 'UpperLeg.L', 'lKnee': 'LowerLeg.L', 'lAnkle': 'LowerLeg.L_end', 'lToe': 'Foot.L_end',
       'rHip': 'UpperLeg.R', 'rKnee': 'LowerLeg.R', 'rAnkle': 'LowerLeg.R_end', 'rToe': 'Foot.R_end',
       'chest': 'Torso', 'neck': 'Neck', 'head': ('Head', 'Head_end'),
       'lSh': 'UpperArm.L', 'lEl': 'LowerArm.L', 'lWr': 'Palm.L', 'rSh': 'UpperArm.R', 'rEl': 'LowerArm.R', 'rWr': 'Palm.R'}
HEADTOP = 1.0   # 頭頂＝1.0 に正規化
N = 40

def gather(src, mp):
    out = []
    for k in J:
        v = mp[k]
        out.append((src[v[0]] + src[v[1]]) * 0.5 if isinstance(v, tuple) else src[v])
    return np.stack(out, 1)   # [frames, joints, 3]

def bake_cmu(name, path):
    P, ft, nf = bvh.load(path)
    A = gather(P, CMU)
    top = P['Head_end']
    hip = A[:, 0]
    fwd = hip[-1] - hip[0]; fwd[1] = 0; fwd /= np.linalg.norm(fwd)
    left = np.cross([0, 1, 0], fwd)
    L = np.stack([A @ left, A[..., 1], A @ fwd], -1)
    topy = top[:, 1]
    assert L[:, 1, 0].mean() > L[:, 5, 0].mean(), 'left/right'
    # one gait cycle: consecutive maxima of (left ankle z - right ankle z)
    s = L[:, 3, 2] - L[:, 7, 2]
    s = np.convolve(s, np.ones(9) / 9, 'same')
    mx = [i for i in range(5, nf - 5) if s[i] == s[i - 5:i + 6].max() and s[i] > 0]
    mid = nf / 2
    pairs = [(a, b) for a, b in zip(mx, mx[1:])]
    a, b = min(pairs, key=lambda p: abs((p[0] + p[1]) / 2 - mid))
    seg = L[a:b + 1].copy(); T = (b - a) * ft; n = b - a
    ground = min(seg[:, [3, 4, 7, 8], 1].min(), 1e9)
    H = topy[a:b + 1].mean() - ground
    seg[..., 1] -= ground; seg /= H
    # remove forward progression + lateral drift (linear), then make seamless
    t = np.arange(n + 1)
    hz = seg[:, 0, 2]; hx = seg[:, 0, 0]
    vz = (hz[-1] - hz[0]) / n; vx = (hx[-1] - hx[0]) / n
    stride = hz[-1] - hz[0]
    seg[..., 2] -= (vz * t)[:, None]; seg[..., 0] -= (vx * t)[:, None]
    d = seg[-1] - seg[0]; seg -= d[None] * (t / n)[:, None, None]
    seg[..., 0] -= seg[:, 0, 0].mean(); seg[..., 2] -= seg[:, 0, 2].mean()
    # resample to N
    u = np.linspace(0, n, N, endpoint=False); i0 = np.floor(u).astype(int); f = (u - i0)[:, None, None]
    R = seg[i0] * (1 - f) + seg[np.minimum(i0 + 1, n)] * f
    return {'loop': 1, 'dur': round(T, 4), 'stride': round(float(stride), 4), 'speed': round(float(stride / T), 4), 'src': 'CMU ' + name, 'f': R}

def bake_qua(clipname, loop, n_out, t_end=None):
    g = gltf_anim.GLB('/workspace/attic_3d/models/woman2.glb')
    ch, dur = g.clip(clipname)
    T = t_end or dur
    P0 = g.world(ch, 0.0)
    H = P0['Head_end'][1] - min(P0['Foot.L'][1], P0['Foot.R'][1])
    frames = []
    for t in np.linspace(0, T, n_out, endpoint=not loop):
        P = g.world(ch, t)
        frames.append(gather({k: np.array(v)[None] for k, v in P.items()}, QUA)[0])
    R = np.stack(frames)
    g0 = min(P0['Foot.L'][1], P0['Foot.R'][1])
    R[..., 1] -= g0
    R[..., 0] -= R[0, 0, 0]; R[..., 2] -= R[0, 0, 2]
    R /= H
    return {'loop': int(loop), 'dur': round(T, 4), 'src': 'Quaternius ' + clipname, 'f': R}

# ---- 直接の関節位置ではなく「骨の向き」を写し取り、標準的な女性の体格（身長=1）の骨格で組み直す ----
BONES = [('hips', 'lHip', 0.055), ('lHip', 'lKnee', 0.245), ('lKnee', 'lAnkle', 0.245), ('lAnkle', 'lToe', 0.125),
         ('hips', 'rHip', 0.055), ('rHip', 'rKnee', 0.245), ('rKnee', 'rAnkle', 0.245), ('rAnkle', 'rToe', 0.125),
         ('hips', 'chest', 0.17), ('chest', 'neck', 0.13), ('neck', 'head', 0.085),
         ('chest', 'lSh', 0.11), ('lSh', 'lEl', 0.17), ('lEl', 'lWr', 0.15),
         ('chest', 'rSh', 0.11), ('rSh', 'rEl', 0.17), ('rEl', 'rWr', 0.15)]
CANON_LEG = 0.49
def retarget(c, loop):
    f = c['f']; ix = {k: i for i, k in enumerate(J)}
    src_leg = np.mean([np.linalg.norm(f[:, ix[a]] - f[:, ix[b]], axis=-1).mean() for a, b in (('lHip', 'lKnee'), ('lKnee', 'lAnkle'), ('rHip', 'rKnee'), ('rKnee', 'rAnkle'))]) * 2
    k = CANON_LEG / src_leg
    f = f.copy(); f[:, 0] = (f[:, ix['lHip']] + f[:, ix['rHip']]) * 0.5   # 骨盤の中心＝左右の股関節の中点
    nz = lambda v: v / np.linalg.norm(v, axis=-1, keepdims=True)
    out = np.zeros_like(f); out[:, 0] = f[:, 0] * k
    hipLat = nz(f[:, ix['lHip']] - f[:, ix['rHip']]); shLat = nz(f[:, ix['lSh']] - f[:, ix['rSh']])
    for a, b, L in BONES:
        if b in ('lHip', 'rHip'): d = hipLat * (1 if b[0] == 'l' else -1)
        elif b in ('lSh', 'rSh'):
            up = nz(f[:, ix['neck']] - f[:, ix['chest']])
            d = nz(shLat * (1 if b[0] == 'l' else -1) * 0.105 + up * 0.03)
        else: d = nz(f[:, ix[b]] - f[:, ix[a]])
        out[:, ix[b]] = out[:, ix[a]] + d * L
    feet = out[:, [ix['lAnkle'], ix['rAnkle'], ix['lToe'], ix['rToe']], 1]
    g = feet.min() if loop else feet[0].min()
    out[..., 1] -= g - 0.035 if loop else g - 0.03
    c['f'] = out
    if 'stride' in c: c['stride'] = round(c['stride'] * k, 4); c['speed'] = round(c['speed'] * k, 4)
    return c

clips = {
    'walk': bake_cmu('07_01', ROOT + '/lib/mocap_src/07_01.bvh'),
    'jog': bake_cmu('16_35', ROOT + '/lib/mocap_src/16_35.bvh'),
    'run': bake_cmu('09_01', ROOT + '/lib/mocap_src/09_01.bvh'),
    'idle': bake_qua('Female_Idle', True, 24),
    'death': bake_qua('Female_Death', False, 36, 1.75),
}
for kk, cc in clips.items(): retarget(cc, cc['loop'])
out = {'joints': J, 'clips': {}}
for k, c in clips.items():
    f = c.pop('f'); c['n'] = len(f)
    c['f'] = [round(float(v), 3) for v in f.reshape(-1)]
    out['clips'][k] = c
    hips = f[:, 0]; print(k, c.get('src'), 'dur', c['dur'], 'stride', c.get('stride'), 'speed h/s', c.get('speed'),
                         'hipY %.3f..%.3f' % (hips[:, 1].min(), hips[:, 1].max()), 'sway %.3f' % np.ptp(hips[:, 0]),
                         'head end', np.round(f[-1, 11], 2))
hdr = '// 自動生成（tools/bake_motion.py）：実在の人の動き（CMU モーションキャプチャ）と CC0 の動き（Quaternius）から\n// 関節位置だけを取り出した表。x=左, y=上(地面から), z=前、身長=1。見た目のモデルは含みません。\n'
open(ROOT + '/lib/motion_data.js', 'w').write(hdr + 'window.MOTION_DATA = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print('bytes', os.path.getsize(ROOT + '/lib/motion_data.js'))
