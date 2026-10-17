#!/usr/bin/env python3
"""席で事切れた写真（seatdown）を切り抜いて登録する。
入力: /workspace/seatdown_src/<id>.jpg（全身・座った姿・灰色の背景）。<id> は assets/frames/frames.json にある娘（girl26 など）
出力: assets/frames/<id>_seatdown.png と frames.json / frames.js / frames_data.js の <id>.seatdown
      {hk, aspect, ax, dir, sy, sx}  sy＝腰（座面）の写真の下からの高さ比、sx＝腰の左からの位置比（ax と同じ）
切り抜き: rembg（isnet-general-use）→ 黒いズボン・ベルト・髪の半透明を不透明に戻す → 体の中の穴を埋める → 設定の消去枠（椅子の脚など）→ 一番大きな塊だけ残す
座席: 黒い座席は黒いズボンと色で分けられないので残し、ゲーム側で座席が乗り物の座席に収まるよう腰の位置で合わせる
腰の位置: 白いトップスの下端（ベルト）から写真の高さの 0.185 下、トップスの中心。tools/seatdown.json の hip で上書きできる
大きさ: 頭頂〜腰が身長の 0.43（うなだれて座った姿）になるように hk を決める
使い方: python3 tools/add_seatdown.py [--only girl26,girl27] [--src /workspace/seatdown_src] [--force]
        （rembg は /workspace/.venv_rembg の python で動かすか pip install "rembg[cpu]" scipy pillow）
"""
import sys, os, io, json, base64, glob
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'assets', 'frames')
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
SRC = arg('--src', '/workspace/seatdown_src'); ONLY = set(arg('--only').split(',')) if arg('--only') else None
FORCE = '--force' in sys.argv
CFG = json.load(open(os.path.join(ROOT, 'tools', 'seatdown.json'), encoding='utf-8'))
MAXH = 900
_s = None
def session():
    global _s
    if _s is None:
        from rembg import new_session
        _s = new_session('isnet-general-use')
    return _s
def cutout(path, cfg):
    from rembg import remove
    im = Image.open(path).convert('RGB'); rgb = np.array(im).astype(np.int32)
    a = np.array(remove(im, session=session(), post_process_mask=True))[..., 3].astype(np.int32)
    H, W = a.shape
    # 背景の灰色（四隅の中央値）
    bgc = np.median(np.concatenate([rgb[:20, :20].reshape(-1, 3), rgb[:20, -20:].reshape(-1, 3), rgb[-20:, :20].reshape(-1, 3), rgb[-20:, -20:].reshape(-1, 3)]), 0)
    L = rgb.mean(-1); dbg = np.abs(rgb - bgc).sum(-1)
    core = a > 128
    # 黒いズボン・ベルト・座席・髪：体の近くで、背景よりはっきり暗いのに半透明にされたところを不透明に戻す
    near = ndimage.binary_dilation(core, iterations=6)
    dark = (L < 75) & (dbg > 90) & near
    a = np.where(dark & (a > 20), 255, a)
    # 体の中の穴（腕と胴の間などは背景色なので、背景と色が違う穴だけ埋める）
    m = a > 128; filled = ndimage.binary_fill_holes(m); hole = filled & ~m
    lab, n = ndimage.label(hole)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        reg = lab[sl] == i + 1
        if (np.median(dbg[sl][reg]) > 40 and np.median(L[sl][reg]) < 190) or reg.sum() < 60: a[sl][reg] = 255   # 背景色でない（白く飛んだ床の照り返しも除く）／ごく小さい穴は埋める
    # 消去枠（椅子の脚など）
    for x0, y0, x1, y1 in cfg.get('erase', []): a[y0:y1, x0:x1] = 0
    # 一番大きな塊だけ残す（切った脚の残りくず・影）
    m = a > 100; lab, n = ndimage.label(m)
    if n > 1:
        sz = ndimage.sum(m, lab, range(1, n + 1)); keep = ndimage.binary_dilation(lab == (np.argmax(sz) + 1), iterations=2)
        a = np.where(keep, a, 0)
    a = np.where(a < 24, 0, a).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), a])
    return out
