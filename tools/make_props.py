#!/usr/bin/env python3
"""手に持つ武器の写真（assets/props_src/*.jpg）を rembg で切り抜き、一枚のアトラス assets/frames/props.webp と
PROP_META（frames_props.js）を作る。どの娘の手にも添えられるように、長い物は縦（先が上）にそろえる。
実行: /workspace/.venv_rembg/bin/python tools/make_props.py"""
import json, os
import numpy as np
from PIL import Image
from rembg import remove, new_session
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/props_src'); OUT = os.path.join(ROOT, 'assets/frames')
sess = new_session('u2net')
def cut(fn):
    im = Image.open(os.path.join(SRC, fn)).convert('RGB')
    o = np.array(remove(im, session=sess, alpha_matting=False).convert('RGBA'))
    a = o[:, :, 3]; a[a < 30] = 0; o[:, :, 3] = a
    return o
def comps(o, axis):   # 透明な隙間で分ける（axis=1: 横に並ぶ、0: 縦に並ぶ）
    a = o[:, :, 3] > 40; prof = a.any(axis=0 if axis == 1 else 1); out = []; s = None
    for i, v in enumerate(list(prof) + [False]):
        if v and s is None: s = i
        if not v and s is not None:
            if i - s > 6: out.append((s, i))
            s = None
    res = []
    for s, e in out:
        sub = o[:, s:e] if axis == 1 else o[s:e, :]
        aa = sub[:, :, 3] > 40; ys = np.nonzero(aa.any(1))[0]; xs = np.nonzero(aa.any(0))[0]
        res.append(sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    return res
def tight(o):
    aa = o[:, :, 3] > 40; ys = np.nonzero(aa.any(1))[0]; xs = np.nonzero(aa.any(0))[0]
    return o[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
P = {}
P['yumi'] = tight(cut('yumi.jpg'))
P['naginata'] = tight(cut('naginata.jpg'))
P['yari'] = tight(cut('yari.jpg'))
qk = comps(cut('quiver_kaiken.jpg'), 1); qk.sort(key=lambda x: -x.shape[0] * x.shape[1])
P['quiver'], P['kaiken'] = qk[0], qk[1]
g = comps(cut('guns.jpg'), 0); g.sort(key=lambda x: -x.shape[1])
P['rifle'] = np.rot90(g[0]); P['colt'] = np.rot90(g[1])   # 銃口を上に
P['musket'] = np.rot90(tight(cut('springfield.jpg')))
# 実寸（m）と握る位置（下からの割合）。弓は籐巻きの所、長柄は中ほど、銃は台尻が下
SPEC = {'yumi': (2.05, 0.40), 'naginata': (2.05, 0.40), 'yari': (2.5, 0.36), 'quiver': (0.85, 0.55), 'kaiken': (0.30, 0.20),
        'rifle': (0.98, 0.33), 'musket': (1.30, 0.30), 'colt': (0.30, 0.16)}
H = 1000; ims = {}
for k, o in P.items():
    im = Image.fromarray(np.ascontiguousarray(o)); hh = H if SPEC[k][0] > 0.5 else (540 if k == 'quiver' else 400)
    if k == 'quiver': hh = 760
    ims[k] = im.resize((max(4, round(im.width * hh / im.height)), hh), Image.Resampling.LANCZOS)
W = 1024; atlas = Image.new('RGBA', (W, 1024), (0, 0, 0, 0)); x = 2; y = 2; rowH = 0; meta = {}
for k in ['yumi', 'naginata', 'yari', 'rifle', 'musket', 'quiver', 'kaiken', 'colt']:
    im = ims[k]
    if x + im.width + 2 > W: x = 2; y += rowH + 4; rowH = 0
    atlas.paste(im, (x, y)); L, gp = SPEC[k]
    meta[k] = {'u': round(x / W, 5), 'v': round(1 - (y + im.height) / 1024, 5), 'uw': round(im.width / W, 5), 'vh': round(im.height / 1024, 5), 'len': L, 'w': round(L * im.width / im.height, 4), 'grip': gp}
    x += im.width + 4; rowH = max(rowH, im.height)
    print(k, im.size, meta[k])
# 縦が足りなければ二段目へ置いたものがはみ出していないか
assert y + rowH <= 1024, (y, rowH)
atlas.save(os.path.join(OUT, 'props.webp'), 'WEBP', quality=88, method=6)
json.dump(meta, open('/tmp/prop_meta.json', 'w'))
print('atlas', os.path.getsize(os.path.join(OUT, 'props.webp')))
