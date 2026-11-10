// ===================================================================
// 決戦2「白壁城」（stage kessen2）：天鳳のあと。英国が中国で反乱を起こし、平野の白壁城（高い城壁で四方を囲み、門は東西南北）を奪った。
// 攻め手 約1500（六つの隊）・守り手 約1000。近くの者は一人ずつ（実体）、遠くの者・人数の多くは簡単な絵（群れ）で出す。
// 中国の現地兵の絵は KS2_CN_LOOKS の一か所だけ差し替えれば変わる（Grok で作った画像を frames/ に入れて id を並べる）。
// ===================================================================
const KS2_CN_LOOKS = ['vn01', 'vn02', 'vn03', 'vn04', 'vn05', 'vn06'];   // ← 中国の現地兵の絵（ここだけ差し替える）
const KS2_CN_NAMES = ['李 梅', '王 芳', '張 静', '劉 麗', '陳 玲', '楊 雪', '趙 婷', '黄 蘭', '周 燕', '呉 敏', '徐 霞', '孫 莉', '馬 蕾', '朱 慧', '胡 琳', '郭 娜'];
const KS2 = { on: false, ph: 'off', t: 0 };
const KS2_W = 70, KS2_T = 3, KS2_H = 9, KS2_IW = 36, KS2_IH = 7, KS2_GATE = 3.5, KS2_IG = 1.8;   // 外の城壁（±70・厚さ3・高さ9）、内の城壁（±36・高さ7）、門の半幅
const KS2_REAL = (() => { const q = parseInt(new URLSearchParams(location.search).get('ks2n'), 10); if (q > 0) return { a: Math.min(400, q), d: Math.min(300, Math.round(q * 0.75)) }; return LITE ? { a: 96, d: 72 } : { a: 260, d: 200 }; })();   // 一人ずつ動く人数（攻め手・守り手）。残りは群れの絵
// 側ごとの座標：u＝壁に沿う向き、v＝中心からの深さ（南 S は +z）
function ks2Rot(s, u, v) { return s === 'S' ? [u, v] : s === 'N' ? [-u, -v] : s === 'E' ? [v, -u] : [-v, u]; }
function ks2Side(x, z) { return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'E' : 'W') : (z > 0 ? 'S' : 'N'); }
const KS2_SIDES = ['S', 'E', 'W', 'N'];
const KS2_UNITS = [
  { k: 'S', name: '南門隊', n: 450, side: 'S', chain: ['ojou', 'omiya'], secs: ['shinobu', 'chikage'], tag: '南門隊長', mix: 'fr', off: [0, -34], path: [[0, 118]], sp: 1.5 },
  { k: 'E', name: '東門隊', n: 250, side: 'E', chain: ['fumi', 'reika'], secs: [], tag: '東門隊長', mix: 'us', off: [26, -18], path: [[60, 150], [125, 80], [118, 0]], sp: 1.7 },
  { k: 'W', name: '西門隊', n: 250, side: 'W', chain: ['uk06', 'shizuka'], secs: [], tag: '西門隊長', uk: 150, off: [-26, -18], path: [[-60, 150], [-125, 80], [-118, 0]], sp: 1.7 },
  { k: 'N', name: '北門隊', n: 200, side: 'N', chain: ['sec4', 'sysop'], secs: [], tag: '北門隊長', mix: 'us', off: [34, 14], path: [[95, 175], [150, 110], [150, -60], [60, -118], [0, -118]], sp: 2.6 },
  { k: 'H', name: '本隊', n: 200, side: null, chain: ['sumi', 'sec2'], secs: ['hirose', 'akari', 'hiyori', 'flute'], tag: '総大将', off: [0, 0], path: [[0, 150]], sp: 1.4 },
  { k: 'R', name: '後方', n: 150, side: null, chain: ['sec3', 'kujo'], secs: [], tag: '後方', off: [0, 26], path: [[0, 172]], sp: 1.3 },
];
const KS2_NM = { ojou: ['西園寺 すみれ', '冷静', 158], omiya: ['大宮 ひなた', '陽気', 147], shinobu: ['氷室 しのぶ', '冷静', 170], chikage: ['一条 千景', '慎重', 160], fumi: ['綾瀬 文乃', '冷静', 159], reika: ['白石 麗華', '好戦的', 165],
  uk06: ['エレノア・アシュコム', '冷静', 170], shizuka: ['久遠 静香', '冷静', 167], sec4: ['宮下 千尋', '慎重', 161], sysop: ['霧島 怜', '冷静', 161], sumi: ['白瀬 澄', '冷静', 160], sec2: ['早瀬 ことね', '陽気', 156],
  akari: ['夏目 あかり', '陽気', 162], hiyori: ['小日向 ひより', '慎重', 152], flute: ['小鳥遊 ひびき', '陽気', 155], sec3: ['桜井 ゆかり', '冷静', 158], kujo: ['九条 紗英', '冷静', 162], hirose: ['広瀬 千夏', '陽気', 0] };
const KS2_TITLE = { ojou: '南門隊長 西園寺', omiya: '南門隊 副官 大宮', shinobu: '西園寺の秘書 氷室', chikage: '西園寺の秘書 一条', fumi: '東門隊長 綾瀬', reika: '東門隊 副官 白石大佐', uk06: '西門隊長 エレノア', shizuka: '西門隊 副官 久遠中佐',
  sec4: '北門隊長 宮下大佐', sysop: '北門隊 副官 霧島中佐', sumi: '総大将 白瀬', sec2: '本隊 早瀬', akari: '本隊の秘書 夏目', hiyori: '本隊の秘書 小日向', flute: '器楽中佐 小鳥遊', sec3: '後方 桜井大佐', kujo: '軍医中将 九条', hirose: '本隊 広瀬' };
const KS2_VK = { ojou: 'ojou', omiya: 'omiya', shinobu: 'shinobu', chikage: 'chikage', fumi: 'fumi', reika: 'reika', uk06: 'uk06', shizuka: 'shizuka', sec4: 'sec4', sysop: 'sysop', sumi: 'sumi', sec2: 'sec2', akari: 'akari', hiyori: 'hiyori', flute: 'flute', sec3: 'sec3', kujo: 'kujo', hirose: 'hirose' };
function ks2Gid(k) { if (k === 'uk06') return 'uk06'; if (k === 'hirose') return GIRLS.girl45 ? 'girl45' : null; const P = PAL_NAMED[k]; const g = P && P.girl(); return g && GIRLS[g] ? g : null; }
// ---- 台詞（声は tools/add_ks2_voices.py → assets/voices/ks2/） ----
const KS2_L = {
  march: [['sumi', '全軍、前へ。隊列を崩さないで'], ['flute', 'さあ、行進曲です！ 歩調を合わせて'], ['sec2', '伝令、各隊へ走って！']],
  peel: [['sumi', '東門隊、西門隊、北門隊、回り込みなさい']],
  ready: [['sumi', '殿、全隊、配置につきました。ご合図を']],
  go: [['sumi', '総攻撃、始め！']],
  kingAhead: [['sumi', '殿、お下がりください。前に出すぎです'], ['sec2', '殿、お一人で先へ行かないでください！']],
  S: [['ojou', '破城槌、前へ。押し手は交代しながら、ですわ'], ['ojou', '攻城塔を壁へ。焦らずに参りましょう'], ['omiya', 'はいっ、押して押して！ 止まらないで！'], ['omiya', '押し手が倒れた、次の人、代わって！'], ['shinobu', '西園寺様、お下がりを。ここは私が'], ['chikage', '西園寺様、押し手の交代表です']],
  E: [['fumi', '梯子、掛けて！ 弓は上を狙って'], ['fumi', '登る人を援護して。撃ち方、続けて'], ['reika', 'ぐずぐずしないで、登りなさい！']],
  W: [['shizuka', '西門隊、マスケットの後ろへ。撃ち方用意'], ['shizuka', '弾込め、急いで。慌てないで']],
  N: [['sec4', '太鼓を叩いて。旗をもっと振って、大勢に見せて'], ['sec4', '北門隊、無理に攻めないで。引きつけるだけでいい'], ['sysop', '守り手が北に寄っています。陽動、効いています']],
  R: [['sec3', '矢と弾を前へ。荷車、急いで'], ['kujo', '担架をこちらへ。生きている人から運んで']],
  H: [['sec2', '澄お姉さま、東門隊から報告です！'], ['akari', '伝令、行ってきます！'], ['hiyori', '殿、お水です。少しだけでも']],
  gate: [['sumi', '門が破れました。続きなさい']], keep: [['sumi', '本丸へ。最後まで気を抜かないで']],
  // 広瀬 千夏：初陣。強がりと世話焼きで緊張を隠す（白瀬・綾瀬・早瀬の返し）
  hir: { m1: [['hirose', '初陣ですけど、澄さんには負けませんから'], ['sumi', '張り合う相手が違いますよ、千夏。……でも、頼りにしています'], ['hirose', '……べ、別に、そう言われても嬉しくなんかないです']],
    m2: [['hirose', '文乃さん、東門でしくじらないでくださいね'], ['fumi', 'そっちこそ。殿の横で転ばないでね、千夏さん']],
    m3: [['hirose', 'ことねちゃん、震えてない？……私も、少しだけ'], ['sec2', '千夏さん……はい。一緒に、がんばりましょう']],
    dep: [['hirose', '殿、後ろは私が見ています']], sg: [['hirose', '矢って、こんなに近くを飛ぶんですね……平気です、平気']],
    kp: [['hirose', '澄さん、私だって最後まで行けます'], ['sumi', 'ええ、見ていました。よくやっています'], ['hirose', '……い、今それを言わないでください']] },
  succ: { omiya: '西園寺に代わって、私が南門隊を預かります！', reika: '綾瀬隊長に代わって、私が東門隊の指揮を執ります', shizuka: '西門隊は、久遠が指揮を引き継ぎます', sysop: '宮下大佐に代わり、霧島が指揮を執ります', sec2: '澄お姉さま……！ 本隊は、私が引き継ぎます', kujo: '後方は、九条が預かります' },
};
const KS2_RV = { siege: ['えいえい、おう！', '押せ、押せ！', '門を破れ！', '梯子を押さえて！', '上から来る、頭を下げて！', '連弩だ、伏せて！', '連弩の射手を狙って！', '弓隊、放て！', '衛生兵！', '負傷者を後ろへ！'],
  inside: ['城内へ！', '第二の門だ、もう一押し！', '屋根の上にいる、気をつけて！', '通路が狭い、押さないで！', '本丸だ、気を抜かないで！'],
  ramen: ['辛っ！', '目が、目がぁ！', 'からい、からいっ！', '鼻が……つーんとする……', 'なんでラーメン!?', '水、水ちょうだい！'], yum: ['……おいしい'],
  med: ['助けに来てくれたんですね……！', '負傷者がまだ中に。運ぶのを手伝ってください'] };
const KS2_EN = { call1: ['uk06', 'Soldiers of Britain! The war is over. Lay down your arms, and no one will be harmed.', 'イギリスの兵よ、戦いは終わりました。武器を置きなさい。誰も傷つけはしません。'],
  call2: ['uk06', 'You know me. Eleanor Ashcombe. I give you my word.', '私を知っているでしょう。エレノア・アシュコムです。約束します。'],
  ready: ['uk06', 'Very well. Musket line, make ready!', 'よろしい。マスケット隊、用意！'], fire: ['uk06', 'Fire!', '撃て！'],
  open: ['uk06', 'They are opening the gate. Thank you.', '門を開けてくれています。ありがとう。'],
  hold: ['uk02', 'Hold the wall!', '城壁を守れ！'], come: ['uk04', 'Here they come!', '来るぞ！'],
  // アラベラ王女（本丸の反乱軍の総指揮。倒れない）
  defy1: ['uk00', 'This castle is ours. Britain will not bow to anyone.', 'この城は私たちのもの。英国は誰にも屈しません。'],
  defy2: ['uk00', 'Hold the inner gates! Not one step back!', '内の門を守りなさい！ 一歩も退かないで！'],
  elCall: ['uk06', 'Your Highness, please. It is over. Spare your soldiers.', '殿下、どうか。もう終わりです。兵たちをお救いください。'],
  araRep: ['uk00', 'Eleanor... you of all people. I will answer at the keep, and not before.', 'エレノア……あなたまで。答えは本丸で。それまでは退きません。'],
  cmd1: ['uk00', 'Enough. The castle is yours. I surrender.', 'もう十分です。城はそちらのもの。降伏します。'], cmd2: ['uk00', 'Tell your King my soldiers are not to blame.', '王に伝えて。兵たちに罪はありません。'],
  elThanks: ['uk06', 'Thank you, Your Highness.', 'ありがとうございます、殿下。'] };
function ks2VoiceFile(t, vk) { const M = ((window.VOICE_KS2 || {}).byText || {})[t]; if (!M || !M.length) return null; const L = (vk && M.find(x => x.v === vk)) || M[(Math.random() * M.length) | 0]; return L.file; }
function ks2Say(e, t, prio, vk) {   // 声と字幕。e が無ければ本隊のそばの声として
  const p = e && e.s ? e.s.position : player.pos, d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z) + Math.abs(p.y - player.pos.y + 1.6) * 0.5;
  const f = ks2VoiceFile(t, vk || (e && e.ks2Vk)); if (f && VoicePack.ok) Talk.as(e || null, () => VoicePack.play(f, Math.min(d, 55), prio == null ? 1.4 : prio, 1));
  if (d < 45 || (prio || 0) >= 1.8) { const nm = e ? (e.ks2Title || (e.prof && e.prof.name) || '') : ''; subtitle(t); const el = $('subtitle'); if (el) el.textContent = (nm ? nm + '「' : '「') + t + '」'; }
}
function ks2SayK(k, t, prio) { const e = KS2.by && KS2.by[k]; if (e && !isUp(e)) return; ks2Say(e || null, t, prio, KS2_VK[k]); }
function ks2En(key, e, prio, dmax) { const L = KS2_EN[key]; if (!L) return; const f = ks2VoiceFile(L[1], L[0]), p = e && e.s ? e.s.position : player.pos, d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
  if (f && VoicePack.ok) VoicePack.play(f, Math.min(d, dmax || 50), prio || 1.9, 1); popup((e ? (e.ks2Title || e.prof.name) + '：' : '') + L[1] + ' ／ ' + L[2]); popupTimer = Math.max(popupTimer, 4.2); }
