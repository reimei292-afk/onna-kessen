#!/usr/bin/env python3
"""侍女の台詞を edge-tts (ja-JP-NanamiNeural) で音声ファイル化し、assets/voices/ と voices.js を作る。
性格ごとに話速・声の高さを控えめに変え、同じ台詞を言い方の揺れ違いで3通り生成する（ja-JP の女性ニューラル音声は Nanami のみ）。
使い方: pip install edge-tts && python3 tools/make_voices.py [lines.json]
lines.json の形: {"性格": {"spot": [...], "attack": [...], "hit": [...], "defeat": [...]}, ...}
被弾・脱落の台詞は短い一声（うっ・くっ・きゃっ 等）＋ひと言のみ。長い悲鳴・うめき・咳き込み・痛がる台詞・性的に聞こえる声は作らない。
"""
import asyncio, json, os, sys
import edge_tts
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices')
VOICE = 'ja-JP-NanamiNeural'
PERS_STYLE = {   # 性格: (ローマ字, 話速%, 声の高さHz)。不自然にならないよう控えめに
    '好戦的': ('aggr', 6, 2), '慎重': ('caut', -4, -3), '臆病': ('timid', 6, 6), '冷静': ('calm', -6, -6), '陽気': ('cheer', 5, 5),
}
VARIANTS = [(-2, -4), (0, 0), (3, 4)]   # 同じ台詞の言い方の揺れ（話速%, 高さHz）。再生時にさらに ±3% の揺らぎ
EXTRA = {'command': ['かかれーっ！', '青組、迎え撃て！']}
# 本陣の秘書課の侍女（落ち着いた丁寧な話し方）
SEC_STYLE = (-6, -8)
SEC = {
  'sec_greet': ['お疲れさまです。何なりとお申し付けください。', 'お戻りなさいませ。ご用件をどうぞ。', 'こちらは本陣です。ここなら安全ですよ。'],
  'sec_tea': ['お茶をどうぞ。熱いのでお気をつけて。', '温かいお茶です。ひと息ついてくださいね。'],
  'sec_tea_wait': ['お茶はさきほどお出ししましたよ。少しお待ちくださいね。'],
  'sec_report': ['ご報告いたします。'],
  'sec_plan_def': ['承知しました。守りを固めます。弓兵は遮蔽物の陰から射るよう伝えますね。'],
  'sec_plan_off': ['承知しました。攻勢に転じます。皆さまに前進をお伝えしますね。'],
  'sec_shoulder': ['少しだけですよ。…はい、肩が軽くなりましたか？', 'お疲れのようですね。…これで矢を引くのも楽になるはずです。'],
  'sec_fan': ['はい、扇いで差し上げますね。涼しいでしょう？', '風をお送りします。どうぞ、ごゆっくり。'],
  'sec_arrows': ['矢をそろえておきました。どうぞお持ちください。'],
  'sec_arrows_full': ['矢筒はもういっぱいですよ。'],
  'sec_bye': ['ご武運を。', 'いってらっしゃいませ。お気をつけて。'],
  # 護衛として同行するとき
  'sec_follow': ['承知しました。お供いたします。', 'はい、背中はお任せください。'],
  'sec_already': ['もうお供しておりますよ。'],
  'sec_return': ['では、本陣に戻ります。どうかご無事で。'],
  'sec_spot': ['敵影です。お気をつけて。', '前方に橙組です。'],
  'sec_attack': ['援護します！', '射ます！', 'そこです！'],
  'sec_hit': ['っ…大丈夫です。', '平気です、続けてください。', 'きゃっ…！ だ、大丈夫です。', 'くっ…まだ射てます。'],
  'sec_defeat': ['申し訳ありません…戦死判定です。', '…ここまでのようです。本陣でお待ちしますね。', '戦死判定…了解です。あとは、お願いします。'],
  'sec_back': ['ただいま本陣に戻りました。'],
  # ご飯（1つの波につき1回）
  'sec_meal_ask': ['えっ、戦の最中にですか！？…かしこまりました。何にしましょう。', 'い、今すぐですか！？…はい、承知しました。何になさいますか？'],
  'sec_meal_ok': ['かしこまりました。少々お待ちくださいね。', 'はい、すぐにお作りします。'],
  'sec_meal_done_onigiri': ['おむすび、握ってきました！ 卓に置いておきますね。'],
  'sec_meal_done_miso': ['お味噌汁、できました。熱いのでお気をつけて。'],
  'sec_meal_done_chazuke': ['お茶漬けです。さらさらっと、どうぞ。'],
  'sec_meal_busy': ['ただいまお作りしています。もう少々お待ちください。'],
  'sec_meal_ready': ['卓にご用意してありますよ。冷めないうちにどうぞ。'],
  'sec_meal_wait': ['この波では、もうお出ししましたよ。次の波まで、お待ちくださいね。'],
  'sec_c_onigiri': ['急いで握ったので、形がちょっと…。でも、塩加減は自信あります！', 'ありがとうございます。具は、梅とおかかにしてみました。', 'ふふ、お口に合ってよかったです。おかわりは、次の波で。'],
  'sec_meal_away': ['本陣に戻ったら、すぐにお作りしますね。'],
  # 「感想を言う」への返事（戦況で選ぶ）
  'sec_c_paint_hi': ['ええ、矢がずいぶん当たっていますね。よく持ちこたえています。'],
  'sec_c_paint_mid': ['ところどころ矢が当たっていますね。まだ大丈夫です。'],
  'sec_c_paint_lo': ['いえ、まだほとんど当たっていませんよ。'],
  'sec_c_notower': ['ここは平原ですから、櫃はありませんよ。'],
  'sec_c_east': ['はい、東の櫃に矢が集まっています。援護が要るかもしれません。'],
  'sec_c_west': ['いえ、押されているのは、むしろ西の櫃のほうです。'],
  'sec_c_even': ['どちらの櫃も同じくらいですね。今は均衡しています。'],
  'sec_c_quiet': ['今は、どちらの櫃も静かですね。'],
  'sec_c_ally_hi': ['ええ、皆さんよく粘っています。味方のほうが多いくらいです。'],
  'sec_c_ally_mid': ['互角の戦いです。気を抜かずにいきましょう。'],
  'sec_c_ally_lo': ['正直、少し押されています。無理はなさらないでくださいね。'],
  'sec_c_arch_hi': ['はい、敵は弓兵が多いですね。竹束の陰に気をつけてください。'],
  'sec_c_arch_mid': ['弓兵と近接兵が、半々くらいですね。'],
  'sec_c_arch_lo': ['いえ、今は近接兵のほうが多いようです。守りを固めましょう。'],
  'sec_c_none': ['今は敵の姿が見えませんね。次の波に備えましょう。'],
  'num_ally': ['味方は%d名、' % n for n in range(0, 31)],
  'num_enemy': ['敵は%d名。' % n for n in range(0, 31)],
  'num_wave': ['ただいま、第%d波です。' % n for n in range(1, 21)],
}
# 二人目の秘書（秘書課 早瀬 ことね、陽気）：明るく丁寧
SEC2_STYLE = (4, 14)
SEC2 = {
  'sec2_greet': ['はーい、ご用ですか？', 'お呼びですか？ なんでも言ってくださいね。'],
  'sec2_bye': ['いってらっしゃい！ お気をつけて。', 'ご武運を！'],
  'sec2_tea': ['はい、お茶です。ほっとしますよ。', 'お茶どうぞ。熱いので気をつけてくださいね。'],
  'sec2_tea_wait': ['さっきお淹れしたばかりですよ。少し待ってくださいね。'],
  'sec2_report': ['はい、ご報告です！'],
  'sec2_shoes': ['ぴかぴかにしておきますね。', 'お靴、磨きますね。少しだけ、そのままで。'],
  'sec2_shoes_done': ['はい、ぴかぴかです！ 足取りも軽くなりますよ。'],
  'sec2_shoes_wait': ['まだぴかぴかですよ。もう少ししたら、また磨きますね。'],
  'sec2_carry': ['お荷物、お持ちしますね。矢筒はお任せください。', 'はい、ついて行きます！ 矢はいつでもお渡ししますね。'],
  'sec2_carry_already': ['もうお持ちしていますよ。'],
  'sec2_already_hq': ['はい、本陣におりますよ。'],
  'sec2_return': ['では、本陣に戻りますね。ご無事で！'],
  'sec2_back': ['本陣に戻りました！'],
  'sec2_hit': ['きゃっ！', 'ひっ…！ だ、大丈夫です。', 'くっ…平気です！'],
  'sec2_defeat': ['うっ…戦死判定です。ごめんなさい。', '…ここまでみたいです。本陣で待ってますね。'],
  'sec2_num_ally': ['味方は%d名、' % n for n in range(0, 31)],
  'sec2_num_enemy': ['敵は%d名。' % n for n in range(0, 31)],
  'sec2_num_wave': ['ただいま、第%d波です。' % n for n in range(1, 21)],
}
# 医療係（両軍の本陣に一人ずつ）：落ち着いた声。傷などの言葉は使わない
MED_STYLE = (-12, -14)
MED = {
  'med_go': ['救護に向かいます。', '今行きます！'],
  'med_start': ['しっかりして、すぐ手当てします。', '大丈夫、すぐ手当てしますね。'],
  'med_arrow': ['矢が刺さっています、引き抜きますよ。', '矢を抜きますね。少しだけ、我慢して。'],
  'med_care': ['ゆっくり息をして。…そう、その調子。', '落ち着いて。私がついています。'],
  'med_ok': ['もう大丈夫です。', 'もう大丈夫です。無理はしないでくださいね。'],
  'med_lost': ['…御臨終です。'],
}
async def one(sem, text, path, rate, pitch):
    if os.path.exists(path) and os.path.getsize(path) > 1000: return
    async with sem:
        for attempt in range(4):
            try:
                c = edge_tts.Communicate(text, VOICE, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz')
                await c.save(path); return
            except Exception as e:
                await asyncio.sleep(1.5 * (attempt + 1))
        print('FAILED', text, path)
async def main():
    lines = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, 'lines.json'), encoding='utf-8'))
    os.makedirs(D, exist_ok=True)
    sem = asyncio.Semaphore(4); jobs = []; manifest = {}
    for pers, cats in lines.items():
        rom, rate, base = PERS_STYLE[pers]
        manifest[pers] = {}
        for cat, arr in cats.items():
            manifest[pers][cat] = []
            for i, text in enumerate(arr):
                files = []
                for vi, dv in enumerate(VARIANTS):
                    fn = f'{rom}_{cat}_{i}_{vi}.mp3'; files.append(fn)
                    jobs.append(one(sem, text, os.path.join(D, fn), rate + dv[0], base + dv[1]))
                manifest[pers][cat].append({'text': text, 'files': files})
    manifest['_extra'] = {}
    for cat, arr in EXTRA.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), 10, 0))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for cat, arr in SEC.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), SEC_STYLE[0], SEC_STYLE[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for cat, arr in SEC2.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), SEC2_STYLE[0], SEC2_STYLE[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for cat, arr in MED.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), MED_STYLE[0], MED_STYLE[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    await asyncio.gather(*jobs)
    json.dump(lines, open(os.path.join(D, 'lines.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(D, 'voices.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/make_voices.py)。edge-tts ja-JP-NanamiNeural。性格×台詞×個体差(声の高さ3段階)\n')
        f.write('window.VOICE_VARIANTS = %d;\nwindow.VOICE_MANIFEST = %s;\n' % (len(VARIANTS), json.dumps(manifest, ensure_ascii=False)))
    print('done', len(jobs), 'clips')
asyncio.run(main())
