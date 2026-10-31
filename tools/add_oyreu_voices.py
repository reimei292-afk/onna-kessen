#!/usr/bin/env python3
"""大淀での再会の台詞（西園寺・大宮・綾瀬・早瀬）。声は voice_profiles.py の各人の声。assets/voices/cv/oyreu_<id>.mp3"""
import asyncio, os, sys, edge_tts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices', 'cv')
L = {'ojou': '陛下！ ご無事で……大淀へようこそ。艦はわたしが預かります', 'omiya': '陛下……よかった、本当によかった',
     'fumi': '陛下、記録は全部持ち出しました。皆の名前も', 'sec2': '陛下、お怪我を見せてください。すぐ手当てします'}
async def main():
    for k, t in L.items():
        v, r, p = PROFILES[k]
        for a in range(4):
            try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{p:+d}Hz').save(os.path.join(D, f'oyreu_{k}.mp3')); break
            except Exception: await asyncio.sleep(2 * (a + 1))
asyncio.run(main())