// ---- 舞台 ----
let KS2_M = null;
function ks2Mats() { if (KS2_M) return KS2_M; const L = c => new THREE.MeshLambertMaterial({ color: c });
  return KS2_M = { wall: L(0xe8e2d2), wallD: L(0xcfc6b2), roof: L(0x3f4a52), wood: L(0x6b4a2e), woodD: L(0x4a321f), earth: L(0x8c7a55), grass: L(0x7f9a5c), stone: L(0xa39a88), gate: L(0x5a3a20), iron: L(0x3a3a3a), cloth: L(0xe9e4d6), red: L(0x9a2a22), blue: L(0x2a3f7a), pot: L(0x3a2a20), broth: L(0xc8902a) }; }
function ks2Box(x0, x1, y0, y1, z0, z1, m, solid) { const g = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m); g.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); stageRoot.add(g); if (KS2.stat) KS2.stat.push(g); if (solid) boxes.push({ x0, x1, z0, z1, y0, y1 }); return g; }
function ks2BoxR(s, u0, u1, v0, v1, y0, y1, m, solid) { const [ax, az] = ks2Rot(s, u0, v0), [bx, bz] = ks2Rot(s, u1, v1); return ks2Box(Math.min(ax, bx), Math.max(ax, bx), y0, y1, Math.min(az, bz), Math.max(az, bz), m, solid); }
// 動かない箱は材質ごとに一つのメッシュへまとめる（描画の呼び出しを減らす）
function ks2Merge(list, parent) { const by = new Map(); for (const m of list) { if (!m.parent) continue; (by.get(m.material) || by.set(m.material, []).get(m.material)).push(m); }
  for (const [mat, L] of by) { if (L.length < 2) continue; let n = 0; const G = L.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0; for (const g of G) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); bg.computeBoundingSphere(); const mm = new THREE.Mesh(bg, mat); parent.add(mm); for (const m of L) { parent.remove(m); m.geometry.dispose(); } } }
function buildKs2() {
  KS2.stat = []; KS2.flags = [];
  const M = ks2Mats(); KS2.gates = {}; KS2.igates = {}; KS2.xbows = []; KS2.posts = []; KS2.look = [];
  const merl = [];   // 狭間（胸壁の凸）はまとめて一つのメッシュ
  for (const s of KS2_SIDES) {
    // 外の城壁：門の左右・門の上の楼閣
    ks2BoxR(s, -KS2_W - KS2_T, -KS2_GATE, KS2_W, KS2_W + KS2_T, 0, KS2_H, M.wall, true); ks2BoxR(s, KS2_GATE, KS2_W + KS2_T, KS2_W, KS2_W + KS2_T, 0, KS2_H, M.wall, true);
    ks2BoxR(s, -KS2_GATE, KS2_GATE, KS2_W, KS2_W + KS2_T, 5.2, KS2_H, M.wall, true);   // 門の上
    ks2BoxR(s, -6, 6, KS2_W - 0.5, KS2_W + KS2_T + 0.5, KS2_H, KS2_H + 3.2, M.wallD, false); ks2BoxR(s, -7, 7, KS2_W - 1, KS2_W + KS2_T + 1, KS2_H + 3.2, KS2_H + 3.7, M.roof, false);   // 門楼
    for (let u = -KS2_W; u <= KS2_W; u += 2.2) { if (Math.abs(u) < 7.5) continue; const [x, z] = ks2Rot(s, u, KS2_W + KS2_T - 0.25); merl.push([x, KS2_H + 0.45, z]); }
    // 外の門（扉）：硬い。破れるまで時間がかかる
    const leaf = ks2BoxR(s, -KS2_GATE, KS2_GATE, KS2_W + 1.0, KS2_W + 1.6, 0, 5.2, M.gate, false); KS2.stat.pop(); const [gx, gz] = ks2Rot(s, 0, KS2_W + 1.3);
    const bx = { x0: Math.min(...[ks2Rot(s, -KS2_GATE, KS2_W + 1)[0], ks2Rot(s, KS2_GATE, KS2_W + 1.6)[0]]), x1: Math.max(...[ks2Rot(s, -KS2_GATE, KS2_W + 1)[0], ks2Rot(s, KS2_GATE, KS2_W + 1.6)[0]]), z0: Math.min(ks2Rot(s, -KS2_GATE, KS2_W + 1)[1], ks2Rot(s, KS2_GATE, KS2_W + 1.6)[1]), z1: Math.max(ks2Rot(s, -KS2_GATE, KS2_W + 1)[1], ks2Rot(s, KS2_GATE, KS2_W + 1.6)[1]), y0: 0, y1: 5.2 };
    boxes.push(bx); const bands = []; for (const k of [-1.2, 0, 1.2]) { bands.push(ks2BoxR(s, -KS2_GATE, KS2_GATE, KS2_W + 1.65, KS2_W + 1.75, 1 + (k + 1.2) * 1.5, 1.25 + (k + 1.2) * 1.5, M.iron, false)); KS2.stat.pop(); }
    KS2.gates[s] = { s, leaf, bands, box: bx, hp: s === 'N' ? 1e9 : s === 'S' ? 900 : 1100, hp0: s === 'S' ? 900 : 1100, open: false, x: gx, z: gz };
    // 内の城壁（回廊つき）と第二の門（狭い）
    ks2BoxR(s, -KS2_IW - 1.5, -KS2_IG, KS2_IW, KS2_IW + 1.5, 0, KS2_IH, M.wallD, true); ks2BoxR(s, KS2_IG, KS2_IW + 1.5, KS2_IW, KS2_IW + 1.5, 0, KS2_IH, M.wallD, true); ks2BoxR(s, -KS2_IG, KS2_IG, KS2_IW, KS2_IW + 1.5, 4, KS2_IH, M.wallD, true);
    ks2BoxR(s, -KS2_IW - 1.5, KS2_IW + 1.5, KS2_IW - 0.4, KS2_IW + 1.9, KS2_IH + 2.4, KS2_IH + 2.7, M.roof, false);   // 回廊の屋根
    for (const u of [-30, -18, 18, 30]) ks2BoxR(s, u - 0.15, u + 0.15, KS2_IW + 1.4, KS2_IW + 1.7, KS2_IH, KS2_IH + 2.4, M.wood, false);
    const il = ks2BoxR(s, -KS2_IG, KS2_IG, KS2_IW + 0.5, KS2_IW + 1.0, 0, 4, M.gate, false); KS2.stat.pop(); const [ix0, iz0] = ks2Rot(s, -KS2_IG, KS2_IW + 0.5), [ix1, iz1] = ks2Rot(s, KS2_IG, KS2_IW + 1.0);
    const ib = { x0: Math.min(ix0, ix1), x1: Math.max(ix0, ix1), z0: Math.min(iz0, iz1), z1: Math.max(iz0, iz1), y0: 0, y1: 4 }; boxes.push(ib); const [igx, igz] = ks2Rot(s, 0, KS2_IW + 0.75);
    KS2.igates[s] = { s, leaf: il, box: ib, hp: 420, hp0: 420, open: false, x: igx, z: igz };
    // 中庭の建物（屋根の上から射る）。門から内の門への道はあける
    for (const [u0, u1] of [[-34, -16], [16, 34]]) { ks2BoxR(s, u0, u1, 50, 60, 0, 5, M.wall, true); ks2BoxR(s, u0 - 0.6, u1 + 0.6, 49.4, 60.6, 5, 5.35, M.roof, false); }
    // 門の前の土塁と柵（番所）。中央は門への道
    for (const sg of [-1, 1]) { ks2BoxR(s, sg > 0 ? 4 : -17, sg > 0 ? 17 : -4, 88, 90.5, 0, 1.3, M.earth, true); for (let u = 4.5; u < 17; u += 1.6) { const [x, z] = ks2Rot(s, sg * u, 91); ks2Box(x - 0.08, x + 0.08, 0, 2.1, z - 0.08, z + 0.08, M.woodD, false); } }
    KS2.posts.push({ s, kind: 'earth', u: 0, v: 89.2 });
    // 連弩台：門の左右の城壁の上
    for (const u of [-14, 14]) { const [x, z] = ks2Rot(s, u, KS2_W + 1.2); const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.0), M.wood); b.position.y = 0.9; g.add(b); const a = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.12), M.woodD); a.position.set(0, 1.25, 0.3); g.add(a);
      g.position.set(x, KS2_H, z); g.rotation.y = s === 'S' ? 0 : s === 'N' ? Math.PI : s === 'E' ? Math.PI / 2 : -Math.PI / 2; stageRoot.add(g); KS2.xbows.push({ s, u, x, z, g, crew: [], t: rand(1, 4), burst: 0, dead: false }); }
  }
  // 角の小さな中庭：隣の中庭との間は細い通路（幅3m）だけ。北東の角に医務班が閉じこめられている
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const ax = sx * KS2_IW, bx2 = sx * KS2_W;
    // z 方向の仕切り（x 方向に伸びる壁）：隣の東西の中庭と
    const zw = sz * (KS2_IW + 1.5); ks2Box(Math.min(ax, bx2), Math.max(ax, bx2), 0, 6, zw - 0.6, zw + 0.6, M.wallD, false);
    const xs = [Math.min(ax, bx2), Math.max(ax, bx2)], gp = [sx * 59.5, sx * 62.5].sort((a, b) => a - b);
    boxes.push({ x0: xs[0], x1: gp[0], z0: zw - 0.6, z1: zw + 0.6, y0: 0, y1: 6 }, { x0: gp[1], x1: xs[1], z0: zw - 0.6, z1: zw + 0.6, y0: 0, y1: 6 });
    ks2Box(gp[0], gp[1], 2.6, 6, zw - 0.62, zw + 0.62, M.wall, false);   // 通路の上の梁（見た目）
    // x 方向の仕切り（z 方向に伸びる壁）：南北の中庭と
    const xw = sx * (KS2_IW + 1.5), zs = [Math.min(sz * KS2_IW, sz * KS2_W), Math.max(sz * KS2_IW, sz * KS2_W)], gq = [sz * 59.5, sz * 62.5].sort((a, b) => a - b);
    ks2Box(xw - 0.6, xw + 0.6, 0, 6, zs[0], zs[1], M.wallD, false); boxes.push({ x0: xw - 0.6, x1: xw + 0.6, z0: zs[0], z1: gq[0], y0: 0, y1: 6 }, { x0: xw - 0.6, x1: xw + 0.6, z0: gq[1], z1: zs[1], y0: 0, y1: 6 });
    // 角の中庭の小屋
    const cx = sx * 54, cz = sz * 54; ks2Box(cx - 5, cx + 5, 0, 4, cz - 4, cz + 4, M.wall, true); ks2Box(cx - 5.4, cx + 5.4, 4, 4.3, cz - 4.4, cz + 4.4, M.roof, false);
    // 角の楼
    { const a = [sx * KS2_W, sx * (KS2_W + KS2_T)].sort((p, q) => p - q), b = [sz * KS2_W, sz * (KS2_W + KS2_T)].sort((p, q) => p - q); ks2Box(a[0] - 0.5, a[1] + 0.5, KS2_H, KS2_H + 3, b[0] - 0.5, b[1] + 0.5, M.wallD, false); }
  }
  KS2.medAt = [53, -45];   // 北東の角の中庭（小屋の南の陰）
  // 本丸：中央。南に戸口、屋根の上にも射手
  ks2Box(-11, 11, 0, 11, -11, 11, M.wall, true); ks2Box(-12.5, 12.5, 11, 11.6, -12.5, 12.5, M.roof, false); ks2Box(-8, 8, 11.6, 14.5, -8, 8, M.wallD, false); ks2Box(-9.5, 9.5, 14.5, 15.0, -9.5, 9.5, M.roof, false);
  ks2Box(-1.6, 1.6, 0, 3.4, 11, 11.15, M.gate, false); KS2.keepAt = [0, 14];
  // 旗（反乱軍：英国旗の色） 
  for (const s of KS2_SIDES) { const [x, z] = ks2Rot(s, 0, KS2_W + 1.5); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 5), M.woodD); pole.position.set(x, KS2_H + 6, z); stageRoot.add(pole); const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshLambertMaterial({ color: 0x1f3a80, side: THREE.DoubleSide })); f.position.set(x + 1.1, KS2_H + 7.8, z); stageRoot.add(f); }
  { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.9, 0.5), M.wall, merl.length), q = new THREE.Object3D(); merl.forEach((m, i) => { q.position.set(m[0], m[1], m[2]); q.rotation.y = Math.abs(m[0]) > Math.abs(m[2]) ? Math.PI / 2 : 0; q.updateMatrix(); im.setMatrixAt(i, q.matrix); }); stageRoot.add(im); }
  // 物見櫓：城の外。進軍してくる者を見張って射る
  for (const [x, z] of [[-42, 152], [44, 148], [150, 34], [-150, -30], [30, -150]]) { for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) ks2Box(x + dx - 0.15, x + dx + 0.15, 0, 6, z + dz - 0.15, z + dz + 0.15, M.woodD, false); ks2Box(x - 1.8, x + 1.8, 5.8, 6.0, z - 1.8, z + 1.8, M.wood, false); ks2Box(x - 1.9, x + 1.9, 8.2, 8.4, z - 1.9, z + 1.9, M.roof, false); KS2.look.push({ x, z, y: 6 }); }
  // 本隊の小高い丘（三段のゆるい段）・後方の天幕と荷車
  for (const [r, y] of [[17, 0.25], [12.5, 0.5], [8, 0.75]]) { ks2Box(-r, r, 0, y, 150 - r, 150 + r, M.grass, false); floors.push({ x0: -r, x1: r, z0: 150 - r, z1: 150 + r, y }); }
  { const t = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.2, 4), M.cloth); t.position.set(10, 1.6, 176); t.rotation.y = Math.PI / 4; stageRoot.add(t); const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.05), new THREE.MeshLambertMaterial({ color: 0xffffff })); c.position.set(10, 2.2, 173.1); stageRoot.add(c); KS2.tent = [10, 172];
    for (let i = 0; i < 4; i++) { ks2Box(-14 + i * 3.2, -12 + i * 3.2, 0.5, 1.4, 178, 180.5, M.wood, false); } }
  // 破城槌（屋根つき）と攻城塔
  { const g = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 6), M.woodD); b.position.y = 1.4; g.add(b); const r = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 6.4), M.wood); r.position.y = 2.6; g.add(r); const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.8, 8), M.wood); log.rotation.x = Math.PI / 2; log.position.y = 1.2; g.add(log); g.position.set(0, 0, 116); stageRoot.add(g); KS2.ram = { g, log, z: 116, hitT: 3, pushers: [] }; }
  { const g = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(4, 11, 4), M.wood); b.position.y = 5.5; g.add(b); const h = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), M.woodD); h.position.y = 11.1; g.add(h); const br = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 2.6), M.woodD); br.position.set(0, KS2_H + 0.1, -3.2); g.add(br); br.visible = false; g.position.set(16, 0, 118); stageRoot.add(g); KS2.tower = { g, br, z: 118, pushers: [] }; }
  // 東の梯子（掛けるまでは寝かせて置く）
  KS2.ladders = [-22, 14, 26].map(u => { const [x, z] = ks2Rot('E', u, KS2_W + KS2_T + 1.4); const g = new THREE.Group(); for (const sx of [-0.35, 0.35]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 10, 0.08), M.wood); r.position.set(sx, 5, 0); g.add(r); } for (let y = 0.4; y < 10; y += 0.45) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), M.wood); r.position.set(0, y, 0); g.add(r); } ks2Merge(g.children.slice(), g); g.position.set(x + 30, 0.1, z); g.rotation.set(0, Math.PI / 2, Math.PI / 2); stageRoot.add(g); return { u, x, z, g, up: false, q: [] }; });
  // 北の陽動：旗をたくさん
  for (let i = 0; i < 14; i++) { const x = -40 + i * 6, z = -128 - (i % 3) * 3; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 4), M.woodD); pole.position.set(x, 2, z); stageRoot.add(pole); const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xb8282a, side: THREE.DoubleSide })); f.position.set(x + 0.6, 3.5, z); stageRoot.add(f); (KS2.flags = KS2.flags || []).push(f); }
  ks2Merge(KS2.stat, stageRoot); KS2.stat = null;
}
function ks2Look() { scene.fog.near = 120; scene.fog.far = 720; scene.background.setHex(0xb9cbd8); sun.intensity = 1.05; ambL.intensity = 0.85; }
function ks2GY(x, z) { const d = Math.max(Math.abs(x), Math.abs(z - 150)); return d < 8 ? 0.75 : d < 12.5 ? 0.5 : d < 17 ? 0.25 : 0; }
// ---- 群れ（遠くの兵・人数の多くは簡単な絵）：InstancedMesh のビルボード。倒れた絵は寝かせたまま残す ----
function ks2PxGroup(gid, cap) { const g = GIRLS[gid]; if (!g || !g.front || !g.front.tex) return null; const t = g.front.tex, im0 = t.image, asp = im0 && im0.width ? im0.width / im0.height : 0.4;
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0); const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.45, depthWrite: true, side: THREE.DoubleSide, fog: true });
  const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.frustumCulled = false; stageRoot.add(im); return { im, asp, list: [], h: ((EXTRA_GIRLS[gid] && EXTRA_GIRLS[gid].prof && EXTRA_GIRLS[gid].prof.cm) || 160) / 100 }; }
