#!/usr/bin/env python3
"""追加の見え方（横・後ろ・歩き・構え）の写真から背景を除き、正面写真と同じ縮尺にそろえて切り抜く。
入力: frames/manifest.json  {"mob09": {"side": パス, "back": パス, "walk": パス, "bow": パス, "stab": パス, "action": パス, "flute": パス}, ...}
       向きの上書き（任意）: "side_dir": 1（右向き）/ -1（左向き）など "<frame>_dir"
出力: assets/frames/<id>_<frame>.png と assets/frames/frames.js（寸法情報＋file:// 用の埋め込み画像）
縮尺: 正面写真（assets/<id>.png）の「頭頂〜足元」の高さを基準に、各フレームの頭頂〜足元が同じ高さ（歩き 0.985、突き 0.93）になるよう拡大縮小。足元は画像の下端。
横顔のキー: side（右向き）／side_left（左向き）／side_right。
使い方: python3 tools/make_frames.py [--force] [--only mob09,archer03]
必要: pip install "rembg[cpu]" pillow
"""
import sys, os, io, json, base64
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
A = os.path.join(ROOT, 'assets'); OUT = os.path.join(A, 'frames')
FORCE = '--force' in sys.argv
ONLY = None
if '--only' in sys.argv: ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(','))
KINDS = ['front', 'kneel', 'side', 'back', 'walk', 'bow', 'stab', 'action', 'flute']
KH = {'kneel': 0.7, 'side': 1.0, 'back': 1.0, 'walk': 0.985, 'bow': 1.0, 'stab': 0.93, 'flute': 1.0}
MAXH = 900
_session = None
def session():
    global _session
    if _session is None:
        from rembg import new_session
        _session = new_session('isnet-general-use')
    return _session
def head_top(a):
    """頭頂の行（細い弓・髪飾りは無視：不透明が一定幅以上続く最初の行）"""
    w, h = a.size; px = a.load(); need = max(4, int(h * 0.05))
    for y in range(h):
        run = best = 0
        for x in range(w):
            if px[x, y] > 128: run += 1; best = max(best, run)
            else: run = 0
        if best >= need: return y
    return 0
def mean_x(a, y0, y1):
    w, h = a.size; px = a.load(); s = n = 0
    for y in range(max(0, y0), min(h, y1)):
        for x in range(w):
            if px[x, y] > 128: s += x; n += 1
    return s / n if n else w / 2
def cut(path):
    from rembg import remove
    im = Image.open(path).convert('RGB')
    out = remove(im, session=session(), post_process_mask=True)
    a = out.split()[3].point(lambda v: 0 if v < 24 else v); out.putalpha(a)
    m = a.point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.MinFilter(5))
    bb = m.getbbox() or a.getbbox()
    bb = (max(0, bb[0] - 4), max(0, bb[1] - 4), min(a.width, bb[2] + 4), min(a.height, bb[3] + 1))
    return out.crop(bb)
def front_ref(gid):
    f = os.path.join(A, gid + '.png')
    im = Image.open(f).convert('RGBA'); a = im.split()[3]
    return im.height - head_top(a)   # 正面の頭頂〜足元（px）
