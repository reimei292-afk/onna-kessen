#!/usr/bin/env python3
"""フランス候補写真をビルボード用透過 PNG にする。白い床だまりは消す。白いキャミソールは残す。"""
import os
from PIL import Image, ImageFilter
import numpy as np

SRC = '/workspace/kessen/assets/fr_candidates'
OUT = '/workspace/kessen/assets/frames'
VIEWS = ['front', 'front_diag', 'side', 'back', 'down']


def src_path(gid, view):
    return os.path.join(SRC, f'{gid}.jpg' if view == 'front' else f'{gid}_{view}.jpg')


def kill_floor(im):
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    a = arr[:, :, 3]
    lum = rgb.mean(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    # 髪・ベルト・ズボン・靴、それに肌や色のある髪。白い床は無彩色で、この範囲の外に広がる。
    struct = (a > 70) & (
        ((lum < 118) & (chroma < 90))
        | ((chroma > 26) & (lum < 235))
        | (lum < 55)
    )
    if not struct.any():
        return im
    h, w = a.shape
    ys, xs = np.nonzero(struct)
    feet = int(ys.max())
    keep = np.zeros((h, w), np.bool_)
    spans = [None] * h
    for y in range(h):
        row = np.nonzero(struct[y])[0]
        if row.size < 2:
            continue
        x0, x1 = int(row[0]), int(row[-1])
        if x1 - x0 > w * 0.72:
            # 端のゴミで横に伸びた行は、密度の高い塊だけ残す
            dense = np.nonzero(struct[y])[0]
            if dense.size < 8:
                continue
            mid = int(np.median(dense))
            near = dense[np.abs(dense - mid) < 180]
            if near.size < 2:
                continue
            x0, x1 = int(near[0]), int(near[-1])
        pad = 5
        a0, a1 = max(0, x0 - pad), min(w, x1 + pad + 1)
        keep[y, a0:a1] = True
        spans[y] = (a0, a1 - 1)
    last = None
    for y in range(h):
        if spans[y]:
            last = spans[y]
        elif last and y < feet:
            keep[y, last[0]:last[1] + 1] = True
    first = next((i for i, s in enumerate(spans) if s), None)
    if first is not None:
        for y in range(max(0, first - 18), first):
            keep[y, spans[first][0]:spans[first][1] + 1] = True
    floor = (a > 6) & (chroma < 18) & (lum > 124) & ~keep
    yf = max(0, feet - 3)
    floor[yf:, :] |= (a[yf:] > 6) & (chroma[yf:] < 38) & (lum[yf:] > 142)
    arr[:, :, 3][floor] = 0
    aa = arr[:, :, 3]
    aa[aa < 100] = 0
    # 端の薄いゴミで幅が膨らまないよう、しっかり残っている列・行だけ残す
    solid = aa > 140
    cols = solid.sum(axis=0)
    rows = solid.sum(axis=1)
    xs = np.nonzero(cols > 6)[0]
    ys = np.nonzero(rows > 6)[0]
    if xs.size < 4 or ys.size < 4:
        return Image.fromarray(arr, 'RGBA')
    pad = 2
    h, w = aa.shape
    x0, x1 = max(0, int(xs[0]) - pad), min(w, int(xs[-1]) + pad + 1)
    y0, y1 = max(0, int(ys[0]) - pad), min(h, int(ys[-1]) + pad + 1)
    return Image.fromarray(arr, 'RGBA').crop((x0, y0, x1, y1))


def cutout(path):
    rgb = np.asarray(Image.open(path).convert('RGB'))
    arr = rgb.astype(np.int16)
    h, w = arr.shape[:2]
    samples = np.concatenate([
        arr[:10, :].reshape(-1, 3),
        arr[:90, :20].reshape(-1, 3),
        arr[:90, -20:].reshape(-1, 3),
        arr[-8:, :70].reshape(-1, 3),
        arr[-8:, -70:].reshape(-1, 3),
    ], 0)
    sl = samples.mean(1)
    samples = samples[(sl > 70) & (sl < 250)]
    bg = np.median(samples, 0) if len(samples) else np.array([180, 180, 180])
    d = np.max(np.abs(arr - bg), axis=2).astype(np.float32)
    alpha = np.clip((d - 12.0) * (255.0 / 32.0), 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    return kill_floor(Image.fromarray(rgba, 'RGBA'))


def feet_ax(im):
    a = np.array(im.split()[-1])
    h, w = a.shape
    band = a[int(h * 0.86):, :]
    xs = np.nonzero(band > 40)[1]
    if xs.size < 4:
        xs = np.nonzero(a > 40)[1]
    if xs.size < 4:
        return 0.5
    return float(np.median(xs) / w)


def meta_of(im, view, front_h):
    w, h = im.size
    aspect = w / h
    if view == 'down':
        # 横たわった長さ ≒ 身長。板の高さは厚み。
        hk = (h / w) * 1.05
        ax = 0.5
        d = -1
    else:
        hk = 1.02 * (h / front_h)
        ax = feet_ax(im)
        d = 0 if view in ('front', 'back') else 1
    return {'hk': round(hk, 4), 'aspect': round(aspect, 4), 'ax': round(ax, 4), 'dir': d}


def main():
    girls = {}
    for i in range(1, 11):
        gid = f'fr{i:02d}'
        cuts = {}
        for v in VIEWS:
            im = cutout(src_path(gid, v))
            cuts[v] = im
        front_h = cuts['front'].size[1]
        # 立ち絵は正面の身丈に揃える（視点で大きさが暴れない）
        girls[gid] = {}
        for v, im in cuts.items():
            if v != 'down' and v != 'front':
                nh = front_h
                nw = max(8, int(round(im.size[0] * nh / im.size[1])))
                im = im.resize((nw, nh), Image.Resampling.LANCZOS)
            fn = f'{gid}_{v}.png'
            im.save(os.path.join(OUT, fn))
            m = meta_of(im, v, front_h)
            m['file'] = 'assets/frames/' + fn
            girls[gid][v] = m
            print(f'{gid} {v:12} {im.size[0]:4}x{im.size[1]:<4} hk {m["hk"]:.3f} ax {m["ax"]:.3f} aspect {m["aspect"]:.3f}')
    # frames_fr.js
    import json
    js = '// フランス人形の見え方（tools/make_fr_frames.py）\n'
    js += '(function(){var X=' + json.dumps(girls, ensure_ascii=False) + ';'
    js += 'window.FRAME_META=window.FRAME_META||{};for(var k in X)window.FRAME_META[k]=X[k];})();\n'
    with open(os.path.join(OUT, 'frames_fr.js'), 'w') as f:
        f.write(js)
    # 確認用の一覧（暗背景。白い床が残っていれば目立つ）
    cell_w, cell_h = 180, 320
    sheet = Image.new('RGB', (cell_w * 5, cell_h * 10), (28, 32, 38))
    for i in range(1, 11):
        gid = f'fr{i:02d}'
        for j, v in enumerate(VIEWS):
            im = Image.open(os.path.join(OUT, f'{gid}_{v}.png')).convert('RGBA')
            sc = min((cell_w - 8) / im.size[0], (cell_h - 8) / im.size[1])
            im = im.resize((max(1, int(im.size[0] * sc)), max(1, int(im.size[1] * sc))), Image.Resampling.LANCZOS)
            bg = Image.new('RGBA', im.size, (28, 32, 38, 255))
            bg.alpha_composite(im)
            x = j * cell_w + (cell_w - im.size[0]) // 2
            y = i * cell_h - 8 - im.size[1] if False else (i - 1) * cell_h + cell_h - im.size[1] - 6
            sheet.paste(bg.convert('RGB'), (x, y))
    os.makedirs('/workspace/screenshots', exist_ok=True)
    sheet.save('/workspace/screenshots/fr_sheet.jpg', quality=85)
    print('sheet', sheet.size)


if __name__ == '__main__':
    main()