function ks2PxAdd(gid, o) { const G = KS2.pxg[gid] || (KS2.pxg[gid] = ks2PxGroup(gid, 1400)); if (!G || G.list.length >= 1400) return null; o.G = G; o.i = G.list.length; G.list.push(o); G.im.count = G.list.length; o.alive = true; KS2.px.push(o); return o; }
const KS2_Q = new THREE.Object3D(); let KS2_C1 = null, KS2_C2 = null;
function ks2PxDraw() { const cy = camera.rotation.y, cam = camera.position; KS2.pxT = (KS2.pxT || 0) + 1; const every = LITE ? 2 : 1; if (KS2.pxT % every) return;
  for (const k in KS2.pxg) { const G = KS2.pxg[k]; if (!G) continue; const w = G.h * G.asp * 1.0;
    for (const o of G.list) { if (!o.alive) { if (o.laid) continue; o.laid = true; KS2_Q.position.set(o.x, o.y + 0.04, o.z); KS2_Q.rotation.set(-Math.PI / 2, 0, o.ry || 0, 'YXZ'); KS2_Q.rotation.set(-Math.PI / 2, 0, 0); KS2_Q.rotateZ(o.ry || 0); KS2_Q.scale.set(w, G.h, 1); KS2_Q.updateMatrix(); G.im.setMatrixAt(o.i, KS2_Q.matrix); continue; }
      const a = Math.atan2(cam.x - o.x, cam.z - o.z); KS2_Q.position.set(o.x, o.y, o.z); KS2_Q.rotation.set(0, a, 0); KS2_Q.scale.set(w, G.h, 1); KS2_Q.updateMatrix(); G.im.setMatrixAt(o.i, KS2_Q.matrix); }
    G.im.instanceMatrix.needsUpdate = true; } }
function ks2PxKill(o) { if (!o || !o.alive) return; o.alive = false; o.laid = false; o.ry = rand(0, Math.PI * 2); if (o.team === 'blue') KS2.pxLostA++; else KS2.pxLostD++; }
// ---- 人：攻め手の隊と守り手 ----
function ks2Mk(x, z, kind, team, gid, prof, y) { const e = spawnEnemy(x, z, kind, false, team, { girl: gid && GIRLS[gid] ? gid : undefined, yari: -1, set: { special: true } }); if (!e) return null;
  if (prof) Object.assign(e.prof, prof); if (gid && EXTRA_GIRLS[gid] && EXTRA_GIRLS[gid].prof) e.figH = (prof && prof.cm || EXTRA_GIRLS[gid].prof.cm) / 100; else if (prof && prof.cm) e.figH = prof.cm / 100;
  e.ks2 = true; e.passive = true; e.sq = null; e.state = 'idle'; if (e.mk) e.mk.visible = false; e.shadow.visible = false; e.hp = e.hpMax = 3; e.dmg = 8; e.ks2Y = y || 0; e.baseY = e.ks2Y; e.s.position.y = e.ks2Y; e.ks2T = rand(0, 1); e.ks2Cd = rand(1, 5); e.ks2V = [0, 0]; e.speed = rand(2.2, 2.6); return e; }
const KS2_KINGDOM_OFF = () => new Set([SEC_ID, SEC2_ID, FUMI_ID, OJOU_ID, SYSOP_ID, FLUTE_ID, 'omiya', 'sec3', 'sec4', 'sec5', 'sec6', 'sec7', 'girl26', 'girl31', 'girl34', 'girl37', 'girl45', MEDIC_ID, 'surgeon']);
function ks2KLook() { const off = KS2_KINGDOM_OFF(); const L = (KS2.kLooks = KS2.kLooks || Object.keys(GIRLS).filter(k => /^(mob\d+|girl\d+)$/.test(k) && !off.has(k) && GIRLS[k].front)); return L[(Math.random() * L.length) | 0]; }
function ks2Spawn() {
  KS2.units = []; KS2.def = []; KS2.by = {}; KS2.px = []; KS2.pxg = {}; KS2.pxLostA = 0; KS2.pxLostD = 0; KS2.all = [];
  const totA = KS2_UNITS.reduce((a, U) => a + U.n, 0), fa = KS2_REAL.a / totA;
  for (const D of KS2_UNITS) { const U = Object.assign({}, D, { mem: [], px: [], ax: 0, az: 0, vx: 0, vz: 0, hd: Math.PI, hist: [], ht: 0, pi: 0, go: false, at: false, lost: 0 });
    const [ox, oz] = D.off; U.ax = ox; U.az = 236 + oz; U.hist.push([U.ax, U.az, U.hd]); KS2.units.push(U); KS2.U = KS2.U || {}; KS2.U[D.k] = U;
    const nReal = Math.max(8, Math.round(D.n * fa)); let i = 0;
    const mk = (k, role) => { const gid = ks2Gid(k), N = KS2_NM[k]; const e = ks2Mk(U.ax, U.az + 2, 'mob', 'blue', gid, Object.assign({ name: N[0], pers: N[1], vv: 1 }, N[2] ? { cm: N[2] } : {})); if (!e) return null; e.ks2U = U; e.ks2Role = role; e.ks2Named = k; e.ks2Title = KS2_TITLE[k]; e.ukTag = KS2_TITLE[k]; e.ks2Vk = KS2_VK[k]; e.campKey = ({ sumi: 'sumi', sec2: 'sec2', fumi: 'fumi', ojou: 'ojou', omiya: 'omiya', reika: 'reika', shizuka: 'shizuka', sysop: 'sysop' })[k] || null; if (k === 'uk06') { e.ukId = 'uk06'; e.campKey = null; } e.hp = e.hpMax = 10; KS2.by[k] = e; U.mem.push(e); e.ks2Slot = i++; return e; };
    for (const k of D.chain) mk(k, 'lead'); for (const k of D.secs) mk(k, 'sec');
    const guardsN = D.k === 'H' ? 10 : 3, n0 = U.mem.length;
    for (let j = n0; j < nReal; j++) { const arch = j % 10 < 3, ukm = D.uk && j < Math.round(nReal * D.uk / D.n) + n0, mixm = D.mix && !ukm && Math.random() < 0.15;
      let gid = ukm ? 'uk' + String(1 + (j % 10)).padStart(2, '0') : mixm ? D.mix + String(1 + (j % 9)).padStart(2, '0') : null; if (gid === 'uk06' || gid === 'us08' || (gid && !GIRLS[gid])) gid = ukm ? 'uk07' : null;
      const kind = arch && !ukm ? 'archer' : 'mob', e = ks2Mk(U.ax + rand(-6, 6), U.az + rand(0, 12), kind, 'blue', gid || (kind === 'mob' ? ks2KLook() : undefined), null); if (!e) continue;
      e.ks2U = U; e.ks2Slot = i++; e.ks2Role = j - n0 < guardsN ? 'guard' : arch ? (ukm ? 'musket' : 'archer') : 'melee'; if (ukm) { e.ukId = gid; e.ks2Uk = true; } U.mem.push(e); }
    // 群れ：残りの人数
    const pn = D.n - U.mem.length; for (let j = 0; j < pn; j++) { const ukm = D.uk && j < D.uk * 0.6, gid = ukm ? 'uk0' + (1 + (j % 5)) : ks2KLook(); const o = ks2PxAdd(gid, { team: 'blue', U, slot: U.mem.length + j, x: U.ax, z: U.az + 10, y: 0, arch: j % 10 < 3 }); if (o) U.px.push(o); }
    U.cmd = U.mem[0]; }
  // 守り手：英国の銃兵（城壁）と中国の現地兵（弓・連弩・番所・物見）
  const fd = KS2_REAL.d / 1000; let cnI = 0, ukI = 0;
  const cnId = () => KS2_CN_LOOKS[(cnI++) % KS2_CN_LOOKS.length], cnProf = () => ({ name: '現地兵 ' + KS2_CN_NAMES[cnI % KS2_CN_NAMES.length], pers: ['慎重', '冷静', '臆病', '好戦的'][cnI % 4], cm: 154 + (cnI * 7) % 14 });
  const ukId = () => { let k; do { k = 'uk' + String(1 + (ukI++ % 10)).padStart(2, '0'); } while (k === 'uk06' || k === 'uk10'); return k; };
  const D = (x, z, y, role, uk, side, extra) => { const gid = extra && extra.ks2G0 && GIRLS[extra.ks2G0] ? extra.ks2G0 : uk ? ukId() : cnId(), e = ks2Mk(x, z, 'mob', 'orange', gid, uk ? null : cnProf(), y); if (!e) return null; e.ks2Role = role; e.ks2Side = side; e.ks2Home = [x, z, y]; e.face = e.faceWant = Math.atan2(x, z); if (uk) { e.ukId = gid; e.ks2Uk = true; } else e.ks2Cn = true; if (extra) Object.assign(e, extra); KS2.def.push(e); return e; };
  const DP = (n, f, team) => { for (let i = 0; i < n; i++) { const q = f(i), uk = q[4], o = ks2PxAdd(uk ? 'uk0' + (2 + (i % 4)) : KS2_CN_LOOKS[i % KS2_CN_LOOKS.length], { team: 'orange', x: q[0], z: q[1], y: q[2], side: q[3], hx: q[0], hz: q[1], hy: q[2], role: q[5] }); } };
  const plan = { wall: { S: 170, E: 140, W: 140, N: 110 }, gal: 25, res: 50, keep: 63, earth: 12, look: 3 };
  for (const s of KS2_SIDES) {
    const nW = plan.wall[s], rW = Math.max(4, Math.round(nW * fd)), uk = s === 'W' ? 0.65 : 0.4;
    for (let i = 0; i < rW; i++) { const u = -60 + 120 * (i + 0.5) / rW + rand(-1, 1), [x, z] = ks2Rot(s, Math.abs(u) < 5 ? u + 7 * Math.sign(u || 1) : u, KS2_W + 1.6); D(x, z, KS2_H, Math.random() < uk ? 'rifle' : 'bow', i % 5 < uk * 5, s); }
    DP(nW - rW, i => { const u = -66 + 132 * ((i * 0.618) % 1), [x, z] = ks2Rot(s, Math.abs(u) < 5 ? u + 7 : u, KS2_W + 1.8 + (i % 2) * 0.5); return [x, z, KS2_H, s, i % 5 < uk * 5, 'wall']; });
    for (const X of KS2.xbows.filter(X => X.s === s)) for (let k = 0; k < (LITE ? 1 : 2); k++) { const [x, z] = ks2Rot(s, X.u + (k ? 1.2 : -1.2), KS2_W + 0.6); const e = D(x, z, KS2_H, 'xbow', false, s, { ks2X: X }); if (e) X.crew.push(e); }
    const rG = Math.max(1, Math.round(plan.gal * fd)); for (let i = 0; i < rG; i++) { const u = -30 + 60 * (i + 0.5) / rG, [x, z] = ks2Rot(s, Math.abs(u) < 3 ? 5 : u, KS2_IW + 0.8); D(x, z, KS2_IH, 'bow', false, s); }
    DP(plan.gal - rG, i => { const u = -34 + 68 * ((i * 0.618) % 1), [x, z] = ks2Rot(s, Math.abs(u) < 3 ? 5 : u, KS2_IW + 0.9); return [x, z, KS2_IH, s, false, 'gal']; });
    // 屋根の射手（中庭の建物）
    for (const u of [-25, 25]) { const [x, z] = ks2Rot(s, u, 55); D(x, z, 5.35, 'bow', false, s); }
    const rR = Math.max(3, Math.round(plan.res * fd)); for (let i = 0; i < rR; i++) { const [x, z] = ks2Rot(s, rand(-12, 12), rand(42, 47)); D(x, z, 0, 'res', i % 3 === 0, s); }
    DP(plan.res - rR, i => { const [x, z] = ks2Rot(s, rand(-14, 14), rand(40, 48)); return [x, z, 0, s, i % 3 === 0, 'res']; });
    const rE = Math.max(3, Math.round(plan.earth * fd * 2)); for (let i = 0; i < rE; i++) { const [x, z] = ks2Rot(s, (i % 2 ? 1 : -1) * rand(5, 15), 87.5); D(x, z, 0, i % 3 ? 'post' : 'bow', false, s); }
  }
  for (const L of KS2.look) for (let i = 0; i < (LITE ? 1 : plan.look); i++) D(L.x + rand(-0.8, 0.8), L.z + rand(-0.8, 0.8), L.y, 'look', false, ks2Side(L.x, L.z));
  const rK = Math.max(6, Math.round(plan.keep * fd * 1.6)); for (let i = 0; i < rK; i++) { const a = (i / rK) * Math.PI * 2, e = D(Math.sin(a) * 16, Math.cos(a) * 16 + 2, 0, 'keep', i % 2 === 0, ks2Side(Math.sin(a), Math.cos(a))); if (e) { e.hp = e.hpMax = 6; } }
  DP(plan.keep - rK, i => { const a = rand(0, Math.PI * 2); return [Math.sin(a) * rand(17, 26), Math.cos(a) * rand(17, 26), 0, ks2Side(Math.sin(a), Math.cos(a)), i % 2 === 0, 'keep']; });
  for (const u of [-6, 6]) for (const s of KS2_SIDES) { const [x, z] = ks2Rot(s, u, 11); D(x, z, 11.6, 'bow', false, s); }   // 本丸の屋根
  { const e = D(0, 13, 0, 'cmd', true, 'S', { ks2G0: 'uk00' }); if (e) { e.ukId = 'uk00'; Object.assign(e.prof, { name: 'アラベラ王女', pers: '冷静', cm: 165 }); e.figH = 1.65; e.ks2Title = '反乱軍を率いる アラベラ王女'; e.ukTag = e.ks2Title; e.hp = e.hpMax = 99; KS2.cmd = e; } }   // 倒れない（damageEnemy で守る）
  // 医務班：北東の角の中庭に閉じこめられている（味方）。見張りが数人
  KS2.med = []; for (let i = 0; i < 6; i++) { const gid = i === 0 && GIRLS.nurse2 ? 'nurse2' : MEDIC_ID; const e = ks2Mk(KS2.medAt[0] - 2 + (i % 3) * 1.2, KS2.medAt[1] - 1 + Math.floor(i / 3) * 1.2, 'mob', 'blue', gid, { name: i ? '医務班の侍女' : '医務班 班長', pers: '慎重' }, 0); if (e) { e.ks2Role = 'trapped'; e.ks2Med = true; e.passive = true; KS2.med.push(e); } }
  for (let i = 0; i < 5; i++) D(KS2.medAt[0] + rand(-5, 5), KS2.medAt[1] + rand(4, 8), 0, 'medguard', false, 'E');
  { const need = 1000 - KS2.def.length - KS2.px.filter(o => o.team === 'orange').length; if (need > 0) DP(need, i => { const s = KS2_SIDES[i % 4], [x, z] = ks2Rot(s, rand(-15, 15), rand(39, 48)); return [x, z, 0, s, i % 3 === 0, 'res']; }); }   // 守り手の合計を 1000 に（残りは中庭の予備）
  KS2.defTotal = 1000; KS2.defReal0 = KS2.def.length; KS2.atkReal0 = KS2.units.reduce((a, U) => a + U.mem.length, 0);
  for (const e of enemies) if (e.ks2) KS2.all.push(e);
}
function ks2Counts() { const A = {}; let a = 0; for (const U of KS2.units) { const n = U.mem.filter(isUp).length + U.px.filter(o => o.alive).length; A[U.k] = n; a += n; } const d = KS2.def.filter(isUp).length + KS2.px.filter(o => o.team === 'orange' && o.alive).length; return { A, a, d }; }
// ---- 近い者を探す（4m の格子・高さも見る） ----
function ks2Grid() { const G = KS2.grid || (KS2.grid = new Map()); for (const a of G.values()) a.length = 0; KS2.live = { blue: [], orange: [] };
  for (const e of KS2.all) { if (!isUp(e) || e.ks2Gave || e.ks2Med) continue; KS2.live[e.team].push(e); const k = (Math.floor(e.s.position.x / 4) + 500) * 2000 + Math.floor(e.s.position.z / 4) + 500; let a = G.get(k); if (!a) G.set(k, a = []); a.push(e); } }
