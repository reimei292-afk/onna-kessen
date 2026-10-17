#!/usr/bin/env python3
"""英国淑女編 第三幕「夜襲」の台詞を edge-tts で作る（add_uk2_voices.py と同じ作り方）。
- 侍女の場面台詞：性格ごと（PERS の話速・高さの Nanami）。接近中のささやき（whisper/nerves/beam）は小さく・ゆっくり作り、再生時も遠くの声として鳴らす
- 殿（Keita）・西園寺（ojou）・白瀬（sumi）・救護（nurse / med）は add_uk2_voices.py の STYLE と同じ
- 英国の娘：add_uk_voices.py の VOICES と同じ声（英語・日本語字幕）
出力: assets/voices/uk3/*.mp3 と assets/voices/voices_uk3.js（window.VOICE_UK3 = { jp: {cat: {rom: [{text, file, dur}]}}, lines: {key: {who, en, ja, file, dur, voice}} }）
Usage: python3 tools/add_uk3_voices.py [--force]
"""
import asyncio, json, os, subprocess, sys
import edge_tts
T = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(T, '..'); D = os.path.join(ROOT, 'assets', 'voices', 'uk3')
FORCE = '--force' in sys.argv
NANAMI, KEITA = 'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'
PERS = {'aggr': (8, 2), 'caut': (-4, -3), 'timid': (6, 8), 'calm': (-6, -7), 'cheer': (6, 6)}
QUIET = {'whisper', 'nerves', 'beam'}   # ささやき：ゆっくり・低め・小さく
STYLE = {'king': (KEITA, -6, -2), 'ojou': (NANAMI, -14, -2), 'sumi': (NANAMI, -6, -8), 'nurse': (NANAMI, -4, 8), 'med': (NANAMI, -12, -14)}
src = open(os.path.join(T, 'add_uk_voices.py'), encoding='utf-8').read()
ns = {}; exec(src[src.index('VOICES = {'):src.index('}', src.index('VOICES = {')) + 1], ns); UKV = ns['VOICES']
JP = {
 'whisper': {'aggr': ['……静かに。櫂は水に置くだけ。', 'しっ……もうすぐだから、我慢して。', '……音、立てないでよ。'],
             'caut': ['……ゆっくり。水を跳ねさせないで。', 'しっ……灯りの外を、外を。', '……息を整えて。まだ遠いです。'],
             'timid': ['……こ、声、出さないようにしなきゃ……', 'しーっ……心臓の音、聞こえちゃいそう……', '……だ、大丈夫、だよね……？'],
             'calm': ['……風下です。音は届きません。', '……櫂を揃えて。焦らずに。', '……あと少し。灯りの間を抜けます。'],
             'cheer': ['……ふふ、なんだか、どきどきするね。', 'しっ……内緒の舟遊びみたい……', '……がんばろ。小さな声で、ね。']},
 'nerves': {'aggr': ['……暗いのは、向こうも同じ。', '……早く斬り込みたい。じっとしてるのは苦手……'],
            'caut': ['……船の形が、だんだん大きく……', '……見張りが、何人いるか……'],
            'timid': ['……暗くて、何も見えない……', '……海、真っ黒……落ちたら、どうしよう……'],
            'calm': ['……月が雲に入ります。今のうちに。', '……見張りは四人。灯りの動きは、規則的です。'],
            'cheer': ['……お月さま、もうちょっと隠れててね……', '……夜の海って、こんなに静かなんだ……']},
 'beam': {'aggr': ['……灯りが来る。止まって。', '……ちっ、こっちを照らしてる……'],
          'caut': ['……止まって。灯りが通り過ぎるまで。', '……動かないで。光が近いです。'],
          'timid': ['……ひっ……ひ、光が……！', '……と、止まって……お願い……'],
          'calm': ['……灯り、右から。櫂を止めて。', '……今は動かない。通り過ぎます。'],
          'cheer': ['……わっ、まぶし……じゃない、止まって……', '……かくれんぼ、かくれんぼ……']},
 'alarm': {'aggr': ['見つかった！ 構うもんか、漕げっ！', '鐘が鳴ってる……上等じゃない！'],
           'caut': ['気づかれました！ 急いで舷側へ！', '鐘です……待ち構えられます。気をつけて。'],
           'timid': ['み、見つかっちゃった……！', 'か、鐘……！ どうしよう……！'],
           'calm': ['発見されました。舷側に付けば大砲は届きません。', '気づかれました。でも、もう間合いの内です。'],
           'cheer': ['ばれちゃった！ じゃあ、全速力だね！', 'うわ、鐘！ でも負けないよ！']},
 'board': {'aggr': ['乗り移れっ！ 一番乗りは私だ！', '縄をかけた！ 上がるよ！'],
           'caut': ['縄、かかりました！ 順番に上がって！', '足元に気をつけて。上で待っています。'],
           'timid': ['の、登らなきゃ……！ えいっ……！', 'う、上、高い……でも、行く……！'],
           'calm': ['鉤縄、固定。一人ずつ上がってください。', '乗り移ります。上がったら、すぐ横に広がって。'],
           'cheer': ['よいしょっ……乗り移れー！', '縄登り、得意なんだから！']},
 'deck': {'aggr': ['甲板を取れっ！ 押し込め！', 'ここは狭い……斬り合いには、ちょうどいい！'],
          'caut': ['横に広がって！ 囲まれないように！', '帆柱を背に。背中を取らせないで。'],
          'timid': ['せ、狭い……ぶつかっちゃう……！', 'ど、どこから来るの……！？'],
          'calm': ['中央を押さえます。船尾楼への階段を。', '甲板は揺れます。重心を低く。'],
          'cheer': ['甲板の上でも、いつも通りだよ！', '行くよ、みんな！ 船を取っちゃお！']},
 'musket': {'aggr': ['鉄砲！ 撃ったら次はない、行け！', '船尾楼に鉄砲！ 込め直す前に詰めろ！'],
            'caut': ['鉄砲です！ 帆柱の陰に！', '撃ちました……今のうちに、前へ。'],
            'timid': ['ひゃっ……！ い、今の、鉄砲……！？', 'み、耳が……！ 煙で見えない……！'],
            'calm': ['この距離では一発きりです。込め直す間に詰めます。', '船尾楼の手すりに銃が六挺。'],
            'cheer': ['わっ、近っ！ でも外れた！', '煙もくもく……今がチャンス！']},
 'pike': {'aggr': ['船首楼に長槍……狭いのに、よくやる！', '槍の先、くぐって懐へ！'],
          'caut': ['船首楼に長槍です。正面からは無理です。', '階段の上で構えています。横から。'],
          'timid': ['や、槍がこっち向いてる……！', 'あんな長いの、ここで振れるの……！？'],
          'calm': ['長槍は甲板では回せません。懐に入れば。', '船首楼の槍は動けません。後回しに。'],
          'cheer': ['槍、長すぎて引っかかってない？', 'あそこは後で！ 先に船尾楼だよ！']},
 'attack': {'aggr': ['はぁっ！', 'どきなっ！'], 'caut': ['今です……！', 'そこ……！'], 'timid': ['え、えいっ……！', 'こ、来ないで……！'],
            'calm': ['参ります。', 'そこです。'], 'cheer': ['えいやっ！', 'それっ！']},
 'kill': {'aggr': ['一人！ 次！', 'まだまだ！'], 'caut': ['一人、倒しました。', '……次へ。'], 'timid': ['た、倒せた……？', 'ご、ごめんなさい……！'],
          'calm': ['一人。', '次。'], 'cheer': ['やった！', 'よし、一人！']},
 'allydown': {'aggr': ['よくも……！', '仇は取る！'], 'caut': ['……一人、倒れました。詰めて。', '救護班を……！'],
              'timid': ['いや……しっかりして……！', 'そんな……！'], 'calm': ['……倒れました。持ち場を詰めて。', '救護班、こちらへ。'],
              'cheer': ['しっかりして！ すぐ来るから！', '……負けない。絶対。']},
 'encourage': {'aggr': ['あと少し！ 船尾楼まで押し上げろ！', '英国の娘も、やるじゃない……でも勝つのは私たち！'],
               'caut': ['焦らないで。一歩ずつ、確実に。', '旗まで、あと少しです。'],
               'timid': ['わ、私も……やれる……！', 'みんなと一緒なら……怖くない……！'],
               'calm': ['押しています。このまま船尾楼へ。', '隣を見て。一人ではありません。'],
               'cheer': ['いけるいける！ もうひと押し！', '夜明けまでに、船を取っちゃおう！']},
 'flag': {'aggr': ['旗が落ちた！ 見たか！', '船を取ったぞーっ！'], 'caut': ['……旗が、下りました。', '軍艦旗が……落ちました！'],
          'timid': ['は、旗……落ちた……？', 'お、終わった……の……？'], 'calm': ['軍艦旗、落ちました。ライオネス号はこちらのものです。', '旗が落ちました。勝負ありです。'],
          'cheer': ['旗、落としたよ！ やったー！', '見て見て、旗が落ちた！']},
 'win': {'aggr': ['逃げた……！ でも船は取った！', '見たか、英国の娘たち！'], 'caut': ['……追わなくていいんですか。……はい。', '終わりました……船は、取りました。'],
         'timid': ['か、勝った……の……？', 'よかった……みんな、よかった……'], 'calm': ['敵は闇の中へ。追撃は無用です。', '船は確保しました。夜が明けます。'],
         'cheer': ['やったー！ 船、取ったよ！', '勝った……！ みんな、勝ったよ！']},
}
LINES = {}
def add(key, who, en, ja): LINES[key] = {'who': who, 'en': en, 'ja': ja}
add('k_open', 'king', '', '夜明け前に打つ。灯りの輪には入るな。櫂の音を立てるな。舷側に付けば、あの大砲は届かん。')
add('sai_1', 'ojou', '', 'わたくしが先に参ります。皆、遅れずについてらして。')
add('sumi_1', 'sumi', '', '水と食糧を取りに上がった短艇の者たちは、もう捕らえました。船は人も糧も足りておりません。')
add('k_go', 'king', '', '……よし。静かに、漕ぎ出せ。')
add('k_alarm', 'king', '', '気づかれたか……構わん、一気に漕ぎ寄せろ！')
add('k_board', 'king', '', '乗り移れ！ 甲板を取れ！')
add('k_deck', 'king', '', '船尾楼だ！ あの旗を落とせ！')
add('k_flag', 'king', '', '旗が落ちた！ ライオネス号は我らのものだ！')
add('k_win', 'king', '', '……逃げたか。だが、船は取った。')
add('sai_win', 'ojou', '', '皆、よく戦いましたわ。……倒れた者を、救護班のもとへ。')
add('sumi_win', 'sumi', '', '殿。あの使者は言いました——王女が、自ら来ると。')
for i, t in enumerate(['暗いけど大丈夫、私の声、聞こえますか。すぐ手当てします。', '静かに、動かないで。手当てしますね。', '灯りの近くへ。少しだけ我慢してね。']): add(f'med_start_{i}', 'nurse', '', t)
for i, t in enumerate(['もう大丈夫。甲板は滑るから、足元に気をつけて。', 'よく頑張りましたね。無理はしないでくださいね。']): add(f'med_ok_{i}', 'nurse', '', t)
for i, t in enumerate(['暗いので、近くで診ます。動かないで。', 'しっかりしてください。今、手当てします。', '落ち着いて。ゆっくり息をして。']): add(f'med_dstart_{i}', 'med', '', t)
# 英国の娘（英語・日本語字幕）
E = [('uk05', 'l_quiet', 'All quiet forward.', '船首、異状なし。'),
     ('uk07', 'l_quiet2', "Lanterns high, ladies. Watch the water — they were ashore tonight.", '灯りは高く。海を見張って——今夜、陸に上がっていたのよ。'),
     ('uk05', 'l_wave', 'Something on the water... no. Just the swell.', '海に何か……いえ、うねりね。'),
     ('uk05', 'l_spot', 'Boats! Boats on the water — starboard side!', '舟よ！ 海に舟——右舷！'),
     ('uk07', 'l_spot2', 'Boats astern! Ring the bell — ring it!', '船尾に舟！ 鐘を——鐘を鳴らして！'),
     ('uk03', 'a_bell', 'All hands! All hands on deck!', '総員！ 総員、甲板へ！'),
     ('uk10', 'c_warn', "We can't depress the guns that low! A warning shot — wide of them!", '砲身がそこまで下がらない！ 威嚇射撃——外して撃って！'),
     ('uk10', 'c_close', "They're under our guns — too close! Muskets to the rail!", '近すぎて大砲は届かない！ マスケットを舷側へ！'),
     ('uk01', 'w_wake', "Up, up, ladies! On your feet — they're here!", '起きて、起きて！ 立って——来たわよ！'),
     ('uk01', 'w_grap', "Grapnels! They're coming over the side!", '鉤縄よ！ 舷側から上がってくる！'),
     ('uk08', 'm_ready', 'Muskets to the quarterdeck rail — make ready!', 'マスケット、船尾楼の手すりへ——構え用意！'),
     ('uk08', 'm_fire', 'Present... fire!', '狙え……撃て！'),
     ('uk08', 'm_swords', "No time to reload — swords, ladies!", '装填の暇はない——剣を抜いて！'),
     ('uk02', 'p_hold', 'Pikes on the forecastle! Hold the ladder head!', '長槍は船首楼へ！ 階段の上を守って！'),
     ('uk02', 'p_close', 'Close up — no room to swing. Keep the points level!', '詰めて——振る場所はない。穂先を水平に！'),
     ('uk04', 'b_repel', 'Repel boarders! With me!', '斬り込みを撃退！ 続いて！'),
     ('uk04', 'b_push', 'Push them back over the side!', '舷側から押し返して！'),
     ('uk06', 'e_hold', 'Hold the quarterdeck. Not one step back.', '船尾楼を守りなさい。一歩も退かないで。'),
     ('uk06', 'e_cut', 'Cut the cables! Every hand to the pinnaces — now!', '錨索を切りなさい！ 全員、小型艇へ——今すぐ！'),
     ('uk06', 'e_part', 'Well played, Your Majesty. Keep the Lioness — for tonight. But the Princess herself is coming. Until then.', 'お見事です、陛下。ライオネス号は差し上げますわ——今夜のところは。けれど、王女殿下ご自身がいらっしゃいます。それまで、ごきげんよう。')]
