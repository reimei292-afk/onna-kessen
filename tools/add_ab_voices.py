#!/usr/bin/env python3
"""幕五 航空基地（?stage=ab1..）の声。台詞は game.js の /*ABLN*/〜/*ABLN_END*/。
名のある人は voice_profiles、名の無い侍女は台詞ごとに話速と高さを散らした Nanami（全員女性）。王は字幕だけ。"""
import asyncio, json, os, subprocess, hashlib, sys, edge_tts
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'ab')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
N = 'ja-JP-NanamiNeural'
JS = r'''const s=require("fs").readFileSync(process.argv[1],"utf8");const a=s.indexOf("/*ABLN*/"),b=s.indexOf("/*ABLN_END*/");console.log(JSON.stringify(new Function(s.slice(a,b)+";return AB_LN")()));'''
o = json.loads(subprocess.check_output(['node', '-e', JS, os.path.join(ROOT, 'game.js')]).decode())
def vo(who):
    if who.endswith('S') and who[:-1] in PROFILES: v = PROFILES[who[:-1]]; return (v[0], v[1] - 16, v[2])   # ゆっくり話す
    if who in PROFILES: return PROFILES[who]
    h = int(hashlib.md5(who.encode()).hexdigest(), 16); return (N, (h % 19) - 9, ((h >> 5) % 23) - 9)
L = {}
def add(who, ja):
    k = hashlib.md5(ja.encode()).hexdigest()[:10]
    if k not in L: L[k] = (who, ja)
for cat, arr in o.items():
    for x in arr:
        if isinstance(x, list):
            if x[0] != 'k' and not x[0].startswith('@'): add(x[0], x[1])
        else: add('ext' + str(int(hashlib.md5(x.encode()).hexdigest(), 16) % 9), x)
async def gen(k, who, ja):
    f = os.path.join(D, k + '.mp3')
    if not os.path.exists(f):
        v, r, p = vo(who)[:3]
        for i in range(4):   # 混み合うと音が返らないことがある：消してやり直す
            try: await edge_tts.Communicate(ja, v, rate=f'{r:+d}%', pitch=f'{p:+d}Hz').save(f); break
            except Exception:
                if os.path.exists(f): os.remove(f)
                if i == 3: print('FAIL', who, v, r, p, ja); raise
                await asyncio.sleep(2 + i * 3)
    d = float(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).decode().strip() or 0)
    return k, {'who': who, 'ja': ja, 'file': f'ab/{k}.mp3', 'dur': round(d, 2)}
async def main():
    os.makedirs(D, exist_ok=True); out = {}; ks = list(L.items())
    for i in range(0, len(ks), 8):
        for k, v in await asyncio.gather(*[gen(k, *w) for k, w in ks[i:i + 8]]): out[k] = v
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_ab.js'), 'w').write('window.VOICE_AB=' + json.dumps({'lines': out}, ensure_ascii=False) + ';\n')
    print(len(out), 'lines')
asyncio.run(main())
