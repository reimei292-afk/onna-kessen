#!/usr/bin/env python3
"""英国淑女編 第二幕「砲火」の台詞を edge-tts で作る（make_voices_situ.py と同じ作り方）。
- 侍女の場面台詞：性格ごと（make_voices_situ.py の PERS と同じ話速・高さの Nanami。個体差は再生時の VV_RATE）
- 殿（Keita）・西園寺（ojou）・白瀬（sec）・救護（nurse）は make_voices_situ.py の STYLE と同じ
- 英国の娘：add_uk_voices.py の VOICES と同じ声（英語・日本語字幕）
出力: assets/voices/uk2/*.mp3 と assets/voices/voices_uk2.js（window.VOICE_UK2 = { jp: {cat: {rom: [{text, file, dur}]}}, lines: {key: {who, en, ja, file, dur, voice}} }）
Usage: python3 tools/add_uk2_voices.py [--force]
"""
import asyncio, json, os, subprocess, sys, importlib.util
import edge_tts
T = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(T, '..'); D = os.path.join(ROOT, 'assets', 'voices', 'uk2')
FORCE = '--force' in sys.argv
NANAMI, KEITA = 'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'
PERS = {'aggr': (8, 2), 'caut': (-4, -3), 'timid': (6, 8), 'calm': (-6, -7), 'cheer': (6, 6)}
STYLE = {'king': (KEITA, -6, -2), 'ojou': (NANAMI, -14, -2), 'sumi': (NANAMI, -6, -8), 'nurse': (NANAMI, -4, 8), 'med': (NANAMI, -12, -14)}
# 英国の娘の声は add_uk_voices.py から
src = open(os.path.join(T, 'add_uk_voices.py'), encoding='utf-8').read()
ns = {}; exec(src[src.index('VOICES = {'):src.index('}', src.index('VOICES = {')) + 1], ns); UKV = ns['VOICES']
JP = {
 'shell': {'aggr': ['くっ…大砲なんかに怯むもんか！', '地面ごと揺れた…でも退かない！', '上で弾けた！ 伏せて！'],
           'caut': ['空で破裂しています、頭を低く！', '破片が飛んできます、動かないで。', '次の着弾まで、数えて…'],
           'timid': ['ひっ…！ い、今の何…！？', 'やだ、地面が揺れてる…！', 'こ、怖い…でも、伏せなきゃ…'],
           'calm': ['破裂弾です。直撃でなくても破片が来ます。', '落ち着いて。笛の音が近くなったら伏せて。', '着弾、手前。次は修正してきます。'],
           'cheer': ['わっ、すごい音…！ みんな無事！？', 'びっくりした〜…でも平気、平気！', 'うわっ、砂が降ってきた！']},
 'cover': {'aggr': ['竹束の陰へ！ 早く！', '頭、出さないで！ 竹束の後ろ！'],
           'caut': ['竹束の陰へ。建物の裏でもいい。', '笛の音がしたら、すぐ陰に。'],
           'timid': ['た、竹束の陰へ…！ 待って、私も！', 'ここ…ここなら大丈夫…！'],
           'calm': ['竹束の陰へ。浜からは下がって。', '海に向かって立たないで。竹束を盾に。'],
           'cheer': ['竹束の陰へ！ ほら、こっちこっち！', 'みんな、竹束の後ろに隠れて！']},
 'musket': {'aggr': ['鉄砲だ…！ あの娘たち、全員持ってる！', '火縄じゃない…あれが向こうの鉄砲か！'],
            'caut': ['鉄砲隊です。煙が晴れるまで動かないで。', 'あの距離から届きます。気をつけて。'],
            'timid': ['て、鉄砲…！？ あんなにたくさん…！', '煙と音が…こ、怖い…'],
            'calm': ['マスケットです。一斉に撃って、込め直しに時間がかかります。', '撃ったあとが狙い目です。'],
            'cheer': ['うわ、鉄砲がずらっと…！ 本物の軍隊みたい！', '煙すごい！ でも、込め直しの間に行けるよ！']},
 'pike': {'aggr': ['長い槍…！ 私の槍の倍はある！', '槍の壁か…面白いじゃない！'],
          'caut': ['長槍の方陣です。正面からは入れません。', '横に回りましょう。正面は危険です。'],
          'timid': ['や、槍がいっぱい…近づけない…！', 'あれ…ぜんぶ槍…！？'],
          'calm': ['長槍の方陣。動きは遅い。側面を狙えます。', '槍ぶすまです。弓で崩してから。'],
          'cheer': ['長っ！ あの槍、物干し竿みたい！', '槍がハリネズミみたいに並んでる！']},
 'drill': {'aggr': ['足並みが揃ってる…あれが本物の兵…！', 'くっ、乱れない…！ 鍛えてある！'],
           'caut': ['交代で撃っています。隙が少ない…', '号令ひとつで動いています。よく訓練されています。'],
           'timid': ['み、みんな同じ動き…なんで崩れないの…', '怖い…まるで機械みたい…'],
           'calm': ['前列と後列で交互に撃っています。見事な規律です。', '号令で動く隊列。指揮官を狙えば崩れます。'],
           'cheer': ['すごい、揃ってる…！ 感心してる場合じゃないけど！', '行進みたい…でも負けないよ！']},
 'encourage': {'aggr': ['押し返すよ！ 浜へ追い落とせ！', 'ここは私たちの港だ！'],
               'caut': ['焦らないで。一人ずつ確実に。', '隊列を崩さずに。もう少しです。'],
               'timid': ['わ、私も…やります…！', 'みんながいるから…怖くない…！'],
               'calm': ['持ちこたえれば勝てます。落ち着いて。', '隣を見て。一人ではありません。'],
               'cheer': ['大丈夫、私たちならいける！', 'がんばろ！ 港はぜったい渡さない！']},
 'spot': {'aggr': ['上がってきた！ 迎え撃つよ！', '短艇が着いた！ 来るよ！'],
          'caut': ['上陸してきます。数が多い…', '浜に敵。隊列を組んでいます。'],
          'timid': ['き、来た…浜に上がってきた…！', 'あ、あんなにたくさん…！'],
          'calm': ['上陸を確認。距離、五十。', '敵、浜に展開。隊列あり。'],
          'cheer': ['来た来た、上がってきたよ！', '見えた！ 英国の娘たち！']},
 'attack': {'aggr': ['てやぁっ！', '浜へ帰りなっ！'], 'caut': ['今です…！', 'そこ…！'], 'timid': ['え、えいっ…！', '当たって…！'],
            'calm': ['射ます。', 'そこです。'], 'cheer': ['いっけー！', 'それっ！']},
 'kill': {'aggr': ['一人、押し返した！', '次！'], 'caut': ['一人、倒しました。', '…次へ。'], 'timid': ['た、倒した…？', 'ごめんなさい…！'],
          'calm': ['一人。', '次の目標へ。'], 'cheer': ['やった！', 'よし、一人！']},
 'allydown': {'aggr': ['よくも…！', '仇は取る！'], 'caut': ['…一人、倒れました。下がらないで。', '救護班を…！'],
              'timid': ['うそ…いやっ…！', 'そんな…！'], 'calm': ['…味方が倒れました。持ち場を詰めて。', '救護班、こちらへ。'],
              'cheer': ['そんな…！ しっかりして！', '…負けないよ、絶対。']},
 'charge': {'aggr': ['斬り込みだ！ 受けて立つ！', '剣の娘たち…来い！'], 'caut': ['斬り込んできます！ 竹束の線で止めて！', '剣です。間合いに入れないで。'],
            'timid': ['ひっ、走ってくる…！', 'こ、来ないで…！'], 'calm': ['最後の突撃です。ここを凌げば終わります。', '斬り込み。槍で間合いを取って。'],
            'cheer': ['最後の勝負だよ、みんな！', '来るよ来るよ！ 踏ん張って！']},
 'win': {'aggr': ['追い払った…！ 港は守ったよ！', '見たか！'], 'caut': ['退いていきます…守り切りました。', '…終わった、んですね。'],
         'timid': ['か、勝った…の…？', 'よかった…ほんとによかった…'], 'calm': ['撃退しました。…次は夜が危ない。', '港を守りました。'],
         'cheer': ['やったー！ 守ったよ！', '勝った…！ みんな、勝ったよ！']},
}
LINES = {}
def add(key, who, en, ja): LINES[key] = {'who': who, 'en': en, 'ja': ja}
# 殿・西園寺・白瀬（開幕の軍議）
add('k_open', 'king', '', '竹束を並べよ。砲撃の間は浜から下がれ。上がってきたところを、浜で迎え撃つ。小早は町の裏の入り江へ回せ。一艘も失うな。')
add('sai_1', 'ojou', '', '船には手が出せません。上がってきたところを討ちましょう。')
add('sumi_1', 'sumi', '', '砲術長は破裂弾と申しておりました。竹束を並べ、浜からは人を下げましょう。')
add('k_ok', 'king', '', 'よし。あの砲術長の言葉、信じよう。破片から身を隠せ。')
add('k_land', 'king', '', '上がってきたぞ！ 浜で迎え撃て！')
add('k_charge', 'king', '', '斬り込みだ！ 竹束の線で止めろ！')
add('k_win', 'king', '', '追い払った…！ 港は守ったぞ。')
add('sumi_win', 'sumi', '', '…殿。船は沖に錨を下ろしました。夜のうちに、こちらから参りましょう。')
add('sai_win', 'ojou', '', '皆、よく持ちこたえましたわ。倒れた者は、救護班のもとへ。')
for i, t in enumerate(['動かないで。すぐ手当てしますからね。', '竹束の陰で手当てします。少しだけ我慢して。', '大丈夫、そばにいます。頭は低くね。']): add(f'med_start_{i}', 'nurse', '', t)
for i, t in enumerate(['よく頑張りましたね。でも頭は低くですよ。', 'もう大丈夫。砲の音がしたら伏せてくださいね。']): add(f'med_ok_{i}', 'nurse', '', t)
# 砲撃・破片向けの手当ての言葉（第二幕では「矢を抜きます」の代わり。傷や血の描写なし）
for i, t in enumerate(['しっかりしてください、手当てします。', '爆風に当てられたのね。動かないで、すぐ手当てします。', '大丈夫、耳は聞こえますか？ ゆっくり息をして。']): add(f'med_aid_n_{i}', 'nurse', '', t)
for i, t in enumerate(['しっかりしてください、手当てします。', '爆風で倒れたのですね。今、診ますから動かないで。', '落ち着いて。頭を低くしたまま、手当てを受けてください。']): add(f'med_aid_d_{i}', 'med', '', t)
# 英国の娘
E = [('uk10', 'c_fire', 'Battery — fire!', '砲列、撃て！'),
     ('uk10', 'c_shift', 'Shift your aim to the town edge. Keep well clear of our own people!', '狙いを町の端へ。味方からは十分に離して！'),
     ('uk01', 'i_row', 'Give way together! Pull, ladies, pull!', '揃えて漕いで！ 漕いで、漕いで！'),
     ('uk01', 'i_beach', 'Beach her! Out you get — form on the sand!', '浜に乗り上げて！ 降りて、砂の上で隊列を！'),
     ('uk08', 's_first', 'There they are, ladies. Steady... wait for my word.', 'いたわね。落ち着いて……わたしの合図を待つのよ。'),
     ('uk08', 's_ready', 'Musketeers — make ready!', 'マスケット隊、構え用意！'),
     ('uk08', 's_present', 'Front rank — present!', '前列、狙え！'),
     ('uk08', 's_fire', 'Fire!', '撃て！'),
     ('uk08', 's_second', 'Second rank — present... fire!', '後列、狙え……撃て！'),
     ('uk08', 's_reload', 'Reload! Smartly now!', '装填！ 手早く！'),
     ('uk08', 's_advance', 'The line will advance — ten paces — march!', '戦列、前進——十歩——進め！'),
     ('uk02', 'h_port', 'Pikes — port your pikes! Slow time — advance!', '長槍、立て！ ゆっくり——前進！'),
     ('uk02', 'h_charge', 'Charge your pikes!', '槍、構え！'),
     ('uk02', 'h_close', 'Close up! Keep the square!', '詰めて！ 方陣を崩さないで！'),
     ('uk04', 'b_land', 'Swords! Over the bundles — with me!', '剣の者、竹束を越えて——続いて！'),
     ('uk04', 'b_charge', 'For the Princess! Charge!', '王女殿下のために！ 突撃！'),
     ('uk04', 'b_fall', 'Fall back... fall back to the boats!', '退いて……小舟まで退いて！'),
     ('uk03', 'r_drum', 'Beat the retreat! Back to the boats!', '退却の太鼓！ 小舟へ戻って！'),
     ('uk06', 'e_part', 'Well fought, Your Majesty! Keep your harbour — for tonight. We shall speak again.', 'お見事でした、陛下！ 港はお守りなさい——今夜のところは。また、お話ししましょう。')]