function ks2Near(e, R, dy, pred) { const p = e.s.position, cx = Math.floor(p.x / 4), cz = Math.floor(p.z / 4), r = Math.ceil(R / 4); let best = null, bd = R;
  for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) { const a = KS2.grid.get((ix + 500) * 2000 + iz + 500); if (!a) continue;
    for (const o of a) { if (o === e || o.team === e.team || Math.abs(o.s.position.y - p.y) > dy) continue; if (pred && !pred(o)) continue; const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z); if (d < bd) { bd = d; best = o; } } }
  return best; }
function ks2Walk(e, tx, tz, sp, dt) { const p = e.s.position, V = e.ks2V, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (e.ks2Go == null) e.ks2Go = false; if (d > (e.ks2Go ? 0.4 : 1.1)) e.ks2Go = true; else if (d < 0.4) e.ks2Go = false;
  const k = e.ks2Sp > 0 ? 0.4 : 1, ws = e.ks2Go ? sp * k * Math.min(1, d / 2) : 0, wx = e.ks2Go ? dx / d * ws : 0, wz = e.ks2Go ? dz / d * ws : 0, ak = Math.min(1, dt * (e.ks2Go ? 2 : 3.5));
  V[0] += (wx - V[0]) * ak; V[1] += (wz - V[1]) * ak; const vv = Math.hypot(V[0], V[1]);
  if (vv > 0.05) { p.x += V[0] * dt; p.z += V[1] * dt; e.moving = vv > 0.3; e.faceWant = Math.atan2(V[0], V[1]); } else e.moving = false; e.state = 'idle';
  if (e.ks2Y < 0.5 && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 30) { const q = { x: p.x, z: p.z }; pushOutBoxes(q, 0.3, e.ks2Y + 0.15, e.ks2Y + 1.6); p.x = q.x; p.z = q.z; }
  return d < 0.6; }
// ---- 撃つ：弓・マスケット・ライフル・連弩。見える範囲だけ矢と煙を描く ----
const KS2_TRN = 120;
function ks2TrIM() { if (KS2.trIM && KS2.trIM.parent) return KS2.trIM; const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), KS2_TRN); im.count = 0; im.frustumCulled = false; stageRoot.add(im); return KS2.trIM = im; }   // 矢と弾の筋はまとめて一つ
function ks2Tracer(a, b, col, T) { if (KS2.tr.length >= (LITE ? 40 : KS2_TRN)) return; KS2.tr.push({ a, b, t: 0, T, c: col }); }
function ks2Shoot(e, t, kind) { const p = e.s.position, tp = t.isPlayer ? player.pos : t.s.position, d = Math.hypot(tp.x - p.x, tp.z - p.z), dP = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
  e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z); e.lungeT = 0.2;
  const gun = kind === 'musket' || kind === 'rifle', a = new V3(p.x, p.y + 1.35, p.z), b = new V3(tp.x + rand(-0.6, 0.6), (t.isPlayer ? tp.y - 0.4 : tp.y + 1.1), tp.z + rand(-0.6, 0.6));
  if (dP < 70) { if (gun) { if (KS2.fx > 0) { KS2.fx -= 2; puff(a.clone(), 0xe9e6de, 2, 0.45, 1.0, 1.2); uk2Flash(a, 1, 0.07); } ks2Tracer(a, b, 2, 0.12); const o = Sfx.at(p, 140, 1.1); if (o) Sfx.noiseBurst(0.22, 'lowpass', 2200, 300, 0.55, 1, 0, o); }
    else { ks2Tracer(a, b, 1, Math.min(1.2, 0.25 + d / 45)); if (dP < 30) { const o = Sfx.at(p, 40, 0.6); if (o) Sfx.noiseBurst(0.08, 'bandpass', 1400, 900, 0.18, 3, 0, o); } } }
  const hc = (kind === 'xbow' ? 0.11 : gun ? 0.13 : 0.15) * (t.ks2Climb ? 1.3 : 1) * (d > 35 ? 0.35 : d > 25 ? 0.7 : 1) * (t.ks2Named ? 0.3 : 1) * (t.ks2Push === 'ram' ? 0.3 : 1) * (!t.isPlayer && t.team === 'blue' && !t.ks2Climb && t.ks2Y < 1 && ks2Cover(t) ? 0.35 : 1);
  const lag = gun ? 0.1 : Math.min(1.2, 0.25 + d / 45);
  if (Math.random() < hc) KS2.later.push([KS2.t + lag, () => { if (t.isPlayer) { if (!player.god && state === 'play') { hurtPlayer(kind === 'xbow' ? 4 : 6); popup(gun ? '銃弾がかすめた！' : '矢がかすめた！'); } } else if (isUp(t)) { if (t.ks2Climb) { t.ks2Fall = { t: 0, y0: t.ks2Y }; t.ks2Climb = null; npcSay(t, 'hit', 1); } else damageEnemy(t, 1, p, false, null, null); } }]); }
// ---- 攻め手の頭脳 ----
function ks2Cover(t) { const p = t.s.position, m = Math.max(Math.abs(p.x), Math.abs(p.z)); if (m < 90.5 || m > 95) return false; const s = ks2Side(p.x, p.z), u = s === 'S' ? p.x : s === 'N' ? -p.x : s === 'E' ? -p.z : p.z; return Math.abs(u) > 4 && Math.abs(u) < 17; }   // 土塁の陰
function ks2Slot(e) { const U = e.ks2U, i = e.ks2Slot || 0, cols = U.k === 'H' ? 10 : 14, c = i % cols, r = Math.floor(i / cols), lat = (c - (cols - 1) / 2) * 1.5, dep = r * 1.6 + 2;
  const dd = U.cmd ? Math.hypot(e.s.position.x - U.cmd.s.position.x, e.s.position.z - U.cmd.s.position.z) : 0, lag = Math.min(U.hist.length - 1, Math.round((0.3 + dd / 9 + ((e.id || 0) % 5) * 0.1) / 0.25)), A = U.hist[Math.max(0, lag)] || [U.ax, U.az, U.hd];   // 伝令・太鼓の届く遅れ
  const fx = Math.sin(A[2]), fz = Math.cos(A[2]); return [A[0] + fz * lat - fx * dep, A[1] - fx * lat - fz * dep]; }   // 隊長の後ろに並ぶ
function ks2Atk(e, dt, dP) { const U = e.ks2U, p = e.s.position, far = dP > 45;
  if ((e.ks2T -= dt) <= 0) { e.ks2T = far ? rand(1, 1.7) : rand(0.35, 0.7); e.tgt = ks2Near(e, e.ks2Role === 'archer' || e.ks2Role === 'musket' ? 48 : 9, e.ks2Role === 'archer' || e.ks2Role === 'musket' ? 14 : 1.5, o => !o.ks2Gave && o.ks2Role !== 'cmd');
    if (!far) { const m = KS2.grid && ks2NearMate(e); if (m) { const dx = p.x - m.s.position.x, dz = p.z - m.s.position.z, d = Math.hypot(dx, dz) || 0.01; p.x += dx / d * 0.15; p.z += dz / d * 0.15; } } }
  const ph = KS2.ph, t = e.tgt && isUp(e.tgt) ? e.tgt : null; e.cd -= dt;
  // 近衛：殿のまわり（殿が先へ走ると、近衛だけが追う）
  if (e.ks2Role === 'guard' && U.k === 'H') { const n = 10, a = ((e.ks2Slot || 0) % n + 0.5) / n * Math.PI * 2, tx = player.pos.x + Math.sin(a) * 2.4, tz = player.pos.z + Math.cos(a) * 2.6; ks2Walk(e, tx, tz, Math.hypot(tx - p.x, tz - p.z) > 5 ? e.speed * 1.5 : e.speed, dt); if (t && Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) < 1.2) ks2Hit(e, t); return; }
  // 担架：後方の担ぎ手
  if (e.ks2Bear) { ks2BearBrain(e, dt); return; }
  if (e.ks2Med) return;
  if (e.ks2Run) { const R = e.ks2Run; R.t += dt; const wp = R.wp && R.wp.length ? R.wp[0] : null, c = wp || (R.back ? [U.ax, U.az] : R.to && isUp(R.to) ? [R.to.s.position.x, R.to.s.position.z] : null); if (!c || R.t > 120) { e.ks2Run = null; return; }
    if (ks2Walk(e, c[0], c[1], e.speed * 1.8, dt)) { if (wp) R.wp.shift(); else if (R.back) e.ks2Run = null; else { R.back = true; R.wp = R.wp0 ? R.wp0.slice().reverse() : []; } } return; }
  const siege0 = ph === 'siege' || ph === 'keep' || ph === 'won';
  if (e !== U.cmd && U.cmd && isUp(U.cmd) && (e.ks2Role === 'lead' || e.ks2Role === 'sec' || (e.ks2Role === 'guard' && U.k !== 'H'))) { const c = U.cmd.s.position, k = e.ks2Slot || 0, fx = Math.sin(U.hd), fz = Math.cos(U.hd), lat = ((k % 4) - 1.5) * 1.5, dep = 1.6 + (k % 8 > 3 ? 1.2 : 0);
    if (t && Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) < 4 && Math.abs(t.s.position.y - p.y) < 1.5) { if (Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) > 1.1) ks2Walk(e, t.s.position.x, t.s.position.z, e.speed, dt); else ks2Hit(e, t); return; }
    ks2Walk(e, c.x + fz * lat - fx * dep, c.z - fx * lat - fz * dep, e.speed * 1.1, dt); if (!e.moving) e.faceWant = U.hd; return; }
  if (e === U.cmd && !(siege0 && U.side)) { ks2Walk(e, U.ax, U.az, e.speed, dt); if (!e.moving) e.faceWant = U.hd; return; }
  const siege = ph === 'siege' || ph === 'keep' || ph === 'won';
  let tx, tz;
  if (!siege || !U.side) { [tx, tz] = ks2Slot(e); if (t && ph !== 'won' && (e.ks2Role === 'archer' || e.ks2Role === 'musket') && (e.ks2Ld = (e.ks2Ld || rand(2, 6)) - dt) <= 0) { e.ks2Ld = e.ks2Role === 'musket' ? rand(9, 13) : rand(3, 5); ks2Shoot(e, t, e.ks2Role); return; }
    if (t && Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) < 6 && t.ks2Y < 1.5) { tx = t.s.position.x; tz = t.s.position.z; if (Math.hypot(tx - p.x, tz - p.z) < 1.1) { ks2Hit(e, t); return; } }
    ks2Walk(e, tx, tz, e.speed * (Math.hypot(tx - p.x, tz - p.z) > 8 ? 1.35 : 1), dt); return; }
  ks2Siege(e, dt, t, U); }
