#!/usr/bin/env python3
"""西園寺（侍大将）が倒れたときの殿・白瀬・早瀬の言葉（edge-tts）。assets/voices/saidown/ と voices_saidown.js を作る。
殿は Keita（第三幕・第四幕と同じ）、白瀬は秘書の声（SEC_STYLE）、早瀬は二人目の秘書の声（SEC2_STYLE）。血・傷の言葉は使わない。
r：本物の戦（英国淑女編）／m：模擬戦（戦死判定）"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'saidown')
NANAMI, KEITA = 'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'
ST = {'king': (KEITA, -6, -2), 'sumi': (NANAMI, -6, -8), 'sec2': (NANAMI, 4, 14)}
L = {
 'r': {'king': ['西園寺……。父方の縁に連なる者が、侍大将として先に倒れたか。……その名、決して忘れぬ。', '……すみれ。よく先頭に立ってくれた。あとは、俺が引き受ける。'],
       'sumi': ['西園寺殿……。殿のお血筋の方を、お守りできませんでした。……ですが、まだ戦は終わっていません。', '西園寺殿が……。殿、どうかお気を確かに。私たちがおります。'],
       'sec2': ['澄さま……西園寺さまが……。いえ、泣くのは後にします。', '西園寺さま……。澄さま、私も最後までお供します。']},
 'm': {'king': ['西園寺が討たれたか。……よく戦った。本陣で休ませよ。', '西園寺……先頭に立ちすぎだ。次の波では、もう少し後ろにいてくれ。'],
       'sumi': ['西園寺殿に戦死判定です。……殿、ご心配なく。本陣でお待ちいただきます。'],
       'sec2': ['西園寺さま、戦死判定……。澄さま、私たちで穴を埋めましょう。']},
}
async def one(sem, t, p, v, r, pi):
    if os.path.exists(p) and os.path.getsize(p) > 800: return
    async with sem:
        for a in range(5):
            try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
            except Exception: await asyncio.sleep(2 * (a + 1))
        print('FAILED', p)
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 0
async def main():
    os.makedirs(D, exist_ok=True); sem = asyncio.Semaphore(4); jobs = []; out = {}
    for m, per in L.items():
        out[m] = {}
        for who, arr in per.items():
            out[m][who] = []
            for i, t in enumerate(arr):
                fn = f'{m}_{who}_{i}.mp3'; v, r, pi = ST[who]
                jobs.append(one(sem, t, os.path.join(D, fn), v, r, pi)); out[m][who].append({'text': t, 'file': 'saidown/' + fn})
    await asyncio.gather(*jobs)
    for m in out:
        for who in out[m]:
            for l in out[m][who]: l['dur'] = dur(os.path.join(ROOT, 'assets', 'voices', l['file']))
            out[m][who] = [l for l in out[m][who] if l['dur']]
    with open(os.path.join(ROOT, 'assets', 'voices', 'voices_saidown.js'), 'w', encoding='utf-8') as f:
        f.write('// 自動生成 (tools/add_saidown_voices.py)。西園寺が倒れたときの殿・白瀬・早瀬の言葉\n')
        f.write('window.VOICE_SAIDOWN = %s;\n' % json.dumps(out, ensure_ascii=False))
    print('ok', {m: {w: len(v) for w, v in out[m].items()} for m in out})
asyncio.run(main())
