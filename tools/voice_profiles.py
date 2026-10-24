"""声の目録（全ステージ共通）。名前のある登場人物は、どのステージでもこの声・話速・高さで作る。
(edge-tts の声, 話速 %, 高さ Hz)。高さは ±15Hz 以内（それ以上は機械っぽく聞こえる）。
日本語の女声で自然に使えるのは ja-JP-NanamiNeural だけなので、話速と高さで人を分ける。
名前の無い侍女・兵は性格ごとの声（make_voices.py の PERS_STYLE）を使い、一人ひとりは
再生時の vv（0〜2）で固定の言い方を割り当てる（同じ娘は最後まで同じ声）。殿は字幕だけ。"""
N, K = 'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'
PROFILES = {
    # 秘書課
    'sumi':    (N, -6, -8),    # 白瀬 澄：落ち着いて、きっぱり
    'sec2':    (N, 4, 14),     # 早瀬 ことね：少し早口で高め、あわてがち
    'fumi':    (N, -2, 4),     # 綾瀬 文乃：やわらかく、ていねい
    'sec3':    (N, -4, 2),     # 桜井 ゆかり：数字に強い、落ち着き
    'sec4':    (N, -8, -4),    # 宮下 千尋：淡々と
    'ojou':    (N, -14, -2),   # 西園寺 すみれ：ゆっくり、品よく
    'shinobu': (N, -8, -8),    # 氷室 しのぶ（西園寺付き）：きびきび低め
    'chikage': (N, -4, 0),     # 一条 千景（西園寺付き）：慎重
    'hiyori':  (N, 2, 12),     # 小日向 ひより（側近付き）：明るく少し高め
    'akari':   (N, 12, 10),    # 夏目 あかり（側近付き）：元気で早口
    'midori':  (N, 6, -4),     # 村瀬 碧（側近付き）：はっきり
    'omiya':   (N, 10, 12),    # 大宮 ひなた：明るく早め、少し高め（以前の +18%/+26Hz は機械っぽかった）
    'shizuka': (N, -8, -10),   # 久遠 静香：静かで低め
    'reika':   (N, 2, 2),      # 白石 麗華：強気
    'kujo':    (N, -10, -10),  # 外科医 九条 紗英：冷静
    'sysop':   (N, -4, -6),    # 霧島 怜（情報室）：落ち着いて、きびきび
    'flute':   (N, 0, 10),     # 笛役
    'nurse':   (N, -4, 8),     # 看護師
    'med':     (N, -12, -14),  # 救護班
    'king':    (K, -6, -2),    # 殿（ゲームでは字幕だけ）
    # 総構えの徴募の娘（既にいる侍女。性格の声＋固定の言い方 vv と同じ高さ・話速）
    'cs01': (N, 4, 2), 'cs02': (N, -4, -3), 'cs03': (N, 8, 9), 'cs04': (N, -6, -6),
    'cs05': (N, 9, 10), 'cs06': (N, -6, -7), 'cs07': (N, 6, 2), 'cs08': (N, -3, -2),
    # 英国
    'uk00': ('en-GB-SoniaNeural', -12, -8), 'uk01': ('en-GB-LibbyNeural', 6, 3), 'uk02': ('en-GB-SoniaNeural', -6, -10), 'uk03': ('en-IE-EmilyNeural', 0, 2),
    'uk04': ('en-GB-SoniaNeural', 4, -3), 'uk05': ('en-IE-EmilyNeural', 2, -5), 'uk06': ('en-GB-SoniaNeural', -10, 0), 'uk07': ('en-GB-LibbyNeural', -10, -2),
    'uk08': ('en-GB-LibbyNeural', -2, -12), 'uk09': ('en-GB-MaisieNeural', -8, -6), 'uk10': ('en-GB-SoniaNeural', 8, 5),
    # フランス
    'fr02': ('fr-FR-DeniseNeural', 0, 0), 'fr06': ('fr-FR-DeniseNeural', -8, -6), 'fr05': ('fr-FR-DeniseNeural', 6, 8),
    # アメリカ
    'us01': ('en-US-AvaNeural', 4, 0), 'us19': ('en-US-EmmaNeural', -6, -6), 'us05': ('en-US-JennyNeural', 6, 4), 'us12': ('en-US-AriaNeural', 0, -4),
    'us14': ('en-US-MichelleNeural', 8, 6), 'us06': ('en-US-JennyNeural', 10, 10),
}
def override(st, order='vrp'):
    """ステージの声の表を、この目録で上書きする（order：'vrp'＝(声, 話速, 高さ)、'rpv'＝(話速, 高さ, 声)）。"""
    for k in st:
        if k in PROFILES:
            v, r, p = PROFILES[k]; st[k] = (v, r, p) if order == 'vrp' else (r, p, v)
    return st
def style(k): v, r, p = PROFILES[k]; return (r, p)
