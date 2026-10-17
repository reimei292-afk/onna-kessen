#!/usr/bin/env python3
"""Bake the user's Mixamo death animation (FBX, X Bot) into a tiny joint/curve table: lib/death_fbx.js
Step 1 (node, three.js FBXLoader): node tools/fbx_sample.mjs <file.fbx>  -> frames.json (world joint positions, 30 fps)
Step 2: python3 tools/bake_fbx_death.py frames.json
Only the MOTION is kept (joint positions + curves). The mesh / skeleton / model is never used or shipped.
Frame: x = left of the fall direction, y = up from the ground, z = fall direction; height normalised (head top = 1).
"""
import json, sys, os, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = ['hips', 'lHip', 'lKnee', 'lAnkle', 'lToe', 'rHip', 'rKnee', 'rAnkle', 'rToe', 'chest', 'neck', 'head', 'lSh', 'lEl', 'lWr', 'rSh', 'rEl', 'rWr']
MX = {'hips': 'Hips', 'lHip': 'LeftUpLeg', 'lKnee': 'LeftLeg', 'lAnkle': 'LeftFoot', 'lToe': 'LeftToe_End', 'rHip': 'RightUpLeg', 'rKnee': 'RightLeg',
      'rAnkle': 'RightFoot', 'rToe': 'RightToe_End', 'chest': 'Spine2', 'neck': 'Neck', 'head': ('Head', 'HeadTop_End'),
      'lSh': 'LeftArm', 'lEl': 'LeftForeArm', 'lWr': 'LeftHand', 'rSh': 'RightArm', 'rEl': 'RightForeArm', 'rWr': 'RightHand'}
BONES = [('hips', 'lHip', 0.055), ('lHip', 'lKnee', 0.245), ('lKnee', 'lAnkle', 0.245), ('lAnkle', 'lToe', 0.125),
         ('hips', 'rHip', 0.055), ('rHip', 'rKnee', 0.245), ('rKnee', 'rAnkle', 0.245), ('rAnkle', 'rToe', 0.125),
         ('hips', 'chest', 0.17), ('chest', 'neck', 0.13), ('neck', 'head', 0.085),
         ('chest', 'lSh', 0.11), ('lSh', 'lEl', 0.17), ('lEl', 'lWr', 0.15), ('chest', 'rSh', 0.11), ('rSh', 'rEl', 0.17), ('rEl', 'rWr', 0.15)]
FPS_OUT = 20
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'frames.json'))
F = d['frames']; fps = d['fps']; n = len(F); dur = (n - 1) / fps
W = lambda i, k: (np.array(F[i][k[0]]) + np.array(F[i][k[1]])) / 2 if isinstance(k, tuple) else np.array(F[i][k])
A = np.array([[W(i, MX[j]) for j in J] for i in range(n)])          # [n, 18, 3] world (cm)
ix = {k: i for i, k in enumerate(J)}
up = np.array([0., 1., 0.])
# facing at frame 0 (from the shoulders + hips), fall direction = start feet -> final head (horizontal)
lat = (A[0, ix['lSh']] - A[0, ix['rSh']]) + (A[0, ix['lHip']] - A[0, ix['rHip']]); lat[1] = 0; lat /= np.linalg.norm(lat)
face = np.cross(lat, up)
foot0 = (A[0, ix['lAnkle']] + A[0, ix['rAnkle']]) / 2; foot0[1] = 0
fall = A[-1, ix['head']] - foot0; fall[1] = 0; fall /= np.linalg.norm(fall)
left = np.cross(up, fall)
yaw = lambda v: np.arctan2(v[0], v[2])
rel = (yaw(fall) - yaw(face) + np.pi) % (2 * np.pi) - np.pi
H = A[0, ix['head'], 1] - A[0, [ix['lToe'], ix['rToe'], ix['lAnkle'], ix['rAnkle']], 1].min() + 0.0
H = F[0]['HeadTop_End'][1] - min(F[0]['LeftToe_End'][1], F[0]['RightToe_End'][1])
L = np.stack([(A - foot0) @ left, A[..., 1], (A - foot0) @ fall], -1) / H
# retarget onto the game's canonical body (height 1, leg 0.49), same as tools/bake_motion.py
nz = lambda v: v / np.linalg.norm(v, axis=-1, keepdims=True)
src_leg = np.mean([np.linalg.norm(L[:, ix[a]] - L[:, ix[b]], axis=-1).mean() for a, b in (('lHip', 'lKnee'), ('lKnee', 'lAnkle'), ('rHip', 'rKnee'), ('rKnee', 'rAnkle'))]) * 2
k = 0.49 / src_leg
f = L.copy(); f[:, 0] = (f[:, ix['lHip']] + f[:, ix['rHip']]) * 0.5
out = np.zeros_like(f); out[:, 0] = f[:, 0] * k
hipLat = nz(f[:, ix['lHip']] - f[:, ix['rHip']]); shLat = nz(f[:, ix['lSh']] - f[:, ix['rSh']])
for a, b, Ln in BONES:
    if b in ('lHip', 'rHip'): dv = hipLat * (1 if b[0] == 'l' else -1)
    elif b in ('lSh', 'rSh'): dv = nz(shLat * (1 if b[0] == 'l' else -1) * 0.105 + nz(f[:, ix['neck']] - f[:, ix['chest']]) * 0.03)
    else: dv = nz(f[:, ix[b]] - f[:, ix[a]])
    out[:, ix[b]] = out[:, ix[a]] + dv * Ln
