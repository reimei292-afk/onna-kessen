"""日本語の声（edge-tts ja-JP）の読み違いを直す辞書。字幕は漢字のまま、TTS に渡す文だけ仮名にする。
使い方：import tts_reading（edge_tts.Communicate を包んで、ja-JP の声のときだけ fix() を通す）。
辞書を足したら tools/regen_readings.py で、影響する声だけ作り直す。"""
import re

NAMES = [  # 姓・名（読みを固定）
    ('小鳥遊', 'たかなし'), ('小日向', 'こひなた'), ('西園寺', 'さいおんじ'), ('白瀬', 'しらせ'), ('早瀬', 'はやせ'), ('綾瀬', 'あやせ'), ('広瀬', 'ひろせ'),
    ('村瀬', 'むらせ'), ('大宮', 'おおみや'), ('九条', 'くじょう'), ('一条', 'いちじょう'), ('三条', 'さんじょう'), ('氷室', 'ひむろ'), ('霧島', 'きりしま'),
    ('宮下', 'みやした'), ('桜井', 'さくらい'), ('白石', 'しらいし'), ('久遠', 'くおん'), ('夏目', 'なつめ'), ('遠野', 'とおの'), ('文乃', 'ふみの'),
    ('玲奈', 'れな'), ('麗華', 'れいか'), ('紗英', 'さえ'), ('千景', 'ちかげ'), ('静香', 'しずか'), ('千尋', 'ちひろ'), ('千夏', 'ちなつ')]
WORDS = [  # 固有の言葉
    ('祝融', 'しゅくゆう'), ('藤甲', 'とうこう'), ('鉄車', 'てっしゃ'), ('輿', 'こし'), ('介錯', 'かいしゃく'), ('輜重', 'しちょう'), ('先鋒', 'せんぽう'),
    ('関所', 'せきしょ'), ('白壁城', 'しらかべじょう'), ('山岳', 'さんがく'), ('甲板', 'かんぱん'), ('狭間', 'さま'), ('女将', 'おかみ'), ('井闌', 'せいらん'),
    ('野伏せ', 'のぶせ'), ('妻娘', 'つまむすめ'), ('方円', 'ほうえん'), ('方陣', 'ほうじん'), ('殿軍', 'しんがり')]
NAME_RE = '|'.join(re.escape(a) for a, _ in sorted(NAMES, key=lambda x: -len(x[0])))
RULES = [  # (正規表現, 置き換え)。上から順に
    # 名前＋殿 → 〜どの（大宮殿・西園寺殿・エレノア殿・王女殿）
    (rf'({NAME_RE})殿', lambda m: dict(NAMES)[m.group(1)] + 'どの'),
    (r'([ァ-ヶー]{2,})殿(?!下)', r'\1どの'), (r'王女殿(?!下)', 'おうじょどの'),
    (r'澄(?=お姉|さん|さま|様|殿|ちゃん|[、。！？…」』\s）]|[がはもをにのとへや]|$)', 'すみ'),
    (r'碧(?=さん|さま|様|[、。！？…\s]|$)', 'みどり'), (r'怜(?=さん|さま|様|[、。！？…\s]|$)', 'れい'),
    # 殿（宮殿・殿下・御殿・殿堂などは除く）
    (r'殿方', 'とのがた'), (r'殿様', 'とのさま'), (r'(?<![宮御神本拝湯])殿(?![下堂])', 'との'),
    # 次（次第・目次・席次・次元・次男などは除く）
    (r'次々', 'つぎつぎ'), (r'(?<![第目席順逐二三四年月再取])次(?![第元男女回期官長席郎々])', 'つぎ'),
    (r'今日(?!的)', 'きょう'), (r'(?<![第十])一人(?![前称])', 'ひとり'), (r'(?<![第十])二人(?![前称])', 'ふたり'),
    (r'上手(?=[くいかけ])', 'うま'), (r'上手', 'じょうず'), (r'下手(?![人])', 'へた'),
    (r'何(?=[をがもにかへや])', 'なに'), (r'何(?=[でだてとの]|人|回|度|時|本|枚|年|日|分|機|番|杯|百|十|千|皿|か所)', 'なん'),
    (r'(?<!を)行って', 'いって'), (r'(?<!を)行った', 'いった'),
    (r'(あの|この|その|どの)方', r'\1かた'), (r'お方', 'おかた'), (r'方々', 'かたがた'), (r'の方(?=[がへにをはも、。])', 'のほう'), (r'た方が', 'たほうが'), (r'る方が', 'るほうが'),
    (r'(この|その|あの)間', r'\1あいだ'), (r'間に合', 'まにあ'), (r'間もなく', 'まもなく'), (r'の間(?=[にでもは、。])', 'のあいだ'), (r'(?<![時人仲広客年週昼夜瞬空期区隙谷山])間(?=を(詰|空|開|あけ|取))', 'あいだ'),
    (r'後で', 'あとで'),
] + [(re.escape(a), b) for a, b in sorted(NAMES + WORDS, key=lambda x: -len(x[0]))]
RULES = [(re.compile(p), r) for p, r in RULES]

def fix(t):
    for p, r in RULES: t = p.sub(r, t)
    return t

FORCED = set()   # 作り直す声（YOMI_REGEN=ファイル一覧）。作り直すまでは「無い」ことにする
DONE = []
def install():
    import os
    try: import edge_tts
    except Exception: return
    if getattr(edge_tts, '_yomi', False): return
    C = edge_tts.Communicate
    class Communicate(C):
        def __init__(self, text, voice=None, *a, **k):
            if isinstance(text, str) and (voice or 'ja-JP').startswith('ja-JP'): text = fix(text)
            super().__init__(text, voice, *a, **k) if voice is not None else super().__init__(text, *a, **k)
        async def save(self, path, *a, **k):
            r = await super().save(path, *a, **k)
            if FORCED and isinstance(path, str):
                p = os.path.realpath(path)
                for f in [f for f in FORCED if p == f or p.startswith(f + '.') or p.startswith(f[:-4] + '.')]: FORCED.discard(f); DONE.append(f)
            return r
    edge_tts.Communicate = Communicate; edge_tts._yomi = True
    lst = os.environ.get('YOMI_REGEN')
    if lst:
        FORCED.update(os.path.realpath(l.strip()) for l in open(lst) if l.strip())
        ex, gs, isf = os.path.exists, os.path.getsize, os.path.isfile
        os.path.exists = lambda p: False if isinstance(p, str) and os.path.realpath(p) in FORCED else ex(p)
        os.path.isfile = lambda p: False if isinstance(p, str) and os.path.realpath(p) in FORCED else isf(p)
        os.path.getsize = lambda p: 0 if isinstance(p, str) and os.path.realpath(p) in FORCED else gs(p)
        import atexit; atexit.register(lambda: print('[yomi] regenerated', len(DONE), 'left', len(FORCED)))
install()
