#!/usr/bin/env python3
"""弓を持たない archer01〜10（同じ顔・髪・体・標準の装い）。assets/archer_un/archerNN_sheet.jpg（正面・斜め前・横・後ろ・歩き）
を rembg で切り抜いて assets/frames/archerNN_u_<view>.png に分け、倒れた写真（archerNN_down.png）からは弓を外す
（いちばん大きいまとまりだけ残す）。メタは /tmp/arch_meta.json（make_frames_props.py が frames_props.js へ書く）。"""
import json, os
import numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(ROOT, 'assets/frames'); SH = os.path.join(ROOT, 'assets/archer_un')
sess = new_session('u2net')
VIEWS = ['front', 'front_diag', 'side', 'back', 'walk']
def feet_ax(a):
    h = a.shape[0]; rows = a[int(h * 0.9):] > 80; xs = np.nonzero(rows.any(0))[0]
    return (xs.min() + xs.max()) / 2 / a.shape[1] if len(xs) else 0.5
def facing(a):   # 横顔：つま先の出ている方（下端 4% の重心がふくらはぎより前）
    h = a.shape[0]
    def cx(r0, r1):
        m = a[int(h * r0):int(h * r1)] > 80; ys, xs = np.nonzero(m); return xs.mean() if len(xs) else 0
    return 1 if cx(0.965, 1.0) > cx(0.80, 0.86) else -1
meta = {}
for n in range(1, 11):
    gid = f'archer{n:02d}'; im = Image.open(os.path.join(SH, f'{gid}_sheet.jpg')).convert('RGB')
    W = im.width; out = np.array(remove(im, session=sess).convert('RGBA')); a = out[:, :, 3]
    a[a < 24] = 0
    lab, k = ndimage.label(a > 60); sizes = ndimage.sum(np.ones_like(lab), lab, range(1, k + 1))
    big = [i + 1 for i, s in enumerate(sizes) if s > 3000]
    boxes = sorted([ndimage.find_objects((lab == i).astype(int))[0] for i in big], key=lambda b: b[1].start)
    if len(boxes) != 5:   # くっついたときは五等分
        print(gid, 'components', len(boxes), '-> equal split'); boxes = [(slice(0, im.height), slice(W * i // 5, W * (i + 1) // 5)) for i in range(5)]
        keep = np.ones_like(a, bool)
    else:
        keep = np.isin(lab, big) | (a > 0) & (ndimage.binary_dilation(np.isin(lab, big), iterations=3))
    m = {}
    for v, (sy, sx) in zip(VIEWS, boxes):
        sub = out[sy, sx].copy(); sub[:, :, 3] = np.where(keep[sy, sx], sub[:, :, 3], 0)
        al = sub[:, :, 3]; ys = np.nonzero((al > 40).any(1))[0]; xs = np.nonzero((al > 40).any(0))[0]
        sub = sub[ys.min():ys.max() + 1, max(0, xs.min() - 2):xs.max() + 3]
        fn = f'assets/frames/{gid}_u_{v}.png'; Image.fromarray(sub).save(os.path.join(ROOT, fn), optimize=True)
        h, w = sub.shape[:2]; d = 0
        if v in ('side', 'front_diag', 'walk'): d = facing(sub[:, :, 3])
        if v == 'walk': d = 0
        m[v] = {'hk': 1.02, 'aspect': round(w / h, 4), 'ax': round(feet_ax(sub[:, :, 3]), 4), 'dir': d, 'file': fn}
    if m['front_diag']['dir'] != m['side']['dir']: m['front_diag']['dir'] = m['side']['dir']
    # 倒れた写真から弓を外す
    dn = np.array(Image.open(os.path.join(FR, f'{gid}_down.png')).convert('RGBA')); da = dn[:, :, 3]
    lab2, k2 = ndimage.label(da > 70)
    if k2:
        # 弓は細い：太い所だけ残す開きで体を取り出し、少し戻す（手に触れている弓も外れる）
        disk = np.hypot(*np.mgrid[-6:7, -6:7]) <= 6
        op = ndimage.binary_opening(da > 70, structure=disk)
        lab3, k3 = ndimage.label(op); sz = ndimage.sum(np.ones_like(lab3), lab3, range(1, k3 + 1))
        core = np.isin(lab3, [i + 1 for i, v in enumerate(sz) if v >= sz.max()])
        body = ndimage.binary_dilation(core, iterations=7) & (da > 0)
        lb, kb = ndimage.label(body); sb = ndimage.sum(np.ones_like(lb), lb, range(1, kb + 1)); body = lb == (int(np.argmax(sb)) + 1)
        dn[:, :, 3] = np.where(body, da, 0)
    al = dn[:, :, 3]; ys = np.nonzero((al > 40).any(1))[0]; xs = np.nonzero((al > 40).any(0))[0]
    dn = dn[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; h, w = dn.shape[:2]
    fn = f'assets/frames/{gid}_u_down.png'; Image.fromarray(dn).save(os.path.join(ROOT, fn), optimize=True)
    m['down'] = {'hk': round((h / w) * 1.05, 4), 'aspect': round(w / h, 4), 'ax': 0.5, 'dir': -1, 'file': fn}
    meta[gid] = m; print(gid, {v: (m[v]['dir'], m[v]['aspect']) for v in m})
json.dump(meta, open('/tmp/arch_meta.json', 'w'), indent=0)
