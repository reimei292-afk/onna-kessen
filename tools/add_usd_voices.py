#!/usr/bin/env python3
"""アメリカ西部編 第一幕「荒野の決闘」の声（edge-tts）。assets/voices/usd/ と voices_usd.js。
殿は字幕のみ（声なし・ここには入れない）。アメリカの娘は en-US、日本側は ja-JP（日本語字幕つき）。"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'usd')
N = 'ja-JP-NanamiNeural'
ST = {'omiya': (N, 18, 26), 'sumi': (N, -6, -8), 'sec2': (N, 4, 14), 'fumi': (N, -2, 4), 'maid': (N, 6, 6), 'shizuka': (N, -8, -10), 'reika': (N, 2, 2),
      'us01': ('en-US-AvaNeural', 4, 0), 'us19': ('en-US-EmmaNeural', -6, -6), 'us05': ('en-US-JennyNeural', 6, 4), 'us12': ('en-US-AriaNeural', 0, -4),
      'us14': ('en-US-MichelleNeural', 8, 6), 'us06': ('en-US-JennyNeural', 10, 10),
      'ojou': (N, -14, -2), 'uk10': ('en-GB-SoniaNeural', 8, 5), 'uk04': ('en-GB-SoniaNeural', 4, -3), 'uk03': ('en-IE-EmilyNeural', 0, 2),
      'usA': ('en-US-AriaNeural', 2, 2), 'usB': ('en-US-JennyNeural', -4, -4), 'usC': ('en-US-EmmaNeural', 6, 6), 'shinobu': (N, -8, -8), 'chikage': (N, -4, 0), 'hiyori': (N, 2, 12), 'akari': (N, 12, 10)}   # usA〜C：名の無いアメリカ兵の短い叫び
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); from voice_profiles import override, style  # 全ステージ共通の声の目録
override(ST)
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
# ---- 第二幕「城下町の罠」（usTown）：町の人は前もって避難ずみ。英国の娘は味方（英語＋字幕） ----
L.update({
 't_sumi1': ('sumi', '殿、町の人たちは昨夜のうちに、皆、山の寺へ逃がしました。この通りに残っているのは、私たちだけです。'),
 't_ojou1': ('ojou', '大通りには落とし穴を、横丁の奥は行き止まりに。屋根の上には弓組を伏せてあります。ここで足を止めさせましょう。'),
 't_uk10': ('uk10', "We'll hold the alleys with you, my lord. After what you did for us, it's the least we can do.", '横丁は私たちも一緒に守ります、殿。あのときの恩を思えば、これくらい当然です。'),
 't_us01': ('us01', "Through the town, girls! The palace is just past that gate. Keep moving!", '町を抜けるのよ！ 宮殿はあの門のすぐ先。止まらないで！'),
 't_pit_s': ('sumi', 'かかりました！'),
 't_pit_o': ('omiya', 'やった、落ちました！'),
 't_pit_us': ('us06', 'Watch the ground! There are pits under the straw!', '足元に気をつけて！ 藁の下に穴がある！'),
 't_spot': ('sumi', '……落とし穴を見抜かれました。避けて通ってきます。'),
 't_alley_o': ('ojou', '横丁に入りました。弓組、放て！'),
 't_alley_uk': ('uk04', "They've walked straight in. Loose!", 'まんまと入ってきたわ。放て！'),
 't_dead_us': ('us14', "Dead end! It's a trap, back out, back out!", '行き止まり！ 罠よ、下がって、下がって！'),
 't_wave_s': ('sumi', '殿、新手が来ます。……まだ増えるようです。'),
 't_wave_us': ('us12', 'Second column coming up! Push on!', '第二隊が来たわ！ 押して！'),
 't_wave2_sh': ('shizuka', '……数が多すぎる。いつまでもは持ちません。'),
 't_reika': ('reika', '来るなら来なさい！ 一歩も通さないわよ！'),
 't_hold_om': ('omiya', 'まだ大丈夫です、殿！ 押し返してます！'),
 't_breach_s': ('sumi', '大通りの守りが破られました！ 門まで来ます！'),
 't_breach_us': ('us01', "We're through! Don't stop now, take the gate!", '抜けたわ！ 止まらないで、門を取るのよ！'),
 't_fall_o': ('ojou', '殿、ここは引きましょう！宮殿で迎え撃ちます'),
 't_fall_s': ('sumi', '殿、お早く！ 宮殿までお供します。皆、門の内へ！'),
 't_fall_uk': ('uk10', 'Fall back to the palace! Go, go!', '宮殿まで退いて！ 早く！'),
 't_cry0': ('usA', 'Ahh—!', 'あっ……！'), 't_cry1': ('usB', 'Whoa—!', 'うわっ……！'), 't_cry2': ('usC', 'Ugh!', 'うっ！'),
 't_cry3': ('usA', 'No—!', 'いや……！'), 't_cry4': ('usB', "I'm hit!", 'やられた！'), 't_cry5': ('usC', 'Oh!', 'あっ！'),
})
# ---- 第二幕の続き：平城・宮殿・山城（usTown の二〜四段）と、大将の采配 ----
L.update({
 't_fumi1': ('fumi', '町の守りは私が預かります。殿は、どうか後ろに。'),
 't_fall_f': ('fumi', '城へ引けーっ！ 殿を先に、皆、城へ！'),
 't_gate_o': ('ojou', '門を閉ざせ！ 閂をかけなさい！'),
 'c_ojou1': ('ojou', '殿、ようこそお越しくださいました。戦より書類の方が得意ですけれど、この城は一歩も譲りません。'),
 'c_shinobu1': ('shinobu', '矢の束、塀の上へ運びます！'),
 'c_chikage1': ('chikage', '伝令、承りました。大手門へ伝えます。'),
 'c_ladder_sh': ('shinobu', '梯子です！ 東の塀に梯子がかかりました！'),
 'c_moat_ck': ('chikage', '堀の浅いところを渡ってきます！'),
 'c_win_o': ('ojou', '……退いていきます。守り切りましたわ、殿。'),
 'c_fall_o': ('ojou', '殿、抜け道へ！ 本丸の奥から、宮殿へ抜けられます！'),
 'c_fall_sh': ('shinobu', 'こちらです、殿！ 足元にお気をつけて！'),
 'p_omiya1': ('omiya', 'はいっ！ 近衛室、全員配置！ そこ、列が乱れてる！ 殿をお守りするのが私たちの仕事でしょう！'),
 'p_omiya2': ('omiya', '抜け道から来ます！ 大階段は絶対に渡さないで！'),
 'p_sumi1': ('sumi', '殿、こちらへ。最後まで、お側におります。'),
 'p_hiyori': ('hiyori', '侍女の皆さん、矢を回してください！'),
 'p_win_om': ('omiya', '追い返しました……！ 殿、ご無事ですね。よかった……！'),
 'p_fall_om': ('omiya', '殿、ここはもう持ちません！ 山城へお逃げください。私が最後までお供します！'),
 'p_fall_s': ('sumi', '殿、お早く。裏の門から、山へ。'),
 'm_ojou1': ('ojou', 'ここが最後の城です。殿、私たちがお守りいたします。'),
 'm_omiya1': ('omiya', 'はいっ！ 一つ目の曲輪から順に守ります！'),
 'm_log': ('sumi', '丸太を落とします！ 道から離れて！'),
 'm_bridge': ('omiya', '吊り橋を切りました！'),
 'm_drum': ('ojou', '太鼓を！ 西の曲輪から援軍を呼びなさい！'),
 'm_mist': ('sumi', '霧が出てきました。……敵も、こちらも見えません。'),
 'm_water': ('chikage', '水の手を取られました！ 手当てが遅れます！'),
 'm_kuruwa': ('omiya', 'この曲輪はもう無理です！ 上の曲輪へ！'),
 'm_win_s': ('sumi', '殿……アメリカ勢が、山を下りていきます。守り抜きました。'),
 'm_end_s': ('sumi', '殿……っ、いや……'),
 'm_end_om': ('omiya', '殿ぉ……！'),
 'm_end_o': ('ojou', '……お供できず、申し訳ございません……'),
 'o_ojou_a': ('ojou', '右を固めなさい！'), 'o_ojou_b': ('ojou', '弓隊、放て！'), 'o_ojou_c': ('ojou', '前に出すぎないで！ 列を保ちなさい！'),
 'o_fumi_a': ('fumi', '弓隊、放てっ！'), 'o_fumi_b': ('fumi', '左を詰めて！'), 'o_fumi_c': ('fumi', '下がって、組み直して！'),
 'o_omiya_a': ('omiya', 'はいっ、弓隊、放て！'), 'o_omiya_b': ('omiya', '右を固めて！'), 'o_omiya_c': ('omiya', '前に出すぎない！'),
})
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