function ks2NearMate(e) { const p = e.s.position, a = KS2.grid.get((Math.floor(p.x / 4) + 500) * 2000 + Math.floor(p.z / 4) + 500); if (!a) return null; for (const o of a) if (o !== e && o.team === e.team && Math.abs(o.s.position.y - p.y) < 1 && Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < 0.6) return o; return null; }
function ks2Hit(e, t) { e.state = 'idle'; e.moving = false; e.faceWant = Math.atan2(t.s.position.x - e.s.position.x, t.s.position.z - e.s.position.z); if (e.ks2Sp > 0 || e.cd > 0) return; e.cd = rand(1.2, 2.1); e.lungeT = 0.25; if (Math.random() < 0.32) damageEnemy(t, 1, e.s.position, false, null, null);
  if (Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z) < 25 && (KS2.clank -= 1) <= 0) { KS2.clank = 2; const o = Sfx.at(e.s.position, 40, 1); if (o) Sfx.noiseBurst(0.06, 'bandpass', 3800, 2600, 0.25, 5, 0, o); } }
// 攻城：側ごとの動き（南＝破城槌と攻城塔、東＝梯子、西＝呼びかけとマスケット、北＝陽動）。門が開けば中へ
function ks2InPath(s) { const P = [[0, KS2_W + 8], [0, KS2_W - 6], [0, 52], [0, KS2_IW + 4], [0, KS2_IW - 4], [0, 22], [0, 15.5]]; return P.map(q => ks2Rot(s, q[0], q[1])); }
function ks2Siege(e, dt, t, U) { const p = e.s.position, s = U.side, G = KS2.gates[s], r = e.ks2Role, rng = r === 'archer' || r === 'musket';
  // 城壁の上：守り手と斬り合い、門のそばの階段から下りる
  if (e.ks2Y > 5) { if (t && Math.abs(t.s.position.y - p.y) < 1.5) { const d = Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z); if (d > 1.1) ks2Walk(e, t.s.position.x, t.s.position.z, e.speed, dt); else ks2Hit(e, t); return; }
    const [gx, gz] = ks2Rot(e.ks2Wall || s, 4.5, KS2_W + 1.5); if (ks2Walk(e, gx, gz, e.speed, dt)) { e.ks2Y = 0; KS2.inS[e.ks2Wall || s]++; const [ix, iz] = ks2Rot(e.ks2Wall || s, 4.5, KS2_W - 2); p.x = ix; p.z = iz; e.ks2In = 1; } return; }
  // 城内
  const inside = Math.max(Math.abs(p.x), Math.abs(p.z)) < KS2_W - 0.5;
  if ((G.open || inside) && !rng || e.ks2In) { e.ks2In = e.ks2In || 1; const ws = inside ? ks2Side(p.x, p.z) : s, P = ks2InPath(ws); let i = e.ks2Pi || 0; if (i >= P.length) i = P.length - 1;
    if (t && Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) < 7 && Math.abs(t.s.position.y - p.y) < 1.5) { const d = Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z); if (d > 1.1) ks2Walk(e, t.s.position.x, t.s.position.z, e.speed * 1.1, dt); else ks2Hit(e, t); return; }
    const IG = KS2.igates[ws]; if (i >= 4 && !IG.open) { const [x, z] = ks2Rot(ws, ((e.ks2Slot || 0) % 7 - 3) * 0.5, KS2_IW + 2.4); if (ks2Walk(e, x, z, e.speed, dt)) { e.faceWant = Math.atan2(-x, -z); if (e.cd <= 0) { e.cd = rand(1, 1.6); e.lungeT = 0.25; IG.hp -= 1; ks2GateThud(IG, 0.4); } } return; }
    // 医務班を助ける（東の中庭→北東の角）
    if (ws === 'E' && !KS2.rescued && (e.ks2Slot || 0) % 3 === 0 && i >= 2) { const Q = [[53, -20], [61, -37.5], [55, -45]]; let j = e.ks2Mq || 0; if (j < Q.length) { if (ks2Walk(e, Q[j][0], Q[j][1], e.speed, dt)) e.ks2Mq = j + 1; return; } }
    const tgt = i === P.length - 1 ? [P[i][0] + ((e.ks2Slot || 0) % 9 - 4) * 1.2, P[i][1]] : P[i]; if (ks2Walk(e, tgt[0] + (i ? ((e.ks2Slot || 0) % 5 - 2) * 0.7 : 0), tgt[1], e.speed * 1.05, dt) && i < P.length - 1) e.ks2Pi = i + 1; return; }
  // 外：弓・マスケットは射撃の列から、白兵は番所→門・梯子・攻城塔へ
  const vS = (U.k === 'W' ? 104 : 102), j = e.ks2Slot || 0;
  if (rng) { const [x, z] = ks2Rot(s, ((j % 24) - 11.5) * 1.6, vS + Math.floor((j % 48) / 24) * 1.8 + (G.open ? -20 : 0)); if (t && (e.ks2Ld = (e.ks2Ld == null ? rand(1, 5) : e.ks2Ld) - dt) <= 0) { e.ks2Ld = r === 'musket' ? rand(8, 12) : rand(2.6, 4.2); if (U.k === 'W' && !KS2.wFire) return; ks2Shoot(e, t, r); return; } ks2Walk(e, x, z, e.speed, dt); return; }
  if (e.ks2Lead) { const [x, z] = ks2Rot(s, 0, U.k === 'W' && KS2.wCall && KS2.wCall.ph < 2 ? 93 : vS - 3); ks2Walk(e, x, z, e.speed, dt); e.faceWant = Math.atan2(-x, -z); return; }   // 隊長：南は攻城塔と破城槌の見える中央のやや後ろ、東は梯子の後ろ（弓の列の前）、北は旗のそば
  if (t && Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) < 8 && t.ks2Y < 1.5) { const d = Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z); if (d > 1.1) ks2Walk(e, t.s.position.x, t.s.position.z, e.speed * 1.1, dt); else ks2Hit(e, t); return; }
  if (U.k === 'S') { const R = KS2.ram, T = KS2.tower;
    if (e.ks2Push === 'ram') { const k = R.pushers.indexOf(e), [x, z] = [(k % 2 ? 1.6 : -1.6), R.z + 2 + Math.floor(k / 2) * 1.2]; ks2Walk(e, x, z, e.speed * 1.2, dt); e.faceWant = Math.PI; return; }
    if (e.ks2Push === 'tower') { const k = T.pushers.indexOf(e), [x, z] = [16 + (k % 2 ? 1.4 : -1.4), T.z + 2.6 + Math.floor(k / 2) * 1.0]; ks2Walk(e, x, z, e.speed * 1.2, dt); e.faceWant = Math.PI; return; }
    if (T.at && !G.open && (j % 2 === 0) && KS2.wallS < 60) { if (ks2Walk(e, 16 + ((j % 3) - 1) * 0.8, KS2_W + KS2_T + 3.2, e.speed, dt)) { e.ks2Climb = { y0: 0, y1: KS2_H, t: 0, T: 4.5, x: 16, z: KS2_W + 1.2, wall: 'S' }; KS2.wallS = (KS2.wallS || 0) + 1; } return; } }
  if (U.k === 'E' && !G.open) { const L = KS2.ladders[j % 3]; if (L.up && KS2.wallE < 70) { const [bx, bz] = [L.x + 1.6 + (L.q.length % 3) * 0.6, L.z + ((j % 2) ? 0.5 : -0.5)]; if (ks2Walk(e, bx, bz, e.speed, dt)) { if (!L.busyT || KS2.t > L.busyT) { L.busyT = KS2.t + 1.6; e.ks2Climb = { y0: 0, y1: KS2_H, t: 0, T: 5.5, x: L.x - 2.9, z: L.z, wall: 'E', lx: L.x + 0.6 }; KS2.wallE = (KS2.wallE || 0) + 1; } } return; } }
  // 門の前で待つ（城壁の近くは上から撃たれる・ラーメンが落ちてくる）
  const wait = U.k === 'N' ? 100 : 91.5 + (j % 3) * 1.2, [x, z] = ks2Rot(s, (j % 2 ? 1 : -1) * (5 + (j % 18) * 0.65), KS2.posts.find(P => P.s === s && !P.clear) ? 95 : wait); ks2Walk(e, x, z, e.speed, dt); }
function ks2GateThud(G, k) { if (Math.hypot(G.x - player.pos.x, G.z - player.pos.z) < 60) { const o = Sfx.at(new V3(G.x, 1, G.z), 160, 1.3); if (o) { Sfx.noiseBurst(0.25 * k + 0.1, 'lowpass', 300, 60, 0.9 * k + 0.2, 1, 0, o); Sfx.tone('sine', 70, 40, 0.3, 0.5 * k, 0, o); } if (k > 0.8 && Math.hypot(G.x - player.pos.x, G.z - player.pos.z) < 25) player.shake = Math.max(player.shake || 0, 0.25); } }
// ---- 守り手の頭脳 ----
function ks2Def(e, dt, dP) { const p = e.s.position, r = e.ks2Role, far = dP > 45; if (e.ks2Gave) { e.state = 'idle'; e.moving = false; e.tgt = null; return; }
  if (r === 'cmd') { e.state = 'idle'; e.faceWant = 0; return; }
  if ((e.ks2T -= dt) <= 0) { e.ks2T = far ? rand(1, 1.8) : rand(0.4, 0.8); const rng = r === 'rifle' || r === 'bow' || r === 'look' || r === 'xbow'; e.tgt = ks2Near(e, rng ? 50 : r === 'keep' ? 14 : r === 'res' || r === 'medguard' ? 26 : 10, rng ? 14 : 1.5, o => !o.ks2Med && !o.ks2Parley);
    if (!e.tgt && rng && !inHQ() && state === 'play' && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 40 && Math.random() < 0.15) e.tgt = PLAYER_T; }
  const t = e.tgt && (e.tgt.isPlayer || isUp(e.tgt)) ? e.tgt : null; e.cd -= dt; const H = e.ks2Home;
  if (r === 'rifle' || r === 'bow' || r === 'look' || r === 'xbow') { if (t && r !== 'xbow' && (e.ks2Ld = (e.ks2Ld == null ? rand(1, 6) : e.ks2Ld) - dt) <= 0) { e.ks2Ld = r === 'rifle' ? rand(6, 9) : rand(3, 5); ks2Shoot(e, t, r === 'rifle' ? 'rifle' : 'bow'); return; }
    if (t && !t.isPlayer && Math.abs(t.s.position.y - p.y) < 1.5 && Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z) < 6) { const d = Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z); if (d > 1.1) ks2Walk(e, t.s.position.x, t.s.position.z, e.speed, dt); else ks2Hit(e, t); return; }
    ks2Walk(e, H[0], H[1], e.speed, dt); if (!e.moving) e.faceWant = Math.atan2(H[0], H[1]); return; }
  // 援軍：ほかの門から城内を走って
  if (e.ks2Go2) { const Q = e.ks2Go2; if (ks2Walk(e, Q[0][0], Q[0][1], e.speed * 1.35, dt)) { Q.shift(); if (!Q.length) { e.ks2Go2 = null; e.ks2Home = [p.x, p.z, 0]; } } return; }
  if (t && !t.isPlayer) { const d = Math.hypot(t.s.position.x - p.x, t.s.position.z - p.z); if (d > 1.1) ks2Walk(e, t.s.position.x, t.s.position.z, e.speed * 1.1, dt); else ks2Hit(e, t); return; }
  if (t && t.isPlayer && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.4) { if (e.cd <= 0) { e.cd = rand(1.4, 2.2); if (!player.god) hurtPlayer(4); } e.faceWant = Math.atan2(player.pos.x - p.x, player.pos.z - p.z); return; }
  ks2Walk(e, H[0], H[1], e.speed, dt); }
