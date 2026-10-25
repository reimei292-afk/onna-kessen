#!/usr/bin/env python3
"""assets/frames/frames_props.js を書く：
 PROP_META（武器アトラスの切り出し・実寸・握り）、弓を持たない archer01〜10 の見え方、
 HAND_META[gid][view] = [uL, vL, uR, vR]（画像の左右の手の位置。u は左から、v は上からの割合。横向きは前の手）。
先に tools/make_props.py と tools/make_archer_unarmed.py を回しておく。"""
import json, os, re, glob
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load_meta(fn):
    s = open(os.path.join(ROOT, fn)).read(); m = re.search(r'=\s*(\{.*\})\s*;?', s, re.S)
    txt = m.group(1)
    # frames.js は window.FRAME_META = {...}; の形、他は var X={...};
    dec = json.JSONDecoder(); return dec.raw_decode(txt)[0]
FM = {}
for fn in ['assets/frames/frames.js', 'assets/frames/frames_fr.js', 'assets/frames/frames_omiya.js', 'assets/frames/frames_us.js']:
    for g, v in load_meta(fn).items(): FM.setdefault(g, {}).update(v)
ARCH = json.load(open('/tmp/arch_meta.json'))
for g, v in ARCH.items(): FM.setdefault(g, {}).update(v)
for p in sorted(glob.glob(os.path.join(ROOT, 'assets/mob[0-9][0-9].png'))):
    g = os.path.basename(p)[:-4]; FM.setdefault(g, {}).setdefault('front', {'file': 'assets/' + g + '.png', 'dir': 0})
VIEWS = ['front', 'back', 'walk', 'front_diag', 'back_diag', 'side']
def hands(fn, view, d):
    a = np.array(Image.open(os.path.join(ROOT, fn)).convert('RGBA'))[:, :, 3] > 80
    H, W = a.shape; ys = np.nonzero(a.any(1))[0]; top, bot = ys.min(), ys.max(); fh = bot - top
    r0, r1 = int(top + fh * 0.44), int(top + fh * 0.58)
    best = None
    if view == 'side':   # 横向き：腰の高さの胴の中ほど、少し前
        row = a[int(top + fh * 0.52)]; xs = np.nonzero(row)[0]; cx = (xs.min() + xs.max()) / 2 + (d or 0) * (xs.max() - xs.min()) * 0.15
        v = (top + fh * 0.52) / H; return [round(cx / W, 4), round(v, 4)] * 2
    L = (W, 0); R = (-1, 0)
    for y in range(r0, r1):
        xs = np.nonzero(a[y])[0]
        if not len(xs): continue
        if xs.min() < L[0]: L = (xs.min(), y)
        if xs.max() > R[0]: R = (xs.max(), y)
    pad = W * 0.015
    return [round((L[0] + pad) / W, 4), round((L[1] + fh * 0.015) / H, 4), round((R[0] - pad) / W, 4), round((R[1] + fh * 0.015) / H, 4)]
HM = {}
for g, vs in FM.items():
    for v in VIEWS:
        m = vs.get(v)
        if not m or 'file' not in m or not os.path.exists(os.path.join(ROOT, m['file'])): continue
        try: HM.setdefault(g, {})[v] = hands(m['file'], v, m.get('dir', 0))
        except Exception as ex: print('skip', g, v, ex)
PM = json.load(open('/tmp/prop_meta.json'))
PM['rifle']['grip'] = 0.27; PM['musket']['grip'] = 0.29; PM['colt']['gx'] = 0.78; PM['colt']['grip'] = 0.18
out = '// 手に持つ武器（tools/make_props.py / make_archer_unarmed.py / make_frames_props.py）\n'
out += 'window.PROP_META=' + json.dumps(PM, separators=(',', ':')) + ';\n'
out += 'window.HAND_META=' + json.dumps(HM, separators=(',', ':')) + ';\n'
out += '(function(){var X=' + json.dumps(ARCH, separators=(',', ':')) + ';var F=window.FRAME_META=window.FRAME_META||{};for(var k in X){F[k]=F[k]||{};for(var v in X[k])F[k][v]=X[k][v];}window.ARCH_UNARMED=Object.keys(X);})();\n'
open(os.path.join(ROOT, 'assets/frames/frames_props.js'), 'w').write(out)
print(len(HM), 'girls with hands', os.path.getsize(os.path.join(ROOT, 'assets/frames/frames_props.js')))