def main():
    man = json.load(open(os.path.join(ROOT, 'frames', 'manifest.json'), encoding='utf-8'))
    loc = os.path.join(ROOT, 'frames', 'manifest_local.json')   # 手元で足す分（医療係の正面など）。manifest.json と合わせる
    if os.path.exists(loc):
        for g, fr in json.load(open(loc, encoding='utf-8')).items(): man.setdefault(g, {}).update(fr)
    os.makedirs(OUT, exist_ok=True)
    metaf = os.path.join(OUT, 'frames.json')
    meta = json.load(open(metaf)) if os.path.exists(metaf) else {}
    for gid, fr in man.items():
        if ONLY and gid not in ONLY: continue
        meta.setdefault(gid, {})
        if os.path.exists(os.path.join(A, gid + '.png')): ref = front_ref(gid)
        elif fr.get('front') and os.path.exists(fr['front']):
            # 元の写真が無い娘（医療係など）：正面も manifest から作り、その頭頂〜足元を基準にする
            png = os.path.join(OUT, f'{gid}_front.png')
            if FORCE or not os.path.exists(png) or os.path.getmtime(png) < os.path.getmtime(fr['front']) or 'front' not in meta[gid]:
                im = cut(fr['front']); a = im.split()[3]; top = head_top(a)
                f = min(1.0, 640 / im.height); im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
                im.save(png, optimize=True); a = im.split()[3]
                top = head_top(a); body = im.height - top
                meta[gid]['front'] = {'hk': round(im.height / body, 4), 'aspect': round(im.width / im.height, 4), 'ax': round(mean_x(a, int(im.height * 0.88), im.height) / im.width, 4), 'dir': 0, 'file': f'assets/frames/{gid}_front.png', 'ref': body}
                print(gid, 'front', im.size, meta[gid]['front'])
            ref = meta[gid]['front']['ref']
        else: print('skip (正面写真なし)', gid); continue
        for k0, src in fr.items():
            # 'side_left'（左向きの横顔）／'side_right' は side として扱い、向きを記録（エンジンが反対向きは左右反転）
            k = 'side' if k0 in ('side_left', 'side_right') else k0
            if k == 'front' or k not in KINDS or not src or not isinstance(src, str): continue
            if k == 'side' and k0 == 'side' and fr.get('side_left') and fr.get('side_right') is None: pass
            if not os.path.exists(src): print('missing', gid, k, src); continue
            png = os.path.join(OUT, f'{gid}_{k}.png')
            if not FORCE and os.path.exists(png) and os.path.getmtime(png) >= os.path.getmtime(src) and k in meta[gid]: continue
            im = cut(src); a = im.split()[3]
            top = head_top(a); body = im.height - top
            kind = k if k != 'action' else ('bow' if gid.startswith('archer') else 'stab')
            sc = ref * KH.get(kind, 1.0) / max(1, body)
            w, h = max(1, round(im.width * sc)), max(1, round(im.height * sc))
            f = 1.0
            if h > MAXH: f = MAXH / h; w, h = max(1, round(w * f)), MAXH
            im = im.resize((w, h), Image.LANCZOS); a = im.split()[3]
            im.save(png, optimize=True)
            # 足元の中心（画像幅に対する比率）＝立ち位置。体の中心がずれた構え（弓を伸ばす等）でも足元をそろえる
            ax = mean_x(a, int(h * 0.88), h) / w
            # 向き：横＝右向き（+1）。構えは、頭から遠くへ伸びている側を向き（弓・懐刀を伸ばす側）とする
            d = fr.get(k + '_dir')
            if d is None and k0 == 'side_left': d = -1
            if d is None and k0 == 'side_right': d = 1
            if d is None:
                if k in ('side', 'kneel'): d = 1
                elif k in ('back', 'walk'): d = 0
                else:
                    t2 = head_top(a); hx = mean_x(a, t2, t2 + int(h * 0.1)); bb = a.getbbox() or (0, 0, w, h)
                    d = 1 if (bb[2] - hx) > (hx - bb[0]) else -1
            meta[gid][k] = {'hk': round(h / (ref * f), 4), 'aspect': round(w / h, 4), 'ax': round(ax, 4), 'dir': int(d), 'file': f'assets/frames/{gid}_{k}.png'}
            print(gid, k, (w, h), 'dir', d, 'ax', round(ax, 3), 'hk', meta[gid][k]['hk'])
    json.dump(meta, open(metaf, 'w'), ensure_ascii=False, indent=1)
    # file:// 用の埋め込み（webp、高さ 512 まで）
    data = {}
    for gid, fr in meta.items():
        for k, m in fr.items():
            p = os.path.join(ROOT, m['file'])
            if not os.path.exists(p): continue
            im = Image.open(p).convert('RGBA')
            if im.height > 512: im = im.resize((max(1, round(im.width * 512 / im.height)), 512), Image.LANCZOS)
            b = io.BytesIO(); im.save(b, 'WEBP', quality=85, method=6)
            data[f'{gid}_{k}'] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    with open(os.path.join(OUT, 'frames.js'), 'w') as f:
        f.write('// 自動生成 (tools/make_frames.py)。見え方ごとの写真フレームの寸法（hk＝正面の頭頂〜足元を1とした画像の高さ、ax＝足元の中心、dir＝向き 1:右 -1:左 0:正面/後ろ）\n')
        f.write('window.FRAME_META = %s;\n' % json.dumps(meta, ensure_ascii=False))
    with open(os.path.join(OUT, 'frames_data.js'), 'w') as f:   # file:// で開いたとき用の埋め込み画像
        f.write('window.FRAME_DATA = %s;\n' % json.dumps(data))
    print('frames.js:', sum(len(v) for v in meta.values()), 'frames')
main()
