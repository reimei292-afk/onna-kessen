#!/usr/bin/env python3
"""侍女の台詞を edge-tts (ja-JP-NanamiNeural) で音声ファイル化し、assets/voices/ と voices.js を作る。
性格ごとに話速・声の高さを控えめに変え、同じ台詞を言い方の揺れ違いで3通り生成する（ja-JP の女性ニューラル音声は Nanami のみ）。
使い方: pip install edge-tts && python3 tools/make_voices.py [lines.json]
lines.json の形: {"性格": {"spot": [...], "attack": [...], "hit": [...], "defeat": [...]}, ...}
被弾・脱落の台詞は短い一声（うっ・きゃっ・いたっ・ひっ 等）＋ひと言のみ。咳き込み・ごぼっ・がはっ 等の音は作らない。長い悲鳴・うめき・咳き込み・痛がる台詞・性的に聞こえる声は作らない。
"""
import asyncio, json, os, sys
import edge_tts
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices')
VOICE = 'ja-JP-NanamiNeural'
PERS_STYLE = {   # 性格: (ローマ字, 話速%, 声の高さHz)。不自然にならないよう控えめに
    '好戦的': ('aggr', 6, 2), '慎重': ('caut', -4, -3), '臆病': ('timid', 6, 6), '冷静': ('calm', -6, -6), '陽気': ('cheer', 5, 5),
}
VARIANTS = [(-2, -4), (0, 0), (3, 4)]   # 同じ台詞の言い方の揺れ（話速%, 高さHz）。再生時にさらに ±3% の揺らぎ
EXTRA = {'command': ['かかれーっ！', '青組、迎え撃て！'],
  # v7：槍兵（槍衆）の掛け声、城の戦い
  'yari_charge': ['突撃！', '槍、突撃ーっ！', 'まっすぐ行くよ、突撃！'],
  'yari_ready': ['槍衆、構え！', '槍、構えー！'],
  'amb_go': ['今です、かかれっ！', '伏兵、かかれーっ！'],
  'gate_broken': ['門が破られた！ 二の丸へ！'],
  'bailey_lost': ['二の丸は持たない！ 城内へ退いて！'],
  'pit_fall': ['きゃっ、落とし穴！？', 'えっ、床が…！'],
  'ram_go': ['破門隊、押せーっ！', 'せーのっ！'],
  # v7：近衛分隊の組頭
  'guard_protect': ['殿をお守りしろ！', '殿をお守りして！'],
  'guard_forward': ['近衛、前へ！']}
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
  # 機内のみ：「CAさんみたいなことしてよ」（殿の無茶振り）
  'sec_ca_announce': ['本日はご搭乗、ありがとうございます…って、何を言わせるんですか！', 'み、皆さま、当機はまもなく…って、私、客室乗務員じゃありません！'],
  'sec_ca_drink_ask': ['…こほん。お飲み物はいかがですか？ お茶とお水、どちらになさいますか？'],
  'sec_ca_drink_tea': ['温かいお茶です。どうぞ、ごゆっくり。'],
  'sec_ca_drink_water': ['お水です。冷たいので、ゆっくりどうぞ。'],
  'sec_ca_demo': ['シートベルトは、腰の低い位置で、しっかりお締めください。…これで、よろしいですか？'],
  'sec_ca_refuse': ['それは本物の客室乗務員さんのお仕事です。…今日は、勘弁してください。'],
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
  'sec2_ca_announce': ['本日はご搭乗、ありがとうございまーす！…って、何言わせるんですか、もう！'],
  'sec2_ca_drink_ask': ['お飲み物はいかがですかー？ お茶とお水、どちらになさいますか？'],
  'sec2_ca_drink_tea': ['はい、お茶です！ 熱いので気をつけてくださいね。'],
  'sec2_ca_drink_water': ['はい、お水です！ すっきりしますよ。'],
  'sec2_ca_demo': ['非常口は、前方と後方にございます！ こちらと、あちらです！…ふふ、それっぽかったですか？'],
  'sec2_ca_refuse': ['えー、恥ずかしいですよぉ…今日は勘弁してください！'],
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
# 看護師（救護班、両軍二人ずつ）：やさしく少し高め。外科医は医療係の声（med_）を使う
NURSE_STYLE = (-4, 8)
NURSE = {
  'nurse_go': ['今行きます、待っててね！', 'すぐ行きます！'],
  'nurse_assist': ['先生、お手伝いします。', '押さえていますね、先生。'],
  'nurse_bandage': ['包帯を巻きますね。', 'きつくないですか？ 少し巻きますね。'],
  'nurse_comfort': ['大丈夫、そばにいますからね。', 'ゆっくり息をして…もう少しですよ。'],
  'nurse_start': ['しっかりして、すぐ手当てしますね。'],
  'nurse_arrow': ['矢を抜きますね。少しだけ我慢してね。'],
  'nurse_care': ['大丈夫、そばにいますからね。'],
  'nurse_ok': ['よく頑張りましたね。もう大丈夫です。'],
  'nurse_lost': ['…御臨終です。'],
}
# 秘書課の三人目・四人目（本陣で気配り）
AIDE_STYLE = {'sec3': (-6, -4), 'sec4': (-2, 2)}
AIDE = {
  'sec3_greet': ['お帰りなさいませ。ご無事で何よりです。', 'お疲れさまです。少し休んでいってくださいね。'],
  'sec3_heal': ['お怪我はありませんか？ 少し手当てしますね。', '無理をなさらないでください。…はい、これで大丈夫です。'],
  'sec4_greet': ['お帰りなさいませ。お茶の用意もできていますよ。', 'ご無事でよかった…。お疲れさまです。'],
  'sec4_arrows': ['矢が少なくなっていますね。こちらをどうぞ。', '矢をお持ちしました。お気をつけて。'],
}
# 殿が本陣を出たとき、慌てて追いかける一言
FLUST = {
  'sec_flust': ('SEC', ['お待ちください、殿！', '殿、お一人では危のうございます！']),
  'sec2_flust': ('SEC2', ['あっ、待ってくださーい！', '危ないですよ、殿！']),
  'sec3_flust': ('sec3', ['お待ちください、殿！ お怪我をされては…！']),
  'sec4_flust': ('sec4', ['危ないですよ！ 私もお供します！']),
  'surgeon_flust': ('MED', ['殿、お待ちを！ 救護班もお供します。']),
  'nurse_flust': ('NURSE', ['危ないですよ、殿！ 待ってください！']),
}
# お嬢さま秘書（秘書課 西園寺 すみれ）：王様の遠縁。上品で少し改まった丁寧語。ゆっくり・やや低めで他の秘書と聞き分けられる声
OJOU_STYLE = (-14, -2)
OJOU = {
  'ojou_greet': ['ごきげんよう、王様。何なりとお申し付けくださいませ。', '王様、お呼びでしょうか。'],
  'ojou_bye': ['どうかご無事で、王様。', 'いってらっしゃいませ。お気をつけて。'],
  'ojou_tea': ['王様、お茶をお持ちしましたわ。熱いのでお気をつけて。', '少しお休みになって。温かいお茶ですわ。'],
  'ojou_tea_wait': ['お茶はさきほどお出ししましたわ。少しだけお待ちになって。'],
  'ojou_report': ['王様、ご報告いたしますわ。'],
  'ojou_num_ally': ['味方は%d名、' % n for n in range(0, 31)],
  'ojou_num_enemy': ['敵は%d名。' % n for n in range(0, 31)],
  'ojou_num_wave': ['ただいま、第%d波ですわ。' % n for n in range(1, 21)],
  'ojou_follow': ['お供いたしますわ。親戚として、放っておけませんもの。', '承知いたしましたわ。おそばを離れませんわ。'],
  'ojou_follow_already': ['もうおそばにおりますわ。'],
  'ojou_return': ['では、本陣でお待ちしておりますわ。どうかご無事で。'],
  'ojou_already_hq': ['ええ、本陣におりますわ。'],
  'ojou_back': ['ただいま本陣に戻りましたわ。'],
  'ojou_ca_intro': ['親戚の頼みですもの、仕方ありませんわね。'],
  'ojou_ca_announce': ['本日は西園寺航空にご搭乗いただき、誠にありがとうございますわ。…ふふ、いかがでしたかしら？'],
  'ojou_ca_drink_ask': ['お飲み物はいかがかしら。お茶とお水、どちらになさいます？'],
  'ojou_ca_drink_tea': ['とっておきのお茶ですわ。ごゆっくりどうぞ。'],
  'ojou_ca_drink_water': ['お水ですわ。空の上は乾きますもの。'],
  'ojou_ca_demo': ['酸素マスクが下りてまいりましたら、まずご自身からお着けくださいませ。…こうですわね。'],
  'ojou_care': ['王様、少しお疲れのご様子ですわ。お茶をどうぞ。', '親戚として放っておけませんわ。さあ、ひと息ついてくださいませ。'],
  'ojou_praise': ['まあ、お上手ですこと。でも、褒めても何も出ませんわよ。', '恐れ入りますわ。王様こそ、ご立派でしたわ。', 'ふふ、ありがとうございます。皆さまのおかげですわ。'],
  'ojou_hit': ['きゃっ…！ だ、大丈夫ですわ。', 'っ…平気ですわ。'],
  'ojou_defeat': ['…戦死判定ですわ。王様、どうかご無事で。', '申し訳ございません…本陣でお待ちしておりますわ。'],
  'ojou_flust': ['お待ちになって、王様！', '王様、お一人では危のうございますわ！'],
}
# 倒れた味方の名前を呼ぶ（「〇〇ちゃん！」）。名前（漢字）→読み。声の高さ3段階（VARIANTS）で個体差
CALL_STYLE = (8, 4)
CALL_NAMES = {'千代': 'ちよ', '小春': 'こはる', '楓': 'かえで', '椿': 'つばき', 'あやめ': 'あやめ', '葵': 'あおい', '鈴': 'すず', '雪乃': 'ゆきの', '静': 'しず', '琴': 'こと',
  '茜': 'あかね', 'なでしこ': 'なでしこ', '桔梗': 'ききょう', '綾': 'あや', '初音': 'はつね', '紅葉': 'もみじ', '澪': 'みお', '凛': 'りん', '若菜': 'わかな', '早苗': 'さなえ',
  '志乃': 'しの', '八重': 'やえ', '花': 'はな', '蓮': 'れん', '菫': 'すみれ', '朱里': 'あかり', '霞': 'かすみ', '千鶴': 'ちづる', 'ひなた': 'ひなた', '詩織': 'しおり',
  '咲良': 'さくら', '真白': 'ましろ', '夕霧': 'ゆうぎり', '桃': 'もも', '小雪': 'こゆき', '藍': 'あい', 'ひより': 'ひより', 'しのぶ': 'しのぶ', 'あかり': 'あかり',
  'ゆな': 'ゆな', '玲奈': 'れな', '理紗': 'りさ', '夏海': 'なつみ', '小夜': 'さよ',
  # v7：よくある名前（一般の兵の名前の幅を広げる）
  '美咲': 'みさき', '陽菜': 'ひな', '結衣': 'ゆい', '愛美': 'まなみ', '莉子': 'りこ', '彩花': 'あやか', '優奈': 'ゆうな', '美月': 'みづき', '紗希': 'さき', '七海': 'ななみ',
  '真央': 'まお', '遥': 'はるか', '千尋': 'ちひろ', '瑞希': 'みずき', '里奈': 'りな', '明日香': 'あすか', '沙織': 'さおり', '菜々子': 'ななこ'}