def hip_point(img, cfg):
    a = img[..., 3] > 128; c = img[..., :3].astype(int); L = c.mean(-1); sat = c.max(-1) - c.min(-1); H, W = a.shape
    ys, xs = np.where(a); top, bot = ys.min(), ys.max()
    if cfg.get('hip'): return cfg['hip'][0], cfg['hip'][1], top, bot
    white = a & (L > 180) & (sat < 22)   # 白いトップス（肌は色味があるので除く）
    rows = white.sum(1); lim = top + int((bot - top) * 0.6)
    pk = rows[top:lim].max(); belt = top + max(i for i in range(lim - top) if rows[top + i] > pk * 0.2)
    wy, wx = np.where(white[max(top, belt - 40):belt + 1]); cx = wx.mean() if len(wx) else W / 2
    return int(round(cx)), int(belt + 0.185 * (bot - top)), top, bot
def write_meta(meta):
    json.dump(meta, open(os.path.join(OUT, 'frames.json'), 'w'), ensure_ascii=False, indent=1)
    jsf = os.path.join(OUT, 'frames.js'); head = open(jsf, encoding='utf-8').readline() if os.path.exists(jsf) else '// 自動生成\n'
    with open(jsf, 'w', encoding='utf-8') as f:
        f.write(head if head.startswith('//') else '// 自動生成 (tools/make_frames.py, tools/add_seatdown.py)\n')
        f.write('window.FRAME_META = %s;\n' % json.dumps(meta, ensure_ascii=False))
def embed(keys):
    dpath = os.path.join(OUT, 'frames_data.js'); txt = open(dpath).read()
    data = json.loads(txt[txt.index('=') + 1:].strip().rstrip(';'))
    for k, p in keys:
        im = Image.open(p).convert('RGBA')
        if im.height > 512: im = im.resize((max(1, round(im.width * 512 / im.height)), 512), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, 'WEBP', quality=85, method=6)
        data[k] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    open(dpath, 'w').write('window.FRAME_DATA = %s;\n' % json.dumps(data))
def main():
    meta = json.load(open(os.path.join(OUT, 'frames.json'), encoding='utf-8'))
    done = []
    for src in sorted(glob.glob(os.path.join(SRC, '*.jp*g')) + glob.glob(os.path.join(SRC, '*.png'))):
        gid = os.path.splitext(os.path.basename(src))[0]
        if ONLY and gid not in ONLY: continue
        if gid not in meta or 'front' not in meta[gid]: print('skip (frames.json に無い娘)', gid); continue
        png = os.path.join(OUT, f'{gid}_seatdown.png')
        if not FORCE and os.path.exists(png) and os.path.getmtime(png) >= os.path.getmtime(src) and 'seatdown' in meta[gid]: print('up to date', gid); continue
        cfg = CFG.get(gid, {})
        img = cutout(src, cfg)
        hx, hy, top, bot = hip_point(img, cfg)
        ys, xs = np.where(img[..., 3] > 0); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        x0 = max(0, x0 - 3); x1 = min(img.shape[1], x1 + 3); y0 = max(0, y0 - 3)
        im = Image.fromarray(img[y0:y1, x0:x1]); w, h = im.size
        stature = (hy - top) / float(cfg.get('torso', 0.43))   # 立ったときの頭頂〜足元（px）
        hk = h / stature
        f = min(1.0, MAXH / h)
        if f < 1: im = im.resize((round(w * f), round(h * f)), Image.LANCZOS)
        im.save(png, optimize=True)
        sx = (hx - x0) / w; sy = (y1 - hy) / h
        meta[gid]['seatdown'] = {'hk': round(float(hk), 4), 'aspect': round(w / h, 4), 'ax': round(float(sx), 4), 'dir': 0, 'sy': round(float(sy), 4), 'sx': round(float(sx), 4), 'file': f'assets/frames/{gid}_seatdown.png'}
        print(gid, 'seatdown', im.size, meta[gid]['seatdown'], flush=True)
        done.append((f'{gid}_seatdown', png))
    if done:
        write_meta(meta); embed(done)
    print('seatdown frames:', sum(1 for g in meta.values() if 'seatdown' in g), '(updated', len(done), ')')
main()
