#!/usr/bin/env python3
"""軽空母・客船（?stage=keiku）の声（edge-tts）。assets/voices/cv/ と voices_cv.js。
台詞は game.js の /*CVLN*/〜/*CVLN_END*/ から node で取り出す（部署ごとの台詞・出来事・王の一行）。
部署の侍女は部署ごとの話速と高さ。名のある人は voice_profiles。米軍機は en-US（日本語字幕つき）。王は字幕だけ。"""
import asyncio, json, os, subprocess, hashlib, sys, edge_tts
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'cv')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from voice_profiles import PROFILES
N = 'ja-JP-NanamiNeural'
JS = r'''
const s=require("fs").readFileSync(process.argv[1],"utf8");const a=s.indexOf("/*CVLN*/"),b=s.indexOf("/*CVLN_END*/");
const o=new Function(s.slice(a,b)+";return {CV_LN,CV_EV,CV_FAMLN}")();
const m=s.match(/const CV_NUM = (\[[^\]]*\])/);o.CV_NUM=JSON.parse(m[1].replace(/'/g,'"'));
const us=[];const re=/cvUsSay\(f\.who, ([^,]+?), ('[^']*'|[^,]+?), f\.pitch\)/g;let x;while((x=re.exec(s)))us.push([x[1],x[2]]);o.US=us;
console.log(JSON.stringify(o));'''
o = json.loads(subprocess.check_output(['node', '-e', JS, os.path.join(ROOT, 'game.js')]).decode())
def vo(who):
    if who in PROFILES: return PROFILES[who]
    h = int(hashlib.md5(who.encode()).hexdigest(), 16); return (N, (h % 17) - 8, ((h >> 5) % 21) - 8)
L = {}   # key -> (who, ja, en, voiceWho)
def add(who, ja, en=None, vw=None):
    k = hashlib.md5((who + '|' + ja).encode()).hexdigest()[:10]
    L[k] = (who, ja, en, vw or who)
for d, v in o['CV_LN'].items():
    for ph, arr in (v.items() if isinstance(v, dict) else [('x', v)]):
        for ja in arr: add(d, ja)
for k, ja in o['CV_EV'].items(): add('*', ja, vw='dc' if k in ('hole', 'holeNo', 'fixed', 'flood') else 'look' if k in ('dive', 'g4m', 'strafe') else 'med' if k in ('treat', 'rinju') else 'brg')
for who, v in o['CV_FAMLN'].items():
    for ja in (sum(v.values(), []) if isinstance(v, dict) else v): add(who, ja)
# 幕四（祝勝会・会議室）の台詞。名のある人は自分の声（voice_profiles）、名の無い者は 'c'、その他は '*'
JS2 = r"""
const s=require("fs").readFileSync(process.argv[1],"utf8");const a=s.indexOf("const CVF_SEAT"),b=s.indexOf("function cvfStage(");
const o=new Function(s.slice(a,b)+";return {CVF_VISIT,CVF_CHAT,CVF_EARLY,CVF_GREET,CVF_FUN,CVF_EV,CVF_MEET,CVF_MUR,CVF_BGN,CVF_BG}")();console.log(JSON.stringify(o));"""
o4 = json.loads(subprocess.check_output(['node', '-e', JS2, os.path.join(ROOT, 'game.js')]).decode())
def seq(x):
    if isinstance(x, dict):
        for v in x.values(): yield from seq(v)
    elif isinstance(x, list) and len(x) == 2 and all(isinstance(v, str) for v in x):
        if not x[0].startswith('@'): yield x
    elif isinstance(x, list):
        for v in x: yield from seq(v)
for who, ja in seq([o4['CVF_VISIT'], o4['CVF_EARLY'], o4['CVF_GREET'], o4['CVF_FUN'], o4['CVF_EV'], o4['CVF_MEET']]):
    if who == 'k' or ja.startswith('（') or '♪' in ja: continue
    if who in ('c', 'c2', 'x', 'x2'): add('c', ja, vw='din')
    elif who == '*': add('*', ja, vw='din')
    else: add(who, ja)
for ja in o4['CVF_CHAT']: add('*', ja, vw='din')
for k, ja in o4['CVF_BGN'].items(): add(k, ja)
for kind, ja in o4['CVF_BG']: add('*', ja, vw='din')
MV = ['din', 'gal', 'cab', 'bath', 'shop', 'ban', 'med', 'res', 'look', 'sig']   # 客席の反応：いろいろな声で
for key, arr in o4['CVF_MUR'].items():
    for i, ja in enumerate(arr): add('*', ja, vw=MV[(i * 3 + len(key)) % len(MV)])