CALL_ROM = {k: 'n%02d' % i for i, k in enumerate(CALL_NAMES)}
# 伝令（本陣と分隊の間を走る娘）
DEN_STYLE = (6, 6)
DEN = {
  'den_take': ['矢、持っていきます！', '補給、行ってきます！'],
  'den_arrows': ['矢、持ってきました！ 使って！', '矢の補給です！'],
  'den_go': ['伝令、行ってきます！'],
  'den_msg': ['本陣より伝令！ 持ち場を守れとのことです！', '本陣より伝令！ そのまま押せとのことです！'],
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
    for cat, arr in NURSE.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), NURSE_STYLE[0], NURSE_STYLE[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for cat, arr in AIDE.items():
        st = AIDE_STYLE[cat.split('_')[0]]
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), st[0], st[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for cat, arr in OJOU.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), OJOU_STYLE[0], OJOU_STYLE[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for cat, (who, arr) in FLUST.items():
        st = {'SEC': SEC_STYLE, 'SEC2': SEC2_STYLE, 'MED': MED_STYLE, 'NURSE': NURSE_STYLE}.get(who) or AIDE_STYLE[who]
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), st[0] + 8, st[1] + 6))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    for given, yomi in CALL_NAMES.items():
        cat = 'call_' + given; files = []
        for vi, dv in enumerate(VARIANTS):
            fn = f'x_call_{CALL_ROM[given]}_{vi}.mp3'; files.append(fn)
            jobs.append(one(sem, yomi + 'ちゃん！', os.path.join(D, fn), CALL_STYLE[0] + dv[0], CALL_STYLE[1] + dv[1] * 2))
        manifest['_extra'][cat] = [{'text': given + 'ちゃん！', 'files': files}]
    for cat, arr in DEN.items():
        manifest['_extra'][cat] = []
        for i, text in enumerate(arr):
            fn = f'x_{cat}_{i}.mp3'; jobs.append(one(sem, text, os.path.join(D, fn), DEN_STYLE[0], DEN_STYLE[1]))
            manifest['_extra'][cat].append({'text': text, 'files': [fn]})
    await asyncio.gather(*jobs)
    json.dump(lines, open(os.path.join(D, 'lines.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(D, 'voices.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/make_voices.py)。edge-tts ja-JP-NanamiNeural。性格×台詞×個体差(声の高さ3段階)\n')
        f.write('window.VOICE_VARIANTS = %d;\nwindow.VOICE_MANIFEST = %s;\n' % (len(VARIANTS), json.dumps(manifest, ensure_ascii=False)))
    print('done', len(jobs), 'clips')
asyncio.run(main())
