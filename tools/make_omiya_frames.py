#!/usr/bin/env python3
"""大宮の写真を rembg で切り抜き、assets/frames/omiya_*.png と frames_omiya.js を作る。
実行: /workspace/.venv_rembg/bin/python tools/make_omiya_frames.py
side は元が左向きなので左右反転して右向きに揃える。"""
import json, os, io
import numpy as np
from PIL import Image, ImageOps
from rembg import remove, new_session
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/omiya'); OUT = os.path.join(ROOT, 'assets/frames')
VIEWS = ['front', 'front_diag', 'side', 'back', 'down']
sess = new_session('u2net')
def cut(v):
    im = Image.open(os.path.join(SRC, f'omiya_{v}.jpg')).convert('RGB')
    if v == 'side': im = ImageOps.mirror(im)
    o = remove(im, session=sess).convert('RGBA')
    a = np.array(o)[:, :, 3]; a[a < 24] = 0
    arr = np.array(o); arr[:, :, 3] = a; o = Image.fromarray(arr)
    ys, xs = np.nonzero(a > 40); pad = 4
    return o.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(o.width, xs.max() + pad + 1), min(o.height, ys.max() + pad + 1)))
def feet_ax(im):
    a = np.array(im.split()[-1]); h, w = a.shape; xs = np.nonzero(a[int(h * 0.86):, :] > 40)[1]
    return float(np.median(xs) / w) if xs.size > 4 else 0.5
cuts = {v: cut(v) for v in VIEWS}; fh = cuts['front'].size[1]; meta = {}
for v, im in cuts.items():
    if v not in ('front', 'down'): im = im.resize((max(8, round(im.size[0] * fh / im.size[1])), fh), Image.Resampling.LANCZOS)
    fn = f'omiya_{v}.png'; im.save(os.path.join(OUT, fn)); w, h = im.size
    m = {'hk': round((h / w) * 1.05, 4), 'aspect': round(w / h, 4), 'ax': 0.5, 'dir': -1} if v == 'down' else {'hk': 1.02, 'aspect': round(w / h, 4), 'ax': round(feet_ax(im), 4), 'dir': 0 if v in ('front', 'back') else 1}
    m['file'] = 'assets/frames/' + fn; meta[v] = m; print(v, im.size, m)
js = '// 大宮の見え方（tools/make_omiya_frames.py）\n(function(){var X=' + json.dumps({'omiya': meta}) + ';window.FRAME_META=window.FRAME_META||{};for(var k in X)window.FRAME_META[k]=X[k];})();\n'
open(os.path.join(OUT, 'frames_omiya.js'), 'w').write(js)
