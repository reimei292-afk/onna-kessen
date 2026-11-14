#!/usr/bin/env python3
"""天鳳の台詞の声（edge-tts）。持ち場の台詞・状況の台詞・人柄の言い回し・空襲と沈没の掛け声・残る人の言葉。
入力は game.js から抜き出した /tmp/th_lines.json（[[声の目録のキー, 台詞], ...]）。出力 assets/voices/th/ と voices_th.js（台詞 → ファイル）。"""
import asyncio, json, os, sys, hashlib, edge_tts
import sys as _ys, os as _yo; _ys.path.insert(0, _yo.path.dirname(_yo.path.abspath(__file__))); import tts_reading  # 読み違いの辞書（漢字の字幕のまま、声には仮名を渡す）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'th'); os.makedirs(D, exist_ok=True)
L = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/th_lines.json'))
def pc(n): return ('+' if n >= 0 else '') + str(n) + '%'
def hz(n): return ('+' if n >= 0 else '') + str(n) + 'Hz'
async def one(k, t, fn):
    v, r, p = PROFILES.get(k, ('ja-JP-NanamiNeural', 0, 0))
    for a in range(3):
        try: await edge_tts.Communicate(t, v, rate=pc(r), pitch=hz(p)).save(fn); return
        except Exception as e: await asyncio.sleep(2)
async def main():
    m = {}; sem = asyncio.Semaphore(6); tasks = []
    for k, t in L:
        h = hashlib.md5((k + '|' + t).encode()).hexdigest()[:10]; f = 'th/' + h + '.mp3'; m.setdefault(t, []).append({'file': f, 'v': k})
        fp = os.path.join(ROOT, 'assets', 'voices', f)
        if os.path.exists(fp) and os.path.getsize(fp) > 500: continue
        async def go(k=k, t=t, fp=fp):
            async with sem: await one(k, t, fp)
        tasks.append(go())
    await asyncio.gather(*tasks)
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_th.js'), 'w').write('window.VOICE_TH = ' + json.dumps({'byText': m}, ensure_ascii=False) + ';\n')
    print(len(m), 'lines', len(tasks), 'made')
asyncio.run(main())
