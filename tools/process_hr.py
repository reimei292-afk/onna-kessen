"""Phase 2: wave-gait walks (phase aligned), kyudo bow with a kept bowstring, game-size atlas.
Usage: python3 tools/process2.py [stand_px] [quality] [out_prefix]"""
import json, os, sys, numpy as np, cv2
from PIL import Image, ImageDraw
os.chdir('/workspace/mob01_hr')
STAND = int(sys.argv[1]) if len(sys.argv) > 1 else 192
Q = int(sys.argv[2]) if len(sys.argv) > 2 else 74
AQ = int(os.environ.get('AQ', 50))
OUT = sys.argv[3] if len(sys.argv) > 3 else 'mob01_motion'
JSON = sys.argv[4] if len(sys.argv) > 4 else 'atlas.json'
WALKH = STAND * 228 / 236
N = 12
C = json.load(open('chk/cycles.json'))
LEFT = {'w2_side': 116, 'w2_front': 126, 'w2_back': 91, 'w2_fdiag': 92, 'w2_bdiag': 101}   # 左足が前で接地（目視で確認）
NAME = {'w2_side': 'walk_side', 'w2_front': 'walk_front', 'w2_back': 'walk_back', 'w2_fdiag': 'walk_fdiag', 'w2_bdiag': 'walk_bdiag'}
cut = lambda s, i: Image.open(f'hcut/{s}_{i:03d}.png').convert('RGBA')
SHARP = float(os.environ.get('SHARP', 0.6))
PAGE = int(os.environ.get('PAGE', 2048))

def torso_cx(a):
    ys = np.where(a.max(1) > 0)[0]; y0, y1 = ys.min(), ys.max()
    band = a[int(y0+0.22*(y1-y0)):int(y0+0.45*(y1-y0))].astype(float)
    w = band.sum(0); xs = np.arange(len(w)); return (w*xs).sum()/w.sum()

def resize_rgba(im, sc, thin=None):
    """premultiplied resize; `thin` = full-res bool mask of 1-px structures (bowstring) kept at >=1 px, opaque"""
    W, H = max(1, round(im.width*sc)), max(1, round(im.height*sc))
    out = im.convert('RGBa').resize((W, H), Image.LANCZOS)
    if SHARP > 0:
        from PIL import ImageFilter
        out = out.filter(ImageFilter.UnsharpMask(radius=0.8, percent=int(SHARP * 100), threshold=2))
    out = out.convert('RGBA')
    if thin is not None and thin.any():
        k = max(1, int(np.ceil(1/sc)))
        tm = cv2.dilate(thin.astype(np.uint8)*255, np.ones((k, k), np.uint8))
        tm = np.asarray(Image.fromarray(tm).resize((W, H), Image.BOX)) > 60
        o = np.asarray(out).copy()
        col = np.array([214, 198, 160], np.uint8)            # 弦（麻の色）
        sel = tm & (o[..., 3] < 200)
        o[sel, :3] = col; o[sel, 3] = 235
        out = Image.fromarray(o)
    return out

frames, info = {}, {}
HANDS = {}
def hands(im, ax, ay, sc):
    o = np.asarray(im).astype(int); a = o[..., 3]; r, g, b = o[..., 0], o[..., 1], o[..., 2]
    ys = np.where(a.max(1) > 0)[0]; y0, y1 = ys.min(), ys.max(); Hh = y1 - y0
    skin = (a > 200) & (r > 120) & (r > g + 12) & (g > b - 5) & (r - b > 25) & (r < 255)
    band = np.zeros_like(skin); band[int(y0 + 0.40 * Hh):int(y0 + 0.64 * Hh)] = True; skin &= band
    out = []
    for side in (0, 1):
        m = skin.copy(); xs = np.arange(m.shape[1])
        m[:, xs >= ax if side == 0 else xs < ax] = False
        yy, xx = np.where(m)
        if len(yy) < 30: out.append(None); continue
        sel = yy >= yy.max() - 0.05 * Hh
        out.append(((xx[sel].mean() - ax) * sc, (ay - yy[sel].mean()) * sc))
    return out
# ---- turn (phase-1 turnA, 16 views) and fall (phase-1) : reuse phase-1 picks
v1 = json.load(open('atlas_v1.json'))
def std_seq(name, src, idx, mode):
    ims = [cut(src, i) for i in idx]
    if mode == 'stand':
        a = np.asarray(cut(src, 1))[..., 3]; ys = np.where(a.max(1) > 0)[0]; sc = STAND/(ys.max()-ys.min())
    else:
        sc = WALKH/np.mean([im.getbbox()[3]-im.getbbox()[1] for im in ims])
    out = []
    if mode == 'fall':
        a = np.asarray(cut(src, 1))[..., 3]; ax = torso_cx(a); ay = np.where(a.max(1) > 0)[0].max()
        a = np.asarray(cut(src, 1))[..., 3]; ys = np.where(a.max(1) > 0)[0]; sc = STAND/(ys.max()-ys.min())
        for im in ims:
            b = im.getbbox(); out.append((resize_rgba(im.crop(b), sc), (b[0]-ax)*sc, (ay-b[3])*sc))
    else:
        hl = []
        for im in ims:
            a = np.asarray(im)[..., 3]; b = im.getbbox(); ax = torso_cx(a)
            out.append((resize_rgba(im.crop(b), sc), (b[0]-ax)*sc, 0))
            hl.append(hands(im, ax, b[3], sc))
        HANDS[name] = hl
    frames[name] = out; info[name] = {'src': f'{src}:{idx}'}
    print(name, len(out), 'scale', round(sc, 3))

