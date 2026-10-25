#!/usr/bin/env python3
"""骨格診断のタイプ（S＝ストレート / W＝ウェーブ / N＝ナチュラル）を、今の正面写真の輪郭から中立に割り振る。
 肩幅÷身長の大きい娘から三分の一を N（骨格がしっかり・肩幅広め）、残りのうち 腰回り÷肩幅 の大きい方を W（重心が低め）、
 残りを S（上半身に厚み・腰の位置が高め）。写真は変えない。結果は game.js の KOKKAKU へ貼る。"""
import json, os, re, glob
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FM = {}
for fn in ['frames.js', 'frames_fr.js', 'frames_omiya.js', 'frames_us.js', 'frames_props.js']:
    s = open(os.path.join(ROOT, 'assets/frames', fn)).read()
    m = re.search(r'(?:var X=|FRAME_META\s*=)\s*', s); s = s[m.end():]
    for g, v in json.JSONDecoder().raw_decode(s)[0].items(): FM.setdefault(g, {}).update(v)
for p in sorted(glob.glob(os.path.join(ROOT, 'assets/mob[0-9][0-9].png'))):
    g = os.path.basename(p)[:-4]; FM.setdefault(g, {}).setdefault('front', {'file': 'assets/' + g + '.png'})
def width(a, r0, r1):
    H = a.shape[0]; ys = np.nonzero(a.any(1))[0]; t, b = ys.min(), ys.max(); fh = b - t; w = []
    for y in range(int(t + fh * r0), int(t + fh * r1)):
        xs = np.nonzero(a[y])[0]
        if len(xs): w.append(xs.max() - xs.min())
    return np.median(w) if w else 0, fh
rows = []
for g, v in FM.items():
    f = v.get('back') or v.get('front')
    if not f or not os.path.exists(os.path.join(ROOT, f['file'])): continue
    a = np.array(Image.open(os.path.join(ROOT, f['file'])).convert('RGBA'))[:, :, 3] > 80
    sh, fh = width(a, 0.18, 0.22); hip, _ = width(a, 0.46, 0.52)
    if not fh or not sh: continue
    rows.append((g, sh / fh, hip / sh))
rows.sort(key=lambda r: -r[1]); n = len(rows); out = {}
for r in rows[:n // 3]: out[r[0]] = 'N'
rest = sorted(rows[n // 3:], key=lambda r: -r[2])
for i, r in enumerate(rest): out[r[0]] = 'W' if i < len(rest) // 2 else 'S'
print(json.dumps(dict(sorted(out.items())), separators=(',', ':')))
from collections import Counter; print(Counter(out.values()), n)
