#!/usr/bin/env python3
"""第五幕：徴兵の娘の返事（性格ごとの話速・高さ、Nanami）。assets/voices/uk5/ と voices_uk5.js"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'uk5')
PERS = {'aggr': (8, 2), 'caut': (-4, -3), 'timid': (6, 8), 'calm': (-6, -7), 'cheer': (6, 6)}
CON = ['……はい。今はこの羽織だけです。でも、帰ったらまた着ます。だから、ちゃんと帰ります。', '正直、まだ慣れません。……でも、着た以上は、皆と同じように戦います。',
       'ゼミの発表より、ずっと怖いです。……それでも、ここまで来ましたから。', 'はい。……締め切りより、逃げられないですね。やれるだけ、やります。']
async def one(sem, t, p, r, pi):
    if os.path.exists(p) and os.path.getsize(p) > 800: return
    async with sem:
        for a in range(5):
            try: await edge_tts.Communicate(t, 'ja-JP-NanamiNeural', rate=f'{r - 6:+d}%', pitch=f'{pi:+d}Hz').save(p); return
            except Exception: await asyncio.sleep(2 * (a + 1))
async def main():
    os.makedirs(D, exist_ok=True); sem = asyncio.Semaphore(4); jobs = []; out = {}
    for rom, (r, pi) in PERS.items():
        out[rom] = []
        for i, t in enumerate(CON): fn = f'con_{rom}_{i}.mp3'; jobs.append(one(sem, t, os.path.join(D, fn), r, pi)); out[rom].append({'text': t, 'file': 'uk5/' + fn})
    await asyncio.gather(*jobs)
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_uk5.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_uk5_voices.py)。第五幕「本土」：徴兵の娘の返事\nwindow.VOICE_UK5 = %s;\n' % json.dumps({'con': out}, ensure_ascii=False))
    print('ok', len(os.listdir(D)))
asyncio.run(main())
