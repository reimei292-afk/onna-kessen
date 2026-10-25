import json, os, sys, numpy as np
from PIL import Image
os.chdir('/workspace/mob01_hr')
C = json.load(open('chk/cycles.json')); v1 = json.load(open('atlas_v1.json'))
LEFT = {'w2_side': 116, 'w2_front': 126, 'w2_back': 91, 'w2_fdiag': 92, 'w2_bdiag': 101}
jobs = [('turn', i) for i in v1['seq']['turn']['src']] + [('turn', 1)]
fi = v1['seq']['fall']['src']; jobs += [('fall', fi[i]) for i in (0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14)] + [('fall', 1)]
for s, c in C.items():
    st, P = c['start'], c['P']; off = (LEFT[s]-st) % P
    jobs += [(s, st + (off + round(k*P/12)) % P) for k in range(12)]
jobs += [('kyudo1', i) for i in [1, 10, 18, 24, 30, 36, 44, 56, 64, 72, 80, 88, 96, 110, 150, 192, 195, 197, 199, 202, 206, 215, 230]]
jobs = sorted(set(jobs))
W, N = int(sys.argv[1]), int(sys.argv[2])
if W == -1: print(len(jobs)); sys.exit()
from rembg import remove, new_session
S = new_session('isnet-general-use')
for j, (s, i) in enumerate(jobs):
    if j % N != W: continue
    out = f'hcut/{s}_{i:03d}.png'
    if os.path.exists(out): continue
    im = Image.open(f'fr/{s}/{i:03d}.png').convert('RGB')
    r = remove(im, session=S, alpha_matting=True, alpha_matting_foreground_threshold=235, alpha_matting_background_threshold=12, alpha_matting_erode_size=5, post_process_mask=True)
    r = np.asarray(r).copy(); a = r[..., 3]; a[a < 8] = 0
    Image.fromarray(r).save(out + '.tmp.png'); os.replace(out + '.tmp.png', out); print(out, flush=True)
print('DONE', W)