feet = out[:, [ix['lAnkle'], ix['rAnkle'], ix['lToe'], ix['rToe']], 1]
lowest = np.minimum(feet.min(1), out[..., 1].min(1))
out[..., 1] -= min(feet[0].min() - 0.03, lowest.min())   # nothing below the ground
# resample to FPS_OUT
m = int(round(dur * FPS_OUT)) + 1
tt = np.linspace(0, n - 1, m); i0 = np.floor(tt).astype(int); i1 = np.minimum(i0 + 1, n - 1); w = (tt - i0)[:, None, None]
R = out[i0] * (1 - w) + out[i1] * w
# curves (what the photo board uses)
hip = R[:, 0]; neck = R[:, ix['neck']]; tor = neck - hip
th = np.arctan2(tor[:, 2], tor[:, 1])               # torso tilt toward the fall direction (rad)
roll = np.arcsin(np.clip(tor[:, 0] / np.linalg.norm(tor, axis=-1), -1, 1))   # sideways lean (to the left of the fall direction +)
piv = (R[:, ix['lAnkle']] + R[:, ix['rAnkle']]) / 2  # foot pivot (stagger steps / slide)
kick = np.maximum(R[:, ix['lAnkle'], 1], R[:, ix['rAnkle'], 1])
t = np.arange(m) / FPS_OUT
sink = hip[:, 1]
def first(cond):
    i = np.flatnonzero(cond); return float(t[i[0]]) if len(i) else None
ev = {'recoilPeak': float(t[np.argmax(th[:int(0.8 * FPS_OUT)])]), 'buckle': first((sink < sink[0] - 0.03) & (t > 0.8)),
      'impact': first(th > 1.35), 'kickPeak': float(t[np.argmax(kick)]), 'settle': first((t > t[np.argmax(kick)]) & (kick < 0.09))}
res = {'src': 'Mixamo FBX (X Bot) ' + os.path.basename(d.get('file', '')), 'fps': FPS_OUT, 'dur': round(dur, 3), 'n': m, 'rel': round(float(rel), 3), 'events': ev,
       'curves': {k2: [round(float(v), 3) for v in arr] for k2, arr in (('hipY', sink), ('th', th), ('roll', roll), ('px', piv[:, 0]), ('pz', piv[:, 2]), ('kick', kick))},
       'f': [round(float(v), 3) for v in R.reshape(-1)]}
print('dur', dur, 'n', m, 'height(cm)', round(H, 1), 'fall rel to facing (deg)', round(np.degrees(rel), 1), 'events', ev)
for i in range(0, m, 4): print(f't={t[i]:.2f} hipY={sink[i]:.3f} th={np.degrees(th[i]):6.1f} roll={np.degrees(roll[i]):6.1f} pivot=({piv[i,0]:+.2f},{piv[i,2]:+.2f}) kick={kick[i]:.2f}')
hdr = '// 自動生成（tools/bake_fbx_death.py）：ユーザー提供の Mixamo の倒れる動き（FBX）から関節位置と曲線だけを取り出した表。\n// モデル（X Bot）の形・顔は含まず、ゲームでも表示しない。x=倒れる向きの左, y=上, z=倒れる向き、身長=1。\n'
open(os.path.join(ROOT, 'lib', 'death_fbx.js'), 'w').write(hdr + 'window.DEATH_FBX = ' + json.dumps(res, separators=(',', ':')) + ';\n')
print('bytes', os.path.getsize(os.path.join(ROOT, 'lib', 'death_fbx.js')))
