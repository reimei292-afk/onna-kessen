#!/usr/bin/env python3
"""状況台詞（situ_lines.json）と、これまで端末の音声合成（speechSynthesis）で読んでいた台詞（robotic_texts.json）を
edge-tts の ja-JP ニューラル音声で mp3 にし、assets/voices/voices_situ.js（VOICE_SITU / VOICE_TEXT）を作る。
voices.js（make_voices.py の出力）は触らない。使い方: python3 tools/make_voices_situ.py [--force]"""
import asyncio, json, os, sys, hashlib
import edge_tts
T = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(T, '..', 'assets', 'voices')
NANAMI, KEITA = 'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'
PERS = {'aggr': (8, 2), 'caut': (-4, -3), 'timid': (6, 8), 'calm': (-6, -7), 'cheer': (6, 6)}   # 性格ごとの話速%・高さHz（make_voices.py と揃える）
VARIANTS = [(-2, -5), (0, 0), (3, 5)]   # 声の高さ3段階（個体差 vv）
STYLE = {'girl': (4, 2, NANAMI), 'nurse': (-4, 8, NANAMI), 'sec': (-6, -8, NANAMI), 'ojou': (-14, -2, NANAMI), 'sec3': (-6, -4, NANAMI),
         'sec4': (-2, 2, NANAMI), 'den': (6, 6, NANAMI), 'cmd': (10, 0, NANAMI), 'king': (-6, -2, KEITA)}
FORCE = '--force' in sys.argv
async def one(sem, text, path, rate, pitch, voice=NANAMI):
    if not FORCE and os.path.exists(path) and os.path.getsize(path) > 1000: return
    async with sem:
        for a in range(5):
            try:
                await edge_tts.Communicate(text, voice, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz').save(path); return
            except Exception: await asyncio.sleep(1.5 * (a + 1))
        print('FAILED', text)
async def main():
    situ = json.load(open(os.path.join(T, 'situ_lines.json'), encoding='utf-8'))
    rob = json.load(open(os.path.join(T, 'robotic_texts.json'), encoding='utf-8'))
    sem = asyncio.Semaphore(6); jobs = []; S = {}; X = {}
    for cat, per in situ.items():
        S[cat] = {}
        for rom, arr in per.items():
            r, p = PERS[rom]; S[cat][rom] = []
            for i, text in enumerate(arr):
                fn = f's_{rom}_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), r, p))
                S[cat][rom].append({'text': text, 'files': [fn]})
    for text, st in rob.items():
        r, p, v = STYLE[st]; h = hashlib.md5(text.encode()).hexdigest()[:8]
        vs = VARIANTS if st == 'girl' else [(0, 0)]
        files = []
        for vi, dv in enumerate(vs):
            fn = f't_{st}_{h}_{vi}.mp3'; files.append(fn); jobs.append(one(sem, text, os.path.join(D, fn), r + dv[0], p + dv[1], v))
        X[text] = {'files': files, 'who': st}
    await asyncio.gather(*jobs)
    with open(os.path.join(D, 'voices_situ.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/make_voices_situ.py)。edge-tts ja-JP ニューラル音声\n')
        f.write('window.VOICE_SITU = %s;\nwindow.VOICE_TEXT = %s;\n' % (json.dumps(S, ensure_ascii=False), json.dumps(X, ensure_ascii=False)))
    print('done', len(jobs))
asyncio.run(main())
