#!/usr/bin/env python3
"""英国淑女編 第四幕「王女」の台詞を edge-tts で作る（add_uk2_voices.py と同じ作り方）。
- 侍女の場面台詞：性格ごと（PERS の話速・高さの Nanami）。接近中のささやき（whisper/nerves/beam）は小さく・ゆっくり作り、再生時も遠くの声として鳴らす
- 殿（Keita）・西園寺（ojou）・白瀬（sumi）・救護（nurse / med）は add_uk2_voices.py の STYLE と同じ
- 英国の娘：add_uk_voices.py の VOICES と同じ声（英語・日本語字幕）
出力: assets/voices/uk4/*.mp3 と assets/voices/voices_uk4.js（window.VOICE_UK3 = { jp: {cat: {rom: [{text, file, dur}]}}, lines: {key: {who, en, ja, file, dur, voice}} }）
Usage: python3 tools/add_uk4_voices.py [--force]
"""
import asyncio, json, os, subprocess, sys
import edge_tts
T = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(T, '..'); D = os.path.join(ROOT, 'assets', 'voices', 'uk4')
FORCE = '--force' in sys.argv
NANAMI, KEITA = 'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'
PERS = {'aggr': (8, 2), 'caut': (-4, -3), 'timid': (6, 8), 'calm': (-6, -7), 'cheer': (6, 6)}
QUIET = set()
STYLE = {'king': (KEITA, -6, -2), 'ojou': (NANAMI, -14, -2), 'sumi': (NANAMI, -6, -8), 'nurse': (NANAMI, -4, 8), 'med': (NANAMI, -12, -14)}
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); from voice_profiles import override, style  # 全ステージ共通の声の目録
override(STYLE)
src = open(os.path.join(T, 'add_uk_voices.py'), encoding='utf-8').read()
ns = {}; exec(src[src.index('VOICES = {'):src.index('}', src.index('VOICES = {')) + 1], ns); UKV = ns['VOICES']
JP = {
 'fleet': {'aggr': ['……船が、あんなに。でも、陸に上がれば同じよ。', '大きな船ばっかり……上等じゃない。'],
           'caut': ['……四隻。いえ、もっと……本隊です。', '沖が、船で埋まっています……油断できません。'],
           'timid': ['ふ、船が……あんなにたくさん……！', 'あ、あれ全部、英国の……？'],
           'calm': ['大型艦が四隻。王女の本隊ですね。', '沖の船は動きません。戦は陸の上です。'],
           'cheer': ['わぁ……船、すごい数！ 見て見て！', 'おっきい船……でも、負けないもん！']},
 'fence': {'aggr': ['柵ごとき、蹴破ってやる！', 'あの柵の向こうに王女がいる……行くよ！'],
           'caut': ['柵です。正面の口は狭い……迂回も考えて。', '柵の内に大砲。……近づくほど危険です。'],
           'timid': ['さ、柵……あんなに高いの……？', 'あの中に、鉄砲がいっぱい……'],
           'calm': ['柵の口は二つ。正面と、東の脇です。', '英国式の陣ですね。天幕の奥に王女の旗。'],
           'cheer': ['お城みたいな柵！ でも入口、あるよね！', 'テントがいっぱい……キャンプみたい！']},
 'cannon': {'aggr': ['大砲がなんだ！ 走れ、走れ！', 'ちっ……竹束の陰へ！ すぐ出るよ！'],
            'caut': ['砲声です！ 竹束の陰に伏せて！', '破片が来ます。頭を低く！'],
            'timid': ['ひっ……！ 大砲……！ こ、怖い……！', 'み、耳が……！ 地面が揺れてる……！'],
            'calm': ['着弾は手前です。竹束の陰で次を待ちます。', '装填の間に、次の竹束まで。'],
            'cheer': ['わわっ、どーんって！ 伏せて伏せて！', 'こわっ……でも、外れたよ！']},
 'musket': {'aggr': ['鉄砲の列！ 撃ったら込め直す間に詰めろ！', '煙が晴れる前に行くよ！'],
            'caut': ['鉄砲の斉射です。竹束から出ないで。', '撃ちました。今のうちに前へ。'],
            'timid': ['て、鉄砲……音が、すごい……！', 'け、煙で何も見えない……！'],
            'calm': ['二列で交互に撃っています。三つ数えて前へ。', '銃剣を付けています。近くでも気を抜かないで。'],
            'cheer': ['煙もくもく……今がチャンス！', '外れた外れた！ 行こう！']},
 'pike': {'aggr': ['長槍の方陣……穂先をくぐって懐へ！', '槍がなんだ、横から崩せ！'],
          'caut': ['正面は槍の壁です。横へ回って。', '方陣は向きを変えるのが遅い。脇から。'],
          'timid': ['や、槍がいっぱいこっち向いてる……！', 'あ、あんなの、近づけないよ……'],
          'calm': ['方陣の角を狙います。', '槍の内側に入れば、こちらの間合いです。'],
          'cheer': ['ハリネズミみたい！ でも横はがら空き！', '槍、長すぎ！ 回り込もう！']},
 'charge': {'aggr': ['柵へ！ 押し込め！', '今だ、柵の口を破れっ！'],
            'caut': ['柵の口へ、まとまって！', '一気に抜けます。止まらないで！'],
            'timid': ['い、行かなきゃ……えいっ……！', 'み、みんな、待って……私も行く……！'],
            'calm': ['突入します。柵の内で広がって。', '口を抜けたら、左右へ。'],
            'cheer': ['突撃ー！ 柵の中へ！', 'いっくよー！ みんな続いて！']},
 'tent': {'aggr': ['王女の天幕だ！ あと少し！', 'あの旗の下まで、押し通る！'],
          'caut': ['奥の天幕に王女の旗……守りが固いです。', '本陣です。囲まれないように。'],
          'timid': ['お、王女さまの……テント……', 'あそこに、本物の王女さまが……？'],
          'calm': ['本陣です。護衛を崩せば終わります。', '王旗の天幕まで、あと三十歩。'],
          'cheer': ['あれ、王女さまのテント！ きれい……！', '本陣、見えたよ！ もうすぐだ！']},
 'win': {'aggr': ['勝った……！ 王女の本陣を落としたぞ！', '見たか、英国の娘たち！'],
         'caut': ['……終わりました。王女は、降られたようです。', '本陣、確保しました。……追撃は無用です。'],
         'timid': ['か、勝った……の……？ ほんとに……？', 'よかった……みんな、よかった……'],
         'calm': ['王旗が下りました。勝負ありです。', '王女は天幕の前に。殿をお待ちです。'],
         'cheer': ['やったー！ 勝ったよ、勝った！', 'みんな、すごい！ 王女さまの陣を取ったよ！']},
}
LINES = {}
def add(key, who, en, ja): LINES[key] = {'who': who, 'en': en, 'ja': ja}
add('k_open', 'king', '', '夜襲の報を聞いて、王女自らが来たか。……数は向こうが上だ。だが、柵の内に閉じこもった者は、動けん。')
add('k_choose', 'king', '', '正面と東の脇、二手に分ける。俺はどちらにつくか——')
add('k_front', 'king', '', '正面だ。西園寺と共に、柵の口を押す。')
add('k_flank', 'king', '', '東へ回る。脇の口から、王女の本陣を突く。')
add('k_main', 'king', '', '本隊と共に行く。皆、遅れるな。')
add('sai_1', 'ojou', '', 'わたくしが先頭に立ちます。皆、竹束を盾に、遅れずに。')
add('sumi_1', 'sumi', '', '敵は百十余り。鉄砲の列が二つ、長槍の方陣が二つ、柵の内に大砲が四門。王女の天幕は奥です。')
add('k_fence', 'king', '', '柵に取りついた！ 口を破れ！')
add('k_honjin', 'king', '', '本陣だ！ 王旗の天幕へ！')
add('k_win', 'king', '', '……護りは崩れた。剣を収めよ。王女の前だ。')
add('sai_win', 'ojou', '', '殿、王女殿下がお待ちです。……皆、武器を下ろして。')
for i, t in enumerate(['大丈夫、私の声が聞こえますか。すぐ手当てします。', '動かないで。手当てしますね。', '竹束の陰へ。少しだけ我慢してね。']): add(f'med_start_{i}', 'nurse', '', t)
for i, t in enumerate(['もう大丈夫。無理はしないでくださいね。', 'よく頑張りましたね。']): add(f'med_ok_{i}', 'nurse', '', t)
for i, t in enumerate(['落ち着いて。ゆっくり息をして。', 'しっかりしてください。今、手当てします。', '少し横になって。すぐ診ます。']): add(f'med_dstart_{i}', 'med', '', t)
# 王女と英国の娘（英語・日本語字幕）
E = [('uk00', 'a_arrive', "So these are the women who took the Lioness. Good. Let them come to me.", 'ライオネス号を奪ったのは、あの女たちね。よろしい。こちらへ来させなさい。'),
     ('uk06', 'e_report', "Your Highness, they are moving. Two columns — one on the road, one around the east side.", '殿下、動きました。二手です——正面の道と、東へ回る一隊。'),
     ('uk00', 'a_order', "Muskets to the fence. Guns, make ready. No one leaves this camp without my word.", 'マスケットは柵へ。大砲、用意。わたくしの許しなく、誰もこの陣を出てはなりません。'),
     ('uk10', 'g_fire', "Gun crews — fire! Shell, short fuse! Wide of them — let the splinters do the work!", '砲手、撃て！ 破裂弾、短導火！ 外して撃って——破片に任せるのよ！'),
     ('uk10', 'g_reload', "Swab and load! Next round!", '洗って装填！ 次弾！'),
     ('uk08', 'm_ready', "Muskets — make ready!", 'マスケット——構え用意！'),
     ('uk08', 'm_fire', "Present... fire!", '狙え……撃て！'),
     ('uk08', 'm_bayo', "Bayonets! Hold the fence with the steel!", '銃剣！ 鋼で柵を守りなさい！'),
     ('uk08', 'm_back', "Fall back behind the pikes! Back, back!", '長槍の後ろへ下がって！ 下がって！'),
     ('uk02', 'p_hold', "Pikes — charge your pikes! Hold the gate!", '長槍——穂先を前へ！ 門を守って！'),
     ('uk02', 'p_east', "To the east gap! Close it with the points!", '東の口へ！ 穂先で塞いで！'),
     ('uk04', 'b_counter', "Swords, with me! Throw them back out of the camp!", '剣の者、続いて！ 陣の外へ押し返すわよ！'),
     ('uk03', 's_breach', "They're through the fence! They're inside!", '柵を破られた！ 中に入ってくる！'),
     ('uk06', 'e_guard', "Guard the Princess. Not one step back.", '殿下をお守りして。一歩も退かないで。'),
     ('uk02', 'h_guard', "Close around Her Highness! Points out!", '殿下のまわりを固めて！ 穂先を外へ！'),
     ('uk00', 'a_steady', "Steady, ladies. England is watching.", '落ち着いて。英国が見ています。'),
     # 降伏の場（王女と殿）
     ('uk00', 'y1', "Enough. Lower your weapons — all of you. That is my command.", 'もうよい。武器を下ろしなさい——皆。わたくしの命令です。'),
     ('uk00', 'y2', "I am Arabella, Princess of England. You have broken my fence and my guard, my lord. I will not run.", 'わたくしはアラベラ、英国の王女。柵も護衛も破られました、殿。けれど、逃げはしません。'),
     ('uk00', 'yA', "Courtesy, on a battlefield. Eleanor did not exaggerate. Then I accept it — as your guest, not your prisoner.", '戦場で礼節を。エレノアの言う通りね。では受けましょう——捕虜ではなく、客として。'),
     ('uk00', 'yB', "My fleet will not leave on my word alone. But my word is all I have left to give you today. You have it.", '艦隊はわたくしの一言では退きません。けれど今日、差し上げられるのはその言葉だけ。お受けなさい。'),
     ('uk00', 'yC', "Why? Because a nation of women who fight like this is worth meeting. I came to see you with my own eyes.", 'なぜ、ですって？ これほど戦う女たちの国——この目で会う価値があると思ったの。'),
     ('uk00', 'y3', "Hear me, then. My admirals still hold the sea. If you want peace, come aboard the Sovereign, and we will speak as equals.", 'ではお聞きなさい。提督たちはまだ海を握っています。和睦を望むなら、旗艦ソヴリン号へ。対等に話しましょう。'),
     ('uk00', 'y4', "If you want war... then we meet once more, on the water, with everything we have.", '戦を望むなら……もう一度、海の上で。持てるすべてをかけて。'),
     ('uk00', 'yP', "Then it is peace we will try for. I will wait for you aboard the Sovereign. Do not keep a princess waiting.", 'では、和睦を。ソヴリン号でお待ちします。王女を待たせないでくださいね。'),
     ('uk00', 'yW', "So be it. I will return to my fleet, as you allow. When we meet again, I will not hold back.", 'よろしい。お許しの通り、艦隊へ戻ります。次に会うときは、手加減しません。'),
     ('uk06', 'e_bow', "Your Highness... forgive me.", '殿下……申し訳ございません。'),
]
for who, k, en, ja in E: add(k, who, en, ja)
add('k_y1', 'king', '', '……アラベラ王女殿とお見受けする。')
add('k_yA', 'king', '', '剣を収めよう。王女を、客として遇する。')
add('k_yB', 'king', '', '降伏は受ける。だが、艦隊を沖から退かせてもらおう。')
add('k_yC', 'king', '', 'なぜ、王女自らここまで来た。')
add('k_yP', 'king', '', '和睦の席に着こう。ソヴリン号へ参る。')
add('k_yW', 'king', '', '海で決着をつけよう。艦隊へ戻られよ。')
for u in [f'uk{i:02d}' for i in range(1, 11)]:
    add(f'{u}_g_repel', u, 'For the Princess!', '王女殿下のために！')