function ks2Brain(e, dt) { if (!KS2.on || !e.ks2) return false; const p = e.s.position; e.passive = true; e.kneel = false; e.crouch = 0; if (e.knock) e.knock.set(0, 0, 0); e.t += dt;
  if (e.ks2Sp > 0) e.ks2Sp -= dt;
  if (e.ks2Fall) { const F = e.ks2Fall; F.t += dt; const k = Math.min(1, F.t / 0.9); p.y = e.baseY = F.y0 * (1 - k * k); if (k >= 1) { e.ks2Fall = null; e.ks2Y = 0; e.baseY = 0; p.y = 0; killEnemy(e, false, null); } return true; }   // 梯子から落ちて、その場に残る
  if (e.ks2Climb) { const C = e.ks2Climb; C.t += dt; const k = Math.min(1, C.t / C.T); if (C.lx != null) p.x = C.lx; p.y = e.baseY = C.y0 + (C.y1 - C.y0) * k; e.moving = true; e.state = 'idle'; e.faceWant = C.wall === 'E' ? -Math.PI / 2 : Math.PI;
    if (k >= 1) { e.ks2Climb = null; e.ks2Y = C.y1; p.x = C.x + rand(-0.5, 0.5); p.z = C.z + (C.wall === 'E' ? rand(-0.5, 0.5) : 0); e.ks2Wall = C.wall; } return true; }
  p.y = e.baseY = e.ks2Y + (e.ks2Y < 0.1 && Math.abs(p.z - 150) < 18 && Math.abs(p.x) < 18 ? ks2GY(p.x, p.z) : 0);
  const dP = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); e.shadow.visible = dP < 20 && e.ks2Y < 1;
  if (e.ks2Med) { ks2MedBrain(e, dt); return true; }
  if (e.team === 'blue') ks2Atk(e, dt, dP); else ks2Def(e, dt, dP); return true; }
// ---- 医務班（閉じこめられている）と担架 ----
function ks2MedBrain(e, dt) { const p = e.s.position;
  if (!KS2.rescued) { e.state = 'idle'; e.moving = false; e.faceWant = Math.atan2(player.pos.x - p.x, player.pos.z - p.z); return; }
  const Q = e.ks2Q || (e.ks2Q = ks2MedRoute()); if (!Q.length) { e.state = 'idle'; e.moving = false; return; }
  if (ks2Walk(e, Q[0][0] + ((e.id || 0) % 3 - 1) * 0.8, Q[0][1], e.speed * 1.1, dt)) Q.shift(); }
function ks2MedRoute() { const t = [KS2.tent[0] + rand(-3, 3), KS2.tent[1] - 2];
  if (KS2.gates.E.open) return [[61, -37.5], [61, -20], [58, 0], [80, 0], [100, 60], [40, 140], t];
  return [[61, -37.5], [61, -20], [61, 37.5], [61, 61], [37.5, 61], [10, 64], [0, 80], [0, 110], t]; }
function ks2BearBrain(e, dt) { const p = e.s.position, J = e.ks2Job;
  if (!J) { const H = [KS2.tent[0] - 8 + (e.ks2Bear % 6) * 1.4, KS2.tent[1] + 3]; ks2Walk(e, H[0], H[1], e.speed, dt); if (!e.moving) e.faceWant = Math.PI; return; }
  const b = J.b, bp = b.s.position;
  if (J.ph === 'go') { if (ks2Walk(e, bp.x + (e.ks2Bear % 2 ? 0.9 : -0.9), bp.z, e.speed * 1.3, dt)) { J.n = (J.n || 0) + 1; if (e.ks2Bear % 2 === 0) J.ph = 'carry'; } return; }
  // 担いで後ろへ（二人一組：前の人が先に立つ）
  const dst = J.dst; if (e.ks2Bear % 2) { const L = J.lead; if (L && L.ks2Job === J) { const lp = L.s.position, fx = Math.sin(L.face || 0), fz = Math.cos(L.face || 0); ks2Walk(e, lp.x - fx * 2.0, lp.z - fz * 2.0, e.speed * 1.3, dt); } return; }
  const arrived = ks2Walk(e, dst[0], dst[1], e.speed * 0.8, dt), fx = Math.sin(e.face || 0), fz = Math.cos(e.face || 0);
  bp.x = p.x - fx * 1.0; bp.z = p.z - fz * 1.0; bp.y = 0.72; b.s.rotation.y = (e.face || 0) + Math.PI / 2; J.st.position.set(bp.x, 0.62, bp.z); J.st.rotation.y = e.face || 0; J.st.visible = true;
  if (arrived) { bp.y = 0.05; b.baseY = 0.05; J.st.position.y = 0.12; e.ks2Job = null; if (J.mate) J.mate.ks2Job = null; KS2.carried++; } }
function ks2BearTick() { const fr = KS2.bearers.filter(e => isUp(e) && !e.ks2Job && e.ks2Bear % 2 === 0); if (!fr.length || !KS2.wq.length) return;
  for (const L of fr) { const mate = KS2.bearers.find(o => isUp(o) && !o.ks2Job && o.ks2Bear === L.ks2Bear + 1); if (!mate) continue; const b = KS2.wq.shift(); if (!b) break;
    const n = KS2.cotN++, st = new THREE.Mesh(KS2.stG || (KS2.stG = new THREE.BoxGeometry(0.7, 0.08, 2.1)), ks2Mats().cloth); st.visible = false; stageRoot.add(st);
    const J = { b, ph: 'go', lead: L, mate, st, dst: [KS2.tent[0] - 10 + (n % 12) * 1.3, KS2.tent[1] - 6 - Math.floor(n / 12) * 2.4] }; L.ks2Job = J; mate.ks2Job = J; } }
// ---- 進行 ----
function ks2Reset() { KS2.ph = 'off'; KS2.t = 0; KS2.peeled = false; KS2.rescued = false; KS2.later = []; KS2.tr = KS2.tr || []; KS2.fx = 0; KS2.clank = 0; KS2.wallS = 0; KS2.wallE = 0; KS2.inS = { S: 0, E: 0, W: 0, N: 0 }; KS2.wCall = null; KS2.wFire = false; KS2.pots = KS2.pots || []; KS2.said = {}; KS2.wq = []; KS2.carried = 0; KS2.cotN = 0; KS2.chatT = 4; KS2.log = []; KS2.sur = null; KS2.vPre = false;
  KS2.tr.length = 0; KS2.trIM = null; for (const P of KS2.pots) stageRoot.remove(P.m); KS2.pots.length = 0;
  player.pos.set(4, 1.6 + 0, 232); player.yaw = 0; player.pitch = -0.04; CFG.maxBodies = Math.max(CFG.maxBodies || 0, 3000); }
function ks2Start() { KS2.on = true; ks2Reset(); ks2Spawn(); KS2.ph = 'march'; KS2.t = 0; KS2.bearers = [];
  { let b = 0; for (const e of KS2.U.R.mem) if (e.ks2Role === 'melee' && b < (LITE ? 6 : 12)) { e.ks2Bear = b++; KS2.bearers.push(e); } }
  for (const U of KS2.units) { for (const e of U.mem) { const [x, z] = ks2Slot(e); e.s.position.x = x; e.s.position.z = z; e.ks2Lead = e === U.cmd; } U.mem0 = U.mem.length; U.px0 = U.px.length; ks2PxPlace(U, true); }
  KS2.zone = {}; for (const e of KS2.def) { const z = ks2Zone(e.ks2Side, e.ks2Y === KS2_IH ? 'gal' : e.ks2Role); (KS2.zone[z] = KS2.zone[z] || { real: [], px: [] }).real.push(e); }
  for (const o of KS2.px) if (o.team === 'orange') { const z = ks2Zone(o.side, o.role); (KS2.zone[z] = KS2.zone[z] || { real: [], px: [] }).px.push(o); }
  showBanner('決戦2「白壁城」', '英国の反乱軍が奪った白壁城へ――全軍、進め'); bannerTimer = 4.5; ks2PxDraw(); ks2Seq(KS2_L.hir.m1, 13); ks2Seq(KS2_L.hir.m2, 27); ks2Seq(KS2_L.hir.m3, 40);
  if (TEST) window.__ks2 = { KS2, updateKs2, ks2Counts, ks2Spawn };
  setTimeout(() => { if (KS2.on && state === 'play') ks2SayK('sumi', KS2_L.march[0][1], 1.9); }, 2500); setTimeout(() => { if (KS2.on && state === 'play') ks2SayK('flute', KS2_L.march[1][1], 1.6); }, 7000); }
function ks2Zone(s, r) { const g = r === 'rifle' || r === 'bow' || r === 'xbow' || r === 'wall' ? 'wall' : r === 'gal' ? 'gal' : r === 'res' || r === 'post' ? 'res' : r === 'keep' ? 'keep' : r; return (g === 'keep' ? 'K' : s) + ':' + g; }
// 群れの位置：隊の並び（行軍）・攻め口の後ろ（攻城）
function ks2PxPlace(U, snap) { const cols = 14, fx = Math.sin(U.hd), fz = Math.cos(U.hd), base = U.mem.length + 2, siege = U.side && (KS2.ph === 'siege' || KS2.ph === 'keep' || KS2.ph === 'won'), G = U.side && KS2.gates[U.side];
  U.px.forEach((o, j) => { if (!o.alive) return; let tx, tz;
    if (siege) { const c = j % 30, r = Math.floor(j / 30) % 7, adv = G.open && !o.arch && j % 2 ? 22 : 0; [tx, tz] = ks2Rot(U.side, (c - 14.5) * 1.4 + ((r % 2) * 0.7), 107 + r * 1.7 - adv); }
    else { const i = base + j, c = i % cols, r = Math.floor(i / cols), lat = (c - (cols - 1) / 2) * 1.5, dep = r * 1.6 + 2; tx = U.ax + fz * lat - fx * dep; tz = U.az - fx * lat - fz * dep; }
    if (snap) { o.x = tx; o.z = tz; } else { const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz), st = Math.min(d, (o.sp || (o.sp = rand(1.3, 1.8))) * 0.5); if (d > 0.05) { o.x += dx / d * st; o.z += dz / d * st; } }
    o.y = Math.abs(o.z - 150) < 18 && Math.abs(o.x) < 18 ? ks2GY(o.x, o.z) : 0; }); }
function ks2UnitMove(U, dt) { const H = KS2.U.H; let tgt;
  if (!KS2.peeled && U.side && U.k !== 'S') tgt = [U.off[0], Math.max(150, H.az) + U.off[1]]; else if (!KS2.peeled && U.k === 'S') tgt = [0, Math.max(118, H.az - 34)]; else tgt = U.path[Math.min(U.pi, U.path.length - 1)];
  if (U.k === 'R') tgt = [0, Math.max(172, H.az + 26)];
  const dx = tgt[0] - U.ax, dz = tgt[1] - U.az, d = Math.hypot(dx, dz); if (KS2.peeled && d < 3 && U.pi < U.path.length - 1) U.pi++;
  const last = !KS2.peeled ? false : U.pi >= U.path.length - 1, sp = (U.sp || 1.5) * (last ? Math.min(1, d / 10) : 1), wx = d > 0.3 ? dx / d * sp : 0, wz = d > 0.3 ? dz / d * sp : 0, k = Math.min(1, dt * 0.7);
  U.vx += (wx - U.vx) * k; U.vz += (wz - U.vz) * k; U.ax += U.vx * dt; U.az += U.vz * dt; const v = Math.hypot(U.vx, U.vz);
  if (v > 0.25) U.hd = Math.atan2(U.vx, U.vz); else { const want = Math.atan2(-U.ax, -U.az), dh = Math.atan2(Math.sin(want - U.hd), Math.cos(want - U.hd)); U.hd += dh * Math.min(1, dt * 0.8); }
  U.at = KS2.peeled && last && d < 2.5 && v < 0.3;
  if ((U.ht -= dt) <= 0) { U.ht = 0.25; U.hist.unshift([U.ax, U.az, U.hd]); if (U.hist.length > 48) U.hist.pop(); } }
// ---- 攻城の仕掛け ----
function ks2Pushers(R, U, n) { R.pushers = R.pushers.filter(e => { if (isUp(e)) return true; if (!R.saidDown || KS2.t - R.saidDown > 12) { R.saidDown = KS2.t; ks2SayK('omiya', KS2_L.S[3][1], 1.5); } return false; });
  if (R.pushers.length >= n) return; const zz = R.g.position.z; const cand = U.mem.filter(e => isUp(e) && e.ks2Role === 'melee' && !e.ks2Push && !e.ks2Climb && e.ks2Y < 1 && !e.ks2In).sort((a, b) => Math.hypot(a.s.position.x, a.s.position.z - zz) - Math.hypot(b.s.position.x, b.s.position.z - zz));
  for (const e of cand) { if (R.pushers.length >= n) break; e.ks2Push = R === KS2.ram ? 'ram' : 'tower'; R.pushers.push(e); } }
function ks2GateOpen(G, why) { if (G.open) return; G.open = true; G.leaf.visible = false; if (G.bands) for (const b of G.bands) b.visible = false; const i = boxes.indexOf(G.box); if (i >= 0) boxes.splice(i, 1);
  for (const sg of [-1, 1]) { const inner = !!KS2.igates[G.s] && KS2.igates[G.s] === G, v = inner ? KS2_IW - 1.5 : KS2_W - 1.2, [x, z] = ks2Rot(G.s, sg * ((inner ? KS2_IG : KS2_GATE) - 0.2), v), m = new THREE.Mesh(new THREE.BoxGeometry(0.35, inner ? 4 : 5.2, (inner ? KS2_IG : KS2_GATE) * 0.95), ks2Mats().gate); m.position.set(x, inner ? 2 : 2.6, z); m.rotation.y = G.s === 'S' || G.s === 'N' ? 0 : Math.PI / 2; stageRoot.add(m); }
  puff(new V3(G.x, 2, G.z), 0xc8b48a, 14, 1.6, 3, 1.8); ks2GateThud(G, 1.2); KS2.log.push(['open', G.s, Math.round(KS2.t), why]);
  for (const e of KS2.all) if (e.ks2Push && e.ks2Push === 'ram' && G === KS2.gates.S) e.ks2Push = null;
  if (G === KS2.gates[G.s]) { if (!KS2.said.defy2) { KS2.said.defy2 = 1; KS2.later.push([KS2.t + 5, () => ks2En('defy2', KS2.cmd, 1.9, 22)]); } showBanner(({ S: '南', E: '東', W: '西', N: '北' })[G.s] + '門、' + (why === 'ram' ? '破れた！' : '開いた！'), why === 'ram' ? '破城槌が門を破った――門の内側で押し合いになる' : why === 'wall' ? '城壁に上った者が内側から門を開けた' : '銃を置いた英国兵が門を開けた'); bannerTimer = 3.5; if (!KS2.said.gate) { KS2.said.gate = 1; setTimeout(() => ks2SayK('sumi', KS2_L.gate[0][1], 1.8), 1500); } ks2Reinforce(G.s, 0.6); }
  else { popup(({ S: '南', E: '東', W: '西', N: '北' })[G.s] + 'の第二の門が破れた！ 本丸の中庭へ'); popupTimer = 3; if (KS2.ph === 'siege') { KS2.ph = 'keep'; setTimeout(() => ks2SayK('sumi', KS2_L.keep[0][1], 1.8), 1200); ks2Seq(KS2_L.hir.kp, 8); } } }
