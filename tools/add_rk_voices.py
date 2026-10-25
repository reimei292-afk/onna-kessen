#!/usr/bin/env python3
"""アメリカ西部編 第三幕「陸攻出撃」（usRaid）の声（edge-tts）。assets/voices/rk/ と voices_rk.js。
搭乗員は名の無い侍女（ja-JP）。アメリカの戦闘機・地上の対空班は en-US（日本語字幕つき）。殿は字幕のみ（ここには入れない）。"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'rk')
N = 'ja-JP-NanamiNeural'
ST = {'rp1': (N, -6, -8), 'rp2': (N, 0, 4), 'rr': (N, -2, -2), 'rb': (N, 2, 6), 'rg1': (N, 6, 8), 'rg2': (N, -4, 0), 'rg3': (N, 8, 12), 'rw': (N, -8, -10), 'fumi': (N, -2, 4), 'sec3': (N, -4, 2), 'sh': (N, 6, 10), 'ga': ('en-US-AriaNeural', 2, -2), 'gb': ('en-US-EmmaMultilingualNeural', 4, 0), 'gc': ('en-US-AvaMultilingualNeural', 6, 4),
      'ua': ('en-US-AvaNeural', 4, 0), 'ub': ('en-US-EmmaNeural', -4, -4), 'uc': ('en-US-JennyNeural', 6, 4), 'ud': ('en-US-MichelleNeural', 4, 2)}
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); from voice_profiles import override  # 全ステージ共通の声の目録
override(ST)
L = {
 'r_brief': ('rp1', '中隊、全機そろった。高度千百で目標へ向かう。間隔を詰めて、離れるな。'),
 'r_climb': ('rp2', '高度千百。針路、そのまま。'),
 'r_radar': ('rr', '電探に感あり！ 前方、敵戦闘機の編隊。こちらへ向かってきます。'),
 'r_fight': ('rp1', '敵戦闘機、来るぞ！ 各銃座、射撃はじめ！'),
 'r_front': ('rg1', '正面、上から来ます！'),
 'r_left': ('rg2', '左、来ます！'),
 'r_right': ('rg3', '右から来る！'),
 'r_tail': ('rg2', '後ろに付かれた！ 撃て、撃て！'),
 'r_kill': ('rg1', '一機、落とした！'),
 'r_kill2': ('rg3', '舵をやられたな、落ちていきます！'),
 'r_engL': ('rp2', '左発動機、被弾！ ……止まります！'),
 'r_engR': ('rp2', '右発動機、被弾！ プロペラが止まった！'),
 'r_fireout': ('rp2', '消火、成功。まだ飛べます。'),
 'r_crew': ('rg3', '機銃手、被弾！ 返事がありません！'),
 'r_pilot': ('rp2', '操縦手、被弾……！ 操縦、代わります！'),
 'r_wdown': ('rw', '僚機、被弾……！ 高度が下がっていきます……！'),
 'r_wdown2': ('rp1', '……見るな。前を向け。'),
 'r_auto': ('rr', '応答がありません……。あの機、自動操縦で、基地へ戻っていきます。'),
 'r_aa': ('rb', '目標上空、対空機銃！ 曳光弾が上がってきます！'),
 'r_run': ('rp1', '爆撃針路に入る。……ようそろ。投下は照準手の合図で。'),
 'r_drop': ('rb', '投下、投下！'),
 'r_hit': ('rb', '命中、命中！ 格納庫が崩れました！'),
 'r_hit2': ('rb', '命中しました！ 燃料タンクを破りました！'),
 'r_miss': ('rb', '……外れました。滑走路の脇です。'),
 'r_turn': ('rp1', '全機、反転。基地へ帰る。'),
 'r_home': ('rp1', '基地が見えます。着陸に入ります。'),
 'r_land': ('rp2', '接地。……着陸しました。'),
 'r_king_hit': ('rp2', '殿……！ 殿が撃たれました！ 誰か、手を！'),
 'r_king_down': ('rp1', '操縦が利かない……！ 殿、つかまってください……！'),
 'r_take': ('rg2', '殿、銃座をどうぞ。弾は十分です。'),
 'r_takeb': ('rb', '殿、照準器をどうぞ。目標が十字に来たら、投下を。'),
 'c0': ('rg1', 'うっ……！'), 'c1': ('rg2', 'あっ……！'), 'c2': ('rg3', 'くっ……！'), 'c3': ('rb', 'っ……！'), 'c4': ('rr', 'う……'), 'c5': ('rp2', 'あぁっ……！'),
 'w_arm': ('rg2', '腕を……！ まだ撃てます！'), 'w_arm2': ('rg1', 'っ……腕が。大丈夫、続けます！'),
 'w_leg': ('rg3', '脚を……！ 立てます、まだ……！'), 'w_leg2': ('rb', '……脚が。でも、まだ……！'),
 'w_abd': ('rg2', 'う……お腹が……'), 'w_abd2': ('rr', '……すみません……動けません……'),
 'r_wound': ('rp2', '負傷者、出ました！ 救護班、頼みます！'),
 's_take': ('fumi', '銃座、私が代わります！'), 's_take2': ('sec3', '私が撃ちます！ 任せてください！'), 's_take3': ('sh', 'この銃、私が！'),
 's_ammo': ('sh', '弾薬、持ってきました！'), 's_king': ('fumi', '殿、お怪我は……！ 先生、こちらへ！'),
 'r_fl': ('rp1', '操縦が利かない……！ 不時着する！ 全員、つかまれ！'), 'r_fl_w': ('rw', '僚機、操縦不能……！ 畑に、降りていきます……！'),
 'r_fl_ok': ('rp2', '……止まった。全員、外へ！ 機銃を外して持て！'), 'r_fl_us': ('rr', '敵兵です！ 畑の向こうから、来ます！'),
 'r_engstop': ('rp2', '発動機、停止！ プロペラが止まりました！'), 'r_ctrl': ('rp1', '舵をやられた……！ 舵が重い！'),
 'r_rescue': ('rp1', '友軍の救援です！ ……助かった。'), 'r_out': ('rg3', '弾が、もう……！'),
 'g_spot': ('ga', 'Enemy bomber down in the field! Spread out and move in!', '敵の爆撃機が畑に降りた！ 散開して進め！'),
 'g_fire': ('gb', 'Open fire! Keep your heads down!', '撃て！ 頭を下げて！'),
 'g_jeep': ('ga', "Bring the jeep up! Get that thirty-cal on 'em!", 'ジープを前へ！ 機関銃で撃て！'),
 'g_hit': ('gc', "I'm hit!", 'やられた！'), 'g_medic': ('gb', 'Medic! Medic!', '衛生兵！ 衛生兵！'),
 'g_back': ('ga', 'Fall back! Fall back to the road!', '後退！ 道まで下がれ！'),
 'g_mg': ('gc', "They've got a machine gun on that wreck!", 'あの機体に機関銃がある！'),
 'u_tally': ('ua', "Bombers, twelve o'clock, angels four. Let's go get 'em!", '爆撃機、正面、高度四千。行くわよ！'),
 'u_run': ('ub', "I'm going in. Cover me!", '突っ込むわ。援護して！'),
 'u_tail': ('uc', 'Watch that tail gunner!', '尾部の銃座に気をつけて！'),
 'u_hit': ('ud', "I'm hit! I'm hit! Bailing out!", '被弾した！ 脱出する！'),
 'u_kill': ('ua', "Got one! It's going down!", '一機やった！ 落ちていく！'),
 'u_rtb': ('ua', 'Low on fuel. Break off, head for home.', '燃料が少ない。離脱して、帰投する。'),
 'u_aa1': ('ub', 'Air raid! Man the guns!', '空襲！ 銃座につけ！'),
 'u_aa2': ('uc', "Open fire! Lead 'em, lead 'em!", '撃て！ 前を狙って、前を！'),
 'u_aa3': ('ud', 'Get down! Bombs!', '伏せて！ 爆弾よ！'),
}
async def one(t, p, v, r, pi):
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 3.0
async def main():
    os.makedirs(D, exist_ok=True); out = {'lines': {}}
    sem = asyncio.Semaphore(6)
    async def gen(k, x):
        who, ja = x[0], x[-1]; en = x[1] if len(x) == 3 else None
        v, r, pi = ST[who]; p = os.path.join(D, k + '.mp3')
        if not os.path.exists(p) or os.path.getsize(p) < 500:
            async with sem: await one(en or ja, p, v, r, pi)
    await asyncio.gather(*[gen(k, x) for k, x in L.items()])
    for k, x in L.items():
        who, ja = x[0], x[-1]; en = x[1] if len(x) == 3 else None
        p = os.path.join(D, k + '.mp3')
        ok = os.path.exists(p) and os.path.getsize(p) > 500
        o = {'who': who, 'ja': ja}
        if ok: o['file'] = 'rk/' + k + '.mp3'; o['dur'] = dur(p)
        if en: o['en'] = en
        out['lines'][k] = o
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_rk.js'), 'w').write('// 自動生成 (tools/add_rk_voices.py)。アメリカ西部編 第三幕「陸攻出撃」\nwindow.VOICE_RK = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print('lines', len(out['lines']), 'with file', sum(1 for v in out['lines'].values() if 'file' in v))
asyncio.run(main())