def vfor(who):
    if who in STYLE: return STYLE[who]
    v = UKV[who]; return (v[0], v[1], v[2])
async def one(sem, text, path, voice, rate, pitch, vol=0):
    if not FORCE and os.path.exists(path) and os.path.getsize(path) > 800: return
    if os.environ.get('SKIPGEN'): return   # 書き出しだけ（生成できなかった声は外す）
    async with sem:
        for a in range(5):
            try:
                tmp = path + '.part'
                await edge_tts.Communicate(text, voice, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz', volume=f'{vol:+d}%').save(tmp)
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
            q = cat in QUIET
            for i, t in enumerate(arr):
                fn = f'j_{cat}_{rom}_{i}.mp3'
                jobs.append(one(sem, t, os.path.join(D, fn), NANAMI, r - 12 if q else r, p - 4 if q else p, -35 if q else 0))
                J[cat][rom].append({'text': t, 'file': 'uk4/' + fn, 'quiet': q})
    for k, v in LINES.items():
        voice, r, p = vfor(v['who']); fn = k + '.mp3'; v['voice'] = voice; v['file'] = 'uk4/' + fn
        jobs.append(one(sem, v['en'] or v['ja'], os.path.join(D, fn), voice, r, p))
    await asyncio.gather(*jobs)
    for cat in J:
        for rom in J[cat]:
            for l in J[cat][rom]: l['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', l['file']))
    for v in LINES.values(): v['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', v['file']))
    for cat in J:
        for rom in J[cat]: J[cat][rom] = [l for l in J[cat][rom] if l['dur']]
    for v in LINES.values():
        if not v['dur']: v['file'] = None
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_uk4.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_uk4_voices.py)。英国淑女編 第四幕「王女」の台詞\n')
        f.write('window.VOICE_UK4 = %s;\n' % json.dumps({'jp': J, 'lines': LINES}, ensure_ascii=False))
    miss = [k for k, v in LINES.items() if not v['dur']]; nj = sum(len(r) for c in J.values() for r in c.values())
    print('jp', nj, 'lines', len(LINES), 'missing', miss)
asyncio.run(main())