// 守り手の援軍：ほかの側の中庭から、角の細い通路を通って走る
function ks2Route(a, b) { const C = s => ks2Rot(s, 0, 46), cor = (s1, s2) => { const [x1, z1] = ks2Rot(s1, 0, 1), [x2, z2] = ks2Rot(s2, 0, 1), sx = Math.sign(x1 + x2), sz = Math.sign(z1 + z2); return [[sx * (Math.abs(x1) ? 61 : 33), sz * (Math.abs(z1) ? 61 : 33)], [sx * (Math.abs(x1) ? 61 : 42), sz * (Math.abs(z1) ? 61 : 42)], [sx * 61, sz * 61], [sx * (Math.abs(x2) ? 61 : 42), sz * (Math.abs(z2) ? 61 : 42)], [sx * (Math.abs(x2) ? 61 : 33), sz * (Math.abs(z2) ? 61 : 33)]]; };
  const nb = { S: ['E', 'W'], N: ['E', 'W'], E: ['S', 'N'], W: ['S', 'N'] }; if (a === b) return [C(b)]; if (nb[a].includes(b)) return cor(a, b).concat([C(b)]); const m = nb[a][Math.random() < 0.5 ? 0 : 1]; return [C(a)].concat(cor(a, m), [C(m)], cor(m, b), [C(b)]); }
function ks2Reinforce(to, frac) { let n = 0; for (const e of KS2.def) { if (!isUp(e) || e.ks2Gave || e.ks2Role !== 'res' || e.ks2Side === to || e.ks2Go2) continue; if (Math.random() > frac) continue; e.ks2Go2 = ks2Route(e.ks2Side, to); e.ks2Side = to; n++; }
  const Z = KS2.zone; for (const k in Z) if (k.endsWith(':res') && !k.startsWith(to)) { const P = Z[k].px.filter(o => o.alive), m = Math.round(P.length * frac * 0.5); for (let i = 0; i < m; i++) { const o = P[i]; const [x, z] = ks2Rot(to, rand(-14, 14), rand(40, 48)); o.hx = x; o.hz = z; } }
  KS2.log.push(['reinf', to, n]); if (n && Math.hypot(player.pos.x, player.pos.z) < 100) popup('守り手が城内を走って' + ({ S: '南', E: '東', W: '西', N: '北' })[to] + 'へ回っている'); }
function ks2Pot(x, z, s) { const m = new THREE.Group(), b = new THREE.Mesh(KS2.potG || (KS2.potG = new THREE.CylinderGeometry(0.32, 0.26, 0.34, 10)), ks2Mats().pot); m.add(b); const top = new THREE.Mesh(KS2.potT || (KS2.potT = new THREE.CircleGeometry(0.3, 10)), ks2Mats().broth); top.rotation.x = -Math.PI / 2; top.position.y = 0.17; m.add(top);
  m.position.set(x, KS2_H + 1, z); stageRoot.add(m); KS2.pots.push({ m, x, z, t: 0, T: 0.85, y0: KS2_H + 1 }); if (KS2.pots.length > 70) stageRoot.remove(KS2.pots.shift().m); }
function ks2PotLand(P) { const q = new V3(P.x, 0.3, P.z); puff(q, 0xc8902a, 10, 0.5, 2.2, 0.9); puff(q.clone().setY(0.6), 0xf2eee6, 6, 0.8, 1.2, 1.4); P.m.rotation.z = 1.4; P.m.position.y = 0.25; const dP = Math.hypot(P.x - player.pos.x, P.z - player.pos.z); if (dP < 40) { const o = Sfx.at(q, 40, 1); if (o) { Sfx.noiseBurst(0.3, 'lowpass', 1200, 200, 0.5, 1, 0, o); Sfx.tone('triangle', 520, 300, 0.12, 0.2, 0, o); } }
  let said = false; for (const e of KS2.live.blue) { if (Math.hypot(e.s.position.x - P.x, e.s.position.z - P.z) > 2.2 || e.ks2Y > 1) continue; e.ks2Sp = rand(7, 10); KS2.spicyN = (KS2.spicyN || 0) + 1; e.lungeT = 0;
    if (!said) { said = true; const yum = Math.random() < 0.1, t = yum ? KS2_RV.yum[0] : KS2_RV.ramen[(Math.random() * KS2_RV.ramen.length) | 0]; ks2Say(e, t, 1.2); if (yum) KS2.yumN = (KS2.yumN || 0) + 1; } } }
function ks2Siege2(dt) { const S = KS2.U.S, E = KS2.U.E, W = KS2.U.W, N = KS2.U.N, st = KS2.t - KS2.goT;
  // 南：破城槌と攻城塔
  const R = KS2.ram, T = KS2.tower, GS = KS2.gates.S;
  if (!GS.open) { ks2Pushers(R, S, LITE ? 4 : 6); const n = R.pushers.filter(e => Math.hypot(e.s.position.x - R.g.position.x, e.s.position.z - R.g.position.z) < 4.5).length, zT = KS2_W + KS2_T + 3.4;
    if (R.z > zT) { if (n >= 3) { R.z = Math.max(zT, R.z - 0.7 * Math.min(1, n / 5) * dt); R.g.position.z = R.z; } }
    else if (n >= 3 && (R.hitT -= dt) <= 0) { R.hitT = 3; GS.hp -= 12 * Math.min(1.5, n / 4); R.log.position.z = -0.8; ks2GateThud(GS, 1); puff(new V3(0, 1.5, KS2_W + KS2_T + 0.2), 0xc8b48a, 4, 0.6, 1.2, 0.8); if (GS.hp <= 0) ks2GateOpen(GS, 'ram'); }
    R.log.position.z += (0 - R.log.position.z) * Math.min(1, dt * 3); }
  if (!T.at) { ks2Pushers(T, S, 4); const n = T.pushers.filter(e => Math.hypot(e.s.position.x - T.g.position.x, e.s.position.z - T.g.position.z) < 4.5).length; if (n >= 2) { T.z = Math.max(KS2_W + KS2_T + 2.3, T.z - 0.45 * Math.min(1, n / 4) * dt); T.g.position.z = T.z; } if (T.z <= KS2_W + KS2_T + 2.31) { T.at = true; T.br.visible = true; for (const e of T.pushers) e.ks2Push = null; T.pushers = []; popup('攻城塔が城壁に着いた！ 渡り板を下ろせ'); KS2.log.push(['tower', Math.round(KS2.t)]); } }
  // 東：梯子
  if (st > 5) for (const L of KS2.ladders) if (!L.up) { L.up = true; L.g.position.set(L.x + 1.0, 0, L.z); L.g.rotation.set(0, Math.PI / 2, 0); L.g.rotateX(-0.17); }
  // 城壁の上から下りた者が内側から門を開ける（守り手が門のそばにいない時）
  for (const s of ['S', 'E']) { const G = KS2.gates[s]; if (G.open || KS2.inS[s] < (LITE ? 4 : 7)) continue; const [ix, iz] = ks2Rot(s, 0, KS2_W - 4); let near = 0; for (const o of KS2.live.orange) if (o.ks2Y < 1 && Math.hypot(o.s.position.x - ix, o.s.position.z - iz) < 9) near++; if (near <= 1) ks2GateOpen(G, 'wall'); }
  // 西：呼びかけ
  const C = KS2.wCall || (KS2.wCall = { ph: 0, t: 0 }); C.t += dt; const el = KS2.by.uk06;
  if (C.ph === 0 && C.t > 6) { C.ph = 1; if (el && isUp(el)) { el.ks2Parley = true; ks2En('call1', el, 2); } }
  else if (C.ph === 1 && C.t > 14) { C.ph = 1.5; if (el && isUp(el)) ks2En('call2', el, 2); }
  else if (C.ph === 1.5 && C.t > 21) { C.ph = 2; if (el) el.ks2Parley = false; let n = 0, m = 0; for (const e of KS2.def) if (isUp(e) && e.ks2Uk && e.ks2Side === 'W' && e.ks2Role !== 'cmd' && e.ks2Role !== 'keep') { m++; if (Math.random() < 0.34) { e.ks2Gave = true; e.tgt = null; n++; } }
    for (const o of KS2.px) if (o.team === 'orange' && o.side === 'W' && o.role === 'wall' && o.alive && Math.random() < 0.2) o.gave = true; KS2.gaveN = n; popup('西の城壁：英国兵の一部が銃を置いた（' + n + '人／' + m + '人）'); popupTimer = 3.5; KS2.log.push(['gave', n, m]); }
  else if (C.ph === 2 && C.t > 25) { C.ph = 3; KS2.later.push([KS2.t + 40, () => { const el2 = KS2.by.uk06; if (el2 && isUp(el2)) { ks2En('elCall', el2, 2, 30); KS2.later.push([KS2.t + 7, () => ks2En('araRep', KS2.cmd, 2, 22)]); } }]); if (el && isUp(el)) ks2En('ready', el, 1.8); else ks2SayK('shizuka', KS2_L.W[0][1], 1.6); }
  else if (C.ph === 3 && C.t > 29) { C.ph = 4; KS2.wFire = true; if (el && isUp(el)) ks2En('fire', el, 1.8); }
  else if (C.ph === 4 && C.t > 150 && !KS2.gates.W.open && KS2.gaveN > 0) { C.ph = 5; ks2GateOpen(KS2.gates.W, 'gave'); setTimeout(() => { if (el && isUp(el)) ks2En('open', el, 1.8); }, 1500); }
  // 北：陽動（太鼓と旗）。守り手の予備を北へ引きつける
  if (st > 20 && !KS2.said.feint) { KS2.said.feint = 1; ks2Reinforce('N', 0.35); setTimeout(() => ks2SayK('sysop', KS2_L.N[2][1], 1.5), 2000); }
  if (KS2.flags) for (let i = 0; i < KS2.flags.length; i++) KS2.flags[i].rotation.y = Math.sin(KS2.t * 3 + i) * 0.5;
  if ((KS2.drT = (KS2.drT || 0) - dt) <= 0) { KS2.drT = 0.5; const q = new V3(0, 1, -120), d = Math.hypot(player.pos.x, player.pos.z + 120); if (d < 160) { const o = Sfx.at(q, 260, 1.2); if (o) { Sfx.tone('sine', 90, 45, 0.25, 0.7, 0, o); Sfx.noiseBurst(0.08, 'lowpass', 600, 100, 0.3, 1, 0, o); } } }
  // 門の前で崩れた守り手の予備は、ときどき他の側から援軍
  if ((KS2.rfT = (KS2.rfT || 15) - dt) <= 0) { KS2.rfT = 15; for (const s of KS2_SIDES) { const G = KS2.gates[s]; if (!G.open) continue; let o = 0; for (const e of KS2.live.orange) if (e.ks2Side === s && e.ks2Role === 'res') o++; if (o < 4) ks2Reinforce(s, 0.25); } }
  // ラーメン（四川の激辛）：城壁の近くの攻め手へ
  if ((KS2.potT2 = (KS2.potT2 || 3) - dt) <= 0) { KS2.potT2 = LITE ? 2.6 : 1.8; const near = KS2.live.blue.filter(e => { const p = e.s.position, m = Math.max(Math.abs(p.x), Math.abs(p.z)); return e.ks2Y < 1 && m > KS2_W + KS2_T && m < KS2_W + KS2_T + 10; });
    if (near.length) { const t = near[(Math.random() * near.length) | 0], s = ks2Side(t.s.position.x, t.s.position.z); if (KS2.live.orange.some(o => o.ks2Side === s && o.ks2Y > 8)) ks2Pot(t.s.position.x + rand(-1.2, 1.2), t.s.position.z + rand(-1.2, 1.2), s); } }
  // 連弩：短い連射。射手が倒れると沈黙
  for (const X of KS2.xbows) { if (X.dead) continue; const crew = X.crew.filter(isUp); if (!crew.length) { X.dead = true; X.g.rotation.z = 0.25; if (Math.hypot(X.x - player.pos.x, X.z - player.pos.z) < 120) popup('連弩が沈黙した'); KS2.log.push(['xbow', X.s, X.u, Math.round(KS2.t)]); continue; }
    if ((X.t -= dt) > 0) continue; X.t = rand(4, 6.5); const sh = crew[0], t = ks2Near(sh, 46, 14, o => o.ks2Y < 1); if (!t) continue; for (let i = 0; i < 5; i++) KS2.later.push([KS2.t + i * 0.14, () => { if (isUp(sh) && isUp(t)) ks2Shoot(sh, t, 'xbow'); }]); }
  // 医務班：近くに味方がいて、見張りがいない
  if (!KS2.rescued) { const m = KS2.medAt; let blue = Math.hypot(player.pos.x - m[0], player.pos.z - m[1]) < 6, ora = false; for (const e of KS2.live.blue) if (Math.hypot(e.s.position.x - m[0], e.s.position.z - m[1]) < 6) { blue = true; break; } for (const e of KS2.live.orange) if (Math.hypot(e.s.position.x - m[0], e.s.position.z - m[1]) < 10) { ora = true; break; }
    if (blue && !ora) { KS2.rescued = true; KS2.log.push(['rescue', Math.round(KS2.t)]); showBanner('医務班、救出！', '閉じこめられていた医務班を連れ出す'); bannerTimer = 3; const e = KS2.med.find(isUp); if (e) ks2Say(e, KS2_RV.med[0], 1.8, 'cs03'); } }
  // 降伏：本丸の守りがほぼ尽き、本丸の中庭に味方が入った
  if (!KS2.sur && KS2.ph === 'keep') { let k = 0, b = 0; for (const e of KS2.live.orange) if (e.ks2Role === 'keep') k++; for (const e of KS2.live.blue) if (Math.max(Math.abs(e.s.position.x), Math.abs(e.s.position.z)) < KS2_IW) b++; if (Math.max(Math.abs(player.pos.x), Math.abs(player.pos.z)) < KS2_IW) b += 3; if (k <= (LITE ? 1 : 2) && b >= 5) ks2Surrender(); } }