for who, k, en, ja in E: add(k, who, en, ja)
for u in [f'uk{i:02d}' for i in range(1, 11)]:
    add(f'{u}_g_attack', u, 'For England!', '英国のために！')
    add(f'{u}_g_attack2', u, 'Have at you!', 'いざ！')
    add(f'{u}_g_back', u, 'Back to the boats!', '小舟へ戻って！')
def vfor(who):
    if who in STYLE: return STYLE[who]
    v = UKV[who]; return (v[0], v[1], v[2])
async def one(sem, text, path, voice, rate, pitch):
    if not FORCE and os.path.exists(path) and os.path.getsize(path) > 800: return
    async with sem:
        for a in range(5):
            try:
                tmp = path + '.part'
                await edge_tts.Communicate(text, voice, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz').save(tmp)
                if os.path.getsize(tmp) < 800: raise RuntimeError('empty')
                os.replace(tmp, path); return
            except Exception:
                await asyncio.sleep(1.5 * (a + 1))
        print('FAILED', path, text)
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 0
async def main():
    os.makedirs(D, exist_ok=True); sem = asyncio.Semaphore(6); jobs = []; J = {}
    for cat, per in JP.items():
        J[cat] = {}
        for rom, arr in per.items():
            r, p = PERS[rom]; J[cat][rom] = []
            for i, t in enumerate(arr):
                fn = f'j_{cat}_{rom}_{i}.mp3'; jobs.append(one(sem, t, os.path.join(D, fn), NANAMI, r, p)); J[cat][rom].append({'text': t, 'file': 'uk2/' + fn})
    for k, v in LINES.items():
        voice, r, p = vfor(v['who']); fn = k + '.mp3'; v['voice'] = voice; v['file'] = 'uk2/' + fn
        jobs.append(one(sem, v['en'] or v['ja'], os.path.join(D, fn), voice, r, p))
    await asyncio.gather(*jobs)
    for cat in J:
        for rom in J[cat]:
            for l in J[cat][rom]: l['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', l['file']))
    for v in LINES.values(): v['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', v['file']))
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_uk2.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_uk2_voices.py)。英国淑女編 第二幕「砲火」の台詞\n')
        f.write('window.VOICE_UK2 = %s;\n' % json.dumps({'jp': J, 'lines': LINES}, ensure_ascii=False))
    miss = [l['file'] for c in J.values() for r in c.values() for l in r if not l['dur']] + [k for k, v in LINES.items() if not v['dur']]
    print('jp', sum(len(r) for c in J.values() for r in c.values()), 'lines', len(LINES), 'missing', miss)
asyncio.run(main())
