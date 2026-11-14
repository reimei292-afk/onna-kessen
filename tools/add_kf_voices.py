#!/usr/bin/env python3
"""白壁城祝勝会の声（edge-tts、声の目録 voice_profiles.py のとおり）。台詞は game.js の /*KF_DATA_BEGIN*/〜/*KF_DATA_END*/ から node で抜き出す。
出力 assets/voices/kf/*.mp3 と voices_kf.js（台詞 → [{file, v, d}]、d は秒）。殿の台詞は字幕だけ。名の無い侍女は cs01〜cs08 の声。"""
import asyncio, json, os, sys, hashlib, subprocess, edge_tts
import sys as _ys, os as _yo; _ys.path.insert(0, _yo.path.dirname(_yo.path.abspath(__file__))); import tts_reading  # 読み違いの辞書（漢字の字幕のまま、声には仮名を渡す）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'kf'); os.makedirs(D, exist_ok=True)
JS = r'''const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');const a=s.indexOf('/*KF_DATA_BEGIN*/'),b=s.indexOf('/*KF_DATA_END*/');eval(s.slice(a,b).replace('const KF_D','var KF_D'));
const o=[];const c=L=>L.forEach(q=>{if(q[0]!=='king'&&q[0]!=='narr')o.push(q)});c(KF_D.open);KF_D.x.flat().forEach(c);c(KF_D.mix);for(const k in KF_D.talk)KF_D.talk[k].forEach(q=>o.push([k,q[1]]));
for(const k in KF_D.mourn)c(KF_D.mourn[k]);for(const k in KF_D.end)c(KF_D.end[k]);KF_D.mob.forEach(t=>{for(let i=1;i<=8;i++)o.push(['cs0'+i,t])});console.log(JSON.stringify(o));'''
L = json.loads(subprocess.check_output(['node', '-e', JS, os.path.join(ROOT, 'game.js')]))
def pc(n): return ('+' if n >= 0 else '') + str(n) + '%'
def hz(n): return ('+' if n >= 0 else '') + str(n) + 'Hz'
async def one(k, t, fn):
    v, r, p = PROFILES[k]
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=pc(r), pitch=hz(p)).save(fn); return
        except Exception: await asyncio.sleep(2 + a * 2)
def dur(fp):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', fp]).strip()), 2)
    except Exception: return None
async def main():
    sem = asyncio.Semaphore(6); tasks = []; items = []
    for k, t in L:
        h = hashlib.md5((k + '|' + t).encode()).hexdigest()[:10]; f = 'kf/' + h + '.mp3'; fp = os.path.join(ROOT, 'assets', 'voices', f); items.append((k, t, f, fp))
        if os.path.exists(fp) and os.path.getsize(fp) > 500: continue
        async def go(k=k, t=t, fp=fp):
            async with sem: await one(k, t, fp)
        tasks.append(go())
    await asyncio.gather(*tasks)
    m = {}; bad = 0
    for k, t, f, fp in items:
        if not (os.path.exists(fp) and os.path.getsize(fp) > 500): bad += 1; continue
        m.setdefault(t, []).append({'file': f, 'v': k, 'd': dur(fp)})
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_kf.js'), 'w').write('window.VOICE_KF = ' + json.dumps({'byText': m}, ensure_ascii=False) + ';\n')
    print(len(items), 'lines', len(tasks), 'made', bad, 'bad')
asyncio.run(main())
