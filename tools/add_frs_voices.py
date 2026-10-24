#!/usr/bin/env python3
"""フランス人形編 第一幕「海戦」と大宮の声（edge-tts）。assets/voices/frs/ と voices_frs.js。
殿は字幕のみ（声なし）。大宮は Nanami を速め・高めにして他の娘と区別する。"""
import asyncio, json, os, subprocess, edge_tts
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(ROOT, 'assets', 'voices', 'frs')
N = 'ja-JP-NanamiNeural'
ST = {'omiya': (N, 18, 26), 'sumi': (N, -6, -8), 'sec2': (N, 4, 14), 'fumi': (N, -2, 4), 'maid': (N, 6, 6), 'crew': (N, 0, 0), 'nurse': (N, 2, 8),
      'uk10': ('en-GB-SoniaNeural', 8, 5), 'uk06': ('en-GB-SoniaNeural', -10, 0), 'fr02': ('fr-FR-DeniseNeural', 0, 0), 'fr06': ('fr-FR-DeniseNeural', -8, -6), 'fr05': ('fr-FR-DeniseNeural', 6, 8)}
L = {
 # 開幕
 'o_sumi': ('sumi', '殿、物見の報せです。フランスの艦隊が、この港へ向かっています。英国の皆さんと、船で迎え撃ちましょう。'),
 'o_uk06': ('uk06', 'My lord, the French are coming for our harbour. We sail with you. England will not forget.', '殿、フランスがこの港を狙っています。私たちも共に出ます。英国はこの恩を忘れません。'),
 'o_omiya': ('omiya', 'はいっ！ 大宮、殿のお側に控えます！ 西園寺の船も、右舷についてますよ！'),
 'o_fr06': ('fr06', "Pour la République ! Feu à volonté ! Chargez les obus !", '共和国のために！ 各砲、撃ち方始め！ 破裂弾を込めよ！'),
 'o_uk10': ('uk10', 'Gun crews ready! Shells loaded, my lord. On your word!', '砲員、準備よし！ 破裂弾装填済みです、殿。ご命令を！'),
 'b_omiya1': ('omiya', '撃ち返しましょう！ ここで引いたら、港の皆に顔向けできません！'),
 'b_omiya2': ('omiya', 'あはは、外れました！ 今のうちに次、いきますよ！'),
 'b_omiya3': ('omiya', '頭を低く！ 破片が来ます！'),
 'b_omiya4': ('omiya', 'はいっ！ 了解です！'),
 'b_omiya5': ('omiya', 'お任せください！'),
 'b_hit': ('uk10', 'A hit! Their foredeck is in disorder!', '命中！ 敵の前甲板が乱れています！'),
 'b_ship': ('fr02', "Le navire amiral ne répond plus… repliez-vous !", '旗艦が応答しません……退却を！'),
 'win': ('omiya', 'やりましたね、殿！ 港は守れました！ ……ふふっ、皆、よく頑張りました！'),
 'lose': ('sumi', '殿、これ以上は持ちません……港へ退きましょう。'),
 'om_down': ('omiya', 'うっ……！'),
 'om_down2': ('omiya', '無念……'),
 'fr_dead': ('fr05', "Il est trop tard…", '御臨終です……'),
 'fr_heal': ('fr05', "Tenez bon… c'est fini, vous pouvez vous relever.", 'しっかり……もう大丈夫、立てますよ。'),
 'fr_heal2': ('fr05', "Vite, la suivante !", '急いで、次の人！'),
 # 大宮との会話
 't_hello': ('omiya', 'はいっ、殿！ 大宮ひなたです。何でもおっしゃってください！'),
 't_saionji': ('omiya', '西園寺は従姉妹です！ 小さい頃からよく一緒に遊びました。あの子、昔は木登りが下手で、いつも私が下で受け止めてたんですよ。'),
 't_kin': ('omiya', 'それと、殿とは父方のハトコにあたります。だから身内の遠慮は、ちょっとだけにしておきますね！'),
 't_tennis': ('omiya', 'テニスとバドミントンを、ずっとやってました！ 背は低くても、足と反応の速さなら負けません。砲煙の中でも、球を追う目は役に立つんですよ。'),
 't_height': ('omiya', '百四十七センチです！ あははっ、よく子どもと間違えられます。でも、低いほうが弾に当たりにくいんですよ。……たぶん！'),
 't_opinion': ('omiya', '殿、ひとつ申し上げます。英国の皆さんの船を、前に出しすぎです。味方を先に危ない目に遭わせるのは、義理が立ちません。私たちの船が前に出ましょう。'),
 't_opinion2': ('omiya', 'ご無礼は承知です。でも、言うべきことは言わせていただきます！'),
 't_laugh': ('omiya', 'あははっ！ 殿、こんな時に冗談なんて。……でも、少し肩の力が抜けました。ありがとうございます！'),
 't_consult': ('omiya', '……不安なんですね。大丈夫ですよ。皆、殿を信じてここにいます。一人で抱えないで、私にも分けてください。'),
 # 早瀬への馴れ馴れしい侍女
 'h_maid1': ('maid', 'ねえねえ、ことねちゃん！ 秘書課ってさ、殿の隣で楽そうでいいよねー。'),
 'h_sec2': ('sec2', 'え、えっと……あの……'),
 'h_omiya1': ('omiya', 'ちょっと待ちなさい。早瀬さんは秘書課で、あなたの上役です。ちゃん付けで呼ぶのはやめなさい。'),
 'h_maid2': ('maid', 'あ……す、すみません、早瀬さん。'),
 'h_omiya2': ('omiya', 'はい、わかればいいんです。……戦の最中は、上下がはっきりしてないと命に関わるの。あなたの元気は、皆の助けになってますよ。持ち場、頼みましたね。'),
 'h_sec2b': ('sec2', 'お、大宮さん……ありがとうございます。'),
 'h_omiya3': ('omiya', 'いいんですよ。早瀬さんも、言うときは言わなきゃだめですよ？ ふふっ。'),
}
async def one(t, p, v, r, pi):
    for a in range(4):
        try: await edge_tts.Communicate(t, v, rate=f'{r:+d}%', pitch=f'{pi:+d}Hz').save(p); return
        except Exception: await asyncio.sleep(2 * (a + 1))
def dur(p):
    try: return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip()), 2)
    except Exception: return 3.0
async def main():
    os.makedirs(D, exist_ok=True); out = {'lines': {}}; jobs = []
    for k, x in L.items():
        who, ja = x[0], x[-1]; en = x[1] if len(x) == 3 else None
        v, r, pi = ST[who]; p = os.path.join(D, k + '.mp3')
        if not os.path.exists(p): jobs.append(one(en or ja, p, v, r, pi))
        out['lines'][k] = dict({'who': who, 'ja': ja, 'file': 'frs/' + k + '.mp3'}, **({'en': en} if en else {}))
    for i in range(0, len(jobs), 5): await asyncio.gather(*jobs[i:i + 5])
    for k in out['lines']: out['lines'][k]['dur'] = dur(os.path.join(D, k + '.mp3'))
    open(os.path.join(ROOT, 'assets', 'voices', 'voices_frs.js'), 'w').write('// 自動生成 (tools/add_frs_voices.py)。フランス人形編 第一幕「海戦」と大宮\nwindow.VOICE_FRS = ' + json.dumps(out, ensure_ascii=False) + ';\n')
asyncio.run(main())
