#!/usr/bin/env python3
"""南蛮行軍（kosui）の台詞の声（edge-tts）。名のある娘は voice_profiles の声、群れの侍女は Nanami の揺れ違い、
南蛮兵は中国語（普通話）の女声：祝融は zh-CN-XiaoxiaoNeural（低め）、群れは Xiaoyi・Xiaobei・Xiaoni。
入力 /tmp/kos_lines.json（[[声の目録のキー, 台詞], ...]。キーが zhu＝祝融、zhm＝南蛮の群れ、kmob＝群れの侍女）。
出力 assets/voices/kos/ と voices_kos.js（台詞 → ファイル）。"""
import asyncio, json, os, sys, hashlib, edge_tts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'kos'); os.makedirs(D, exist_ok=True)
L = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/kos_lines.json'))
N = 'ja-JP-NanamiNeural'
SPECIAL = {'zhu': [('zh-CN-XiaoxiaoNeural', 4, -6)], 'zhm': [('zh-CN-XiaoyiNeural', 6, 0), ('zh-CN-liaoning-XiaobeiNeural', 4, 0), ('zh-CN-shaanxi-XiaoniNeural', 2, 0)],
           'kmob': [(N, 0, 0), (N, 5, 6), (N, -3, -4)]}
def pc(n): return ('+' if n >= 0 else '') + str(n) + '%'
def hz(n): return ('+' if n >= 0 else '') + str(n) + 'Hz'
async def one(v, r, p, t, fn):
    for a in range(4):
        try:
            await edge_tts.Communicate(t, v, rate=pc(r), pitch=hz(p)).save(fn)
            if os.path.getsize(fn) > 500: return
        except Exception: await asyncio.sleep(2)
async def main():
    m = {}; sem = asyncio.Semaphore(6); tasks = []
    for k, t in L:
        profs = SPECIAL.get(k) or [PROFILES.get(k, (N, 0, 0))]
        for i, (v, r, p) in enumerate(profs):
            h = hashlib.md5((k + str(i) + '|' + t).encode()).hexdigest()[:10]; f = 'kos/' + h + '.mp3'; m.setdefault(t, []).append({'file': f, 'v': k})
            fp = os.path.join(ROOT, 'assets', 'voices', f)
            if os.path.exists(fp) and os.path.getsize(fp) > 500: continue
            async def go(v=v, r=r, p=p, t=t, fp=fp):
                async with sem: await one(v, r, p, t, fp)
            tasks.append(go())
    await asyncio.gather(*tasks)
    bad = [x['file'] for M in m.values() for x in M if not os.path.exists(os.path.join(ROOT, 'assets', 'voices', x['file']))]
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_kos.js'), 'w').write('window.VOICE_KOS = ' + json.dumps({'byText': m}, ensure_ascii=False) + ';\n')
    print(len(m), 'lines', len(tasks), 'made', len(bad), 'missing')
asyncio.run(main())
