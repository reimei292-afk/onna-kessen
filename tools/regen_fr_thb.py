#!/usr/bin/env python3
"""手で作った声の目録（voices_fr.js / voices_fr2.js / voices_thb.js）の声を、読みの辞書を通して作り直す。
fr・fr2 は話し手の声（voice_profiles）、thb は性格の声（make_voices.py の PERS_STYLE）。引数：作り直すファイル（assets/voices/ からの相対）"""
import asyncio, json, os, re, sys, edge_tts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import tts_reading; from voice_profiles import PROFILES
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices')
PERS = {'aggr': (6, 2), 'caut': (-4, -3), 'timid': (6, 6), 'calm': (-6, -6), 'cheer': (5, 5)}
WHO = {'hayase': 'sec2', 'ayase': 'fumi'}
def load(f):
    s = open(os.path.join(ROOT, f)).read(); s = s[s.index('{'):s.rindex('}') + 1]; return json.loads(s)
async def one(t, v, r, p, fn):
    for a in range(4):
        try:
            await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{p:+d}Hz').save(fn)
            if os.path.getsize(fn) > 500: return True
        except Exception: await asyncio.sleep(2)
async def main(want):
    jobs = []
    for mf in ('voices_fr.js', 'voices_fr2.js', 'voices_thb.js'):
        M = load(mf); M = M.get('lines', M)
        for key, o in M.items():
            f = o.get('file')
            if not f or f not in want: continue
            if mf == 'voices_thb.js': r, p = PERS[key.split('_')[0]]; v = 'ja-JP-NanamiNeural'
            else: v, r, p = PROFILES[WHO.get(o['who'], o['who'])]
            jobs.append(one(o['ja'], v, r, p, os.path.join(ROOT, f)))
    print('regen', sum(1 for x in await asyncio.gather(*jobs) if x), 'of', len(jobs))
asyncio.run(main(set(sys.argv[1:])))
