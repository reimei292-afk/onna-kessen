#!/usr/bin/env python3
"""幕三「輸送機強襲」米兵の班長（女性・英語）と兵の短い声。edge-tts。assets/voices/cv/us3_*.mp3 と voices_cvus.js"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'cv')
LEAD = [('en-US-AriaNeural', 0, 2), ('en-GB-SoniaNeural', -3, 4), ('en-US-MichelleNeural', -6, 6)]
LL = {'move': 'Move up!', 'cover': 'Cover me!', 'clear': 'Clear!', 'stairs': 'Stairs, go!', 'boiler': 'Boiler room this way!', 'contact': 'Contact!', 'hold': 'Hold!'}
TR = [('en-US-JennyNeural', 4, 6), ('en-US-AvaNeural', 2, 4), ('en-US-EmmaNeural', -2, 8)]
TL = {'moving': 'Moving!', 'gotit': 'Got it!', 'reload': 'Reloading!', 'die1': 'Ugh!', 'die2': 'Ah...!'}
async def one(t, p, v, pi, r):
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
def dur(p): return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
async def main():
    out = {'lead': [], 'troop': []}
    for i, (v, pi, r) in enumerate(LEAD):
        m = {}
        for k, t in LL.items():
            fn = f'us3_l{i}_{k}.mp3'; p = os.path.join(D, fn); await one(t, p, v, pi, r); m[k] = {'file': 'cv/' + fn, 'dur': dur(p), 'en': t}
        out['lead'].append(m)
    for i, (v, pi, r) in enumerate(TR):
        m = {}
        for k, t in TL.items():
            fn = f'us3_t{i}_{k}.mp3'; p = os.path.join(D, fn); await one(t, p, v, pi, r); m[k] = {'file': 'cv/' + fn, 'dur': dur(p), 'en': t}
        out['troop'].append(m)
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_cvus.js'), 'w').write('// 自動生成 (tools/add_cvus_voices.py)。幕三の米兵（班長は英語の女性の声）\nwindow.VOICE_CVUS = ' + json.dumps(out, ensure_ascii=False) + ';\n')
asyncio.run(main())
