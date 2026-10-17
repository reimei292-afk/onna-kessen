#!/usr/bin/env python3
"""記録係の秘書（秘書課 綾瀬 文乃）の台詞を edge-tts (ja-JP-NanamiNeural) で作り、assets/voices/voices.js の _extra に足す（他の台詞はそのまま）。
穏やかで物静か、やわらかい丁寧語。使い方: python3 tools/add_fumi_voices.py
"""
import asyncio, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edge_tts
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices')
VOICE = 'ja-JP-NanamiNeural'
FUMI_STYLE = (-10, 2)   # 話速%, 高さHz：ゆっくり、やわらかく
FUMI = {
  'fumi_greet': ['お疲れさまです、殿。手帳はいつでも開けますよ。', 'お呼びでしょうか。何なりとどうぞ。', 'おかえりなさいませ。ここは本陣です、少し落ち着いてくださいね。'],
  'fumi_bye': ['いってらっしゃいませ。ご無事のご様子も、きちんと書き留めますね。', 'どうかお気をつけて。'],
  'fumi_tea': ['お茶をどうぞ。少し冷ましておきました。', '温かいお茶です。ひと息ついてくださいね。'],
  'fumi_tea_wait': ['お茶はさきほどお出ししましたよ。もう少しだけお待ちくださいね。'],
  'fumi_report': ['殿、手帳の写しです。'],
  'fumi_num_ally': ['味方は%d名、' % n for n in range(0, 31)],
  'fumi_num_enemy': ['敵は%d名。' % n for n in range(0, 31)],
  'fumi_num_wave': ['ただいま、第%d波です。' % n for n in range(1, 21)],
  'fumi_record': ['では、ここまでの記録を読み上げますね。', '手帳を開きます。…はい、記録です。'],
  'fumi_record_end': ['以上、手帳に書き留めてございます。', '記録はここまでです。続きも、きちんと残しますね。'],
  'fumi_follow': ['承知しました。後ろで記録を取りながら、ついてまいります。', 'お供します。お邪魔にならないよう、少し後ろを歩きますね。'],
  'fumi_follow_already': ['はい、すぐ後ろにおりますよ。'],
  'fumi_return': ['では、本陣に戻って記録をまとめておきます。お気をつけて。'],
  'fumi_already_hq': ['はい、本陣におります。'],
  'fumi_back': ['本陣に戻りました。記録の続きをつけておきますね。'],
  'fumi_praise': ['ありがとうございます。そう言っていただけると、書く手にも力が入ります。', '恐れ入ります。殿のお働きがあるから、書くことがあるんですよ。'],
  'fumi_ca_announce': ['ご搭乗の皆さま、ただいま本機は穏やかに飛行しております。…こ、こんな感じでしょうか。'],
  'fumi_ca_drink_ask': ['お飲み物はいかがですか。お茶とお水がございます。'],
  'fumi_ca_drink_tea': ['お茶です。熱いので、ゆっくりどうぞ。'],
  'fumi_ca_drink_water': ['お水です。空の上は乾きますから。'],
  'fumi_ca_demo': ['非常口は、前方と後方にございます。…念のため、手帳にも書いておきますね。'],
  'fumi_hit': ['っ…だ、大丈夫です。', 'きゃっ…！ 手帳は無事です。'],
  'fumi_defeat': ['…戦死判定です。記録の続きは、本陣で。', '申し訳ありません…あとは、お願いします。'],
  'fumi_flust': ['殿、お待ちください。記録係もお供します。', 'お一人では危ないです、殿。'],
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
    for cat, arr in FUMI.items():
        st = (FUMI_STYLE[0] + 8, FUMI_STYLE[1] + 6) if cat.endswith('_flust') else FUMI_STYLE
        man['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), st[0], st[1]))
            man['_extra'][cat].append({'text': text, 'files': [fn]})
    await asyncio.gather(*jobs)
    open(jf, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(man, ensure_ascii=False) + ';\n')
    print('fumi lines:', sum(len(v) for v in FUMI.values()))
asyncio.run(main())
