#!/usr/bin/env python3
"""第七幕「祝勝会」の声（edge-tts）。assets/voices/uk7/ と voices_uk7.js。血・性的な言葉は使わない。"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'uk7')
N = 'ja-JP-NanamiNeural'
ST = {'sumi': (N, -6, -8), 'ojou': (N, -14, -2), 'sec2': (N, 4, 14), 'fumi': (N, -2, 4), 'sec3': (N, -4, 2), 'sec4': (N, -8, -4), 'reika': (N, 4, 6), 'shizuka': (N, -8, -6), 'kujo': (N, -10, -10), 'sysop': (N, -2, -2),
      'a': (N, 0, 0), 'b': (N, 6, 6), 'c': (N, -6, -6), 'd': (N, 4, 10)}
EN = {'uk00': ('en-GB-SoniaNeural', -12, -8), 'uk01': ('en-GB-LibbyNeural', 6, 3), 'uk02': ('en-GB-SoniaNeural', -6, -10), 'uk03': ('en-IE-EmilyNeural', 0, 2), 'uk04': ('en-GB-SoniaNeural', 4, -3), 'uk05': ('en-IE-EmilyNeural', 2, -5),
      'uk06': ('en-GB-SoniaNeural', -10, 0), 'uk07': ('en-GB-LibbyNeural', -10, -2), 'uk08': ('en-GB-LibbyNeural', -2, -12), 'uk09': ('en-GB-MaisieNeural', -8, -6), 'uk10': ('en-GB-SoniaNeural', 8, 5)}
LINES = {
 'open': ('sumi', '皆さま、お静かに。……英国は降伏し、私たちは日本へ帰ります。倒れた仲間のことを胸に、今夜だけは、心から祝いましょう。殿、乾杯の音頭をお願いいたします。'),
 'mid': ('ojou', '宴もたけなわではございますが、ここで中締めとさせていただきます。皆、よく戦い、よく生き延びました。……残りの航海も、どうか無事に。'),
}
TALK = ['船の食事、思ってたより美味しいですね。ローストビーフ、三回もおかわりしちゃいました。', '帰ったら、まず母の味噌汁が飲みたいです。', '窓の外、真っ暗な海……あの夜襲の夜を思い出します。',
        '砲台の音、まだ耳に残ってるんです。でも、今夜は静かですね。', '英国の娘さんたち、仕事が丁寧ですよね。少し仲良くなりました。', 'この船、本当に大きい……迷子になりそうです。',
        '日本に着いたら、桜はもう散ってるかな。', 'あの戦、皆がいてくれたから、ここまで来られました。', 'デザートのプディング、甘すぎなくて好きです。',
        '殿、今日くらいはゆっくりなさってくださいね。', '航海はあと何日でしょう。ちょっと寂しい気もします。', '機関室を見せてもらいました。仕組みを覚えるの、大変そうです。']
CON = ['徴兵で来たときは、帰れないと思ってました。……今夜のこと、ずっと覚えておきます。', '本当は、普通の大学生に戻りたいです。でも、皆と会えたのは、よかったかな。',
       'スーツじゃなくて、ドレスで来たかったですね。……なんて。', '会社に戻ったら、この話、誰も信じてくれないと思います。']
PAIRS = [('ねえ、帰ったら何したい？', '温泉。三日くらい、何もしないで浸かってたい。'), ('アラベラ王女、給仕してるの見た？', '見た見た。所作がきれいすぎて、こっちが緊張しちゃう。'),
         ('あのとき、殿が前に出てきたの覚えてる？', '覚えてる。あれで皆、もう一歩踏み出せたよね。'), ('このケーキ、英国の味？', 'うん。ちょっと重いけど、紅茶と合うね。')]
ORD = {'food': "Your dinner, my lord. Roast beef, with the chef's compliments.", 'drink': "A glass for you, my lord. To a safe voyage home.", 'sweet': "Something sweet, my lord. Sticky toffee pudding — it's rather good."}
ORD_ARA = {'food': "Your dinner, my lord. I carried it myself — do not tell my admirals.", 'drink': "Your glass, my lord. I find serving rather more peaceful than commanding.", 'sweet': "Pudding, my lord. In England, no celebration is complete without it."}
CONF = {'ojou': ('ask', '……殿。わたくしは、侍大将として殿にお仕えしてきました。そのお気持ち、少しだけ、時間をいただけますか。'),
        'sumi': ('yes', 'えっ……私、ですか。……はい。ずっと、お側にいられたらと思っていました。'),
        'sec2': ('yes', 'ほ、本当ですか……！ う、嬉しいです。……よろしくお願いします。'),
        'fumi': ('no', 'ありがとうございます、殿。でも……私は、秘書として殿をお支えする今のままが一番なんです。ごめんなさい。'),
        'sec3': ('ask', 'お気持ち、とても嬉しいです。……日本に着くまで、考えさせていただけますか。'),
        'sec4': ('yes', '……はい。私でよければ。夜風、少し冷たいですね。もう少し、ここにいましょうか。'),
        'reika': ('no', 'ふふ、殿にそう言われるとは思わなかった。……でも、私は剣の道を選ぶわ。気持ちだけ、受け取っておく。'),
        'shizuka': ('ask', '……静かな夜ですね。答えは、次の満月の夜まで待っていただけますか。'),
        'kujo': ('no', '殿のお気持ちは嬉しいです。けれど、私は医師として、皆を等しく診る立場でいたいんです。'),
        'sysop': ('ask', '想定外の入力ですね……。少し、処理する時間をください。逃げたりはしませんから。')}

# ---- 殿の問い（字幕のみ）と侍女の答え：志願（2 通り）／徴兵 ----
Q = ['早く日本に帰りたい？', '戦ってるときどんな気持ちだった？', '傷を負ったことは？', '死ぬかと思った？', 'たくさんの侍女が死んだけど、結局イギリスを降らせた。このことについてはどう思う？', '名誉の戦死？', '正直、話し合いで何とかしろよって思った？']
QA_V = [['はい。でも、この船の夜も好きです。皆とこうしていられるのは、今だけですから。', '帰りたいです！ 着いたらまず、お風呂とお布団です。'],
        ['怖かったです。でも、隣の子が踏みとどまっているのを見たら、私も下がれませんでした。', '正直、何も考えられませんでした。殿の旗だけを見て、走っていました。'],
        ['腕を少し。九条先生に診ていただいて、もう平気です。……私は、運がよかったんです。', 'かすり傷くらいです。もっと重い傷の子が、たくさんいましたから。'],
        ['何度も思いました。今でも、夜に目が覚めることがあります。', '思いました。だから今夜、こうして笑えているのが、不思議なくらいです。'],
        ['勝ったのは嬉しいです。でも、隣にいたあの子がいないのは……勝ちとは別のことです。忘れません。', '降伏させたのは事実です。でも、払ったものが大きすぎた気もします。……それでも、皆の戦いを無駄にはしたくないです。'],
        ['名誉、なんて言葉で片づけたくありません。あの子には、名前があったんです。', '……そう呼べば、少しは楽になるのかもしれません。でも私は、ただ帰ってきてほしかった。'],
        ['少しだけ……思いました。最初の会見で、もう一歩歩み寄れていたらって。', '思ったことはあります。でも、あの条件を呑めなかった殿のお気持ちも、わかるんです。']]
QA_C = ['帰りたいです。正直、毎晩それだけを考えていました。', 'ずっと震えてました。召集の紙が来た日のこと、何度も思い出しました。',
        '転んで膝を擦りむいたくらいです。……他の子に比べたら、何でもないです。', '思いました。私、ただの学生だったのに、って。',
        '……正直、わかりません。勝ったと言われても、いなくなった子は戻らないので。', '名誉なんて、私には要りません。生きて帰りたかった、それだけの子もいました。',
        '思いました。はっきり言って、思いました。……すみません、殿の前で。']
# 割り込み：白瀬が諫める／早瀬・西園寺がひとこと
CHIME = {3: ('sumi', '殿。……そのお尋ねは、少し酷ですよ。今夜くらいは、そっとしてあげてください。'),
         5: ('sumi', '殿、お言葉が過ぎます。その言葉で救われる者ばかりではありません。'),
         2: ('sumi', '殿。傷のことは、本人が話したいときに聞いてあげてくださいね。'),
         0: ('sec2', '私も帰りたいです！ ……あ、すみません、つい。'),
         4: ('ojou', '殿。その問いには、わたくしたち将も、一生向き合わねばなりません。'),
         6: ('sumi', '殿。それは、殿ご自身が一番お考えのことでしょう。……この子を責めないであげてくださいね。')}
# 英国の給仕への問い
QE = ['この船で働くのはどう？', '故郷が恋しい？', '降伏したこと、どう思ってる？', '日本の侍女たちとはうまくやれてる？']
QE_A = [[("It's honest work, my lord. Better than a battlefield, at any rate.", '真っ当な仕事です、殿。少なくとも戦場よりは。'),
         ("Strange, at first. Now I rather like the sound of the engines at night.", '最初は不思議でした。今は、夜の機関の音が少し好きです。'),
         ("The galley is warm and nobody shoots at me. I've had worse posts.", '厨房は暖かいし、誰にも撃たれません。もっとひどい持ち場もありました。')],
        [("Every day. I miss the rain on the downs, if you can believe it.", '毎日です。丘に降る雨が恋しいなんて、信じられます？'),
         ("My mother will be worried sick. I hope a letter reaches her soon.", '母がとても心配しているはずです。早く手紙が届くといいのですが。'),
         ("Yes. But home will still be there when all this is over.", 'はい。でも、全部が終わっても、故郷はそこにありますから。')],
        [("It hurt our pride. But it stopped the dying, and that matters more.", '誇りは傷つきました。でも、人が死ぬのは止まった。そのほうが大事です。'),
         ("I cried that night. Now I think it was the only sensible thing.", 'あの夜は泣きました。今は、あれしかなかったと思います。'),
         ("We lost. I'd rather not pretend otherwise. But we're still here.", '負けました。ごまかすつもりはありません。でも、私たちはまだここにいます。')],
        [("Better than I expected. They taught me to fold those little rice balls.", '思ったよりずっと。小さなおにぎりの握り方を教わりました。'),
         ("We don't share many words yet, but we share the work. That's a start.", 'まだ言葉はあまり通じませんが、仕事は一緒にできます。始まりとしては十分です。'),
         ("One of them laughed at my bow. Then she showed me how. We're friends now.", '私のお辞儀を笑った子がいて、やり方を教えてくれました。今は友達です。')]]
QE_ARA = [("Serving tables teaches humility, my lord. My governess would be delighted.", '給仕は謙虚さを教えてくれますわ、殿。わたくしの家庭教師が見たら喜ぶでしょう。'),
          ("I miss London terribly. But a princess goes where her people need her.", 'ロンドンがとても恋しいです。でも王女は、民が必要とする場所へ行くものです。'),
          ("I signed it with a steady hand. I wept afterwards, alone. Both were my duty.", '震えずに署名しました。泣いたのは、そのあと一人きりで。どちらも、わたくしの務めでした。'),
          ("Your handmaidens are fierce in battle and kind at table. I envy you a little.", 'あなたの侍女たちは、戦では猛く、食卓では優しい。少し、うらやましいですわ。')]
async def one(sem, t, p, v, r, pi):
    if os.path.exists(p) and os.path.getsize(p) > 800: return
    async with sem:
        for a in range(5):
            try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
            except Exception: await asyncio.sleep(2 * (a + 1))
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 0
async def main():
    os.makedirs(D, exist_ok=True); sem = asyncio.Semaphore(5); jobs = []; out = {'lines': {}, 'talk': [], 'con': [], 'pairs': [], 'ord': {}, 'conf': {}}
    def job(name, t, st):
        v, r, pi = st; jobs.append(one(sem, t, os.path.join(D, name), v, r, pi)); return 'uk7/' + name
    for k, (w, t) in LINES.items(): out['lines'][k] = {'who': w, 'ja': t, 'file': job(k + '.mp3', t, ST[w])}
    sty = ['a', 'b', 'c', 'd']
    for i, t in enumerate(TALK): out['talk'].append({'text': t, 'file': job(f't{i}.mp3', t, ST[sty[i % 4]])})
    for i, t in enumerate(CON): out['con'].append({'text': t, 'file': job(f'c{i}.mp3', t, ST['c' if i % 2 else 'a'])})
    for i, (a, b) in enumerate(PAIRS): out['pairs'].append([{'text': a, 'file': job(f'p{i}a.mp3', a, ST['b'])}, {'text': b, 'file': job(f'p{i}b.mp3', b, ST['c'])}])
    for g, st in EN.items():
        out['ord'][g] = {}
        for k, t in (ORD_ARA if g == 'uk00' else ORD).items(): out['ord'][g][k] = {'en': t, 'file': job(f'o_{g}_{k}.mp3', t, st)}
    for w, (kind, t) in CONF.items(): out['conf'][w] = {'kind': kind, 'text': t, 'file': job(f'f_{w}.mp3', t, ST[w])}
    out['q'] = Q; out['qv'] = []; out['qc'] = []; out['qvip'] = {}; out['chime'] = {}; out['qe'] = QE; out['qea'] = {}
    for i, pair in enumerate(QA_V): out['qv'].append([{'text': t, 'file': job(f'qv{i}_{j}.mp3', t, ST['a' if j == 0 else 'd'])} for j, t in enumerate(pair)])
    for i, t in enumerate(QA_C): out['qc'].append({'text': t, 'file': job(f'qc{i}.mp3', t, ST['c'])})
    for k, w in enumerate(['ojou', 'sumi', 'sec2', 'fumi', 'sec3', 'sec4', 'reika', 'shizuka', 'kujo', 'sysop']):
        out['qvip'][w] = [{'text': QA_V[i][k % 2], 'file': job(f'qx_{w}_{i}.mp3', QA_V[i][k % 2], ST[w])} for i in range(len(Q))]
    for i, (w, t) in CHIME.items(): out['chime'][i] = {'who': w, 'text': t, 'file': job(f'ch{i}.mp3', t, ST[w])}
    for n, (g, st) in enumerate(EN.items()):
        out['qea'][g] = [({'en': QE_ARA[i][0], 'ja': QE_ARA[i][1]} if g == 'uk00' else {'en': QE_A[i][n % 3][0], 'ja': QE_A[i][n % 3][1]}) for i in range(len(QE))]
        for i, o in enumerate(out['qea'][g]): o['file'] = job(f'qe_{g}_{i}.mp3', o['en'], st)
    await asyncio.gather(*jobs)
    def fix(o):
        if isinstance(o, dict):
            if 'file' in o: o['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', o['file']))
            for v in o.values(): fix(v)
        elif isinstance(o, list):
            for v in o: fix(v)
    fix(out)
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_uk7.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_uk7_voices.py)。英国淑女編 第七幕「祝勝会」\nwindow.VOICE_UK7 = %s;\n' % json.dumps(out, ensure_ascii=False))
    print('ok', len(os.listdir(D)), 'zero', sum(1 for f in os.listdir(D) if os.path.getsize(os.path.join(D, f)) < 800))
asyncio.run(main())
