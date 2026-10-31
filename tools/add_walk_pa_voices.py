#!/usr/bin/env python3
"""ウォーキングレッスンの講師（白鷺 れいか）と、新しい艦内放送（髪のまとめ方・姿勢と歩き方）の声。edge-tts。録音そのものは使わない"""
import asyncio, os, re, edge_tts
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'cv'); G = open(os.path.join(ROOT, 'game.js'), encoding='utf8').read()
W = dict(re.findall(r"(\w): '([^']+)'", re.search(r"const WALK_V = \{(.*?)\};", G).group(1)))
PA = {m[1]: m[0] for m in re.findall(r"\['[^']+', '([^']+)', '(pa_\w+)'\]", G)}
async def one(t, p, pi, r):
    for a in range(4):
        try: await edge_tts.Communicate(t, 'ja-JP-NanamiNeural', rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
async def main():
    for k, t in W.items(): await one(t, os.path.join(D, f'walk_t_{k}.mp3'), -25, -8)
    for f, t in PA.items(): await one(t, os.path.join(D, f + '.mp3'), 18, -4)
asyncio.run(main())
