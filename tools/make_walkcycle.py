#!/usr/bin/env python3
"""横から見た歩きの連続写真（歩行サイクル）を、ゲームで使える形にそろえる。
入力: frames/cycles.json
  {"<娘のid>": {"walk_side": {"src": "連番のパス（%02d）", "n": 枚数, "steps": 何歩分か, "fps": 想定の再生速度,
                 "dir": 1（右向き）/-1, "baseline": 足裏の行(px), "contact": 前足のかかとが着く絵の番号, "stepLen": 一歩の長さ（身長比・参考）}}}
  連番は透明背景・同じ大きさ・体（帯の中心）の位置と足裏の行がそろっていること。
出力: assets/frames/<id>_<key>_NN.webp（同じ絵は1枚にまとめる）、assets/frames/cycles.js（window.FRAME_CYCLES）、
      assets/frames/cycles_data.js（file:// 用の埋め込み）
縮尺: 正面写真（frames.json の front.ref、無ければ 640px）の頭頂〜足元と同じ高さになるよう縮小。hk＝画像の高さ／頭頂〜足元。
使い方: python3 tools/make_walkcycle.py
"""
import os, json, hashlib, base64, io, statistics
from PIL import Image
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'frames')
def head_top(a):
    need = max(8, int(a.shape[1] * 0.03))
    for y in range(a.shape[0]):
        if (a[y] > 100).sum() >= need: return y
    return 0
def main():
    man = json.load(open(os.path.join(ROOT, 'frames', 'cycles.json'), encoding='utf-8'))
    fm = os.path.join(OUT, 'frames.json'); fmeta = json.load(open(fm)) if os.path.exists(fm) else {}
    meta, data = {}, {}
    for gid, cyc in man.items():
        for key, c in cyc.items():
            paths = [c['src'] % i for i in range(c['n'])]
            uniq, seq, hashes = [], [], {}
            for p in paths:
                h = hashlib.md5(open(p, 'rb').read()).hexdigest()
                if h not in hashes: hashes[h] = len(uniq); uniq.append(p)
                seq.append(hashes[h])
            ims = [Image.open(p).convert('RGBA') for p in uniq]
            A = [np.array(im)[:, :, 3] for im in ims]
            ys = [np.nonzero(a > 16) for a in A]
            x0 = max(0, min(int(y[1].min()) for y in ys) - 4); x1 = min(ims[0].width, max(int(y[1].max()) for y in ys) + 5)
            y0 = max(0, min(int(y[0].min()) for y in ys) - 4); base = c['baseline']; y1 = min(ims[0].height, base + 2)
            body = base - statistics.median(head_top(a) for a in A)
            # 帯の中心（体の位置）：頭頂〜足元の 45% の高さの行の不透明部分の中心
            by = int(base - body * 0.55); bx = statistics.median(float(np.nonzero(a[by] > 100)[0].mean()) for a in A)
            ref = (fmeta.get(gid, {}).get('front') or {}).get('ref', 640)
            f = min(1.0, ref / body)
            W, H = round((x1 - x0) * f), round((y1 - y0) * f)
            files = []
            for i, im in enumerate(ims):
                out = im.crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS)
                fn = f'assets/frames/{gid}_{key}_{i:02d}.webp'
                b = io.BytesIO(); out.save(b, 'WEBP', quality=90, method=6, exact=False); raw = b.getvalue()
                open(os.path.join(ROOT, fn), 'wb').write(raw); files.append(fn)
                data[f'{gid}_{key}_{i:02d}'] = 'data:image/webp;base64,' + base64.b64encode(raw).decode()
            m = {'files': files, 'seq': seq, 'steps': c.get('steps', 2), 'fps': c.get('fps', 12.5), 'dir': c.get('dir', 1),
                 'contact': c.get('contact', 0), 'stepLen': c.get('stepLen'), 'hk': round((y1 - y0) / body, 4),
                 'aspect': round(W / H, 4), 'ax': round((bx - x0) / (x1 - x0), 4)}
            meta.setdefault(gid, {})[key] = m
            print(gid, key, len(uniq), 'unique of', len(seq), (W, H), {k: v for k, v in m.items() if k not in ('files', 'seq')},
                  'bytes', sum(os.path.getsize(os.path.join(ROOT, x)) for x in files))
    with open(os.path.join(OUT, 'cycles.js'), 'w') as f:
        f.write('// 自動生成 (tools/make_walkcycle.py)。歩行サイクル：files＝絵、seq＝再生順（steps 歩で一巡、contact＝前足が着く絵）、hk・aspect・ax・dir は frames.js と同じ意味\n')
        f.write('window.FRAME_CYCLES = %s;\n' % json.dumps(meta, ensure_ascii=False))
    with open(os.path.join(OUT, 'cycles_data.js'), 'w') as f:
        f.write('window.CYCLE_DATA = %s;\n' % json.dumps(data))
main()