std_seq('turn', 'turn', v1['seq']['turn']['src'], 'stand')
fall_idx = v1['seq']['fall']['src']; fall_idx = [fall_idx[i] for i in (0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14)]
std_seq('fall', 'fall', fall_idx, 'fall')

# ---- walks: 12 frames per cycle, index 0 = left foot forward at contact (game stepT phase 0)
for s, c in C.items():
    st, P = c['start'], c['P']; off = (LEFT[s]-st) % P
    idx = [st + (off + round(k*P/N)) % P for k in range(N)]
    std_seq(NAME[s], s, idx, 'walk')
    info[NAME[s]].update(period=P, left_contact=LEFT[s], index0='left foot forward, contact')

# ---- kyudo bow (kyudo1): ready, uchiokoshi, hikiwake, kai, hanare, zanshin
BOW = [1, 10, 18, 24, 30, 36, 44, 56, 64, 72, 80, 88, 96, 110, 150, 192, 195, 197, 199, 202, 206, 215, 230]
STAGES = {'set': [0, 1], 'draw': [2, 12], 'kai': [13, 15], 'hanare': [16, 20], 'zanshin': [21, 22]}
XMAX = 950   # 弓の右端より先（飛んでいく矢の筋）は切る
a1 = np.asarray(cut('kyudo1', 1))[..., 3].copy()
cols = a1[300:560].sum(0); cx0 = int((cols*np.arange(len(cols))).sum()/cols.sum())
band = a1[:, cx0-50:cx0+50]; ys = np.where(band.max(1) > 0)[0]
bsc = STAND/(ys.max()-ys.min()); ay = ys.max()
tb = a1[int(ys.min()+0.22*(ay-ys.min())):int(ys.min()+0.45*(ay-ys.min())), :cx0+90].astype(float)
w = tb.sum(0); ax = (w*np.arange(len(w))).sum()/w.sum()
out = []; STR = {}
for i in BOW:
    im = cut('kyudo1', i); o = np.asarray(im).copy(); o[:, XMAX:, 3] = 0
    rgb = np.asarray(Image.open(f'fr/kyudo1/{i:03d}.png').convert('RGB'))
    L = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.int16)
    d = cv2.medianBlur(L.astype(np.uint8), 11).astype(np.int16) - L
    al = o[..., 3]
    # 弦：背景よりわずかに暗い細い線（rembg が落とした所）＋ rembg が残した細い明るい線
    det = (d > 4) & (al == 0)
    thin_kept = (al > 0) & (cv2.morphologyEx((al > 0).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) == 0) & (L > 140)
    m = det | thin_kept
    ysA, xsA = np.where(al > 0); box = np.zeros_like(m)
    box[:, max(0, xsA.min()-10):min(XMAX, xsA.max()+10)] = True; m &= box
    n, lab, stt, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    keep = np.zeros_like(m)
    for k in range(1, n):
        if max(stt[k][2], stt[k][3]) >= 30: keep |= lab == k
    keep[ay+2:] = False
    # 弓の両端（茶色の細い物の一番上と下）と、引いているときは弦の一番左（＝矢筈・右手）
    Lc = L; bowm = (al > 0) & (rgb[..., 0].astype(int) > rgb[..., 1].astype(int) + 18) & (rgb[..., 0].astype(int) > rgb[..., 2].astype(int) + 22) & (Lc < 150)
    bowm[:, :cx0+20] = False if BOW.index(i) < 2 else bowm[:, :cx0+20]   # 構え：弓は体の左（画面右）
    nb, lb, sb, _ = cv2.connectedComponentsWithStats(cv2.dilate(bowm.astype(np.uint8), np.ones((5, 5), np.uint8)), 8)
    hmax = sb[1:, 3].max(); big = [k for k in range(1, nb) if sb[k, 3] >= 0.4*hmax]   # 縦に長い茶色の塊 = 弓の上下の成（握りの籐で分かれる）
    by, bx = np.where(bowm & np.isin(lb, big))
    top = (bx[by.argmin()], by.min()); bot = (bx[by.argmax()], by.max())
    pts = [top, bot]
    j = BOW.index(i)
    if 8 <= j <= 15 and keep.any():
        ky, kx = np.where(keep & (np.arange(keep.shape[0])[:, None] > top[1]) & (np.arange(keep.shape[0])[:, None] < bot[1]))
        if len(kx): n_ = kx.argmin(); pts = [top, (kx[n_], ky[n_]), bot]
    o[..., 3][keep & (o[..., 3] < 128)] = 0   # 半端な弦の画素は捨てて、線で描き直す
    if o[0, :, 3].max() > 0:
        fh = int(0.05*o.shape[0]); o[:fh, :, 3] = (o[:fh, :, 3]*np.linspace(0, 1, fh)[:, None]).astype(np.uint8)
    im2 = Image.fromarray(o); b = im2.getbbox()
    spr = resize_rgba(im2.crop(b), bsc)
    dr = ImageDraw.Draw(spr)
    P = [((px-b[0])*bsc, (py-b[1])*bsc) for px, py in pts]
    dr.line(P, fill=(222, 206, 168, 255), width=1)
    out.append((spr, (b[0]-ax)*bsc, (ay-b[3])*bsc))
    STR[i] = [list(map(int, p)) for p in pts]
