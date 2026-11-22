"""日本の侍女（兵・弓兵・名のある娘）の絵は assets/maids/ に一か所にまとめる。英・仏・米・越の娘と持ち物・メタ情報は assets/frames/ のまま。"""
import re
MAID_RE = re.compile(r'^(girl\d+|sec\d*|fumi|ojou|omiya|medic|nurse2|surgeon|sysop|hibiki|shirase|hayase|reika|kuon|ichijo|murase|hirose|sanjo)$')
def maid_dir(gid):
    return 'assets/maids' if MAID_RE.match(gid) else 'assets/frames'
# 名のある侍女の絵のファイル名は日本語のフルネーム（game.js の MAID_REN と同じ表）。キー（gid）はそのまま
MAID_REN = {'shirase': '白瀬澄', 'hayase': '早瀬ことね', 'hibiki': '小鳥遊ひびき', 'fumi': '綾瀬文乃', 'ojou': '西園寺すみれ', 'omiya': '大宮ひなた', 'sysop': '霧島怜',
            'sec3': '桜井ゆかり', 'sec4': '宮下千尋', 'sec5': '小日向ひより', 'sec6': '氷室しのぶ', 'sec7': '夏目あかり', 'reika': '白石麗華', 'kuon': '久遠静香',
            'ichijo': '一条千景', 'murase': '村瀬碧', 'hirose': '広瀬千夏', 'sanjo': '三条玲奈', 'surgeon': '九条紗英'}
def maid_name(gid):
    return MAID_REN.get(gid, gid)