function ks2Surrender() { KS2.sur = { t: KS2.t }; KS2.ph = 'won'; KS2.log.push(['surrender', Math.round(KS2.t)]); for (const e of KS2.def) if (isUp(e)) { e.ks2Gave = true; e.tgt = null; } for (const o of KS2.px) if (o.team === 'orange') o.gave = true; KS2.rescued = true;
  const c = KS2.cmd; if (c) { c.s.position.set(0, 0, 13.5); c.ks2Home = [0, 13.5, 0]; } ks2En('cmd1', c, 2, 20); setTimeout(() => { if (KS2.on) ks2En('cmd2', c, 2, 20); }, 5500); setTimeout(() => { const el = KS2.by.uk06; if (KS2.on && el && isUp(el)) ks2En('elThanks', el, 1.8, 25); }, 9000);
  setTimeout(() => { if (!KS2.on || state !== 'play') return; showBanner('白壁城、開城！', '反乱軍を率いたアラベラ王女が本丸で降伏した'); bannerTimer = 5; Sfx.fanfare && Sfx.fanfare(); }, 10500);
  setTimeout(() => { if (!KS2.on || state !== 'play') return; gameOver(true); const c2 = ks2Counts(); $('result').innerHTML = `白壁城を取り戻した。攻め手 <b>${c2.a}</b> / 1500・守り手の残り <b>${c2.d}</b> / 1000（降伏）。医務班 ${KS2.rescued ? '救出' : '—'}・担架で運んだ負傷者 ${KS2.carried} 人。`; }, 15500); }
function ks2VoicePre() { if (KS2.vPre || !VoicePack.ok || !window.VOICE_KS2) return; KS2.vPre = true; const M = window.VOICE_KS2.byText, fs = [], add = t => { for (const x of M[t] || []) fs.push(x.file); };   // 号令・名のある娘の台詞・英語の呼びかけは先に読む
  for (const k in KS2_L) { const v = KS2_L[k]; if (k === 'succ') for (const n in v) add(v[n]); else if (k === 'hir') for (const g in v) for (const q of v[g]) add(q[1]); else for (const q of v) add(q[1]); } for (const k in KS2_EN) add(KS2_EN[k][1]); for (const t of KS2_RV.ramen) add(t);
  for (let i = fs.length - 1; i >= 0; i--) VoicePack.load(fs[i], i < 12); }
function ks2Seq(L, t0, gap) { (L || []).forEach((q, i) => KS2.later.push([KS2.t + t0 + i * (gap || 4.2), () => { if (KS2.on && state === 'play') ks2SayK(q[0], q[1], 1.7); }])); }
function ks2Go() { if (KS2.ph !== 'deploy') return; KS2.ph = 'siege'; KS2.goT = KS2.t; ks2SayK('sumi', KS2_L.go[0][1], 2); const b = $('bKs2Go'); if (b) b.style.display = 'none'; ks2Seq(KS2_L.hir.sg, 40); showBanner('総攻撃', '南は破城槌と攻城塔、東は梯子、西は呼びかけ、北は陽動'); bannerTimer = 3;
  setTimeout(() => ks2SayK('ojou', KS2_L.S[0][1], 1.5), 3000); setTimeout(() => ks2SayK('fumi', KS2_L.E[0][1], 1.5), 6000); setTimeout(() => ks2SayK('sec4', KS2_L.N[0][1], 1.4), 9000); setTimeout(() => ks2En('hold', KS2.def.find(e => e.ks2Uk && isUp(e) && e.ks2Side === 'S'), 1.2), 4500); setTimeout(() => { if (KS2.on && state === 'play') ks2En('defy1', KS2.cmd, 2, 22); }, 12000); }
function ks2Remain() { const c = ks2Counts(), A = c.A; return `南${A.S} 東${A.E} 西${A.W} 北${A.N} 本隊${A.H} 後方${A.R}`; }
function ks2Label() { const c = ks2Counts(), P = { march: '進軍', deploy: '布陣（総攻撃の合図を）', siege: '攻城', keep: '本丸', won: '開城' }[KS2.ph] || ''; return `決戦2「白壁城」 ${P}　攻 ${c.a}　守 ${c.d}`; }
// ---- 行進曲（笛と太鼓・この場で作る短い曲） ----
const KS2_TUNE = [[67, 1], [72, 1], [74, 1], [76, 2], [74, 1], [72, 1], [74, 2], [67, 2], [69, 1], [71, 1], [72, 1], [74, 1], [76, 2], [79, 2], [77, 1], [76, 1], [74, 1], [72, 1], [74, 2], [71, 2], [72, 4]];
function ks2Music(dt) { const c = Sfx.ctx; if (!c || (KS2.ph !== 'march' && KS2.ph !== 'deploy')) return; const fl = KS2.by.flute, d = fl && isUp(fl) ? Math.hypot(fl.s.position.x - player.pos.x, fl.s.position.z - player.pos.z) : 999; if (d > 70) return; const g = 0.16 * (1 - d / 70);
  KS2.mT = (KS2.mT || 0) - dt; if (KS2.mT > 0) return; const beat = 0.32, N = KS2_TUNE[KS2.mi = ((KS2.mi || 0) + 1) % KS2_TUNE.length], f = 440 * Math.pow(2, (N[0] - 69) / 12); KS2.mT = beat * N[1];
  Sfx.tone('sine', f, f * 1.003, beat * N[1] * 0.9, g, 0); Sfx.tone('triangle', f * 2, f * 2, beat * N[1] * 0.5, g * 0.12, 0); if (KS2.mi % 2 === 0) Sfx.noiseBurst(0.09, 'lowpass', 500, 120, g * 2.2, 1, 0); if (KS2.mi % 4 === 0) Sfx.tone('sine', 110, 55, 0.18, g * 2.5, 0); }
function ks2Chat(dt) { if ((KS2.chatT -= dt) > 0) return; KS2.chatT = rand(3, 6); const L = KS2.live.blue.filter(e => !e.ks2Named && Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z) < 30); if (!L.length) return; const e = L[(Math.random() * L.length) | 0];
  if (KS2.ph === 'march' || KS2.ph === 'deploy') { const k = e.ks2U.k, A = KS2_L[k]; if (A && Math.random() < 0.5) { const q = A[(Math.random() * A.length) | 0]; ks2SayK(q[0], q[1], 1.2); } return; }
  const inside = Math.max(Math.abs(e.s.position.x), Math.abs(e.s.position.z)) < KS2_W; const A = inside ? KS2_RV.inside : KS2_RV.siege; ks2Say(e, A[(Math.random() * A.length) | 0], 1, ['cs01', 'cs03', 'cs06'][(e.id || 0) % 3]);
  if (Math.random() < 0.35) { const U = KS2.units[(Math.random() * 4) | 0], A2 = KS2_L[U.k]; const q = A2[(Math.random() * A2.length) | 0]; ks2SayK(q[0], q[1], 1.2); } }
// ---- 毎フレーム ----
function updateKs2(dt) { if (!KS2.on || state !== 'play') return; KS2.t += dt; if (!KS2.vPre) ks2VoicePre(); KS2.fx = Math.min(LITE ? 3 : 8, KS2.fx + dt * (LITE ? 4 : 10));
  if ((KS2.gT = (KS2.gT || 0) - dt) <= 0) { KS2.gT = 0.2; ks2Grid(); }
  for (let i = KS2.later.length - 1; i >= 0; i--) if (KS2.later[i][0] <= KS2.t) { const f = KS2.later[i][1]; KS2.later.splice(i, 1); f(); }
  { const im = ks2TrIM(), C1 = KS2_C1 || (KS2_C1 = new THREE.Color(0x5a4a32)), C2 = KS2_C2 || (KS2_C2 = new THREE.Color(0xffe2a0)); let n = 0; for (let i = KS2.tr.length - 1; i >= 0; i--) { const T = KS2.tr[i]; T.t += dt; const k = Math.min(1, T.t / T.T); if (k >= 1) { KS2.tr.splice(i, 1); continue; } KS2_Q.position.lerpVectors(T.a, T.b, k); KS2_Q.position.y += Math.sin(k * Math.PI) * (T.T > 0.3 ? 1.2 : 0); KS2_Q.scale.set(1, 1, 1); KS2_Q.lookAt(T.b); KS2_Q.rotateX(Math.PI / 2); KS2_Q.updateMatrix(); im.setMatrixAt(n, KS2_Q.matrix); im.setColorAt(n, T.c === 1 ? C1 : C2); n++; } im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  for (const P of KS2.pots) if (P.t < P.T) { P.t += dt; const k = Math.min(1, P.t / P.T); P.m.position.y = P.y0 * (1 - k * k) + 0.2; P.m.rotation.x += dt * 6; if (k >= 1) ks2PotLand(P); }
  for (const U of KS2.units) ks2UnitMove(U, dt);
  const H = KS2.U.H;
  if (KS2.ph === 'march') { if (!KS2.peeled && H.az < 200) { KS2.peeled = true; ks2SayK('sumi', KS2_L.peel[0][1], 1.9); popup('東門隊・西門隊・北門隊が隊列を離れ、城を回り込む'); popupTimer = 3; }
    if (KS2.peeled && KS2.units.every(U => U.at || !U.side) && H.at) { KS2.ph = 'deploy'; KS2.depT = KS2.t; ks2SayK('sumi', KS2_L.ready[0][1], 2); ks2Seq(KS2_L.hir.dep, 5); const b = $('bKs2Go'); if (b) b.style.display = 'block'; } }
  else if (KS2.ph === 'deploy') { if (KS2.t - KS2.depT > 25) ks2Go(); }
  if (KS2.ph === 'siege' || KS2.ph === 'keep') { ks2Siege2(dt); for (const s of KS2_SIDES) { const IG = KS2.igates[s]; if (!IG.open && IG.hp <= 0) ks2GateOpen(IG, 'ram'); } }
  // 隊長が倒れたら副官が引き継ぐ
  if ((KS2.sT = (KS2.sT || 0) - dt) <= 0) { KS2.sT = 0.5;
    for (const U of KS2.units) { if (U.cmd && isUp(U.cmd)) continue; const nx = U.chain.map(k => KS2.by[k]).find(e => e && isUp(e)) || U.mem.find(e => isUp(e) && e.ks2Role === 'guard') || U.mem.find(isUp); if (!nx || nx === U.cmd) continue; const old = U.cmd; U.cmd = nx; nx.ks2Lead = true; if (old) old.ks2Lead = false; const ln = KS2_L.succ[nx.ks2Named]; if (ln) ks2SayK(nx.ks2Named, ln, 1.9); popup(U.name + '：' + (nx.ks2Title || nx.prof.name) + 'が指揮を引き継いだ'); KS2.log.push(['succ', U.k, nx.prof.name, Math.round(KS2.t)]); }
    // 倒れた攻め手：城の外なら負傷者として担架で後方へ（一部）
    for (const U of KS2.units) for (const e of U.mem) if (!isUp(e) && !e.ks2Dn) { e.ks2Dn = true; const p = e.s.position; if (Math.max(Math.abs(p.x), Math.abs(p.z)) > KS2_W + KS2_T + 1 && Math.random() < 0.4) KS2.wq.push(e); }
    if (KS2.bearers) ks2BearTick();
    // 群れの人数：実体の生き残りの割合に合わせて減らす
    for (const U of KS2.units) { const al = U.mem.filter(isUp).length, want = Math.round(U.px0 * al / Math.max(1, U.mem0)); let live = U.px.filter(o => o.alive); while (live.length > want) { const o = live.splice((Math.random() * live.length) | 0, 1)[0]; ks2PxKill(o); } }
    for (const k in KS2.zone) { const Z = KS2.zone[k]; if (!Z.px.length || !Z.real.length) continue; const al = Z.real.filter(e => isUp(e)).length, want = Math.round(Z.px.length * al / Math.max(1, Z.real.length)); let live = Z.px.filter(o => o.alive && !o.gave); const gv = Z.px.filter(o => o.alive && o.gave).length; while (live.length + gv > want && live.length) { const o = live.splice((Math.random() * live.length) | 0, 1)[0]; ks2PxKill(o); } }
    for (const U of KS2.units) ks2PxPlace(U, false);
    for (const o of KS2.px) if (o.team === 'orange' && o.alive && o.hx != null && (o.x !== o.hx || o.z !== o.hz)) { const dx = o.hx - o.x, dz = o.hz - o.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.0); o.x += dx / (d || 1) * st; o.z += dz / (d || 1) * st; }
    // 殿が先へ出すぎた：近衛だけが追い、たしなめる
    const dz = H.az - player.pos.z; if (KS2.ph !== 'won' && dz > 14 && (!KS2.kaT || KS2.t - KS2.kaT > 25)) { KS2.kaT = KS2.t; const q = KS2_L.kingAhead[(Math.random() * 2) | 0]; const g = H.mem.find(e => isUp(e) && e.ks2Role === 'guard'); if (g) ks2Say(g, '殿、お一人で先へは行かないでください！', 1.8, 'cs03'); else ks2SayK(q[0], q[1], 1.8); }
    // 伝令：早瀬のそばから各隊へ走る
    if (KS2.ph !== 'march' && (KS2.rnT = (KS2.rnT || 8) - 0.5) <= 0) { KS2.rnT = 18; const r = H.mem.find(e => isUp(e) && e.ks2Role === 'melee' && !e.ks2Run); const U = KS2.units[(Math.random() * 4) | 0]; if (r && U.cmd && isUp(U.cmd) && U.k !== 'N') { const sg = U.k === 'E' ? 1 : -1, w0 = U.k === 'S' ? [] : [[sg * 60, 140], [sg * 100, 95]]; r.ks2Run = { to: U.cmd, t: 0, wp: w0.slice(), wp0: w0 }; if (Math.random() < 0.5) ks2SayK('sec2', KS2_L.march[2][1], 1.2); } } }
  ks2Chat(dt); ks2Music(dt); ks2PxDraw(); }