frames['bow'] = out; info['bow'] = {'src': f'kyudo1:{BOW}', 'stages': STAGES, 'string_pts_fullres': STR}
print('bow', len(out), 'scale', round(bsc, 3))

# ---- pages: turn+fall (always), walks, bow (on demand). Each page <= PAGE x PAGE
GROUPS = [['turn', 'fall'], [k for k in frames if k.startswith('walk_')], ['bow']]
meta = {'v': 3, 'id': 'mob01', 'stand': STAND, 'kokkaku': 'W', 'pages': [],
        'note': 'frame = [x, y, w, h, ox, oy, page] px; ox = crop left edge minus anchor (torso centre), oy = crop bottom above ground; hd[k] = [lx, ly, rx, ry] px from anchor/ground (image-left hand, image-right hand; null if unseen); '
                'turn[k] = view angle k*22.5 deg (camera toward her left); walk index 0 = left foot forward at contact',
        'walk8': [['walk_front', 0], ['walk_fdiag', 0], ['walk_side', 1], ['walk_bdiag', 1],
                  ['walk_back', 0], ['walk_bdiag', 0], ['walk_side', 0], ['walk_fdiag', 1]],
        'bow': {'stages': STAGES, 'facing': 'body to camera, arrow to screen right (target on her left)'},
        'seq': {}}
def fillsave(atlas, path):
    arr = np.asarray(atlas).copy(); al = arr[..., 3]
    rgb = arr[..., :3].astype(np.float32); w = (al > 0).astype(np.float32)
    for _ in range(3):
        k = np.ones((3, 3), np.float32)
        num = cv2.filter2D(rgb*w[..., None], -1, k); den = cv2.filter2D(w, -1, k)
        fill = (w == 0) & (den > 0)
        rgb[fill] = num[fill]/den[fill][:, None]; w = np.maximum(w, fill.astype(np.float32))
    arr[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8); arr[w == 0, :3] = 0
    Image.fromarray(arr).save(path, quality=Q, method=6, alpha_quality=AQ, exact=False)
pg = 0; tot = 0
for G in GROUPS:
    items = sorted([(s_, k, c) for s_ in G for k, (c, _, _) in enumerate(frames[s_])], key=lambda t: -t[2].height)
    while items:
        x = y = rowh = 0; pos = {}; rest = []; MAXW = PAGE
        area = sum(c.width*c.height for _, _, c in items)
        if area < PAGE*PAGE*0.22: MAXW = PAGE // 2
        for s_, k, c in items:
            if x + c.width + 2 > MAXW: x = 0; y += rowh + 2; rowh = 0
            if y + c.height > PAGE: rest.append((s_, k, c)); continue
            pos[(s_, k)] = (x, y); x += c.width + 2; rowh = max(rowh, c.height)
        H = min(PAGE, (y + rowh + 3)//4*4)
        atlas = Image.new('RGBA', (MAXW, H), (0, 0, 0, 0))
        for (s_, k), (px, py) in pos.items(): atlas.alpha_composite(frames[s_][k][0], (px, py))
        img = f'{OUT}_p{pg}.webp'; fillsave(atlas, img)
        meta['pages'].append({'image': os.path.basename(img), 'size': [MAXW, H], 'seq': sorted({s_ for (s_, _) in pos})})
        for (s_, k), (px, py) in pos.items():
            c, ox, oy = frames[s_][k]
            d = meta['seq'].setdefault(s_, dict(info[s_], f=[None]*len(frames[s_])))
            d['f'][k] = [px, py, c.width, c.height, round(ox, 1), round(oy, 1), pg]
            if s_ in HANDS:
                hv = HANDS[s_][k]; d.setdefault('hd', [None]*len(frames[s_]))
                d['hd'][k] = [None if v is None else round(v[0], 1) for v in hv[:1]] + [None if hv[0] is None else round(hv[0][1], 1)] + [None if hv[1] is None else round(hv[1][0], 1), None if hv[1] is None else round(hv[1][1], 1)]
        bg = Image.new('RGBA', atlas.size, (70, 110, 70, 255)); bg.alpha_composite(atlas); bg.convert('RGB').save(f'chk/{os.path.basename(OUT)}_p{pg}_view.jpg', quality=85)
        print('page', pg, MAXW, H, os.path.getsize(img), 'bytes', len(pos), 'frames'); tot += os.path.getsize(img)
        pg += 1; items = rest
json.dump(meta, open(JSON, 'w'), separators=(',', ':'))
print('total', tot)
