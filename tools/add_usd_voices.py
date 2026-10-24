#!/usr/bin/env python3
"""アメリカ西部編 第一幕「荒野の決闘」の声（edge-tts）。assets/voices/usd/ と voices_usd.js。
殿は字幕のみ（声なし・ここには入れない）。アメリカの娘は en-US、日本側は ja-JP（日本語字幕つき）。"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'usd')
N = 'ja-JP-NanamiNeural'
ST = {'omiya': (N, 18, 26), 'sumi': (N, -6, -8), 'sec2': (N, 4, 14), 'fumi': (N, -2, 4), 'maid': (N, 6, 6), 'shizuka': (N, -8, -10), 'reika': (N, 2, 2),
      'us01': ('en-US-AvaNeural', 4, 0), 'us19': ('en-US-EmmaNeural', -6, -6), 'us05': ('en-US-JennyNeural', 6, 4), 'us12': ('en-US-AriaNeural', 0, -4),
      'us14': ('en-US-MichelleNeural', 8, 6), 'us06': ('en-US-JennyNeural', 10, 10)}
NUM = ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven.', 'Eight.', 'Nine.', 'Ten!']
NJA = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十！']
L = {
 'o_sumi': ('sumi', '殿、前方にアメリカ勢です。……白い布を掲げて、使者が来ます。'),
 'p1': ('us01', "Hold your fire! I'm Captain Maggie O'Connell. We've got no wish to waste a whole army before supper.", '撃つな！ 私はマギー・オコンネル隊長。夕飯前に軍を丸ごと無駄にする気はないの。'),
 'p2': ('us01', "Here's how we settle things out West. One of yours against one of mine. Back to back, ten paces, turn and shoot. Whoever falls, her side loses.", '西部のやり方で決めましょう。そちらから一人、こちらから一人。背中合わせで十歩、振り向いて撃つ。倒れた方の負けよ。'),
 'p3': ('us01', "I hear you folks don't carry pistols. Take this one. A Colt, loaded. You'll give it back, one way or another.", 'そちらは拳銃を持たないそうね。これを貸すわ。コルトよ、弾は込めてある。返してもらうわ……どちらにしてもね。'),
 'p4': ('us19', "I'll stand for our side. Send me whoever you like.", 'こちらは私が出るわ。誰でも寄こしなさい。'),
 'p5': ('sumi', '殿、銃を貸すと……。断れば、臆したと笑われます。誰を出されますか。'),
 'r_fumi': ('fumi', '……承知しました。銃は初めてですが、狙いは弓と同じ。必ず、戻ります。'),
 'r_omiya': ('omiya', 'はいっ！ お任せください！ 反応の速さなら、負けません！'),
 'r_sec2': ('sec2', 'え……わ、私ですか……？ ……は、はい……行きます……。手が、震えて……'),
 'r_shizuka': ('shizuka', '承知。十数えて、振り向いて、撃つ。それだけのことです。'),
 'r_reika': ('reika', 'ふふっ、いいわ。私を選んだこと、後悔させないから。'),
 'r_maid': ('maid', 'わ、私が……！？ は、はいっ！ 殿のために！'),
 'r_self': ('sumi', '殿！ なりません！ 殿が倒れたら、それで全てが終わるのですよ！ ……どうしても、と仰るなら……必ず、生きて戻ってください。'),
 'd_rules': ('us01', "Back to back. I'll count to ten. On ten, turn and fire. Nobody turns before ten.", '背中合わせに。私が十まで数える。十で振り向いて撃つこと。十より前に振り向かないで。'),
 'cry_fumi': ('fumi', 'うっ……！'), 'cry_omiya': ('omiya', 'うっ……！'), 'cry_sec2': ('sec2', 'あっ……！'), 'cry_shizuka': ('shizuka', 'くっ……！'),
 'cry_reika': ('reika', 'うっ……！'), 'cry_maid': ('maid', 'あっ……！'), 'cry_us': ('us19', 'Ugh!', 'うっ……！'),
 'd_jpwin': ('us01', "Well, I'll be. A deal's a deal. But that was only round one. Give back the Colt.", '……やるじゃない。約束は約束。でも、これは一回戦にすぎないわ。コルトを返して。'),
 'd_return': ('sumi', 'お返しします。……殿、来ます。皆、構えて！'),
 'd_uswin': ('us01', "First round to us. I'll take my Colt back, thank you. Now, all hands, open fire!", '一回戦はこちらの勝ち。コルトは返してもらうわ。さあ、全員、撃て！'),
 'd_uswin_s': ('sumi', '……弔い合戦です。竹束を押し立てて進め！'),
 'b_start': ('us01', 'All hands! Rifles hold the rocks, pistols with me!', '全員！ ライフルは岩場を守れ、拳銃組は私に続け！'),
 'b_bundle': ('sumi', '竹束を押し立てて進め！'),
 'b_rush': ('sumi', '弾込めの隙に斬り込め！'),
 'b_cannon': ('sumi', '大砲、撃てーっ！'),
 'b_reload': ('us05', 'Reloading! Cover me!', '弾込め中！ 援護して！'),
 'b_winch': ('us12', "Keep 'em pinned! Work those levers!", '釘付けにして！ レバーを引き続けて！'),
 'b_close': ('us14', "They're on us! Pistols!", '来たわ！ 拳銃を！'),
 'b_shell': ('us06', 'Cannon! Get down!', '大砲よ！ 伏せて！'),
 'b_omiya1': ('omiya', '竹束の陰から離れないで！ 弓組、今です！'),
 'b_omiya2': ('omiya', 'あの人たち、弾を込め直してます！ 今ですよ、殿！'),
 'win': ('us01', 'Fall back! Fall back to the wagons! ... You fight like the devil, you know that?', '退け！ 馬車まで退却！ ……あなたたち、悪魔みたいに強いのね。'),
 'win_s': ('sumi', '殿、アメリカ勢が退きます。……この荒野は、私たちのものです。'),
 'lose': ('sumi', '殿、これ以上は……。退きましょう。'),
}
for i in range(10): L['c%d' % (i + 1)] = ('us01', NUM[i], NJA[i])
async def one(t, p, v, r, pi):
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 3.0
async def main():
    os.makedirs(D, exist_ok=True); out = {'lines': {}}
    for k, x in L.items():
        who, ja = x[0], x[-1]; en = x[1] if len(x) == 3 else None
        v, r, pi = ST[who]; p = os.path.join(D, k + '.mp3')
        if not os.path.exists(p) or os.path.getsize(p) < 500: await one(en or ja, p, v, r, pi)
        ok = os.path.exists(p) and os.path.getsize(p) > 500
        o = {'who': who, 'ja': ja}
        if ok: o['file'] = 'usd/' + k + '.mp3'; o['dur'] = dur(p)
        if en: o['en'] = en
        out['lines'][k] = o
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_usd.js'), 'w').write('// 自動生成 (tools/add_usd_voices.py)。アメリカ西部編 第一幕「荒野の決闘」\nwindow.VOICE_USD = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print('lines', len(out['lines']), 'with file', sum(1 for v in out['lines'].values() if 'file' in v))
asyncio.run(main())
