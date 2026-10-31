#!/usr/bin/env python3
"""吹雪の山岳行軍（fubuki）の声。台詞は game.js の FB_TXT から読む（node で抜き出す）。
殿（king）と語り（narr）は字幕のみ。出力：assets/voices/fb/*.mp3 と assets/voices/voices_fb.js"""
import asyncio, json, os, re, subprocess, edge_tts, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'fb')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
N = 'ja-JP-NanamiNeural'
ST = dict(PROFILES); ST.update({'m35': (N, -10, -10), 'm37': (N, 0, 6), 'm39': (N, 6, 14), 'm43': (N, 10, 0), 'maid': (N, 2, 8), 'porter': (N, -4, -2)})
src = open(os.path.join(ROOT, 'game.js')).read(); a = src.index('const FB_TXT = {'); b = src.index('\n};\n', a)
L = json.loads(subprocess.check_output(['node', '-e', 'const o=' + src[a + 15:b + 2] + ';console.log(JSON.stringify(o))']).decode())
async def one(t, p, v, r, pi):
    for k in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (k + 1))
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 3.0
async def main():
    os.makedirs(D, exist_ok=True); sem = asyncio.Semaphore(6)
    async def gen(k, o):
        if o['who'] in ('king', 'narr'): return
        v, r, pi = ST.get(o['who'], ST['maid']); p = os.path.join(D, k + '.mp3')
        t = re.sub(r'（[^）]*）', '', o['ja']).replace('(笑)', '')
        if not os.path.exists(p) or os.path.getsize(p) < 500:
            async with sem: await one(t, p, v, r, pi)
    await asyncio.gather(*[gen(k, o) for k, o in L.items()])
    out = {'lines': {}}
    for k, o in L.items():
        p = os.path.join(D, k + '.mp3'); o = dict(o)
        if os.path.exists(p) and os.path.getsize(p) > 500: o['file'] = 'fb/' + k + '.mp3'; o['dur'] = dur(p)
        out['lines'][k] = o
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_fb.js'), 'w').write('// 自動生成 (tools/add_fb_voices.py)。吹雪の山岳行軍\nwindow.VOICE_FB = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print('lines', len(out['lines']), 'with file', sum(1 for v in out['lines'].values() if 'file' in v))
asyncio.run(main())