for ja in [o['CV_EV']['start'], o['CV_EV']['aa'], o['CV_EV']['clear'], o['CV_EV']['sink']] + o['CV_LN'].get('brg', {}).get('raid', []) + o['CV_LN'].get('brg', {}).get('sail', []): add('sumi', ja)
NUM = o['CV_NUM']
import re as _re
_g = open(os.path.join(ROOT, 'game.js'), encoding='utf8').read()
_t = json.loads(_re.search(r'const CV3_TALK = (\{.*?\});\n', _g).group(1))
for i, ja in enumerate(_t['body'] + _t['beauty']): add('*', ja, vw=f'ext{i * 7 + 3}')   # 答えごとに別の侍女の声
_p = _re.findall(r"\['\w+', '([^']+)'\]", _re.search(r'const CV3_PHOTO = (\[.*?\]);\n', _g).group(1))
for i, ja in enumerate(_p + ['陛下……ポケットに、これが', 'はい。布の下に、戻しておきます']): add('*', ja, vw='ext90' if i < len(_p) else 'ext90')
for i, ja in enumerate(['逃げろ！', '逃げろ！ 機体が来る！', '艦橋に突っ込んだ！', '消火急げ！ ホースを艦橋へ！', '残骸から兵が出てくる！', '敵兵とはいえ丁重に扱え。米兵の子たちに白布をかけて、担架で舷側に並べろ', '……重いですね', 'トラクターを上げろ！ 機体を舷側へ曳く', '曳くよ！ ゆっくり！', '手の空いてる者は全員集まれ！ 押して落とす！', 'せーのっ！', 'よいしょっ！', 'もう少し！']): add('*', ja, vw=['look', 'deck', 'brg', 'dc', 'look', 'brg', 'ext55', 'brg', 'ext61', 'brg', 'ext70', 'ext77', 'ext83'][i])
for t in ['敵機、正面！', '敵機、真後ろ！'] + [f'敵機、{s}{NUM[n]}度！' for s in ('右', '左') for n in range(1, 17)]: add('*', t, vw='look')
USV = [('en-US-AvaNeural', 4, 0), ('en-US-EmmaNeural', -4, -4), ('en-US-JennyNeural', 6, 4)]
for ja_e, en_e in o['US']:
    def lit(e): return [p.strip().strip("'") for p in e.replace('(f.kind === \'usf\' ? ', '').split(':')] if '?' in e else [e.strip().strip("'")]
    if '?' in ja_e:   # (f.kind === 'usf' ? '戦闘機' : '爆撃機') + '、被弾！'
        for a, en in (('戦闘機、被弾！', 'I am hit! Going down!'), ('爆撃機、被弾！', 'Bomber hit! We are going down!')): add('us', a, en)
    else: add('us', ja_e.strip("'"), en_e.strip("'"))
async def one(t, p, v, r, pi):
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 2.0
async def main():
    os.makedirs(D, exist_ok=True); out = {'lines': {}}; sem = asyncio.Semaphore(8)
    async def gen(k, x):
        who, ja, en, vw = x; p = os.path.join(D, k + '.mp3')
        v, r, pi = USV[int(k, 16) % 3] if who == 'us' else vo(vw)
        if not os.path.exists(p) or os.path.getsize(p) < 500:
            async with sem: await one(en or ja.replace('…', '、'), p, v, r, pi)
    await asyncio.gather(*[gen(k, x) for k, x in L.items()])
    seen = set()
    for k, (who, ja, en, vw) in L.items():
        p = os.path.join(D, k + '.mp3'); o2 = {'who': who, 'ja': ja}
        if os.path.exists(p) and os.path.getsize(p) > 500: o2['file'] = 'cv/' + k + '.mp3'; o2['dur'] = dur(p)
        if en: o2['en'] = en
        out['lines'][k] = o2
        if who != '*' and who != 'us' and ja not in seen and 'file' in o2: out['lines'][k + 's'] = {'who': '*', 'ja': ja, 'file': o2['file'], 'dur': o2['dur']}
        seen.add(ja)
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_cv.js'), 'w').write('// 自動生成 (tools/add_cv_voices.py)。軽空母・客船\nwindow.VOICE_CV = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print('lines', len(L), 'with file', sum(1 for v in out['lines'].values() if 'file' in v and v['who'] != '*' or v['who'] == '*'))
asyncio.run(main())
