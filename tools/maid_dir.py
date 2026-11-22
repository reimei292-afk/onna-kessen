"""日本の侍女の絵は assets/jp_jijo/ にまとめる。中国の現地兵（南蛮兵）は assets/cn/。英・仏・米・越の娘と持ち物・メタ情報は assets/frames/。"""
import re
MAID_RE = re.compile(r'^(jp\d+|sec\d*|fumi|ojou|omiya|medic|nurse2|surgeon|sysop|hibiki|shirase|hayase|reika|kuon|ichijo|murase|hirose|sanjo)$')
CN_RE = re.compile(r'^cn\d+$')
def maid_dir(gid):
    if CN_RE.match(gid):
        return 'assets/cn'
    return 'assets/jp_jijo' if MAID_RE.match(gid) else 'assets/frames'
# 名のある侍女の絵のファイル名は日本語のフルネーム（game.js の MAID_REN と同じ表）。キー（gid）はそのまま
MAID_REN = {'shirase': '白瀬澄', 'hayase': '早瀬ことね', 'hibiki': '小鳥遊ひびき', 'fumi': '綾瀬文乃', 'ojou': '西園寺すみれ', 'omiya': '大宮ひなた', 'sysop': '霧島怜',
            'sec3': '桜井ゆかり', 'sec4': '宮下千尋', 'sec5': '小日向ひより', 'sec6': '氷室しのぶ', 'sec7': '夏目あかり', 'reika': '白石麗華', 'kuon': '久遠静香',
            'ichijo': '一条千景', 'murase': '村瀬碧', 'hirose': '広瀬千夏', 'sanjo': '三条玲奈', 'surgeon': '九条紗英'}
def maid_name(gid):
    return MAID_REN.get(gid, gid)
