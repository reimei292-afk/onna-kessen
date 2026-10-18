#!/usr/bin/env python3
"""英国淑女編（English Ladies arc）の台詞を edge-tts で作る（他の台詞と同じパイプライン：tools/make_voices.py / add_fumi_voices.py）。
英国の娘：en-GB の女性ニューラル音声（Sonia / Libby / Maisie）を、娘ごとに話速・高さを変えて使い分ける（英語・日本語字幕）。
殿：ja-JP-KeitaNeural（make_voices.py の KING_VOICE と同じ）。日本の侍女：ja-JP-NanamiNeural。
出力: assets/voices/uk/<key>.mp3 と assets/voices/voices_uk.js（window.VOICE_UK = {key: {who, en, ja, file, dur}}）。
英国淑女編のステージでだけ読み込む（他のステージの先読みには入らない）。
使い方: python3 tools/add_uk_voices.py [--force]
"""
import asyncio, json, os, subprocess, sys
import edge_tts
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = os.path.join(ROOT, 'assets', 'voices', 'uk')
FORCE = '--force' in sys.argv
WHO = set(next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--who=')), []))   # --who=uk03,uk05：その話し手だけ作り直す
# en-GB の女性の声は edge-tts では Sonia / Libby / Maisie の 3 つだけ（Abbi・Bella・Hollie・Olivia などは 2026-10 時点で音声が返らない）
# 声：(voice, 話速%, 高さHz)
VOICES = {
  'uk00': ('en-GB-SoniaNeural', -12, -8),  # Princess Arabella：ゆっくり低めの、威厳ある声
  'uk01': ('en-GB-LibbyNeural', 6, 3),     # Imogen Hartley：明るく負けず嫌い
  'uk02': ('en-GB-SoniaNeural', -6, -10),  # Harriet Pemberton：低く落ち着いた貴族
  'uk03': ('en-IE-EmilyNeural', 0, 2),     # Rosie Whitmore：やわらかく少し慌てがち（アイルランド英語の声で他の娘と分ける）
  'uk04': ('en-GB-SoniaNeural', 4, -3),    # Beatrice Thorne：歯切れよく皮肉屋
  'uk05': ('en-IE-EmilyNeural', 2, -5),    # Molly Fairbairn：温かく面倒見がいい（同上・低め）
  'uk06': ('en-GB-SoniaNeural', -10, 0),   # Eleanor Ashcombe：ゆっくり端正な使者
  'uk07': ('en-GB-LibbyNeural', -10, -2),  # Clara Bennett：夢見がちで静か
  'uk08': ('en-GB-LibbyNeural', -2, -12),  # Scarlett Hayward：低めで自信家
  'uk09': ('en-GB-MaisieNeural', -8, -6),  # Alice Moorcroft：やさしく控えめ
  'uk10': ('en-GB-SoniaNeural', 8, 5),     # Charlotte Kendall：きびきびした士官候補生
  'king': ('ja-JP-KeitaNeural', -6, -2),
  'reika': ('ja-JP-NanamiNeural', 4, 6),    # 白石 麗華（好戦的）
  'shizuka': ('ja-JP-NanamiNeural', -4, -6),# 久遠 静香（冷静）
  'sumi': ('ja-JP-NanamiNeural', -4, 0),    # 秘書課 白瀬 澄
}
L = {}
def add(key, who, en, ja=None):
    L[key] = {'who': who, 'en': en, 'ja': ja if ja is not None else en}
# ---- 接近（呼びかけ）----
add('hail_uk10', 'uk10', "Ahoy, the boats! You are approaching a ship of the English Crown. Heave to, and state your business!", 'そこの小舟！ こちらは英国王室の艦である。止まって、用向きを述べよ！')
add('look_shizuka', 'shizuka', None, '殿、前方に大型の異国船。三本マストに、砲門がずらりと並んでいます。')
add('king_approach', 'king', None, '…でかいな。紅毛の船か。寄せろ、話を聞いてやる。')
add('hail_uk08', 'uk08', "Muskets up, ladies. Nobody fires unless I say so.", 'マスケット構え。わたしの合図があるまで、誰も撃たないこと。')
add('invite_uk06', 'uk06', "Lower the ladder. Let the king come aboard — if he dares.", '梯子を下ろしなさい。王に乗船していただきましょう——その度胸がおありなら。')
add('king_board', 'king', None, '上等だ。梯子を上がるぞ。')
# ---- 会見（使者エレノア）----
add('p1', 'uk06', "Good day. I am Lady Eleanor Ashcombe, envoy of Her Royal Highness, Princess Arabella of England. I speak with her voice.", 'ごきげんよう。英国アラベラ王女殿下の使者、エレノア・アシュコムと申します。わたくしの言葉は、殿下のお言葉です。')
add('p2', 'uk06', "Her Highness has heard of your little war games. Your mock battles. Your practice arrows, wrapped in cloth.", '殿下は、あなた方の「戦ごっこ」をお聞き及びです。模擬戦、布で包んだ練習の矢——。')
add('p3', 'uk06', "She therefore requires the following. Your castle, your harbour and your ships are to be placed under the protection of the English Crown.", 'よって、殿下は次のことを求めておられます。あなたの城、港、そして船を、英国王室の庇護の下に置くこと。')
add('p4', 'uk06', "And your ladies shall enter Her Highness's service. Accept by the turn of the tide, and not a single shot need be fired.", 'そして、あなたの侍女たちは殿下にお仕えすること。潮が変わるまでにお受けになれば、一発の砲声も要りません。')
add('king_A', 'king', None, '断る。この海も、城も、俺の侍女たちも、誰にも渡さん。')
add('king_B', 'king', None, '王女に伝えよ。日本の女は、脅しでは退かぬ。')
add('king_C', 'king', None, '模擬戦しか知らぬと侮ったか。…後悔するぞ。')
add('rA', 'uk06', "How very gallant. Her Highness did say you would refuse.", 'まあ、なんとも勇ましいこと。殿下も、あなたは断るだろうとおっしゃっていました。')
add('rB', 'uk06', "I shall deliver your words exactly. Her Highness appreciates honesty — before a battle especially.", 'お言葉、そのままお伝えします。殿下は率直さを好まれます——戦の前には、特に。')
add('rC', 'uk06', "Regret is for those who lose, Your Majesty. We have no intention of losing.", '後悔は、負けた者のすることですわ、陛下。わたくしたちに、負けるつもりはございません。')
add('p5', 'reika', None, '殿に指一本でも触れてみなさい。模擬戦で鍛えた腕、見せてあげる。')
add('p6', 'uk04', "Practice arrows against cold steel? How charming.", '練習の矢で、本物の鋼に挑むの？ かわいらしいこと。')
add('p7', 'shizuka', None, '練習は、本番のためにするものです。…お忘れなく。')
add('p8', 'uk10', "Ma'am, the tide is turning. The guns are loaded. On your word.", '閣下、潮が変わります。砲の装填は済んでいます。ご命令ひとつで。')
add('p9', 'uk06', "Not today, Miss Kendall. Today we are envoys. Tomorrow, we are something else.", '今日はまだよ、ケンドール。今日のわたくしたちは使者。明日は——別のものになります。')
add('p10', 'uk06', "Return to your boats, Your Majesty. When next we meet, it will not be with words.", '小舟へお戻りください、陛下。次にお会いするときは、言葉ではございません。')
add('king_F1', 'king', None, '望むところだ。')
add('king_F2', 'king', None, '次は、こちらから行く。')
add('p11', 'uk06', "Then God save the Princess. And may God help you.", 'では、王女殿下に神のご加護を。そして、あなた方にも神のお慈悲がありますように。')
add('p12', 'uk03', "Signal from Her Highness's flag! All hands — make sail!", '殿下の旗より信号！ 総員——帆を上げよ！')
add('king_end', 'king', None, '皆、聞け。もう模擬戦ではない。次は——本物の戦だ。')
add('sumi_end', 'sumi', None, 'はっ！ 皆、持ち場へ。次は、本番です。')
# ---- 自由に話す（娘ごと：intro / who / why / battle / bye）----
TALK = {
 'uk01': ["Hello! You row those little boats yourselves? Respect. That's proper rowing, that.", 'こんにちは！ その小舟、自分たちで漕いでるの？ 尊敬するわ。本物の漕ぎ方ね。',
          "Imogen Hartley. I stroked the Cambridge eight. Now I command the longboats. When we come for you, I'll be the one rowing hardest.", 'イモジェン・ハートリー。ケンブリッジのエイトで整調を漕いでたの。今は短艇隊の隊長。攻めに行くときは、いちばん必死に漕いでるのがわたしよ。',
          "Her Highness picks people who never settle for second place. Neither do I.", '殿下は、二位で満足しない人を選ぶの。わたしもそう。',
          "Race you, then. Loser buys the tea.", 'じゃあ競争ね。負けたほうがお茶をおごるのよ。',
          "Pull hard, Your Majesty. You'll need to.", 'しっかり漕いでね、陛下。必要になるから。'],
 'uk02': ["You may look. Kindly don't touch the rail.", '見るのは構いません。手すりには触れないでいただける？',
          "Harriet Pemberton. I lead the pike. Horses taught me one thing: never show fear to something larger than you.", 'ハリエット・ペンバートン。長槍隊を率いています。馬から学んだことはひとつ——自分より大きなものに、恐れを見せないこと。',
          "My family has served the Crown for three hundred years. I'm hardly going to be the one who stops.", 'わが家は三百年、王室にお仕えしてきました。わたくしの代で途切れさせるわけにはいきません。',
          "Keep your ladies in good order. I do so dislike an untidy fight.", '侍女たちの隊列は整えておきなさい。乱れた戦いは嫌いなの。',
          "Good day.", 'ごきげんよう。'],
 'uk03': ["Oh! Um, hello. Sorry, I wasn't expecting you to actually come aboard.", 'あっ！ え、えっと、こんにちは。ごめんなさい、本当に乗ってこられるとは思ってなくて。',
          "Rosie Whitmore. I do the signals. Flags, the drum, the bell. I used to sing in the college choir, so at least I'm loud.", 'ロージー・ホイットモアです。信号係です。旗と、太鼓と、鐘。大学の聖歌隊で歌ってたので、声だけは大きいんです。',
          "The Princess heard me sing once, and asked me to come. You don't really say no to a princess, do you?", '王女さまが一度わたしの歌を聞いて、来てほしいって。王女さまに、いやとは言えないでしょう？',
          "I hope it doesn't come to that. I really do. But if it does, I'll be the one beating the drum.", 'そうならないといいな。本当に。でも、もしそうなったら……太鼓を叩くのは、わたしです。',
          "Bye! I mean, farewell. Sorry.", 'バイバイ！ じゃなくて、ご機嫌よう。ごめんなさい。'],
 'uk04': ["Closer, if you like. I don't bite. I fence.", 'もっと近くでもどうぞ。噛みつきはしないわ。突くだけ。',
          "Beatrice Thorne. First over the side when we board. Épée, mostly. I like to finish things in one touch.", 'ベアトリス・ソーン。斬り込みのとき、最初に舷側を越えるのがわたし。得物はエペ。一突きで終わらせるのが好きなの。',
          "Because it's the only fight in years worth having. Your girls had better be as good as they look.", '何年ぶりかの、本気でやる価値のある戦いだから。あなたの侍女たち、見た目どおり強いといいけど。',
          "En garde, Your Majesty. Next time, I won't just be talking.", '構えて、陛下。次は、おしゃべりだけでは済まないわ。',
          "Run along.", 'さあ、お帰りなさい。'],
 'uk05': ["Hiya, love! Mind the ropes, they'll have your feet out from under you.", 'やあ、いらっしゃい！ ロープに気をつけてね、足を取られるわよ。',
          "Molly Fairbairn. Gun crew. I load the big guns on the lower deck. Played hockey for the county, so I've got the arms for it.", 'モリー・フェアベアン。砲員よ。下の甲板で大砲に弾を込めてるの。州の代表でホッケーをやってたから、腕っぷしには自信があるわ。',
          "Honestly? The girls. You look after your team, don't you. Wherever they go, I go.", '正直に言うとね、仲間のためよ。チームは大事にするものでしょ。みんなが行くなら、わたしも行くの。',
          "When the guns go, keep your heads down, yeah? I'd rather you all came through it.", '大砲が鳴ったら、頭を低くしてね？ できれば、みんな無事でいてほしいの。',
          "Ta-ra, then! Mind how you go.", 'じゃあね！ 気をつけて帰るのよ。'],
 'uk06': ["Our business is concluded, Your Majesty.", 'お話は済みました、陛下。',
          "I drafted Her Highness's letters for six years. Every word I said today was chosen with care.", '六年間、殿下の書簡をしたためてまいりました。今日申し上げた言葉は、一語一語、選び抜いたものです。',
          "Because I believe in her. And because a lawyer always reads the terms before the war.", '殿下を信じているからです。それに法律家は、戦の前に必ず条件を読むものですわ。',
          "Should you change your mind before the tide turns, raise a white flag. I would honour it.", '潮が変わる前にお気持ちが変われば、白旗を。わたくしは、それを尊重いたします。',
          "Go with care, Your Majesty.", 'お気をつけて、陛下。'],
 'uk07': ["Hold still a moment. The light on the water behind you. Sorry. Old habit.", 'ちょっとそのまま。あなたの後ろの水面の光。ごめんなさい、昔からの癖で。',
          "Clara Bennett, navigator. I studied art history. It turns out reading a chart is a lot like reading a painting.", 'クララ・ベネット、航海士です。美術史を学んでいました。海図を読むのは、絵を読むのとよく似ているんです。',
          "I sketched your coastline on the way in. Every cove, every reef. Her Highness will love the drawings.", 'ここへ来る途中、あなた方の海岸線を写生しました。入り江も、岩礁も全部。殿下はきっと気に入ってくださいます。',
          "I play the violin when I'm nervous. I expect you'll hear a lot of it soon.", '緊張すると、ヴァイオリンを弾くんです。きっと近いうちに、たくさん聞こえますよ。',
          "Fair winds. Well... perhaps not too fair.", 'よい風を。いえ……あまりよすぎないほうがいいかしら。'],
 'uk08': ["Well, well. The king himself. You're braver than you look.", 'あら、あら。王さまご本人ね。見た目より度胸があるじゃない。',
          "Scarlett Hayward. Captain of the musket line. Tennis taught me timing. You wait, and wait, and then you hit it exactly right.", 'スカーレット・ヘイワード。マスケット隊長よ。テニスでタイミングを覚えたの。待って、待って、ここぞという瞬間に打つ。',
          "I like winning. Her Highness likes winning. We get on splendidly.", '勝つのが好きなの。殿下も勝つのがお好き。気が合うのよ。',
          "Game, set and match, darling. That's how this ends.", 'ゲーム、セット、アンド、マッチ。そういう結末よ。',
          "Off you pop.", 'さ、行って行って。'],
 'uk09': ["Oh, are you all right? You look a little pale. It's the swell. It gets everyone.", 'あ、大丈夫ですか？ 少し顔色が悪いみたい。うねりのせいです。みんなそうなるんです。',
          "Alice Moorcroft. I'm the ship's medic. Well, a nursing student, really. Bandages, splints, and cups of tea.", 'アリス・ムアクロフトです。船の衛生係……といっても、本当はまだ看護学生なんです。包帯に添え木、それと紅茶。',
          "Someone has to look after everyone. I'd look after your girls too, if they needed it. I mean that.", '誰かが、みんなの面倒を見なくちゃ。あなたの侍女たちだって、必要ならお世話します。本気です。',
          "Please, try not to let it come to fighting. But if it does, I'll be there.", 'お願いです、戦いにならないようにしてください。でも、もしなったら、わたしはそこにいます。',
          "Take care of yourself. Really.", 'お体、大切にしてくださいね。本当に。'],
 'uk10': ["Your Majesty. Charlotte Kendall, gunnery. Please keep clear of the guns.", '陛下。砲術のシャーロット・ケンドールです。砲には近づかないでください。',
          "Royal Navy cadet, Dartmouth. Thirty-two guns on this ship, and every crew answers to me.", 'ダートマスの英国海軍士官候補生です。この艦の砲は三十二門、その砲員はすべてわたしの指揮下にあります。',
          "Duty, mostly. And I've drilled these crews for a year. I'd like to see what they can do.", '主に、義務です。それに、一年かけて砲員を鍛えてきました。その成果を見てみたいんです。',
          "When we fire, our shells burst short, and the fragments fly. Keep your heads down.", '撃つときは、砲弾は手前で炸裂して、破片が飛びます。頭を低くしていてください。',
          "Carry on.", 'では、これで。'],
}
for g, a in TALK.items():
    for i, k in enumerate(['intro', 'who', 'why', 'battle', 'bye']): add(f'{g}_{k}', g, a[i * 2], a[i * 2 + 1])
# 日本の侍女（小早の上で話しかけたとき）
add('reika_talk', 'reika', None, 'あの船、大砲が何十門も……。でも、怖くなんかない。')
add('shizuka_talk', 'shizuka', None, '甲板の上は十人。全員、女性です。……配置は覚えておきます。')
add('sumi_talk', 'sumi', None, '殿、交渉はお任せします。わたくしは、お側におります。')
# ---- のちの戦闘ステージ用：短い倒れる声（血を吐く声は無し）----
DEFEAT = {
 'uk01': ['Ah!', 'Ugh... not yet...', 'No...!', 'Oh... blast...'],
 'uk02': ['Ah...', 'Oh...', 'No... impossible...', 'Ugh...'],
 'uk03': ['Oh!', 'Ah... no...', 'No, no...', 'Oh...'],
 'uk04': ['Ugh!', 'Ah...', 'Touché...', 'No...'],
 'uk05': ['Oof!', 'Ah... sorry, girls...', 'Oh...', 'Ugh...'],
 'uk06': ['Ah...', 'Oh... Your Highness...', 'No...', 'Oh!'],
 'uk07': ['Oh!', 'Ah...', 'No... not like this...', 'Oh...'],
 'uk08': ['Ugh!', 'Ah... out...', 'No...!', 'Oh...'],
 'uk09': ['Ah!', 'Oh... no...', 'Ow...', 'Oh...'],
 'uk10': ['Ugh!', 'Ah... hold the line...', 'No...', 'Oh!'],
}
DJA = {'Ah!': 'あっ！', 'Ah...': 'あ……', 'Oh...': 'う……', 'Oh!': 'あっ……', 'Ugh!': 'うっ！', 'Ugh...': 'うぅ……', 'No...': 'そんな……', 'No...!': 'いや……！', 'Oof!': 'うっ！', 'Ow...': 'いたっ……',
       'Ugh... not yet...': 'くっ……まだ……', 'Oh... blast...': 'もう……っ', 'No... impossible...': 'まさか……', 'Ah... no...': 'あ……だめ……', 'No, no...': 'いや、いや……', 'Touché...': '……一本、取られたわ',
       'Ah... sorry, girls...': 'ごめん、みんな……', 'Oh... Your Highness...': '殿下……', 'No... not like this...': 'こんな、ふうに……', 'Ah... out...': '……アウト', 'Oh... no...': 'そんな……', 'Ah... hold the line...': '……戦列を、保って……'}
for g, a in DEFEAT.items():
    for i, t in enumerate(a): add(f'{g}_defeat_{i}', g, t, DJA.get(t, t))
for k, v in L.items():
    if v['en'] is None: v['en'] = ''
async def one(sem, key, v):
    path = os.path.join(D, key + '.mp3')
    if not (FORCE or v['who'] in WHO) and os.path.exists(path) and os.path.getsize(path) > 800: return
    voice, rate, pitch = VOICES[v['who']]
    text = v['en'] or v['ja']
    if '_defeat_' in key: rate += 4   # 倒れる声は少しだけ速く・短く
    async with sem:
        for a in range(4):
            try:
                tmp = path + '.part'; await edge_tts.Communicate(text, voice, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz').save(tmp)
                if os.path.getsize(tmp) < 800: raise RuntimeError('empty audio')
                os.replace(tmp, path); return
            except Exception as ex:
                await asyncio.sleep(1.5 * (a + 1))
        print('FAILED', key, text)
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 0
async def main():
    os.makedirs(D, exist_ok=True)
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*[one(sem, k, v) for k, v in L.items()])
    man = {}
    for k, v in L.items():
        p = os.path.join(D, k + '.mp3')
        man[k] = dict(v, file='uk/' + k + '.mp3', dur=dur(p) if os.path.exists(p) else 0, voice=VOICES[v['who']][0])
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_uk.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_uk_voices.py)。英国淑女編の台詞（英語の声＋日本語字幕）。who＝話し手、file＝assets/voices/ からの相対パス、dur＝秒\n')
        f.write('window.VOICE_UK = %s;\n' % json.dumps(man, ensure_ascii=False))
    print('uk lines:', len(man), 'missing:', [k for k, v in man.items() if not v['dur']])
asyncio.run(main())
