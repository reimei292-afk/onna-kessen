#!/usr/bin/env python3
"""assets/maids を見て、侍女の見た目の名簿 assets/maids/ids.js を作る。
新しいタイプの絵を足したら、この脚本を走らせる（公開前でも可）。game.js は名簿と FRAME_META から
自動で山札に入れる（名のある娘・外国の娘は除く）。
"""
import json, re
from pathlib import Path
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from maid_dir import MAID_REN

ROOT = Path(__file__).resolve().parents[1]
MAID = ROOT / 'assets' / 'maids'
REN_BACK = {v: k for k, v in MAID_REN.items()}
SUFS = ['_front_diag', '_back_diag', '_walk_side', '_seatdown', '_u_front_diag', '_u_front',
        '_u_back', '_u_side', '_u_down', '_u_walk', '_front', '_side', '_back', '_down',
        '_walk', '_bow', '_stab', '_kneel', '_low', '_unarmed', '_sheet', '_sit', '_slump', '_top']
VIEW_OF = {
    '_front_diag': 'front_diag', '_back_diag': 'back_diag', '_u_front_diag': 'front_diag',
    '_u_front': 'front', '_u_back': 'back', '_u_side': 'side', '_u_down': 'down', '_u_walk': 'walk',
    '_front': 'front', '_side': 'side', '_back': 'back', '_down': 'down', '_walk': 'walk',
    '_bow': 'bow', '_stab': 'stab', '_kneel': 'kneel', '_seatdown': 'seatdown',
}
CYCLE_RE = re.compile(r'_walk_side_\d+$')
ORDER = ['front', 'side', 'back', 'front_diag', 'down', 'walk', 'bow', 'stab', 'kneel', 'seatdown']

def split_view(stem):
    for s in sorted(SUFS, key=len, reverse=True):
        if stem.endswith(s):
            return stem[:-len(s)], s
    return stem, ''

def main():
    files = {}
    for p in sorted(MAID.iterdir()):
        if p.is_dir() or p.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        if CYCLE_RE.search(p.stem) or p.stem.endswith('_top'):
            continue
        base, suf = split_view(p.stem)
        gid = REN_BACK.get(base, base)
        if not re.match(r'^[a-z][a-z0-9]*$', gid):
            continue
        view = VIEW_OF.get(suf, 'front' if not suf else None)
        if not view:
            continue
        rec = files.setdefault(gid, {})
        rel = f'assets/maids/{p.name}'
        if view not in rec or (rec[view].endswith(('.jpg', '.jpeg')) and p.suffix.lower() == '.png'):
            rec[view] = rel
    ids = sorted(files, key=lambda s: (re.sub(r'\d+', '', s), int(re.sub(r'\D+', '0', s) or 0), s))
    lines = [
        '// 自動生成（tools/make_maid_ids.py）。assets/maids にある侍女の見た目の名簿。新しいタイプを足したら再実行する。',
        'window.MAID_IDS = ' + json.dumps(ids, ensure_ascii=False) + ';',
        'window.MAID_FILES = {',
    ]
    for gid in ids:
        rec = files[gid]
        keys = [k for k in ORDER if k in rec] + [k for k in rec if k not in ORDER]
        inner = ', '.join(f'{k}: "{rec[k]}"' for k in keys)
        lines.append(f'  {gid}: {{ {inner} }},')
    lines.append('};')
    out = MAID / 'ids.js'
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'wrote {out.relative_to(ROOT)} ({len(ids)} ids)')

if __name__ == '__main__':
    main()
