#!/usr/bin/env python3
"""システム担当（霧島 怜）の台詞を edge-tts (ja-JP-NanamiNeural) で作り、assets/voices/voices.js の _extra に足す（他の台詞はそのまま）。
冷静でまじめ、きびきびした丁寧語。使い方: python3 tools/add_sysop_voices.py
"""
import asyncio, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edge_tts
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices')
VOICE = 'ja-JP-NanamiNeural'
SYSOP_STYLE = (-4, -6)
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); from voice_profiles import override, style  # 全ステージ共通の声の目録
SYSOP_STYLE = style('sysop')   # 話速%, 高さHz：落ち着いて、きびきび
SYSOP = {
  'sysop_greet': ['システム担当の霧島です。ご用件をどうぞ。', 'お疲れさまです、殿。仕掛けはすべて点検済みです。'],
  'sysop_bye': ['了解しました。持ち場に戻ります。', 'お気をつけて。合図はいつでも出せます。'],
  'sysop_report': ['状況を報告します。'],
  'sysop_num_ally': ['味方%d名、' % n for n in range(0, 31)],
  'sysop_num_enemy': ['敵%d名。' % n for n in range(0, 31)],
  'sysop_num_wave': ['現在、第%d波です。' % n for n in range(1, 21)],
  'sysop_flare': ['狼煙、上げます。物見の合図で、敵の位置をお知らせします。', '了解しました。狼煙を上げます。三十秒、敵の居場所が見えるはずです。'],
  'sysop_flare_now': ['狼煙はいま上がっています。敵の位置、確認してください。'],
  'sysop_flare_wait': ['狼煙台の準備がまだです。もう少しお待ちください。'],
  'sysop_check_now': ['狼煙は上がっています。仕掛けは順調です。'],
  'sysop_check_wait': ['次の狼煙の準備中です。整い次第、お知らせします。'],
  'sysop_check_ok': ['狼煙台、準備できています。いつでも上げられます。'],
  'sysop_praise': ['ありがとうございます。仕掛けが働いてこそ、ですから。', '恐縮です。引き続き、点検を続けます。'],
  'sysop_ca_announce': ['機内のシステムは正常です。…以上、システム担当からのご案内でした。'],
  'sysop_ca_drink_ask': ['お飲み物ですね。お茶とお水、どちらにしますか。'],
  'sysop_ca_drink_tea': ['お茶です。熱いので気をつけてください。'],
  'sysop_ca_drink_water': ['お水です。どうぞ。'],
  'sysop_ca_demo': ['非常口は前方と後方です。誘導灯に沿って、落ち着いて移動してください。'],
  'sysop_hit': ['っ…問題ありません。', 'くっ…まだ動けます。'],
  'sysop_defeat': ['…戦死判定です。仕掛けのことは、本陣に…', '申し訳ありません…あとはお願いします。'],
}
async def one(sem, text, path, rate, pitch):
    if os.path.exists(path) and os.path.getsize(path) > 1000: return
    async with sem:
        for a in range(4):
            try:
                await edge_tts.Communicate(text, VOICE, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz').save(path); return
            except Exception:
                await asyncio.sleep(1.5 * (a + 1))
        print('FAILED', text, path)
async def main():
    jf = os.path.join(D, 'voices.js'); src = open(jf, encoding='utf-8').read()
    m = re.search(r'window\.VOICE_MANIFEST = (\{.*\});\s*$', src, re.S); man = json.loads(m.group(1))
    sem = asyncio.Semaphore(4); jobs = []
    for cat, arr in SYSOP.items():
        st = SYSOP_STYLE
        man['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), st[0], st[1]))
            man['_extra'][cat].append({'text': text, 'files': [fn]})
    await asyncio.gather(*jobs)
    open(jf, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(man, ensure_ascii=False) + ';\n')
    print('sysop lines:', sum(len(v) for v in SYSOP.values()))
asyncio.run(main())
