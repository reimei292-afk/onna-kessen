#!/usr/bin/env python3
"""フランス候補写真をビルボード用透過 PNG にする。

白い床だまりは捨てる。横向きで胴の外に出る白いキャミソールとティアラは残す。
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

SRC = '/workspace/kessen/assets/fr_candidates'
OUT = '/workspace/kessen/assets/frames'
VIEWS = ['front', 'front_diag', 'side', 'back', 'down']


def src_path(gid, view):
    return os.path.join(SRC, f'{gid}.jpg' if view == 'front' else f'{gid}_{view}.jpg')


def dilate_dist(seed, maxd):
    dist = np.full(seed.shape, 255, np.uint8)
    dist[seed] = 0
    cur = seed
    for d in range(1, maxd + 1):
        nxt = np.asarray(Image.fromarray((cur.astype(np.uint8) * 255), 'L').filter(ImageFilter.MaxFilter(3))) > 127
        fresh = nxt & (dist == 255)
        if not fresh.any():
            break
        dist[fresh] = d
        cur = nxt
    return dist


def bright_components(mask):
    h, w = mask.shape
    seen = np.zeros((h, w), np.uint8)
    ys, xs = np.nonzero(mask)
    comps = []
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        q = deque([(y, x)])
        seen[y, x] = 1
        cells = [(y, x)]
        while q:
            cy, cx = q.pop()
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if ny < 0 or nx < 0 or ny >= h or nx >= w or seen[ny, nx] or not mask[ny, nx]:
                    continue
                seen[ny, nx] = 1
                q.append((ny, nx))
                cells.append((ny, nx))
        comps.append(cells)
    return comps


def fill_gaps(mask, allow, max_gap, y0, y1):
    out = mask.copy()
    h, w = mask.shape
    y0 = max(0, y0)
    y1 = min(h, y1)
    for y in range(y0, y1):
        xs = np.nonzero(mask[y])[0]
        if xs.size < 2:
            continue
        for i in range(int(xs.size) - 1):
            a, b = int(xs[i]), int(xs[i + 1])
            if 0 < b - a - 1 <= max_gap and allow[y, a + 1:b].all():
                out[y, a + 1:b] = True
    for x in range(w):
        ys = np.nonzero(out[y0:y1, x])[0]
        if ys.size < 2:
            continue
        for i in range(int(ys.size) - 1):
            a, b = int(ys[i]), int(ys[i + 1])
            if 0 < b - a - 1 <= max_gap and allow[y0 + a + 1:y0 + b, x].all():
                out[y0 + a + 1:y0 + b, x] = True
    return out


def bleed(rgb, mask, times):
    color = rgb.astype(np.uint8).copy()
    m = mask.copy()
    h, w = m.shape
    for _ in range(times):
        acc = np.zeros((h, w, 3), np.float32)
        cnt = np.zeros((h, w), np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sm = np.roll(np.roll(m, dy, 0), dx, 1)
            sc = np.roll(np.roll(color, dy, 0), dx, 1)
            if dy > 0:
                sm[:dy] = False
            elif dy < 0:
                sm[dy:] = False
            if dx > 0:
                sm[:, :dx] = False
            elif dx < 0:
                sm[:, dx:] = False
            acc += sc * sm[:, :, None]
            cnt += sm
        add = (cnt > 0) & ~m
        if not add.any():
            break
        color[add] = (acc[add] / cnt[add, None]).astype(np.uint8)
        m |= add
    return color, m


def cutout(path):
    rgb = np.asarray(Image.open(path).convert('RGB'))
    arr = rgb.astype(np.int16)
    h, w = arr.shape[:2]
    lum = arr.mean(axis=2)
    chroma = arr.max(axis=2) - arr.min(axis=2)
    # 背景のグレー（端が少し暗い）は入れない。肌・髪・黒服・靴だけ。
    seed = (chroma > 16) | (lum < 108)
    seed[:2, :] = False
    seed[-2:, :] = False
    seed[:, :2] = False
    seed[:, -2:] = False
    if int(seed.sum()) < 80:
        seed = (chroma > 12) | (lum < 130)
    ys = np.nonzero(seed.any(axis=1))[0]
    xs = np.nonzero(seed.any(axis=0))[0]
    if ys.size < 4:
        return Image.fromarray(np.dstack([rgb, np.full((h, w), 255, np.uint8)]), 'RGBA')
    head, feet = int(ys.min()), int(ys.max())
    lying = (int(xs.max()) - int(xs.min())) > (feet - head) * 1.6
    dist = dilate_dist(seed, 74)
    waist = head + int((feet - head) * 0.56)
    bright = (lum >= 222) & (chroma <= 20)
    keep_b = np.zeros((h, w), np.bool_)
    for cells in bright_components(bright):
        n = len(cells)
        if n < 6 or n > 9000:
            continue
        cys = [c[0] for c in cells]
        cxs = [c[1] for c in cells]
        if (max(cxs) - min(cxs)) > 280 or (max(cys) - min(cys)) > 380:
            continue
        cy = sum(cys) / n
        step = max(1, n // 30)
        mind = min(int(dist[cys[i], cxs[i]]) for i in range(0, n, step))
        if lying:
            if mind > 26 or cy > feet - 4:
                continue
        elif cy > feet - 10 or cy > waist or mind > 72:
            continue
        for cy_, cx_ in cells:
            keep_b[cy_, cx_] = True
    mask = seed | keep_b
    fill_to = feet if lying else waist
    # 輪郭の内側（腕と腕のあいだのキャミ）を埋める。広い隙間は脇や床なので渡さない。
    for y in range(max(0, head - 2), fill_to):
        cols = np.nonzero(mask[y])[0]
        if cols.size < 2:
            continue
        spans = []
        s = prev = int(cols[0])
        for x in cols[1:]:
            x = int(x)
            if x - prev > (36 if lying else 48):
                spans.append((s, prev))
                s = x
            prev = x
        spans.append((s, prev))
        for a, b in spans:
            if b - a >= 8:
                mask[y, a:b + 1] = True
    lace = (lum > 188) | (chroma > 14) | (lum < 150)
    cloth = (lum < 160) | (chroma > 16)
    mask = fill_gaps(mask, lace, 6, max(0, head - 6), fill_to)
    if not lying:
        mask = fill_gaps(mask, cloth, 3, waist, min(h, feet + 2))
        mask[max(0, feet - 12):, :] = seed[max(0, feet - 12):, :]
    else:
        bottom = np.full(w, -1, np.int32)
        for x in range(w):
            col = np.nonzero(seed[:, x])[0]
            if col.size:
                bottom[x] = int(col[-1])
        floorish = (chroma < 22) & (lum > 165) & ~seed
        for x in range(w):
            if bottom[x] < 0:
                continue
            yb = int(bottom[x]) + 3
            if yb < h:
                mask[yb:, x] &= ~floorish[yb:, x]
    # 細い抜け（レースの影）を閉じる
    sub0, sub1 = max(0, head - 2), min(h, fill_to)
    if sub1 - sub0 > 8:
        closed = np.asarray(Image.fromarray((mask[sub0:sub1].astype(np.uint8) * 255), 'L').filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))) > 127
        mask[sub0:sub1] |= closed
    color, mask = bleed(rgb, mask, 2)
    aa = mask.astype(np.uint8) * 255
    cols = mask.sum(axis=0)
    rows = mask.sum(axis=1)
    xs2 = np.nonzero(cols > 2)[0]
    ys2 = np.nonzero(rows > 2)[0]
    if xs2.size < 4 or ys2.size < 4:
        return Image.fromarray(np.dstack([color, aa]), 'RGBA')
    pad = 4
    x0, x1 = max(0, int(xs2[0]) - pad), min(w, int(xs2[-1]) + pad + 1)
    y0, y1 = max(0, int(ys2[0]) - pad), min(h, int(ys2[-1]) + pad + 1)
    return Image.fromarray(np.dstack([color, aa]), 'RGBA').crop((x0, y0, x1, y1))


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
        hk = (h / w) * 1.05
        ax = 0.5
        d = -1
    else:
        hk = 1.02 * (h / front_h)
        ax = feet_ax(im)
        d = 0 if view in ('front', 'back') else 1
    return {'hk': round(hk, 4), 'aspect': round(aspect, 4), 'ax': round(ax, 4), 'dir': d}


def main():
    only = sys.argv[1:]
    girls = {}
    ids = only or [f'fr{i:02d}' for i in range(1, 11)]
    for gid in ids:
        cuts = {}
        for v in VIEWS:
            im = cutout(src_path(gid, v))
            cuts[v] = im
        front_h = cuts['front'].size[1]
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
            print(f'{gid} {v:12} {im.size[0]:4}x{im.size[1]:<4} hk {m["hk"]:.3f} ax {m["ax"]:.3f} aspect {m["aspect"]:.3f}', flush=True)
    if only:
        return
    js = '// フランス人形の見え方（tools/make_fr_frames.py）\n'
    js += '(function(){var X=' + json.dumps(girls, ensure_ascii=False) + ';'
    js += 'window.FRAME_META=window.FRAME_META||{};for(var k in X)window.FRAME_META[k]=X[k];})();\n'
    with open(os.path.join(OUT, 'frames_fr.js'), 'w') as f:
        f.write(js)
    cell_w, cell_h = 180, 340
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
            y = (i - 1) * cell_h + cell_h - im.size[1] - 6
            sheet.paste(bg.convert('RGB'), (x, y))
    os.makedirs('/workspace/screenshots', exist_ok=True)
    sheet.save('/workspace/screenshots/fr_sheet.jpg', quality=85)
    print('sheet', sheet.size)


if __name__ == '__main__':
    main()