for who, k, en, ja in E: add(k, who, en, ja)
for u in [f'uk{i:02d}' for i in range(1, 11)]:
    add(f'{u}_g_repel', u, 'Repel boarders!', '斬り込みを撃退！')
def vfor(who):
    if who in STYLE: return STYLE[who]
    v = UKV[who]; return (v[0], v[1], v[2])
async def one(sem, text, path, voice, rate, pitch, vol=0):
    if not FORCE and os.path.exists(path) and os.path.getsize(path) > 800: return
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
                J[cat][rom].append({'text': t, 'file': 'uk3/' + fn, 'quiet': q})
    for k, v in LINES.items():
        voice, r, p = vfor(v['who']); fn = k + '.mp3'; v['voice'] = voice; v['file'] = 'uk3/' + fn
        jobs.append(one(sem, v['en'] or v['ja'], os.path.join(D, fn), voice, r, p))
    await asyncio.gather(*jobs)
    for cat in J:
        for rom in J[cat]:
            for l in J[cat][rom]: l['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', l['file']))
    for v in LINES.values(): v['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', v['file']))
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_uk3.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_uk3_voices.py)。英国淑女編 第三幕「夜襲」の台詞\n')
        f.write('window.VOICE_UK3 = %s;\n' % json.dumps({'jp': J, 'lines': LINES}, ensure_ascii=False))
    miss = [l['file'] for c in J.values() for r in c.values() for l in r if not l['dur']] + [k for k, v in LINES.items() if not v['dur']]
    print('jp', sum(len(r) for c in J.values() for r in c.values()), 'lines', len(LINES), 'missing', miss)
asyncio.run(main())
