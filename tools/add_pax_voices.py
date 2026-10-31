#!/usr/bin/env python3
"""中央エレベーターのエレベーターガール（天音 ののか）とカフェの二人（葉月 ここな・美空 みるく）の声。edge-tts。assets/voices/cv/pax_*.mp3"""
import asyncio, os, edge_tts
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'cv')
L = {
 'elv': ('ja-JP-NanamiNeural', 32, 2, {
  'greet': 'いらっしゃいませ。何階へ参りますか？', 'up': '上へ参ります。', 'down': '下へ参ります。', 'close': 'ドアが閉まります。', 'here': 'こちらの階でございます。',
  'f5': '5階、飛行甲板でございます。', 'f4': '4階、格納庫でございます。', 'cafe': '4階、カフェでございます。', 'f3': '3階、第二甲板、客室甲板でございます。',
  'f2': '2階、中甲板、王の間、小劇場でございます。', 'f1': '1階、大劇場でございます。'}),
 'cf1': ('ja-JP-NanamiNeural', 12, 10, {
  'hello': 'いらっしゃいませ！カフェへようこそ！', 'ask': 'アイスクリーム、バニラとストロベリーとチョコがございます。', 'serve': 'お待たせしました！どうぞ、ごゆっくり。'}),
 'cf2': ('ja-JP-NanamiNeural', -8, -4, {
  'hello': 'いらっしゃいませ。お好きなお席へどうぞ。', 'serve': 'コーンにたっぷり盛りましたよ。', 'bye': 'ありがとうございました。またお越しくださいませ。'}),
}
async def one(t, p, v, pi, r):
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
async def main():
    for who, (v, pi, r, m) in L.items():
        for k, t in m.items(): await one(t, os.path.join(D, f'pax_{who}_{k}.mp3'), v, pi, r)
asyncio.run(main())
