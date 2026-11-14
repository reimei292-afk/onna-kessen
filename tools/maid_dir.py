"""日本の侍女（兵・弓兵・名のある娘）の絵は assets/maids/ に一か所にまとめる。英・仏・米・越の娘と持ち物・メタ情報は assets/frames/ のまま。"""
import re
MAID_RE = re.compile(r'^(mob|archer|arch|girl|sec|fumi|ojou|omiya|medic|nurse2|surgeon|sysop)\d*$')
def maid_dir(gid):
    return 'assets/maids' if MAID_RE.match(gid) else 'assets/frames'
