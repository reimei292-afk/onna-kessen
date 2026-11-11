#!/usr/bin/env python3
"""被弾・倒れる時の短い声（全ステージ共通）。ユーザーが選んだ言葉だけを使う。名のある娘は自分の声、名の無い兵は cs01〜cs08。
息の上がった言い方（少し早く・高め）で作り、前後の無音を切る。出力 assets/voices/hv/ と voices_hv.js（声 → 言葉 → ファイル）。"""
import asyncio, json, os, sys, hashlib, subprocess, edge_tts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'hv'); os.makedirs(D, exist_ok=True)
T = ['はうっ', 'う！', 'ああっ', 'ぐっ', 'うっ', 'う', 'いやあああぁ！', 'はっ…', 'ぐ…', 'い、いや…', 'あああああ…', 'あ…', 'いやっ', 'ああ…', 'いたい…', 'ぐぇっ！', 'っぐ…', 'きゃっ', 'けほっ', '……っ', 'ううーうぅ…', 'ううっ', 'ひっ…！', 'うう…', '……ぅ…', 'きゃあっ！']
FADE = {'あ…', 'ああ…', '……ぅ…', 'うう…', 'ううーうぅ…', 'あああああ…', 'い、いや…', 'いたい…'}
VK = ['sumi', 'sec2', 'fumi', 'sec3', 'sec4', 'ojou', 'shinobu', 'chikage', 'hiyori', 'akari', 'midori', 'omiya', 'shizuka', 'reika', 'kujo', 'sysop', 'hirose', 'sanjo', 'flute', 'nurse'] + ['cs0%d' % i for i in range(1, 9)]
def pc(n): return ('+' if n >= 0 else '') + str(n) + '%'
def hz(n): return ('+' if n >= 0 else '') + str(n) + 'Hz'
async def one(k, t, fp):
    v, r, p = PROFILES[k]; fade = t in FADE; r, p = (r - 4, p - 2) if fade else (r + 12, p + 7)
    tmp = fp + '.raw.mp3'
    for a in range(3):
        try: await edge_tts.Communicate(t, v, rate=pc(r), pitch=hz(p)).save(tmp); break
        except Exception: await asyncio.sleep(2)
    if not os.path.exists(tmp): return
    af = 'silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,apad=pad_dur=0.05'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', af, '-ac', '1', '-b:a', '40k', fp]); os.remove(tmp)
async def main():
    m = {}; sem = asyncio.Semaphore(8); tasks = []
    for k in VK:
        for t in T:
            h = hashlib.md5((k + '|' + t).encode()).hexdigest()[:10]; f = 'hv/' + h + '.mp3'; m.setdefault(k, {})[t] = f
            fp = os.path.join(ROOT, 'assets', 'voices', f)
            if os.path.exists(fp) and os.path.getsize(fp) > 300: continue
            async def go(k=k, t=t, fp=fp):
                async with sem: await one(k, t, fp)
            tasks.append(go())
    await asyncio.gather(*tasks)
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_hv.js'), 'w').write('window.VOICE_HV = ' + json.dumps(m, ensure_ascii=False) + ';\n')
    print(len(VK), 'voices', len(T), 'words', len(tasks), 'made')
asyncio.run(main())
