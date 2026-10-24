#!/usr/bin/env python3
"""アメリカ西部編の候補写真（assets/us_candidates）を rembg で透過 PNG にする。

使い方: /workspace/.venv_rembg/bin/python tools/make_us_frames.py [us01 ...]
出力: assets/frames/usNN_{front,front_diag,side,back,down,shoot}.png と frames_us.js
us08 / us20 は不採用なので既定の対象に入れない。
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/us_candidates')
OUT = os.path.join(ROOT, 'assets/frames')
VIEWS = ['front', 'front_diag', 'side', 'back', 'down', 'shoot']
IDS = [f'us{i:02d}' for i in range(1, 20) if i != 8]
SESSION = None


def src_path(gid, view):
    return os.path.join(SRC, f'{gid}.jpg' if view == 'front' else f'{gid}_{view}.jpg')


def largest_blob(mask):
    # 主たる人物の塊だけ残す（床の影や小さなゴミを捨てる）
    from scipy import ndimage
    lab, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    big = sizes.max()
    keep = [i + 1 for i, s in enumerate(sizes) if s >= big * 0.04]
    return np.isin(lab, keep)


def cutout(path, view):
    im = Image.open(path).convert('RGB')
    rgba = remove(im, session=SESSION, post_process_mask=True)
    a = np.asarray(rgba.split()[-1]).astype(np.uint8)
    rgb = np.asarray(im)
    mask = a > 110
    mask = largest_blob(mask)
    if view == 'down':
        # 床の白っぽい溜まりを体の下から削る
        lum = rgb.mean(axis=2)
        chroma = rgb.max(axis=2).astype(int) - rgb.min(axis=2)
        floorish = (chroma < 14) & (lum > 175) & (lum < 236)
        ys = np.nonzero(mask.any(axis=1))[0]
        if ys.size:
            low = int(ys.min() + (ys.max() - ys.min()) * 0.8)
            mask[low:] &= ~floorish[low:]
    alpha = np.where(mask, np.maximum(a, 200), 0).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.6)))
    out = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
    ys = np.nonzero((alpha > 20).sum(axis=1) > 2)[0]
    xs = np.nonzero((alpha > 20).sum(axis=0) > 2)[0]
    if ys.size < 4:
        return out
    pad = 4
    h, w = alpha.shape
    return out.crop((max(0, int(xs[0]) - pad), max(0, int(ys[0]) - pad), min(w, int(xs[-1]) + pad + 1), min(h, int(ys[-1]) + pad + 1)))


def feet_ax(im):
    a = np.array(im.split()[-1])
    h, w = a.shape
    xs = np.nonzero(a[int(h * 0.86):, :] > 40)[1]
    if xs.size < 4:
        xs = np.nonzero(a > 40)[1]
    return 0.5 if xs.size < 4 else float(np.median(xs) / w)


def meta_of(im, view, front_h):
    w, h = im.size
    if view == 'down':
        return {'hk': round((h / w) * 1.05, 4), 'aspect': round(w / h, 4), 'ax': 0.5, 'dir': -1}
    return {'hk': round(1.02 * (h / front_h), 4), 'aspect': round(w / h, 4), 'ax': round(feet_ax(im), 4),
            'dir': 0 if view in ('front', 'back') else 1}


def main():
    global SESSION
    SESSION = new_session('u2net')
    only = sys.argv[1:]
    ids = only or IDS
    path_js = os.path.join(OUT, 'frames_us.js')
    girls = {}
    for gid in ids:
        cuts = {v: cutout(src_path(gid, v), v) for v in VIEWS}
        front_h = cuts['front'].size[1]
        girls[gid] = {}
        for v, im in cuts.items():
            if v not in ('down', 'front', 'shoot'):
                im = im.resize((max(8, int(round(im.size[0] * front_h / im.size[1]))), front_h), Image.Resampling.LANCZOS)
            fn = f'{gid}_{v}.png'
            im.save(os.path.join(OUT, fn), optimize=True)
            m = meta_of(im, v, front_h)
            m['file'] = 'assets/frames/' + fn
            girls[gid][v] = m
            print(gid, v, im.size, m['hk'], m['ax'], flush=True)
    if only:
        return
    js = '// アメリカ西部編の見え方（tools/make_us_frames.py）\n'
    js += '(function(){var X=' + json.dumps(girls, ensure_ascii=False) + ';'
    js += 'window.FRAME_META=window.FRAME_META||{};for(var k in X)window.FRAME_META[k]=X[k];})();\n'
    open(path_js, 'w').write(js)
    cw, ch = 150, 300
    sheet = Image.new('RGB', (cw * 6, ch * len(ids)), (28, 32, 38))
    for i, gid in enumerate(ids):
        for j, v in enumerate(VIEWS):
            im = Image.open(os.path.join(OUT, f'{gid}_{v}.png')).convert('RGBA')
            sc = min((cw - 8) / im.size[0], (ch - 8) / im.size[1])
            im = im.resize((max(1, int(im.size[0] * sc)), max(1, int(im.size[1] * sc))))
            bg = Image.new('RGBA', im.size, (28, 32, 38, 255)); bg.alpha_composite(im)
            sheet.paste(bg.convert('RGB'), (j * cw + (cw - im.size[0]) // 2, i * ch + ch - im.size[1] - 6))
    sheet.save('/workspace/us_frames_sheet.jpg', quality=80)
    print('sheet', sheet.size)


if __name__ == '__main__':
    main()
