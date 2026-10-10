#!/usr/bin/env python3
"""assets/mobNN.jpg と assets/archerNN.jpg から背景を除去し、切り抜いた透過 PNG (mobNN.png / archerNN.png) と
埋め込み版 assets/sprites.js を再生成する。番号は 01 から連番で、存在するものすべてを処理する。
必要: pip install "rembg[cpu]" pillow   (rembg が無い場合は明るい無地背景向けの色キーで代用)
使い方: python3 tools/make_sprites.py            （背景除去＋sprites.js 再生成）
        python3 tools/make_sprites.py --no-cut   （既存の PNG から sprites.js だけ再生成）
"""
import sys
NO_CUT = '--no-cut' in sys.argv
import io, base64, os, glob, re
from PIL import Image, ImageFilter
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
H = 640
S = None
if not NO_CUT:
  try:
    from rembg import remove, new_session
    S = new_session('isnet-general-use')
  except Exception:
    S = None
def colorkey(im):
    px = im.convert('RGB'); w, h = px.size
    bg = [px.getpixel(p) for p in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]]
    a = Image.new('L', px.size, 0); pa = a.load(); pp = px.load()
    for y in range(h):
        for x in range(w):
            r, g, b = pp[x, y]
            d = min(abs(r - c[0]) + abs(g - c[1]) + abs(b - c[2]) for c in bg)
            pa[x, y] = 0 if (d < 40 and max(r, g, b) - min(r, g, b) < 18 and r > 150) else 255
    out = px.convert('RGBA'); out.putalpha(a.filter(ImageFilter.MedianFilter(5))); return out
def head_top(img):
    """頭頂の位置（画像上端からの比率）。弓などの細い物を無視するため、不透明な横幅が一定以上の最初の行。"""
    a = img.split()[3]; w, h = a.size; px = a.load(); need = max(4, int(h * 0.05))
    for y in range(h):
        run = best = 0
        for x in range(w):
            if px[x, y] > 128: run += 1; best = max(best, run)
            else: run = 0
        if best >= need: return round(y / h, 3)
    return 0.0
def process(prefix):
    ext = 'png' if NO_CUT else 'jpg'
    files = sorted(f for f in glob.glob(os.path.join(D, prefix + '*.' + ext)) if re.search(prefix + r'\d+\.' + ext + '$', f))
    data = []
    for f in files:
        if NO_CUT:
            out = Image.open(f).convert('RGBA')
            if out.height > H:
                out = out.resize((max(1, round(out.width * H / out.height)), H), Image.LANCZOS)
                out.save(f, optimize=True)
            b = io.BytesIO(); out.save(b, 'WEBP', quality=88, method=6)
            data.append(('data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(), head_top(out)))
            print(os.path.basename(f), out.size, 'top', data[-1][1]); continue
        im = Image.open(f).convert('RGB')
        out = remove(im, session=S, post_process_mask=True) if S else colorkey(im)
        a = out.split()[3].point(lambda v: 0 if v < 24 else v); out.putalpha(a)
        # 小さなゴミを無視して切り抜き範囲を決める
        m = a.point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.MinFilter(5))
        bb = m.getbbox() or a.getbbox()
        bb = (max(0, bb[0] - 4), max(0, bb[1] - 4), min(a.width, bb[2] + 4), min(a.height, bb[3] + 4))
        out = out.crop(bb); w, h = out.size
        out = out.resize((max(1, round(w * H / h)), H), Image.LANCZOS)
        png = f[:-4] + '.png'; out.save(png, optimize=True)
        b = io.BytesIO(); out.save(b, 'WEBP', quality=88, method=6)
        data.append(('data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(), head_top(out)))
        print(os.path.basename(png), out.size, 'rembg' if S else 'colorkey', 'top', data[-1][1])
    return data
mobs, archers = process('mob'), process('archer')
with open(os.path.join(D, 'sprites.js'), 'w') as f:
    f.write('// 自動生成 (tools/make_sprites.py)。file:// で開いた時に使う埋め込み画像。枚数もここから決まる。\n')
    for name, arr in (('MOB', mobs), ('ARCHER', archers)):
        f.write('window.%s_SPRITES = [\n' % name + ',\n'.join('"%s"' % d for d, _ in arr) + '\n];\n')
        f.write('// 頭頂の位置（画像上端からの比率）。身長の計算に使用\nwindow.%s_HEADTOP = %s;\n' % (name, [t for _, t in arr]))
