/* 孤影の弓 ― 模擬戦 ―  (plain JS + three.js r158, no build step) */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const TEST = /[?&]test=1/.test(location.search);
const PASSIVE = /[?&]passive=1/.test(location.search);  // テスト用：自動プレイが何もしない
// スマホ・タブレット（指で操作する端末）。?mobile=1 で強制。画質や敵の数は PC と同じ
const MOBILE = /[?&]mobile=1/.test(location.search) || (!!window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V3 = THREE.Vector3;

// ====================================================================
//  設定
// ====================================================================
const CFG = {
  field: 140,            // 戦場の半径 (正方形 ±field)
  eyeH: 1.6,
  walk: 6, run: 9.5,
  maxHp: 100,
  arrowsStart: 30, arrowsMax: 40, arrowRegen: 5,   // 秒ごとに1本回復
  maxBodies: 100,        // 戦死判定で倒れたまま残る侍女の上限（性能のため。超えると最も古いものから消える）
  enemyH: 1.72,
};
const WAVE_NUM = ['零','一','二','三','四','五','六','七','八','九','十'];
const waveName = n => n <= 10 ? WAVE_NUM[n] : (n < 20 ? '十' + WAVE_NUM[n - 10] : String(n));

// ====================================================================
//  効果音 (WebAudio)
// ====================================================================
const Sfx = {
  ctx: null, master: null, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate, b = this.ctx.createBuffer(1, len, len), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
  },
  noiseBurst(dur, type, f0, f1, gain, q = 1, delay = 0, dst = null) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dst || this.master); s.start(t); s.stop(t + dur + 0.05);
  },
  tone(type, f0, f1, dur, gain, delay = 0, dst = null) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst || this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  twangFar(d) { const k = clamp(1 - d / 60, 0.08, 1); this.tone('triangle', 200, 80, 0.3, 0.35 * k); this.noiseBurst(0.12, 'bandpass', 2200, 700, 0.18 * k, 2); },
  hitFar(d) { const k = clamp(1 - d / 50, 0.05, 1); this.tone('sine', 220, 70, 0.12, 0.35 * k); this.noiseBurst(0.06, 'lowpass', 3000, 300, 0.25 * k); },
  thudAt(d) { const k = clamp(1 - d / 50, 0.05, 1); this.noiseBurst(0.25, 'lowpass', 400, 60, 0.5 * k); },
  stab() { this.noiseBurst(0.12, 'highpass', 1800, 5000, 0.3, 0.8); this.tone('sine', 900, 1400, 0.06, 0.06); },
  thunk() { this.tone('sine', 520, 300, 0.08, 0.15); this.noiseBurst(0.05, 'bandpass', 1500, 900, 0.15, 3); },
  twang(p) { this.tone('triangle', 170 + p * 140, 65, 0.4, 0.55); this.tone('sawtooth', 340 + p * 220, 110, 0.12, 0.1); this.noiseBurst(0.18, 'bandpass', 2600, 700, 0.3, 2); },
  drawCreak() { this.noiseBurst(0.5, 'bandpass', 260, 520, 0.05, 6); },
  swing() { this.noiseBurst(0.22, 'bandpass', 500, 3800, 0.4, 1.4); },
  // 自分の攻撃が当たった：布で包んだ矢先・刃引きの鈍い「ぼすっ」（湿った音・生々しい音は使わない）
  hit() { this.tone('sine', 125, 55, 0.16, 0.55); this.noiseBurst(0.1, 'lowpass', 600, 90, 0.42, 0.7); this.tone('sine', 1500, 1500, 0.04, 0.035); },
  clash() { this.tone('square', 1800, 1200, 0.08, 0.08); this.tone('sine', 2600, 2400, 0.25, 0.08); this.hit(); },
  hurt() { this.tone('square', 120, 45, 0.22, 0.22); this.noiseBurst(0.18, 'lowpass', 900, 100, 0.55); },
  thud() { this.noiseBurst(0.25, 'lowpass', 400, 60, 0.5); },
  pickup() { this.tone('sine', 660, 990, 0.12, 0.25); this.tone('sine', 990, 1320, 0.14, 0.2, 0.08); },
  drum() { for (let i = 0; i < 3; i++) { this.tone('sine', 95, 38, 0.4, 0.9, i * 0.3); this.noiseBurst(0.1, 'lowpass', 300, 80, 0.4, 1, i * 0.3); } },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.25, i * 0.12)); },
  empty() { this.tone('square', 300, 240, 0.05, 0.1); },
  // ---- 位置つきの音：距離で小さく・遠いほどこもる・左右に振る ----
  at(p, R = 50, vol = 1) {
    const c = this.ctx; if (!c) return null;
    const dx = p.x - player.pos.x, dy = (p.y || 0) - (player.pos.y + 1.5), dz = p.z - player.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > R) return null;
    const k = clamp(1 - d / R, 0, 1), g = c.createGain(); g.gain.value = (k * k * 0.92 + 0.06) * vol;
    let out = g;
    if (c.createStereoPanner) {
      const pn = c.createStereoPanner(); pn.pan.value = clamp((dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / (d || 1), -1, 1) * 0.85;
      g.connect(pn); pn.connect(this.master);
    } else g.connect(this.master);
    if (d > 14) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(9000 - d * 140, 900, 9000); f.connect(g); out = f; }
    return out;
  },
  twangAt(p) { const o = this.at(p, 75, 0.9); if (!o) return; this.tone('triangle', 180 + Math.random() * 50, 72, 0.32, 0.4, 0, o); this.noiseBurst(0.12, 'bandpass', 2400, 700, 0.2, 2, 0, o); },
  whoosh(p, d) {   // 近くを矢がかすめる「ひゅっ」
    const o = this.at(p, 10, 1.4); if (!o) return; const g = clamp(0.55 - d * 0.1, 0.15, 0.55);
    this.noiseBurst(0.3, 'bandpass', 2800, 520, g, 2.4, 0, o); this.noiseBurst(0.16, 'highpass', 5200, 2600, g * 0.35, 0.7, 0, o);
  },
  impactGround(p) { const o = this.at(p, 40); if (!o) return; this.tone('sine', 150, 55, 0.1, 0.35, 0, o); this.noiseBurst(0.14, 'lowpass', 900, 120, 0.3, 1, 0, o); this.noiseBurst(0.2, 'bandpass', 3200, 1600, 0.05, 1, 0.02, o); },
  impactBamboo(p) { const o = this.at(p, 45); if (!o) return; this.tone('triangle', 640, 600, 0.12, 0.26, 0, o); this.tone('triangle', 955, 900, 0.09, 0.16, 0, o); this.noiseBurst(0.05, 'bandpass', 1300, 1100, 0.25, 8, 0, o); },
  impactWood(p) { const o = this.at(p, 45); if (!o) return; this.tone('sine', 230, 150, 0.09, 0.45, 0, o); this.noiseBurst(0.05, 'bandpass', 800, 500, 0.3, 3, 0, o); },
  // 矢が体に刺さる「ズブッ」：鈍い打撃（低い正弦の急降下）＋布越しの柔らかい「どすっ」（こもった雑音）。湿った音・生々しい音は使わない
  arrowFlesh(p, near = false) {
    const o = near ? this.master : this.at(p, 50, 1.15); if (!o) return;
    const v = near ? 0.9 : 1;
    this.noiseBurst(0.035, 'bandpass', 1400, 700, 0.22 * v, 1.8, 0, o);        // ズ：当たった瞬間の短い擦れ
    this.tone('sine', 150, 52, 0.11, 0.62 * v, 0.004, o);                      // ブッ：鈍い打撃
    this.tone('triangle', 92, 48, 0.09, 0.22 * v, 0.006, o);
    this.noiseBurst(0.13, 'lowpass', 650, 110, 0.42 * v, 0.6, 0.01, o);       // 柔らかい「どすっ」
  },
  // 矢がそばをかすめる「ヒュンッ」：帯域雑音の中心周波数を高→低へ落とす（ドップラー風）。近いほど大きく、通った側へ振る
  flyby(pan, k) {
    const c = this.ctx; if (!c || (this.fbN || 0) >= 4) return;
    this.fbN = (this.fbN || 0) + 1; setTimeout(() => { this.fbN--; }, 380);
    const t = c.currentTime, g = c.createGain(); g.gain.value = 0.25 + 0.75 * k * k;
    if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1); g.connect(pn); pn.connect(this.master); } else g.connect(this.master);
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 1;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3.2;
    f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.07); f.frequency.exponentialRampToValueAtTime(650, t + 0.3);
    const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.75, t + 0.06); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    s.connect(f); f.connect(e); e.connect(g); s.start(t); s.stop(t + 0.36);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.06); o.frequency.exponentialRampToValueAtTime(520, t + 0.28);   // かすかな笛鳴り
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05, t + 0.05); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.32);
  },
  impactBody(p) { const o = this.at(p, 45); if (!o) return; this.tone('sine', 115, 55, 0.16, 0.5, 0, o); this.noiseBurst(0.1, 'lowpass', 500, 90, 0.35, 0.7, 0, o); },
  step(wood, vol = 1, p = null) {   // 足音：土（ざっ）／木の床（とん）
    const o = p ? this.at(p, 16, vol) : this.master; if (!o) return; const v = p ? 1 : vol;
    if (wood) { this.tone('sine', 150 + Math.random() * 30, 95, 0.06, 0.2 * v, 0, o); this.noiseBurst(0.04, 'bandpass', 600, 400, 0.08 * v, 2, 0, o); }
    else { this.noiseBurst(0.08, 'lowpass', 1100 + Math.random() * 300, 180, 0.13 * v, 0.8, 0, o); this.noiseBurst(0.06, 'bandpass', 2800, 1800, 0.03 * v, 1, 0.01, o); }
  },
  // ---- 遠くの合戦の気配：ざわめき・遠くの弓弦の一斉射・「かかれー！」（太鼓は使わない） ----
  amb: { bed: null, volT: 4, shoutT: 10, combat: 0 },
  farOut() {
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = rand(-0.8, 0.8); f.connect(pn); pn.connect(this.master); } else f.connect(this.master);
    return f;
  },
  ambience(dt, playing, combat) {
    const c = this.ctx; if (!c) return; const A = this.amb;
    if (!A.bed) {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); A.bed = g;
    }
    A.combat += ((playing && combat ? 1 : 0) - A.combat) * Math.min(1, dt * 0.5);
    // 機内：エンジンと空調の低い唸り（遠くの合戦の気配は鳴らさない）
    const pl = typeof PLANE !== 'undefined' && PLANE.on;
    if (pl && !A.hum) {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170; f.Q.value = 0.7;
      const f2 = c.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 95; f2.gain.value = 8;
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(f2); f2.connect(g); g.connect(this.master); s.start(); A.hum = g;
    }
    if (A.hum) A.hum.gain.setTargetAtTime(pl && playing ? 0.42 : pl && state === 'title' ? 0.25 : 0, c.currentTime, 0.6);
    A.bed.gain.setTargetAtTime(playing ? (pl ? 0.006 : 0.01 + A.combat * 0.03) : 0, c.currentTime, 0.5);
    if (!playing || !combat || pl) return;
    if ((A.volT -= dt) <= 0) {
      A.volT = rand(5, 11); const n = 4 + (Math.random() * 5 | 0);
      for (let i = 0; i < n; i++) { const dl = Math.random() * 1.3, k = rand(0.03, 0.07), o = this.farOut(); this.tone('triangle', 180 + Math.random() * 60, 70, 0.3, k, dl, o); this.noiseBurst(0.1, 'bandpass', 2000, 700, k * 0.5, 2, dl, o); }
    }
    if ((A.shoutT -= dt) <= 0) {
      A.shoutT = rand(16, 30);
      const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra.command;
      if (L && L.length) VoicePack.play(L[(Math.random() * L.length) | 0].files[0], 52, 0, rand(0.94, 1.06));
    }
  },
  // ---- 笛（本陣の笛役の娘から聞こえる）：行進風の旋律。戦闘中は速く強く、波の合間はゆったり ----
  fl: { out: null, pan: null, lp: null, next: 0, idx: 0 },
  // 陽音階（D E G A B）。[半音（D5 基準）, 拍]
  FLUTE_MEL: [[7, 1], [7, .5], [9, .5], [7, 1], [5, 1], [2, 1], [0, 1], [2, 2], [5, 1], [7, 1], [9, 1], [12, 1], [9, 2], [7, 2],
              [12, 1], [12, .5], [14, .5], [12, 1], [9, 1], [7, 1], [9, .5], [7, .5], [5, 1], [2, 1], [0, 1], [2, 1], [5, 1], [7, 1], [5, 2], [null, 2]],
  fluteNote(f, t, dur, vel) {
    const c = this.ctx, F = this.fl;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = 0.12;
    const vib = c.createOscillator(); vib.frequency.value = 5.3; const vg = c.createGain();
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.max(0.05, dur * 0.7)); vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.035);
    g.gain.setValueAtTime(vel * 0.85, t + Math.max(0.05, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;   // 息の音
    const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f; bf.Q.value = 6;
    const bg = c.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(vel * 0.1, t + 0.09); bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(F.out); s.connect(bf); bf.connect(bg); bg.connect(F.out);
    for (const n of [o, o2, vib]) { n.start(t); n.stop(t + dur + 0.05); } s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  flute(pos, combat) {
    const c = this.ctx; if (!c) return; const F = this.fl;
    if (!F.out) {
      F.out = c.createGain(); F.out.gain.value = 0; F.lp = c.createBiquadFilter(); F.lp.type = 'lowpass'; F.lp.frequency.value = 8000;
      F.out.connect(F.lp);
      if (c.createStereoPanner) { F.pan = c.createStereoPanner(); F.lp.connect(F.pan); F.pan.connect(this.master); } else F.lp.connect(this.master);
    }
    const now = c.currentTime;
    if (pos === false) { F.out.gain.setTargetAtTime(0, now, 0.3); F.next = 0; F.idx = 0; return; }   // タイトル・一時停止など
    // 戦の最中は笛が途切れない：笛役の娘がいれば彼女の位置から（近いほど大きく）、倒れていれば遠くの味方の笛として小さく続く
    // （距離で小さくなりすぎないよう下限 0.08。声の再生・会話の中断とは別の経路なので、声が止まっても笛は止まらない）
    const dx = pos ? pos.x - player.pos.x : 0, dz = pos ? pos.z - player.pos.z : 60, d = pos ? Math.hypot(dx, dz) : 90, k = clamp(1 - d / 90, 0, 1);
    F.out.gain.setTargetAtTime(((pos ? 0.08 : 0.13) + k * k * 0.36) * (combat ? 1 : 0.75), now, 0.2);   // 笛役が倒れたあとも聞き取れる大きさ
    F.lp.frequency.setTargetAtTime(clamp(9000 - d * 90, 2200, 9000), now, 0.2);
    if (F.pan) F.pan.pan.setTargetAtTime(pos ? clamp((dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / (d || 1), -1, 1) * 0.8 : 0, now, 0.1);
    if (F.next > now + 2) F.next = now + 0.05;   // 止まっていた時計（一時停止・タブ切替）からの復帰
    const beat = 60 / (combat ? 138 : 84);
    if (F.next < now) F.next = now + 0.05;
    while (F.next < now + 0.3) {
      const [n, b] = this.FLUTE_MEL[F.idx]; F.idx = (F.idx + 1) % this.FLUTE_MEL.length;
      const dur = b * beat;
      if (n !== null) this.fluteNote(587.33 * Math.pow(2, n / 12), F.next, dur * (combat ? 0.88 : 0.95), combat ? 0.32 : 0.22);
      F.next += dur;
    }
  },
  // 機内のチャイム「ポーン」（奇襲の時は二度、少し高く）
  chime(alert) {
    const c = this.ctx; if (!c) return;
    const n = alert ? [[1175, 0], [988, 0.32], [1175, 0.64], [988, 0.96]] : [[880, 0], [698.5, 0.45]];
    for (const [f, d] of n) { this.tone('sine', f, f * 0.998, 1.4, 0.16, d); this.tone('sine', f * 2, f * 2, 0.6, 0.03, d); }
  },
  // 波の開始の合図（太鼓の代わりに笛の短い呼び）
  fluteCall() {
    const c = this.ctx; if (!c || !this.fl.out) return; const t = c.currentTime + 0.05;
    [[7, .15], [9, .15], [12, .5]].reduce((tt, [n, d]) => { this.fluteNote(587.33 * Math.pow(2, n / 12), tt, d, 0.4); return tt + d; }, t);
  },
};

// ---- 音が消えないように：AudioContext が止まっていたら（タブ切替・スマホの割り込み・自動再生の制限）入力や画面の復帰のたびに再開。
//      声の出口（VoicePack.out）と全体（master）の音量が 0 のまま残っていたら戻す
const AudioGuard = {
  t: 0, resumes: 0, fixes: 0,
  kick() { const c = Sfx.ctx; if (c && c.state !== 'running' && c.state !== 'closed') { c.resume().then(() => { this.resumes++; }, () => {}); } },
  tick(dt) {
    if ((this.t -= dt) > 0) return; this.t = 1;
    this.kick();
    if (Sfx.master && Sfx.master.gain.value < 0.49) { Sfx.master.gain.cancelScheduledValues(0); Sfx.master.gain.value = 0.5; this.fixes++; }
    if (VoicePack.out && VoicePack.out.gain.value < 0.99) { VoicePack.out.gain.cancelScheduledValues(0); VoicePack.out.gain.value = 1; this.fixes++; }
    VoicePack.reap();
  },
  state() { const c = Sfx.ctx, F = Sfx.fl; return { ctx: c ? c.state : 'none', t: c ? +c.currentTime.toFixed(1) : 0, flute: F.out ? +F.out.gain.value.toFixed(3) : -1, voices: VoicePack.active.length,
    stats: Object.assign({}, VoicePack.stats), bufs: Object.values(VoicePack.buf).filter(Boolean).length, queue: VoicePack.q.length, resumes: this.resumes, fixes: this.fixes,
    speech: Voice.ok ? speechSynthesis.speaking : null }; },
};
for (const ev of ['pointerdown', 'keydown', 'touchstart', 'touchend', 'focus', 'pageshow']) addEventListener(ev, () => AudioGuard.kick(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) AudioGuard.kick(); });

// ====================================================================
//  ボイス (Web Speech API)
// ====================================================================
// 優先度: 0=見つけた/攻撃/被弾（混んでいたら省略）, 1=号令, 2=戦死判定の台詞（低優先の発話を打ち切って話す）
const Voice = {
  voice: null, ok: 'speechSynthesis' in window, prio: 0, lastLow: 0,
  pick() {
    if (!this.ok) return;
    const vs = speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang));
    const fem = /female|女性|kyoko|haruka|nanami|ayumi|mizuki|o-ren|sayaka|aoi|mayu|nozomi|google 日本語/i;
    this.voice = vs.find(v => fem.test(v.name)) || vs[0] || null;
  },
  say(text, prof, prio = 0) {
    if (!this.ok || !text) return;
    const now = performance.now();
    if ((speechSynthesis.speaking || speechSynthesis.pending) && this.since && now - this.since > 9000) { speechSynthesis.cancel(); this.prio = 0; this.since = 0; }   // Chrome で発話が止まったまま「話し中」になる不具合の回避
    const busy = speechSynthesis.speaking || speechSynthesis.pending;
    if (prio >= 2) {
      if (speechSynthesis.pending && this.prio >= 2) return;
      if (busy && this.prio < 2) speechSynthesis.cancel();
    } else {
      if (busy || now - this.lastLow < 700) return;
      this.lastLow = now;
    }
    if (!this.voice) this.pick();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; if (this.voice) u.voice = this.voice;
    u.pitch = clamp(prof.pitch, 0.1, 2); u.rate = clamp(prof.rate, 0.5, 2); u.volume = 1;
    u.onend = u.onerror = () => { this.prio = 0; this.since = 0; };
    this.prio = prio; Talk.ws = Talk.cur; this.since = now;
    speechSynthesis.speak(u);
  },
};
if (Voice.ok) { Voice.pick(); speechSynthesis.onvoiceschanged = () => Voice.pick(); }
// ---- 誰が話しているか：話している娘が撃たれたら、その娘の声・字幕をすぐ止める ----
const Talk = {
  cur: null, srcs: [], ws: null, sub: null, subT: 0,
  as(e, fn) { const o = this.cur; this.cur = e || null; try { return fn(); } finally { this.cur = o; } },
  track(src) { if (!this.cur) return; const o = { src, owner: this.cur }; this.srcs.push(o); src.addEventListener('ended', () => { const i = this.srcs.indexOf(o); if (i >= 0) this.srcs.splice(i, 1); }); },
  speaking(e) { return !!e && (this.srcs.some(o => o.owner === e) || (this.sub === e && performance.now() < this.subT) || (this.ws === e && Voice.ok && speechSynthesis.speaking)); },
  hush(e) {
    if (!e) return;
    for (const o of this.srcs) if (o.owner === e) { try { o.src.stop(); } catch (_) {} }
    this.srcs = this.srcs.filter(o => o.owner !== e);
    if (this.ws === e && Voice.ok) { speechSynthesis.cancel(); this.ws = null; Voice.prio = 0; }
    if (this.sub === e) { this.sub = null; const el = document.getElementById('subtitle'); if (el) el.style.opacity = 0; const s2 = document.getElementById('secsay'); if (s2) s2.textContent = ''; }
  },
};
// ---- 収録済みボイス：edge-tts（ja-JP-NanamiNeural）で事前生成した mp3（assets/voices/、目録は voices.js）
//   WebAudio で再生し、距離で音量を変える。ファイルが無い・file:// で開いた時は Web Speech にフォールバック。
const VV_RATE = [0.965, 1.0, 1.035];   // 侍女ごとの声の高さ・速さの個体差（控えめ）
const VoicePack = {
  man: window.VOICE_MANIFEST || null, buf: {}, loading: {}, playing: 0, lastLow: 0, ok: false, out: null,
  // 声の同時再生は MAXV 本まで（チャンネルの取り合いは優先度：戦死判定・会話 > 近い声 > 遠い声。いっぱいなら一番低いものを止めて入れ替える）
  active: [], MAXV: 5, stats: { req: 0, played: 0, skipped: 0, stolen: 0, failed: 0 }, q: [], inflight: 0,
  score(prio, dist, conv) { return prio * 100 + (conv ? 150 : 0) - dist; },
  reap() { const t = Sfx.ctx ? Sfx.ctx.currentTime : 0; this.active = this.active.filter(a => !a.done && t < a.end + 1); this.playing = this.active.length; },
  add(src, prio, dist, conv, dur, t0) {
    const a = { src, sc: this.score(prio, dist, conv), end: (t0 || Sfx.ctx.currentTime) + dur, done: false };
    this.active.push(a); this.playing = this.active.length;
    src.addEventListener('ended', () => { a.done = true; this.reap(); });
    return a;
  },
  // 空きを作る：入れられるなら true
  room(prio, dist, conv) {
    this.reap();
    if (this.active.length < this.MAXV) return true;
    const sc = this.score(prio, dist, conv); let lo = null;
    for (const a of this.active) if (!lo || a.sc < lo.sc) lo = a;
    if (lo && sc > lo.sc + 20) { try { lo.src.stop(); } catch (_) {} lo.done = true; this.stats.stolen++; this.reap(); return true; }
    return false;
  },
  init() {
    this.ok = !!(this.man && Sfx.ctx && /^https?:/.test(location.protocol) && window.fetch);
    if (this.ok && !this.out) { this.out = Sfx.ctx.createGain(); this.out.gain.value = 1; this.out.connect(Sfx.ctx.destination); }
  },
  // 読み込みは同時 6 本まで（数百の mp3 を一度に取りに行くと、スマホでは失敗して無音になることがある）。失敗は一度だけやり直す
  load(fn, urgent) {
    if (fn in this.buf || this.loading[fn]) return;
    this.loading[fn] = true;
    if (urgent) this.q.unshift(fn); else this.q.push(fn);
    this.pump();
  },
  pump() {
    while (this.inflight < 6 && this.q.length) {
      const fn = this.q.shift(); this.inflight++;
      const get = () => fetch('assets/voices/' + fn).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => Sfx.ctx.decodeAudioData(ab, res, rej)));
      get().catch(() => new Promise(r => setTimeout(r, 1500)).then(get))
        .then(b => { this.buf[fn] = b; }, () => { this.buf[fn] = null; this.stats.failed++; })
        .finally(() => { this.inflight--; this.pump(); });
    }
  },
  preload() {
    if (!this.ok) return;
    for (const k in this.man) for (const c in this.man[k]) { if (c.startsWith('call_')) continue; for (const l of this.man[k][c]) for (const f of l.files) this.load(f); }   // 名前呼び（call_）はその娘が出たときに読む
  },
  // true = 収録音声で処理した（再生した・混雑で省略した）／false = フォールバックが必要
  play(fn, dist, prio, rate = 1) {
    if (!this.ok || !fn) return false;
    const b = this.buf[fn];
    if (b === null) return false;
    this.stats.req++;
    if (b === undefined) { this.load(fn, true); return prio < 2; }
    const now = performance.now(), conv = !!Talk.cur && (menuOpen || prio >= 1) && dist < 12;
    const k = clamp(1 - dist / 60, 0.12, 1);
    if (prio < 2 && !conv) {
      if (now - this.lastLow < 450 || k < 0.15) { this.stats.skipped++; return true; }
    }
    if (!this.room(prio, dist, conv)) { this.stats.skipped++; return true; }
    if (prio < 2 && !conv) this.lastLow = now;
    AudioGuard.kick();
    const c = Sfx.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = b; g.gain.value = 1.15 * k * k + 0.05;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * 0.03);   // ±3% の揺らぎ
    src.connect(g); g.connect(this.out);
    this.add(src, prio, dist, conv, b.duration / src.playbackRate.value); Talk.track(src);
    src.start(); this.stats.played++;
    return true;
  },
  say(pers, kind, i, vv, dist, prio) {
    const L = this.man && this.man[pers] && this.man[pers][kind];
    const ent = L && L[i];
    if (!ent) return false;
    // 言い方の揺れ（3通り）から毎回選ぶ。声の個性は再生速度の個体差（vv）で付ける
    return this.play(ent.files[(Math.random() * ent.files.length) | 0], dist, prio, VV_RATE[vv] || 1);
  },
  extra(kind, i) {
    const L = this.man && this.man._extra && this.man._extra[kind];
    return !!(L && L[i]) && this.play(L[i].files[0], 0, 1);
  },
};

// ====================================================================
//  three.js 基本
// ====================================================================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const FOG = 0xd9d4c4;
scene.fog = new THREE.Fog(FOG, 35, 200);
scene.background = new THREE.Color(FOG);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1200);
camera.rotation.order = 'YXZ';
const hemiL = new THREE.HemisphereLight(0xeaf2ff, 0x55603a, 1.6); scene.add(hemiL);
const ambL = new THREE.AmbientLight(0xffffff, 0.75); scene.add(ambL);   // 3D の侍女の陰が真っ黒にならないように
const sun = new THREE.DirectionalLight(0xfff0d0, 2.2); sun.position.set(60, 120, 30); scene.add(sun);

// 空
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4f7fb8) }, mid: { value: new THREE.Color(0xa9c3dc) }, bot: { value: new THREE.Color(FOG) } },
  vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top,mid,bot; varying vec3 vp; void main(){ float h=vp.y; vec3 c = h>0.0 ? mix(mid, top, smoothstep(0.0,0.5,h)) : bot; c = mix(bot, c, smoothstep(-0.02,0.12,h)); gl_FragColor=vec4(c,1.0); }',
}));
sky.renderOrder = -1; scene.add(sky);

// ---- テクスチャ生成ヘルパ ----
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4; return t;
}
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#7a8a45'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const l = rand(-28, 28);
    g.fillStyle = `rgb(${122 + l | 0},${138 + l | 0},${70 + l * .6 | 0})`;
    g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(2, 6));
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(150,130,80,.18)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, rand(6, 22), 0, 7); g.fill(); }
}, 90);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ map: grassTex }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
// 街道
const roadTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#a08b63'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const l = rand(-25, 25); g.fillStyle = `rgb(${160 + l | 0},${139 + l | 0},${99 + l | 0})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(2, 60);
const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 400), new THREE.MeshLambertMaterial({ map: roadTex }));
road.rotation.x = -Math.PI / 2; road.position.set(8, 0.01, -60); road.rotation.z = 0.12; scene.add(road);

// ---- 風景（ステージごとに stageRoot に作り直す） ----
const stageRoot = new THREE.Group(); scene.add(stageRoot);
const colliders = [];   // {x,z,r}  プレイヤーのみ衝突
const flags = [];
const M = {
  trunk: new THREE.MeshLambertMaterial({ color: 0x5a3d26 }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x2f5a2c }),
  leaf2: new THREE.MeshLambertMaterial({ color: 0x3d6b33 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x7a5a38 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x8a8a84, flatShading: true }),
  pole: new THREE.MeshLambertMaterial({ color: 0x2b2118 }),
};
const G = {
  trunk: new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6),
  cone: new THREE.ConeGeometry(1.6, 2.6, 7),
  post: new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5),
  stake: new THREE.ConeGeometry(0.09, 0.5, 5),
  rail: new THREE.BoxGeometry(1, 0.1, 0.1),
  rock: new THREE.DodecahedronGeometry(1, 0),
  pole: new THREE.CylinderGeometry(0.05, 0.06, 5.5, 6),
};
function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(G.trunk, M.trunk); t.position.y = 1.2; g.add(t);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(G.cone, i % 2 ? M.leaf2 : M.leaf);
    c.position.y = 2.4 + i * 1.15; c.scale.setScalar(1 - i * 0.25); g.add(c);
  }
  g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = Math.random() * 6; stageRoot.add(g);
  colliders.push({ x, z, r: 0.5 * s });
}
function rock(x, z, s = 1) {
  const r = new THREE.Mesh(G.rock, M.rock); r.position.set(x, s * 0.35, z);
  r.scale.set(s * rand(.8, 1.3), s * rand(.5, .8), s * rand(.8, 1.3)); r.rotation.y = Math.random() * 6; stageRoot.add(r);
  colliders.push({ x, z, r: s * 1.0 });
}
// 馬防柵
function fence(x, z, len, ang) {
  const g = new THREE.Group(); const n = Math.max(2, Math.round(len / 1.4));
  for (let i = 0; i <= n; i++) {
    const px = -len / 2 + len * i / n;
    const p = new THREE.Mesh(G.post, M.wood); p.position.set(px, 1.1, 0); g.add(p);
    const s = new THREE.Mesh(G.stake, M.wood); s.position.set(px, 2.45, 0); g.add(s);
  }
  for (const y of [0.7, 1.6]) { const r = new THREE.Mesh(G.rail, M.wood); r.scale.x = len; r.position.y = y; g.add(r); }
  g.position.set(x, 0, z); g.rotation.y = ang; stageRoot.add(g);
}
// 幟（のぼり）
const bannerTexCache = {};
function bannerTex(bg, fg, ch) {
  const key = bg + fg + ch; if (bannerTexCache[key]) return bannerTexCache[key];
  const t = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.fillRect(0, 0, w, 14);
    g.beginPath(); g.arc(w / 2, 52, 22, 0, 7); g.lineWidth = 5; g.strokeStyle = fg; g.stroke();
    g.beginPath(); g.arc(w / 2, 52, 9, 0, 7); g.fillStyle = fg; g.fill();
    g.font = 'bold 44px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...ch].forEach((c, i) => g.fillText(c, w / 2, 112 + i * 50));
  });
  return bannerTexCache[key] = t;
}
function nobori(x, z, bg, fg, ch) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(G.pole, M.pole); p.position.y = 2.75; g.add(p);
  const geo = new THREE.PlaneGeometry(0.8, 3.2, 1, 6); geo.translate(0.42, 0, 0);
  const b = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: bannerTex(bg, fg, ch), side: THREE.DoubleSide }));
  b.position.y = 3.7; g.add(b);
  g.position.set(x, 0, z); g.rotation.y = rand(-0.5, 0.5); stageRoot.add(g);
  flags.push({ mesh: b, ph: Math.random() * 6, base: g.rotation.y });
  return g;
}
// 陣幕
const makuTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d1d24'; g.fillRect(0, 40, w, 46);
  for (const cx of [w * .25, w * .75]) {
    g.beginPath(); g.arc(cx, 63, 34, 0, 7); g.fillStyle = '#f2efe6'; g.fill();
    g.beginPath(); g.arc(cx, 63, 24, 0, 7); g.lineWidth = 6; g.strokeStyle = '#1d1d24'; g.stroke();
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx + Math.cos(k * 2.09) * 9, 63 + Math.sin(k * 2.09) * 9, 6, 0, 7); g.fillStyle = '#1d1d24'; g.fill(); }
  }
});
function maku(x, z, len, ang) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.8), new THREE.MeshLambertMaterial({ map: makuTex, side: THREE.DoubleSide }));
  m.position.set(x, 1.25, z); m.rotation.y = ang; stageRoot.add(m);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(G.post, M.pole);
    p.position.set(x + Math.cos(ang) * s * len / 2, 1.1, z - Math.sin(ang) * s * len / 2); stageRoot.add(p);
  }
}
// 遠景の山
const mountains = [];
const mtMat = new THREE.MeshBasicMaterial({ color: 0x8c9db0, fog: false });
const mtMat2 = new THREE.MeshBasicMaterial({ color: 0xa6b4c2, fog: false });
for (let i = 0; i < 26; i++) {
  const a = i / 26 * Math.PI * 2 + rand(-.1, .1), r = rand(520, 640), h = rand(60, 150);
  const m = new THREE.Mesh(new THREE.ConeGeometry(rand(90, 160), h, 6), i % 2 ? mtMat : mtMat2);
  m.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r); m.renderOrder = 0; scene.add(m); mountains.push(m);
}
// 竹林（遮蔽物。矢を防ぎ、慎重な侍女が身を隠す）
const covers = [];
const bambooStalks = [], bambooLeaves = [];
function bambooGrove(x, z, r) {
  const n = Math.round(r * r * 2.6 + 8);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * r;
    const h = rand(5.5, 9);
    bambooStalks.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, h, s: rand(0.8, 1.3), c: rand(0.85, 1.1) });
    for (let k = 0; k < 2; k++) bambooLeaves.push({ x: x + Math.cos(a) * d + rand(-.6, .6), y: h - rand(0.3, 2.2), z: z + Math.sin(a) * d + rand(-.6, .6), s: rand(0.6, 1.1) });
  }
  covers.push({ x, z, r, type: 'grove', h: 7.5 });
  colliders.push({ x, z, r: r * 0.75 });
}
function finishBamboo() {
  const geo = new THREE.CylinderGeometry(0.055, 0.07, 1, 6); geo.translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), bambooStalks.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  bambooStalks.forEach((b, i) => {
    e.set(rand(-0.05, 0.05), 0, rand(-0.05, 0.05)); q.setFromEuler(e);
    m4.compose(new V3(b.x, 0, b.z), q, new V3(b.s, b.h, b.s)); im.setMatrixAt(i, m4);
    im.setColorAt(i, col.setRGB(0.42 * b.c, 0.62 * b.c, 0.28 * b.c));
  });
  stageRoot.add(im);
  const lg = new THREE.IcosahedronGeometry(1, 0);
  const lm = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0x4f7a32, flatShading: true }), bambooLeaves.length);
  bambooLeaves.forEach((l, i) => { m4.compose(new V3(l.x, l.y, l.z), q.identity(), new V3(l.s * 1.2, l.s * 0.45, l.s * 1.2)); lm.setMatrixAt(i, m4); });
  stageRoot.add(lm);
  bambooStalks.length = 0; bambooLeaves.length = 0;
}
function buildPlains() {
  // 竹林を中盤に配置
  for (let tries = 0, made = 0; made < 18 && tries < 400; tries++) {
    const a = rand(0, 6.283), r = rand(14, 95), x = Math.cos(a) * r, z = Math.sin(a) * r * 1.1 - 10;
    if (Math.abs(x - 8 - (z + 60) * 0.12) < 7) continue;            // 街道
    if (z > 8 && Math.abs(x) < 14) continue;                          // 自陣
    if (Math.hypot(x, z) < 12) continue;                              // 開始地点
    if (covers.some(c => Math.hypot(c.x - x, c.z - z) < 14)) continue;
    bambooGrove(x, z, rand(2.2, 3.8)); made++;
  }
  finishBamboo();
  // 自陣（後方）
  // 本陣（陣幕で囲み、前に入口を空ける）
  maku(-4, 22, 4, 0); maku(4, 22, 4, 0); maku(-6, 28, 12, Math.PI / 2); maku(6, 28, 12, Math.PI / 2); maku(0, 34, 12, 0);
  buildHQ(-6, 6, 22, 34, 0, 31);
  buildMedPost(3.6, 29.5, 'blue'); buildMedPost(0, -74, 'orange');
  for (let i = -2; i <= 2; i++) nobori(i * 3, 18, '#1f5fb8', '#f4f1e8', i % 2 ? '青組' : '必勝');
  // 敵陣（前方）
  for (let i = 0; i < 16; i++) nobori(rand(-50, 50), rand(-130, -85), '#d9741c', '#fff6e8', pick(['橙組', '必勝', '勝鬨', '一番']));
  for (let i = 0; i < 8; i++) nobori(rand(-120, 120), rand(-60, 60), pick(['#2d5a3a', '#6b4a1f', '#4a2d6b']), '#f4f1e8', pick(['八幡', '一番', '先陣']));
  // 馬防柵
  for (let i = -3; i <= 3; i++) if (i !== 0) fence(i * 14 + rand(-2, 2), -32 + rand(-3, 3), 10, rand(-0.15, 0.15));
  fence(-30, 10, 12, Math.PI / 2 + 0.1); fence(32, 4, 12, Math.PI / 2 - 0.1);
  // 木々・岩
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(35, CFG.field + 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z) < 140 && Math.abs(x - 8) < 6) continue; // 街道を避ける
    if (covers.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue;
    tree(x, z, rand(0.8, 1.6));
  }
  for (let i = 0; i < 12; i++) { const a = rand(0, 6.28), r = rand(8, 30); if (covers.some(c => Math.hypot(c.x - (Math.cos(a) * r + 30), c.z - (Math.sin(a) * r - 10)) < c.r + 2)) continue; tree(Math.cos(a) * r + 30, Math.sin(a) * r - 10, rand(.8, 1.3)); }
  for (let i = 0; i < 30; i++) { const x = rand(-120, 120), z = rand(-120, 120); if (!covers.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2) && Math.hypot(x, z) > 6) rock(x, z, rand(0.4, 1.4)); }
}

// ====================================================================
//  ステージ「櫃の戦い」：木の砦壁（門つき）と二基の櫃（やぐら）
//   青組は砦の内側。櫃の上と壁の内側の足場（武者走り）に弓兵が陣取る。
//   橙組は門の外から、竹束を盾にして波状に攻め寄せる。
// ====================================================================
const boxes = [];    // 当たり箱 {x0,x1,z0,z1,y0,y1}：プレイヤー・地上のNPC・矢を止める
const floors = [];   // 乗れる床 {x0,x1,z0,z1,y}
const ladders = [];  // はしご {x0,x1,z0,z1,y0,y1}
const perches = [];  // 高所の射撃位置 {x,z,y,face,taken}
let fortGate = null; // {x, zOut, zIn}
const WOOD = new THREE.MeshLambertMaterial({ color: 0x8a6440 });
const WOOD_D = new THREE.MeshLambertMaterial({ color: 0x5e4129 });
const WOOD_L = new THREE.MeshLambertMaterial({ color: 0xa47c52 });
function boxMesh(x0, x1, y0, y1, z0, z1, mat, solid = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); stageRoot.add(m);
  if (solid) boxes.push({ x0, x1, z0, z1, y0, y1 });
  return m;
}
const logGeo = new THREE.CylinderGeometry(0.17, 0.19, 1, 7); logGeo.translate(0, 0.5, 0);
const tipGeo = new THREE.ConeGeometry(0.18, 0.4, 7); tipGeo.translate(0, 0.2, 0);
// 丸太の柵壁（x0→x1 方向、z 固定）。見た目は丸太、当たりは箱
function palisadeX(x0, x1, z, h) {
  const n = Math.round((x1 - x0) / 0.36);
  const logs = new THREE.InstancedMesh(logGeo, WOOD, n), tips = new THREE.InstancedMesh(tipGeo, WOOD_D, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * (x1 - x0) / n, hh = h + rand(-0.15, 0.15);
    m4.compose(new V3(x, 0, z + rand(-0.04, 0.04)), q, new V3(1, hh, 1)); logs.setMatrixAt(i, m4);
    logs.setColorAt(i, col.setScalar(rand(0.85, 1.1)));
    m4.compose(new V3(x, hh, z), q, new V3(1, 1, 1)); tips.setMatrixAt(i, m4);
  }
  stageRoot.add(logs); stageRoot.add(tips);
  boxes.push({ x0, x1, z0: z - 0.22, z1: z + 0.22, y0: 0, y1: h });
}
function palisadeZ(z0, z1, x, h) {
  const n = Math.round((z1 - z0) / 0.36);
  const logs = new THREE.InstancedMesh(logGeo, WOOD, n), tips = new THREE.InstancedMesh(tipGeo, WOOD_D, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const z = z0 + (i + 0.5) * (z1 - z0) / n, hh = h + rand(-0.15, 0.15);
    m4.compose(new V3(x, 0, z), q, new V3(1, hh, 1)); logs.setMatrixAt(i, m4);
    m4.compose(new V3(x, hh, z), q, new V3(1, 1, 1)); tips.setMatrixAt(i, m4);
  }
  stageRoot.add(logs); stageRoot.add(tips);
  boxes.push({ x0: x - 0.22, x1: x + 0.22, z0, z1, y0: 0, y1: h });
}
function ladder(x, z0, z1, y1) {   // z0..z1 の奥行きに立てかけた梯子（x 中心）
  const zc = (z0 + z1) / 2;
  for (const s of [-1, 1]) boxMesh(x + s * 0.32 - 0.04, x + s * 0.32 + 0.04, 0, y1 + 1.0, zc - 0.04, zc + 0.04, WOOD_D, false);
  for (let y = 0.35; y < y1 + 0.9; y += 0.35) boxMesh(x - 0.32, x + 0.32, y - 0.03, y + 0.03, zc - 0.03, zc + 0.03, WOOD_L, false);
  ladders.push({ x0: x - 0.6, x1: x + 0.6, z0, z1, y0: 0, y1 });
}
// 櫃（やぐら）：中心(cx,cz)、床の高さ Y、梯子は後ろ（+Z 側）
function yagura(cx, cz, Y) {
  const S = 2.5, T = 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * (S - 0.2), z = cz + sz * (S - 0.2);
    boxMesh(x - 0.17, x + 0.17, 0, Y + 3.6, z - 0.17, z + 0.17, WOOD_D);
  }
  // 筋交い
  for (const sz of [-1, 1]) for (const y of [1.8, 4.0]) boxMesh(cx - S, cx + S, y - 0.08, y + 0.08, cz + sz * (S - 0.2) - 0.06, cz + sz * (S - 0.2) + 0.06, WOOD, false);
  for (const sx of [-1, 1]) for (const y of [1.8, 4.0]) boxMesh(cx + sx * (S - 0.2) - 0.06, cx + sx * (S - 0.2) + 0.06, y - 0.08, y + 0.08, cz - S, cz + S, WOOD, false);
  // 床
  boxMesh(cx - S, cx + S, Y - 0.22, Y, cz - S, cz + S, WOOD_L);
  floors.push({ x0: cx - S, x1: cx + S, z0: cz - S, z1: cz + S, y: Y });
  // 板壁（胸壁）：前・左右・後ろ（後ろは梯子口を空ける）
  const H = 1.15;
  boxMesh(cx - S, cx + S, Y, Y + H, cz - S, cz - S + T, WOOD);
  boxMesh(cx - S, cx - S + T, Y, Y + H, cz - S, cz + S, WOOD);
  boxMesh(cx + S - T, cx + S, Y, Y + H, cz - S, cz + S, WOOD);
  boxMesh(cx - S, cx - 0.65, Y, Y + H, cz + S - T, cz + S, WOOD);
  boxMesh(cx + 0.65, cx + S, Y, Y + H, cz + S - T, cz + S, WOOD);
  // 屋根
  const roof = new THREE.Mesh(new THREE.ConeGeometry(S * 1.6, 1.6, 4), WOOD_D);
  roof.rotation.y = Math.PI / 4; roof.position.set(cx, Y + 4.3, cz); stageRoot.add(roof);
  ladder(cx, cz + S, cz + S + 0.9, Y);
  for (let i = 0; i < 4; i++) perches.push({ x: cx - 1.65 + i * 1.1, z: cz - S + 0.55, y: Y, taken: null, tower: true });
  nobori(cx + S - 0.3, cz + S - 0.3, '#1f5fb8', '#f4f1e8', '青組').position.y = Y;
}
// ---- 井闌（せいらん）：橙組の攻城櫓。味方の櫓より高い車付きの木の塔で、門の外からゆっくり壁へ近づく。
//      上の床に弓兵 2〜4 人（前と左右は胸壁、狭間の隙間から上半身が出る）。上の弓兵を全員倒すと止まる。
const seirans = [];
const SEIRAN_Y = 8.4, SEIRAN_STOP = -11, SEIRAN_V = 0.16;
const SEIRAN_LANES = [-17, 19];
function seiran(x, z) {
  const Y = SEIRAN_Y, S = 2.3, grp = new THREE.Group(), lb = [];
  const add = (x0, x1, y0, y1, z0, z1, mat, solid) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); grp.add(m);
    if (solid) lb.push({ l: { x0, x1, z0, z1, y0, y1 }, w: { x0, x1, z0, z1, y0, y1 } });
    return m;
  };
  // 台車と車輪
  add(-S - 0.2, S + 0.2, 0.55, 0.85, -S - 0.2, S + 0.2, WOOD_D, false);
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.28, 12); wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo, WOOD_D); w.position.set(sx * (S + 0.32), 0.62, sz * (S - 0.6)); grp.add(w); wheels.push(w);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 1.1), WOOD_L); w.add(hub);
  }
  // 少しすぼまる四本柱と筋交い
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = add(-0.17, 0.17, 0, Y + 0.1, -0.17, 0.17, WOOD_D, false);
    m.position.set(sx * (S - 0.15), Y / 2 + 0.45, sz * (S - 0.15)); m.rotation.set(sz * -0.035, 0, sx * 0.035);
  }
  for (const y of [2.6, 4.9, 7.0]) for (const sz of [-1, 1]) add(-S, S, y - 0.08, y + 0.08, sz * (S - 0.25) - 0.06, sz * (S - 0.25) + 0.06, WOOD, false);
  for (const y of [2.6, 4.9, 7.0]) for (const sx of [-1, 1]) add(sx * (S - 0.25) - 0.06, sx * (S - 0.25) + 0.06, y - 0.08, y + 0.08, -S, S, WOOD, false);
  // 前面（壁の側、+Z）を板で覆う（矢よけ）。横板の継ぎ目を少し色違いに
  for (let y = 0.9; y < Y - 0.2; y += 0.55) {
    const m = add(-S + 0.05, S - 0.05, y, y + 0.5, S - 0.12, S, Math.random() < 0.5 ? WOOD : WOOD_L, false);
    m.rotation.z = rand(-0.01, 0.01);
  }
  lb.push({ l: { x0: -S, x1: S, z0: -S, z1: S, y0: 0, y1: Y - 0.25 }, w: {} });   // 塔の胴：人と矢を止める
  // 上の床と胸壁（前と左右。前は狭間＝凹凸）
  add(-S - 0.15, S + 0.15, Y - 0.25, Y, -S - 0.15, S + 0.15, WOOD_L, false);
  const PH = 0.95;
  add(-S - 0.15, S + 0.15, Y, Y + PH, S, S + 0.15, WOOD, true);
  for (let i = 0; i < 5; i++) { const x = -S + 0.25 + i * (2 * S - 0.5) / 4; add(x - 0.22, x + 0.22, Y + PH, Y + PH + 0.35, S, S + 0.15, WOOD_D, false); }
  for (const sx of [-1, 1]) add(sx * (S + 0.15) - 0.08, sx * (S + 0.15) + 0.08, Y, Y + PH, -S - 0.15, S + 0.15, WOOD, true);
  add(-S - 0.15, S + 0.15, Y + 0.8, Y + 0.9, -S - 0.15, -S - 0.05, WOOD, false);   // 後ろは手すりだけ
  // 皮張りの日除け屋根（柱4本）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * (S - 0.05) - 0.07, sx * (S - 0.05) + 0.07, Y, Y + 2.6, sz * (S - 0.05) - 0.07, sz * (S - 0.05) + 0.07, WOOD_D, false);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2 * S + 0.6, 0.12, 2 * S + 0.6), new THREE.MeshLambertMaterial({ color: 0x6d5236 }));
  roof.position.set(0, Y + 2.65, 0); roof.rotation.x = -0.12; grp.add(roof);
  // 後ろの梯子（飾り）
  for (const s of [-1, 1]) add(s * 0.32 - 0.04, s * 0.32 + 0.04, 0.8, Y, -S - 0.2, -S - 0.12, WOOD_D, false);
  for (let y = 1.1; y < Y; y += 0.4) add(-0.32, 0.32, y - 0.03, y + 0.03, -S - 0.2, -S - 0.13, WOOD_L, false);
  // 幟
  const nb = nobori(0, 0, '#d9741c', '#fff6e8', '井闌'); stageRoot.remove(nb); grp.add(nb); nb.position.set(-S + 0.1, Y + 0.5, -S + 0.1); nb.rotation.y = 0;
  grp.position.set(x, 0, z); stageRoot.add(grp);
  const T = { x, z, z0: z, grp, wheels, lb, perches: [], hp: 0 };
  // 上の床と後ろの梯子：殿も味方の近接兵も上れる（櫃と同じ操作）
  T.floor = { x0: 0, x1: 0, z0: 0, z1: 0, y: Y, seiran: T }; floors.push(T.floor);
  T.lad = { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: Y, F: T.floor, dir: 1, seiran: T }; ladders.push(T.lad);
  for (const L of lb) boxes.push(L.w);
  // 射撃位置：前の胸壁の後ろに 4 か所（波が進むほど埋まる）
  for (let i = 0; i < 4; i++) T.perches.push({ x: 0, z: 0, lx: -1.35 + i * 0.9, lz: S - 0.55, y: Y, taken: null, seiran: T });
  seiranSync(T, 0);
  seirans.push(T);
  return T;
}
function seiranSync(T, dz) {
  T.grp.position.set(T.x, 0, T.z);
  const S = 2.3;
  Object.assign(T.floor, { x0: T.x - S - 0.1, x1: T.x + S + 0.1, z0: T.z - S - 0.1, z1: T.z + S + 0.1 });
  Object.assign(T.lad, { x0: T.x - 0.6, x1: T.x + 0.6, z0: T.z - S - 0.9, z1: T.z - S });
  if (dz) {   // 上や梯子にいる者も一緒に動く
    if (player.pos.y > 0.4 && Math.abs(player.pos.x - T.x) < S + 0.6 && player.pos.z > T.z - S - 1.3 - dz && player.pos.z < T.z + S + 0.4) player.pos.z += dz;
    for (const o of [...enemies, ...bodies]) if (o.onFloor === T.floor || (o.lad && o.lad.L === T.lad && o.lad.ph !== 'go')) { o.s.position.z += dz; o.pz += dz; }
  }
  for (const L of T.lb) { L.w.x0 = T.x + L.l.x0; L.w.x1 = T.x + L.l.x1; L.w.z0 = T.z + L.l.z0; L.w.z1 = T.z + L.l.z1; L.w.y0 = L.l.y0; L.w.y1 = L.l.y1; }
  for (const q of T.perches) {
    q.x = T.x + q.lx; q.z = T.z + q.lz;
    const e = q.taken;
    if (e && e.perch === q) { e.s.position.x = q.x; e.s.position.z = q.z; e.px = q.x; e.pz += dz; }
  }
  if (dz) for (const b of bodies) if (b.perch && b.perch.seiran === T && b.onFloor !== T.floor) b.s.position.z += dz;   // 上で倒れた娘も一緒に動く
}
// 波の始まり：櫓の上に弓兵を出す（第1波は一基、第2波から二基。人数は波とともに 2→4）
function seiranWave(n) {
  if (builtStage !== 'fort' || !seirans.length) return 0;
  let k = 0;
  seirans.forEach((T, i) => {
    T.active = i === 0 || n >= 2;
    T.grp.visible = true;
    if (!T.active) return;
    const want = Math.min(4, 2 + Math.floor((n - 1) / 2));
    const order = [1, 2, 0, 3];
    for (let j = 0; j < want; j++) {
      const q = T.perches[order[j]];
      if (q.taken) continue;
      const e = spawnEnemy(q.x, q.z, 'archer', false, 'orange', { y: q.y, perch: q });
      if (e) { e.onSeiran = T; k++; }
    }
  });
  return k;
}
function updateSeiran(dt) {
  for (const T of seirans) {
    const crew = T.perches.some(q => q.taken && q.taken.state !== 'down');
    if (!crew || T.z >= SEIRAN_STOP) { T.moving = false; continue; }
    const dz = Math.min(SEIRAN_V * dt, SEIRAN_STOP - T.z);
    T.z += dz; T.moving = true;
    for (const w of T.wheels) w.rotation.x += dz / 0.62;
    seiranSync(T, dz);
    if (Math.random() < dt * 0.6) { const d = Math.hypot(T.x - player.pos.x, T.z - player.pos.z); if (d < 40 && Sfx.step) Sfx.step(false, 0.25, new V3(T.x, 0, T.z)); }   // 車のきしみ（足音で代用）
  }
}
function seiranReset() { for (const T of seirans) { for (const q of T.perches) q.taken = null; T.z = T.z0; seiranSync(T, 0); } }
// 竹束（低い盾）
const bundleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6);
const bundleMat = new THREE.MeshLambertMaterial({ color: 0x8aa04a });
const ropeMat = new THREE.MeshLambertMaterial({ color: 0x6b5a3a });
function bamboobundle(x, z, ang) {
  const g = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(bundleGeo, bundleMat);
    c.position.set(-0.75 + i * 0.115 + rand(-0.02, 0.02), 0.8, rand(-0.05, 0.05)); c.scale.y = rand(0.92, 1.05); g.add(c);
  }
  for (const y of [0.45, 1.15]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.16), ropeMat); r.position.y = y; g.add(r); }
  // 支え棒
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), WOOD_D); s.position.set(0, 0.7, 0.6); s.rotation.x = -0.6; g.add(s);
  g.rotation.set(-0.12, ang, 0); g.position.set(x, 0, z); stageRoot.add(g);
  covers.push({ x, z, r: 0.85, type: 'bundle', h: 1.45, ang });
  colliders.push({ x, z, r: 0.6 });
}
function buildFort() {
  const WALL_Z = 0, WH = 3.8, WX = 42, GATE = 3.2;
  // 正面の壁（門の左右）
  palisadeX(-WX, -GATE, WALL_Z, WH); palisadeX(GATE, WX, WALL_Z, WH);
  // 側面の壁
  palisadeZ(WALL_Z, 34, -WX, WH); palisadeZ(WALL_Z, 34, WX, WH);
  // 門：柱・冠木（かぶき）・開いた扉
  boxMesh(-GATE - 0.3, -GATE + 0.05, 0, WH + 1.2, -0.3, 0.3, WOOD_D);
  boxMesh(GATE - 0.05, GATE + 0.3, 0, WH + 1.2, -0.3, 0.3, WOOD_D);
  boxMesh(-GATE - 0.6, GATE + 0.6, WH + 0.7, WH + 1.15, -0.35, 0.35, WOOD_D, false);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(GATE - 0.1, WH - 0.6, 0.14), WOOD);
    d.geometry.translate(-s * (GATE - 0.1) / 2, (WH - 0.6) / 2, 0);
    d.position.set(s * GATE, 0, 0.2); d.rotation.y = s * 1.25; stageRoot.add(d);
  }
  fortGate = { x: 0, zOut: WALL_Z - 3, zIn: WALL_Z + 3, half: GATE - 0.4 };
  // 武者走り（壁の内側の足場）と梯子
  const WY = 2.9;
  for (const [x0, x1] of [[-WX + 0.3, -GATE - 0.3], [GATE + 0.3, WX - 0.3]]) {
    boxMesh(x0, x1, WY - 0.2, WY, WALL_Z + 0.25, WALL_Z + 2.1, WOOD_L, false);
    floors.push({ x0, x1, z0: WALL_Z + 0.2, z1: WALL_Z + 2.1, y: WY });
    for (let x = x0 + 1.5; x < x1; x += 4) boxMesh(x - 0.12, x + 0.12, 0, WY - 0.2, WALL_Z + 1.9, WALL_Z + 2.1, WOOD_D);
    for (let x = x0 + 2.2; x < x1 - 1; x += 3.4) perches.push({ x, z: WALL_Z + 0.75, y: WY, taken: null });
  }
  ladder(-7, WALL_Z + 2.1, WALL_Z + 3.0, WY); ladder(7, WALL_Z + 2.1, WALL_Z + 3.0, WY);
  ladder(-30, WALL_Z + 2.1, WALL_Z + 3.0, WY); ladder(30, WALL_Z + 2.1, WALL_Z + 3.0, WY);
  // 二基の櫃
  yagura(-12, 8, 6.0); yagura(12, 8, 6.0);
  // 陣内の飾り
  maku(-4, 26, 4, 0); maku(4, 26, 4, 0); maku(-6, 32, 12, Math.PI / 2); maku(6, 32, 12, Math.PI / 2); maku(0, 38, 12, 0);
  buildHQ(-6, 6, 26, 38, 0, 35);
  buildMedPost(3.6, 33.5, 'blue'); buildMedPost(0, -86, 'orange');
  for (let i = -2; i <= 2; i++) nobori(i * 3, 22, '#1f5fb8', '#f4f1e8', i % 2 ? '青組' : '必勝');
  // 門の外：竹束の列（橙組の盾）
  for (const [z, n] of [[-14, 7], [-26, 8], [-38, 9], [-52, 10], [-66, 10]]) {
    for (let i = 0; i < n; i++) {
      const x = -34 + (i + 0.5) * 68 / n + rand(-2.5, 2.5);
      if (Math.abs(x) < 2 && z > -20) continue;
      if (SEIRAN_LANES.some(l => Math.abs(x - l) < 3.8) && z > -40) continue;   // 井闌の通り道は空けておく
      bamboobundle(x, z + rand(-2, 2), rand(-0.25, 0.25));
    }
  }
  for (const x of SEIRAN_LANES) seiran(x, -36);
  for (let i = 0; i < 10; i++) nobori(rand(-45, 45), rand(-95, -80), '#d9741c', '#fff6e8', pick(['橙組', '必勝', '勝鬨', '一番']));
  // 周りの木々
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(55, CFG.field + 20), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < 0 && z > -100 && Math.abs(x) < 50) continue;
    if (z >= -2 && z < 40 && Math.abs(x) < 46) continue;
    tree(x, z, rand(0.8, 1.6));
  }
}
// ====================================================================
//  ステージ「機内の戦い」：旅客機の客室。前（+Z、機首）から
//   ラウンジ（ファーストクラス：革の回転椅子・木目・バー・山と峡谷の見える楕円の窓）＝本陣（殿の席と秘書課）
//   → 個室（スイート：高い仕切りと大きな画面）→ エコノミー（3-3 席、通路は約 0.56m で一人分）→ 後方ギャレー（橙組の援軍が出る）
//  座席の背もたれは矢を止め、列の間にしゃがんで隠れられる。通路で倒れた娘は重なって残り、またぐと遅くなる
// ====================================================================
const PL = { R: 2.3, YC: 1.0, zNose: 20, zL: 12.0, zS: 5.1, zG: -14.75, zTail: -19.6, eco0: 4.3, pitch: 0.9, rows: 22,
  seatX: [0.6, 1.1, 1.6], suiteZ: [[5.2, 7.35], [7.35, 9.5], [9.5, 11.65]] };
const PLANE = { on: false, intro: false, introT: 0, eco: [[], []], suite: [[], []], seats: [], suiteSeats: [], winMat: null, strip: null, alarm: 0 };
const ecoZb = r => PL.eco0 - r * PL.pitch;   // r 列目の背もたれの z
// 0=ラウンジ 1=個室 2=エコノミー 3=後方ギャレー
const plZone = z => z > PL.zL ? 0 : z > PL.zS ? 1 : z > PL.zG ? 2 : 3;
const PL_ZT = [[PL.zL, PL.zNose], [PL.zS, PL.zL], [PL.zG, PL.zS], [PL.zTail, PL.zG]];   // [下端, 上端]
function plCellAt(x, z) {   // 座席の列の間・個室の中（通路以外）
  const ax = Math.abs(x), sd = x < 0 ? 0 : 1, zn = plZone(z);
  if (zn === 2 && ax > 0.36) return PLANE.eco[sd][clamp(Math.ceil((PL.eco0 - z) / PL.pitch), 0, PL.rows - 1)] || null;
  if (zn === 1 && z > PL.suiteZ[0][0] && z < PL.suiteZ[2][1]) {
    const k = z < PL.suiteZ[0][1] ? 0 : z < PL.suiteZ[1][1] ? 1 : 2, c = PLANE.suite[sd][k];
    if (c && (ax > 0.58 || (ax > 0.42 && z > c.dz0 && z < c.dz1))) return c;
  }
  return null;
}
// 機内の道順：列の間・個室からはまず通路へ、通路は機体の中心線を進み、隔壁は扉口を通る
function planeRoute(p, tx, tz) {
  const cP = plCellAt(p.x, p.z), cT = plCellAt(tx, tz);
  if (cP && (cP === cT || (cT && cP.eco && cT.eco && cP.r === cT.r))) return [tx, tz];
  if (cP) {
    if (cP.inner && Math.abs(p.x) > 0.62 && Math.hypot(p.x - cP.inner[0], p.z - cP.inner[1]) > 0.25) return cP.inner;
    return cP.door;
  }
  let gx = tx, gz = tz;
  if (cT) {
    const d = cT.door;
    if (Math.hypot(p.x - d[0], p.z - d[1]) < 0.3) return cT.inner || [tx, tz];
    gx = d[0]; gz = d[1];
  }
  const zp = plZone(p.z), zg = plZone(gz);
  if (zp === zg) return [gx, gz];
  const fwd = zg < zp;   // 機首の方へ
  if (Math.abs(p.x) > 0.2) {
    if (zp === 0 || zp === 3) return [0, fwd ? PL_ZT[zp][1] - 0.5 : PL_ZT[zp][0] + 0.5];
    return [0, p.z];
  }
  if (zg === 1 || zg === 2) return [0, gz];
  return [0, fwd ? PL_ZT[zg][0] + 0.6 : PL_ZT[zg][1] - 0.6];
}
// ---- 倒れた娘の上をまたぐ：体（足→頭の線分）の上の高さ ----
function segDist2(px, pz, s) {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l = dx * dx + dz * dz || 1e-6;
  const t = clamp(((px - s.x0) * dx + (pz - s.z0) * dz) / l, 0, 1), cx = s.x0 + dx * t - px, cz = s.z0 + dz * t - pz;
  return cx * cx + cz * cz;
}
function pileAt(x, z) {
  let h = 0;
  for (const b of bodies) {
    const s = b.seg; if (!s || s.h <= h) continue;
    if (x < Math.min(s.x0, s.x1) - 0.3 || x > Math.max(s.x0, s.x1) + 0.3 || z < Math.min(s.z0, s.z1) - 0.3 || z > Math.max(s.z0, s.z1) + 0.3) continue;
    if (segDist2(x, z, s) < 0.3 * 0.3) h = s.h;
  }
  return h;
}
// 線分どうしの最短距離（重なり判定）
function segSegD(a, b) {
  return Math.sqrt(Math.min(segDist2(a.x0, a.z0, b), segDist2(a.x1, a.z1, b), segDist2(b.x0, b.z0, a), segDist2(b.x1, b.z1, a),
    segDist2((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, b)));
}
// 倒れ方（機内）：席で倒れた娘は座ったまま崩れる。列の間では座面の上に横たわり、通路では通路に沿って（ときに肘掛け越しに座席へ）倒れ、先に倒れた娘の上に重なる
function planeFall(e) {
  const p = e.s.position, H = e.figH, ax = Math.abs(p.x);
  if (e.seated) { e.slump = { side: Math.random() < 0.5 ? -1 : 1, fwd: rand(0.12, 0.28) }; e.seated = null; return; }
  const cell = plCellAt(p.x, p.z), zn = plZone(p.z);
  let yaw = e.fallYaw, tiltA = 0, land = 0;
  if (cell && cell.eco) {
    const sd = p.x < 0 ? -1 : 1, toWall = ax + H * 0.8 < 1.95;
    yaw = (toWall ? sd : -sd) * Math.PI / 2 + rand(-0.12, 0.12);
    e.slideTo = { x: p.x, z: cell.cz }; land = 0.52;
    if (!toWall && ax - H * 0.8 < 0.36) tiltA = -Math.atan2(0.32, H * 0.6);   // 頭が通路へ落ちる
  } else if (!cell && (zn === 1 || zn === 2) && ax < 0.6) {
    const sd = Math.random() < 0.5 ? -1 : 1, nc = zn === 2 && Math.random() < 0.3 ? plCellAt(sd * 0.8, p.z) : null;
    if (nc && nc.eco) { yaw = sd * Math.PI / 2 + rand(-0.15, 0.15); e.slideTo = { x: sd * 0.3, z: nc.cz }; land = 0.52; }   // 肘掛け越しに座席へ：上体は座面、足は通路へはみ出す
    else yaw = (Math.cos(yaw) >= 0 ? 0 : Math.PI) + rand(-0.22, 0.22);
  }
  const fx = e.slideTo ? e.slideTo.x : p.x, fz = e.slideTo ? e.slideTo.z : p.z;
  const others = bodies.concat(enemies.filter(o => o !== e && o.state === 'down' && o.seg));
  const stackAt = (x0, z0) => {   // その位置に倒れたときの高さと段
    const sg = { x0, z0, x1: x0 + Math.sin(yaw) * H * 0.85, z1: z0 + Math.cos(yaw) * H * 0.85 };
    let top = land, layer = 0;
    for (const b of others) if (b.seg && segSegD(sg, b.seg) < 0.34 && b.seg.h + 0.02 > top) { top = Math.max(top, b.seg.h - 0.06); layer = Math.max(layer, b.seg.layer + 1); }
    return { sg, top, layer };
  };
  let best = stackAt(fx, fz);
  if (!e.slideTo && best.layer > 0) {   // 通路：山の上より、少し先へ倒れ込める所があればそちらへ（崩れて広がる）
    for (const d of [0.3, 0.55, -0.3]) { const z0 = fz + Math.cos(yaw) * d, x0 = fx + Math.sin(yaw) * d;
      if (plCellAt(x0, z0) || Math.abs(x0) > 0.6) continue;
      const c = stackAt(x0, z0); if (c.top + 0.1 * Math.abs(d) < best.top - 0.05) { best = c; e.slideTo = { x: x0, z: z0 }; } }
  }
  const seg = best.sg; let top = Math.min(best.top, 0.62), layer = best.layer;
  if (tiltA > 0) tiltA = Math.atan2(Math.max(0, 0.46 - top), H * 0.7);
  seg.h = top + 0.2; seg.layer = layer;
  e.fallYaw = yaw; e.landY = top; e.lieTilt = tiltA; e.seg = seg;
}
// ---- 見た目 ----
function boxBatch(mat) {
  const pos = [], nor = [], uv = [];
  return {
    add(x0, x1, y0, y1, z0, z1, solid = false, uvk = null) {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv.array;
      for (let i = 0; i < pa.length; i++) pos.push(pa[i]);
      for (let i = 0; i < na.length; i++) nor.push(na[i]);
      for (let i = 0; i < ua.length; i += 2) {   // uvk：面の大きさに合わせて模様を繰り返す（1m あたり uvk 回）
        if (uvk) { const k = i / 2 | 0, f = k / 6 | 0, nx = Math.abs(na[k * 3]), ny = Math.abs(na[k * 3 + 1]);
          const w = nx > 0.5 ? z1 - z0 : x1 - x0, h = ny > 0.5 ? z1 - z0 : y1 - y0; uv.push(ua[i] * w * uvk, ua[i + 1] * h * uvk); }
        else uv.push(ua[i], ua[i + 1]);
      }
      g.dispose();
      if (solid) boxes.push({ x0, x1, z0, z1, y0, y1 });
    },
    done() {
      if (!pos.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const m = new THREE.Mesh(g, mat); stageRoot.add(m); return m;
    },
  };
}
function instBoxes(mat, list, colors) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  list.forEach((b, i) => { m4.compose(new V3((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2), q, new V3(b[1] - b[0], b[3] - b[2], b[5] - b[4])); im.setMatrixAt(i, m4); if (colors) im.setColorAt(i, c.setHex(colors[i])); });
  stageRoot.add(im); return im;
}
function instPlanes(mat, list) {   // [x, y, z, w, h, rotY]
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((b, i) => { q.setFromEuler(e.set(0, b[5], 0)); m4.compose(new V3(b[0], b[1], b[2]), q, new V3(b[3], b[4], 1)); im.setMatrixAt(i, m4); });
  stageRoot.add(im); return im;
}
let PLM = null;   // 機内の材質（最初に作ったものを使い回す）
function planeMats() {
  if (PLM) return PLM;
  const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  // 胴体の内壁：床から見上げた高さで色を塗り分ける（腰板・壁・荷物棚の上）。v は長さ方向の継ぎ目
  const th0 = Math.acos(PL.YC / PL.R), thL = Math.PI * 2 - th0 * 2;
  const wallTex = (low, mid, up, trim, seam) => { const t = canvasTex(256, 128, (g, w, h) => {
    for (let x = 0; x < w; x++) { const th = th0 + (x + 0.5) / w * thL, y = PL.YC - PL.R * Math.cos(th);
      g.fillStyle = y < 0.62 ? low : y < 1.72 ? mid : up; g.fillRect(x, 0, 1, h);
      if (trim && ((y > 0.86 && y < 0.93) || (y > 1.66 && y < 1.72))) { g.fillStyle = trim; g.fillRect(x, 0, 1, h); } }
    g.fillStyle = seam; g.fillRect(0, 0, w, 2); }); t.wrapT = THREE.RepeatWrapping; return t; };
  const chevron = canvasTex(256, 256, (g, w, h) => {   // 杉綾（シェブロン）の絨毯
    g.fillStyle = '#3c4330'; g.fillRect(0, 0, w, h);
    for (let y = -32; y < h + 32; y += 16) for (let x = 0; x < w; x += 32) {
      g.strokeStyle = (y / 16 & 1) ? '#56603f' : '#4a5236'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 16, y + 12); g.lineTo(x + 32, y); g.stroke(); }
  }, 1);
  const ecoCarpet = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#2c3440'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const l = rand(-12, 12); g.fillStyle = `rgb(${44 + l | 0},${52 + l | 0},${64 + l | 0})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, 1);
  const slat = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#8a8172'; g.fillRect(0, 0, w, h); g.fillStyle = '#6f675b'; for (let x = 4; x < w; x += 10) g.fillRect(x, 0, 3, h); }, 1);
  const screen = canvasTex(256, 144, (g, w, h) => {   // 個室の大画面：青空とラベンダー畑
    let gr = g.createLinearGradient(0, 0, 0, h * 0.55); gr.addColorStop(0, '#5f8fd6'); gr.addColorStop(1, '#cfe0f4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(rand(0, w), rand(10, 45), rand(18, 40), rand(5, 10), 0, 0, 7); g.fill(); }
    g.fillStyle = '#3f7a35'; g.beginPath(); g.moveTo(w * 0.6, h * 0.55); g.quadraticCurveTo(w * 0.85, h * 0.38, w, h * 0.45); g.lineTo(w, h * 0.6); g.lineTo(w * 0.6, h * 0.6); g.fill();
    for (let y = h * 0.55; y < h; y += 5) { g.fillStyle = (y / 5 & 1) ? '#7b5cc4' : '#6a4fb0'; g.fillRect(0, y, w, 5); }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 12px sans-serif'; g.fillText('ANA', w - 34, h - 8);
  });
  const backTex = canvasTex(128, 128, (g, w, h) => {   // エコノミーの背もたれの裏：テーブルと安全のしおり
    g.fillStyle = '#d6d6d2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c3c3bf'; g.fillRect(10, 40, w - 20, 50); g.fillStyle = '#9a9a96'; g.fillRect(56, 34, 16, 8);
    g.fillStyle = '#1f3f9a'; g.fillRect(18, 96, w - 36, 22); g.fillStyle = '#ffffff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('安全のしおり', w / 2, 112);
    g.fillStyle = '#efc341'; g.fillRect(18, 96, 6, 22);
  });
  const barTex = canvasTex(256, 128, (g, w, h) => {   // バーの棚（琥珀色の光とボトル）
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f6c477'); gr.addColorStop(1, '#a8642a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (const y of [40, 84, 126]) { g.fillStyle = '#5a3418'; g.fillRect(0, y, w, 4); for (let x = 6; x < w - 8; x += rand(9, 16)) { g.fillStyle = pick(['#6b2f12', '#2f4a1f', '#d9b36a', '#8a1f1f', '#e8dcc0']); const bh = rand(18, 32); g.fillRect(x, y - bh, 7, bh); g.fillRect(x + 2, y - bh - 6, 3, 6); } }
  });
  const lav = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#e9e6df'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9b5ad'; g.lineWidth = 2; g.strokeRect(6, 8, w - 12, h - 16); g.fillStyle = '#3a6fb0'; g.fillRect(w / 2 - 9, 14, 18, 10); });
  PLM = {
    wallEco: L(0xffffff, { map: wallTex('#a9aaa6', '#ecebe6', '#f4f3ee', null, '#d4d3ce') }),
    wallLounge: L(0xffffff, { map: wallTex('#7a5233', '#d9cbb4', '#e6dccb', '#5a3920', '#c9bba2') }),
    wallSuite: L(0xffffff, { map: wallTex('#8e8778', '#ebe8e0', '#f2f0ea', null, '#d8d4ca') }),
    chevron: L(0xffffff, { map: chevron }), eco: L(0xffffff, { map: ecoCarpet }), suiteFloor: L(0x4a4036), galleyFloor: L(0x9a9a96),
    ceil: L(0xffffff), ceilL: L(0xf0e6d2), bin: L(0xf1f0eb), binLip: L(0xc9c8c2),
    shell: L(0xd2d2ce), fabric: L(0x26324d), rim: L(0xb4824e), arm: L(0x9c9c98), back: new THREE.MeshLambertMaterial({ map: backTex }),
    partition: L(0xffffff, { map: slat }), suiteIn: L(0x3d352d), suiteSeat: L(0x4b4b4f), taupe: L(0x9b9284),
    screen: new THREE.MeshBasicMaterial({ map: screen }), glow: new THREE.MeshBasicMaterial({ color: 0xfff3dc }), glowCool: new THREE.MeshBasicMaterial({ color: 0xe6ecff }),
    leather: L(0xb9875a), leatherD: L(0x7a4f30), wood: L(0x6e4325), woodL: L(0xcdb89a), steel: L(0xb4b6b8), steelD: L(0x7d8084),
    bar: new THREE.MeshBasicMaterial({ map: barTex }), lav: L(0xffffff, { map: lav }), white: L(0xf2f1ec), yellow: new THREE.MeshBasicMaterial({ color: 0xd8b437 }),
    cushionL: L(0xc8a07a), aisleLight: new THREE.MeshBasicMaterial({ color: 0xbfe0ff }),
  };
  // 窓の外：空・流れる雲・峡谷（世界座標で模様を作るので、窓をまたいで景色がつながり、機首から機尾へ流れていく）
  PLM.win = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, fog: false,
    vertexShader: 'varying vec3 wp; varying vec2 vuv; void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0); wp = w.xyz; vuv = uv; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; varying vec3 wp; varying vec2 vuv;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float ns(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hs(i),hs(i+vec2(1,0)),f.x), mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x), f.y); }
      float fb(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*ns(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec2 e = vuv*2.0-1.0; float r = length(e); if (r > 1.0) discard;
        float side = wp.x < 0.0 ? 0.0 : 37.0;
        float s = wp.z*0.55 + time*1.6 + side, h = (wp.y-1.27)*3.2;
        vec3 sky = mix(vec3(0.98,0.84,0.76), vec3(0.36,0.56,0.86), smoothstep(-0.2,0.7,h));
        float c = fb(vec2(s*0.35, h*2.4 + 3.0));
        sky = mix(sky, vec3(1.0,0.97,0.95), smoothstep(0.55,0.82,c)*0.85*smoothstep(-0.4,0.2,h));
        float hz = -0.38 + 0.36*fb(vec2(s*0.12, 1.7));
        float g = fb(vec2(s*0.5, h*3.0));
        vec3 land = mix(vec3(0.55,0.33,0.30), vec3(0.78,0.52,0.42), g); land = mix(land, vec3(0.62,0.55,0.70), 0.35);
        vec3 col = h < hz ? land : sky;
        col *= 1.0 - 0.28*smoothstep(0.55,1.0,r);   // 窓の縁の陰
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  PLM.winFrame = new THREE.ShaderMaterial({ fog: false, uniforms: { col: { value: new THREE.Color(0xdedcd4) } },
    vertexShader: 'varying vec2 vuv; void main(){ vuv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 col; varying vec2 vuv; void main(){ vec2 e = vuv*2.0-1.0; float r = length(e); if (r > 1.0 || r < 0.74) discard; gl_FragColor = vec4(col*(0.82+0.18*(1.0-r)), 1.0); }' });
  PLM.winFrameL = PLM.winFrame.clone(); PLM.winFrameL.uniforms = { col: { value: new THREE.Color(0x6e4325) } };
  return PLM;
}
function fuselage(z0, z1, mat) {
  const th0 = Math.acos(PL.YC / PL.R), g = new THREE.CylinderGeometry(PL.R, PL.R, z1 - z0, 44, 1, true, th0, Math.PI * 2 - th0 * 2);
  g.rotateX(Math.PI / 2); g.translate(0, PL.YC, (z0 + z1) / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (z1 - z0) / 1.6);
  const m = new THREE.Mesh(g, mat); m.material.side = THREE.BackSide; stageRoot.add(m);
}
function floorPlane(z0, z1, mat, rep) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.002, (z0 + z1) / 2); stageRoot.add(m);
  if (rep && mat.map) { mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(rep[0], rep[1]); }
}
const PLANE_HQ = { sec: [0.05, 17.3], sec2: [-0.55, 16.5], ojou: [0.95, 16.8], sec3: [-0.35, 14.3], sec4: [0.95, 14.5], fluter: [-1.05, 13.45], run0: [-0.6, 12.6], run1: [0.6, 12.6], dish: [0.05, 18.75] };
const PLANE_MED = { blue: [[-1.25, 0.1], [1.25, 0.1], [-1.25, -0.7], [1.25, -0.7]], orange: [[0, 0], [1.1, 0.2], [-1.1, 0.2], [0, -1.1]] };
function hqSpot(key, dx, dz) { return builtStage === 'plane' && PLANE_HQ[key] ? PLANE_HQ[key] : [hq.sx + dx, hq.sz + dz]; }
function buildPlane() {
  const M = planeMats(), R = PL.R;
  PLANE.eco = [[], []]; PLANE.suite = [[], []]; PLANE.seats = []; PLANE.suiteSeats = [];
  // 胴体・床・天井
  fuselage(PL.zL, PL.zNose, M.wallLounge); fuselage(PL.zS, PL.zL, M.wallSuite); fuselage(PL.zTail, PL.zS, M.wallEco);
  floorPlane(PL.zL, PL.zNose, M.chevron, [3, 6]); floorPlane(PL.zS, PL.zL, M.suiteFloor); floorPlane(PL.zG, PL.zS, M.eco, [2, 12]); floorPlane(PL.zTail, PL.zG, M.galleyFloor);
  const ceil = boxBatch(M.ceil), ceilL = boxBatch(M.ceilL), wood = boxBatch(M.wood), woodL = boxBatch(M.woodL), glow = boxBatch(M.glow), glowC = boxBatch(M.glowCool);
  ceilL.add(-1.95, 1.95, 2.3, 2.36, PL.zL, PL.zNose); ceil.add(-1.95, 1.95, 2.33, 2.39, PL.zS, PL.zL); ceil.add(-1.3, 1.3, 2.33, 2.39, PL.zTail, PL.zS);
  for (const z of [13.2, 15.4, 17.6, 19.4]) wood.add(-1.2, 1.2, 2.26, 2.3, z - 0.35, z + 0.35);   // ラウンジの天井の木目板
  glowC.add(-1.86, -1.8, 2.2, 2.24, PL.zL + 0.1, PL.zNose - 0.1); glowC.add(1.8, 1.86, 2.2, 2.24, PL.zL + 0.1, PL.zNose - 0.1);   // 天井の間接照明
  // 当たり：側壁・天井・前後の壁
  boxes.push({ x0: -3, x1: -2.02, z0: PL.zTail - 1, z1: PL.zNose + 1, y0: 0, y1: 4 }, { x0: 2.02, x1: 3, z0: PL.zTail - 1, z1: PL.zNose + 1, y0: 0, y1: 4 },
    { x0: -3, x1: 3, z0: PL.zTail - 1, z1: PL.zNose + 1, y0: 2.34, y1: 5 });
  wood.add(-2.2, 2.2, 0, 2.4, PL.zNose, PL.zNose + 0.15, true);
  boxBatch(M.white).add(-2.2, 2.2, 0, 2.4, PL.zTail - 0.15, PL.zTail, true);
  // 隔壁（扉口つき）
  const bulk = (z, half, mat, mat2) => { const b = boxBatch(mat); b.add(-2.3, -half, 0, 2.36, z - 0.06, z + 0.06, true); b.add(half, 2.3, 0, 2.36, z - 0.06, z + 0.06, true); b.add(-half, half, 2.05, 2.36, z - 0.06, z + 0.06, false); b.done();
    if (mat2) { const t = boxBatch(mat2); for (const s of [-1, 1]) t.add(s * half - 0.04, s * half + 0.04, 0, 2.05, z - 0.08, z + 0.08); t.done(); } };
  bulk(PL.zL, 0.55, M.woodL, M.wood); bulk(PL.zS, 0.45, M.taupe, M.steelD);
  // ---- エコノミー：3-3 席・狭い通路・荷物棚 ----
  const shells = [], fabrics = [], rims = [], cush = [], arms = [], backs = [];
  for (let r = 0; r < PL.rows; r++) {
    const zb = ecoZb(r), zf = r === 0 ? PL.zS - 0.06 : ecoZb(r - 1) - 0.07;
    for (const sd of [0, 1]) {
      const sg = sd ? 1 : -1;
      for (const xc of PL.seatX) {
        const x = sg * xc;
        shells.push([x - 0.24, x + 0.24, 0.42, 1.1, zb - 0.07, zb - 0.02]);
        fabrics.push([x - 0.23, x + 0.23, 0.45, 1.06, zb - 0.02, zb + 0.07]);
        rims.push([x - 0.245, x + 0.245, 1.06, 1.15, zb - 0.075, zb + 0.075]);
        cush.push([x - 0.23, x + 0.23, 0.36, 0.48, zb + 0.07, zb + 0.55]);
        backs.push([x, 0.8, zb - 0.072, 0.44, 0.6, Math.PI]);
        PLANE.seats.push({ x, z: zb + 0.33, r, sd, taken: null });
      }
      for (const xa of [0.35, 0.85, 1.35, 1.85]) arms.push([sg * xa - 0.03, sg * xa + 0.03, 0.55, 0.66, zb + 0.08, zb + 0.55]);
      arms.push([sg < 0 ? -1.85 : 0.35, sg < 0 ? -0.35 : 1.85, 0.04, 0.1, zb + 0.4, zb + 0.46]);   // 脚の横桟
      boxes.push({ x0: sd ? 0.36 : -1.96, x1: sd ? 1.96 : -0.36, z0: zb - 0.07, z1: zb + 0.07, y0: 0, y1: 1.15 });
      const cell = { eco: true, r, sd, z0: zb + 0.07, z1: zf, cz: zb + 0.3, door: [0, (zb + 0.07 + zf) / 2] };
      PLANE.eco[sd][r] = cell;
      covers.push({ x: sg * 1.0, z: zb, r: 0.5, type: 'bundle', row: true, h: 0.001 });
    }
  }
  instBoxes(M.shell, shells); instBoxes(M.fabric, fabrics); instBoxes(M.rim, rims); instBoxes(M.fabric, cush); instBoxes(M.arm, arms); instPlanes(M.back, backs);
  const bins = boxBatch(M.bin), lip = boxBatch(M.binLip);
  for (const sg of [-1, 1]) {
    bins.add(sg > 0 ? 1.22 : -2.05, sg > 0 ? 2.05 : -1.22, 1.8, 2.34, PL.zG, PL.zS - 0.06, true);
    for (let z = PL.zS - 1.8; z > PL.zG; z -= 1.8) lip.add(sg * 1.218 - 0.006, sg * 1.218 + 0.006, 1.82, 2.3, z - 0.012, z + 0.012);
    glow.add(sg * 1.2 - 0.02, sg * 1.2 + 0.02, 1.78, 1.81, PL.zG, PL.zS - 0.06);   // 荷物棚の下の照明
    glowC.add(sg * 1.27 - 0.02, sg * 1.27 + 0.02, 2.33, 2.345, PL.zG, PL.zS);
  }
  boxBatch(M.yellow).add(-0.3, -0.28, 0.003, 0.006, PL.zG, PL.zS); boxBatch(M.yellow).add(0.28, 0.3, 0.003, 0.006, PL.zG, PL.zS);
  // ---- 個室（スイート）：高い仕切り・扉口・大画面・座席 ----
  const part = boxBatch(M.partition), inner = boxBatch(M.suiteIn), sseat = boxBatch(M.suiteSeat), taupe = boxBatch(M.taupe), scr = [];
  PL.suiteZ.forEach(([z0, z1], k) => {
    for (const sd of [0, 1]) {
      const sg = sd ? 1 : -1, xa = sg * 0.5, xb = sg * 0.58, lo = Math.min(xa, xb), hi = Math.max(xa, xb), c = sg * 1.3;
      const dz0 = z1 - 0.88, dz1 = z1 - 0.06;
      part.add(lo, hi, 0, 1.32, z0 + 0.04, dz0, true, 4); part.add(lo, hi, 0, 1.32, dz1, z1, true, 4);
      const w0 = sd ? 0.5 : -2.05, w1 = sd ? 2.05 : -0.5;
      part.add(w0, w1, 0, 1.32, z1 - 0.04, z1 + 0.02, true, 4);
      if (k === 0) part.add(w0, w1, 0, 1.32, z0 - 0.02, z0 + 0.04, true, 4);
      taupe.add(lo - 0.02, hi + 0.02, 1.32, 1.37, z0, z1);   // 仕切りの上の縁
      sseat.add(c - 0.33, c + 0.33, 0.12, 0.46, z0 + 0.2, z0 + 0.95); sseat.add(c - 0.33, c + 0.33, 0.46, 1.12, z0 + 0.12, z0 + 0.3);
      inner.add(c - 0.36, c + 0.36, 0, 0.12, z0 + 0.15, z0 + 1.0); inner.add(c - 0.3, c + 0.3, 0, 0.38, z1 - 0.78, z1 - 0.34);   // 台座・足置き
      taupe.add(sd ? 0.6 : -0.86, sd ? 0.86 : -0.6, 0, 0.66, z0 + 0.15, z0 + 1.15);   // 通路側のコンソール
      inner.add(c - 0.5, c + 0.5, 0.66, 1.3, z1 - 0.1, z1 - 0.04);
      scr.push([c, 0.98, z1 - 0.105, 0.86, 0.5, Math.PI]);
      glow.add(sg * 0.7 - 0.05, sg * 0.7 + 0.05, 0.66, 0.68, z0 + 0.3, z0 + 0.5);
      const cell = { suite: true, k, sd, dz0, dz1, door: [sg * 0.22, z1 - 0.47], inner: [sg * 0.9, z1 - 0.47] };
      PLANE.suite[sd][k] = cell;
      if (k < 2) PLANE.suiteSeats.push({ x: c, z: z0 + 0.62, taken: null });
    }
  });
  instPlanes(M.screen, scr);
  // ---- ラウンジ（本陣）：革の回転椅子・小卓・バー・長椅子 ----
  const lth = boxBatch(M.leather), lthD = boxBatch(M.leatherD), cushL = boxBatch(M.cushionL);
  const chair = (cx, cz, face) => {   // face: 0=後ろ向き（-Z を向く）, 1=+X を向く
    const add = (B, x0, x1, y0, y1, z0, z1) => { if (face) { B.add(cx - z1, cx - z0, y0, y1, cz + x0, cz + x1); } else B.add(cx + x0, cx + x1, y0, y1, cz - z1, cz - z0); };
    add(lthD, -0.2, 0.2, 0, 0.24, -0.2, 0.2);
    add(cushL, -0.3, 0.3, 0.24, 0.48, -0.32, 0.3);
    add(lth, -0.4, -0.3, 0.24, 0.7, -0.34, 0.34); add(lth, 0.3, 0.4, 0.24, 0.7, -0.34, 0.34);
    add(lth, -0.33, 0.33, 0.3, 1.18, 0.3, 0.44); add(cushL, -0.22, 0.22, 0.95, 1.12, 0.26, 0.3);
    boxes.push(face ? { x0: cx - 0.44, x1: cx + 0.34, z0: cz - 0.4, z1: cz + 0.4, y0: 0, y1: 1.18 } : { x0: cx - 0.4, x1: cx + 0.4, z0: cz - 0.34, z1: cz + 0.44, y0: 0, y1: 1.18 });
  };
  chair(-0.95, 18.55, 0); chair(1.05, 18.55, 0); chair(-1.42, 15.4, 1);
  wood.add(-0.22, 0.32, 0, 0.7, 18.5, 19.0, true); woodL.add(-0.26, 0.36, 0.7, 0.74, 18.46, 19.04);   // 小卓（ご飯の皿をここに置く）
  woodL.add(1.48, 2.05, 0, 1.0, 13.4, 16.2, true); wood.add(1.44, 2.05, 1.0, 1.05, 13.36, 16.24);   // バーの下の棚
  const barM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), M.bar); barM.rotation.y = -Math.PI / 2; barM.position.set(1.66, 1.55, 14.8); stageRoot.add(barM);
  wood.add(1.62, 2.05, 1.05, 1.1, 13.4, 16.2); wood.add(1.62, 2.05, 2.0, 2.06, 13.4, 16.2); glowC.add(1.6, 1.64, 1.05, 2.06, 13.38, 13.42); glowC.add(1.6, 1.64, 1.05, 2.06, 16.18, 16.22);
  boxes.push({ x0: 1.48, x1: 2.05, z0: 13.4, z1: 16.2, y0: 0, y1: 2.1 });
  lth.add(-2.02, -1.6, 0, 0.42, 12.6, 14.4, true); cushL.add(-2.0, -1.62, 0.42, 0.52, 12.65, 14.35); lth.add(-2.05, -1.9, 0.42, 0.95, 12.6, 14.4);   // 長椅子
  wood.add(-2.1, 2.1, 0.86, 0.93, 19.85, 20.0);
  // 木目の腰板の縁（窓の下）
  for (const sg of [-1, 1]) wood.add(sg > 0 ? 1.98 : -2.12, sg > 0 ? 2.12 : -1.98, 0.86, 0.93, PL.zL + 0.1, PL.zNose - 0.1);
  // ---- 後方ギャレー・化粧室 ----
  const steel = boxBatch(M.steel), steelD = boxBatch(M.steelD), lavB = boxBatch(M.lav);
  for (const sg of [-1, 1]) lavB.add(sg > 0 ? 1.0 : -2.1, sg > 0 ? 2.1 : -1.0, 0, 2.34, -16.6, PL.zG - 0.12, true, 1);
  steel.add(-2.1, 2.1, 0, 1.0, PL.zTail, PL.zTail + 0.6, true); steelD.add(-2.1, 2.1, 1.0, 1.04, PL.zTail, PL.zTail + 0.64);
  steel.add(-2.1, 2.1, 1.55, 2.34, PL.zTail, PL.zTail + 0.45, true);
  steelD.add(-1.5, -0.9, 0, 1.0, PL.zTail + 0.6, PL.zTail + 1.4, true); steelD.add(0.9, 1.5, 0, 1.0, PL.zTail + 0.6, PL.zTail + 1.4, true);   // カート
  glow.add(-1.9, 1.9, 1.5, 1.53, PL.zTail + 0.3, PL.zTail + 0.6);
  // 窓（楕円・外の景色は流れる）
  const wins = [], frames = [], framesL = [];
  for (const sg of [-1, 1]) {
    const x = sg * 2.2, ry = sg < 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let r = 0; r < PL.rows; r++) { const z = ecoZb(r) + 0.42; wins.push([x, 1.27, z, 0.26, 0.36, ry]); frames.push([x - sg * 0.006, 1.27, z, 0.36, 0.48, ry]); }
    for (const [z0, z1] of PL.suiteZ) for (const f of [0.3, 0.7]) { const z = z0 + (z1 - z0) * f; wins.push([x, 1.32, z, 0.3, 0.42, ry]); frames.push([x - sg * 0.006, 1.32, z, 0.42, 0.56, ry]); }
    for (const z of [13.6, 15.9, 18.2]) { wins.push([x, 1.3, z, 0.62, 0.42, ry]); framesL.push([x - sg * 0.006, 1.3, z, 0.82, 0.58, ry]); }
  }
  instPlanes(M.win, wins); instPlanes(M.winFrame, frames); instPlanes(M.winFrameL, framesL);
  // 天井の照明（小さな丸いダウンライト）
  const dl = []; for (let z = PL.zL + 0.8; z < PL.zNose; z += 1.6) for (const x of [-1.45, 1.45]) dl.push([x, 2.295, z, 0.09, 0.09, 0]);
  for (let z = PL.zS + 0.6; z < PL.zL; z += 1.4) dl.push([0, 2.325, z, 0.1, 0.1, 0]);
  const dlm = instPlanes(M.glow, dl); { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), m4 = new THREE.Matrix4(); dl.forEach((b, i) => { m4.compose(new V3(b[0], b[1], b[2]), q, new V3(b[3], b[4], 1)); dlm.setMatrixAt(i, m4); }); }
  for (const B of [ceil, ceilL, wood, woodL, glow, glowC, bins, lip, part, inner, sseat, taupe, lth, lthD, cushL, steel, steelD, lavB]) B.done();
  PLANE.winMat = M.win; PLANE.strip = [M.glow, M.glowCool];
  // 本陣（ラウンジ）・救護の持ち場
  hq = { x0: -2.05, x1: 2.05, z0: PL.zL + 0.1, z1: PL.zNose, sx: PLANE_HQ.sec[0], sz: PLANE_HQ.sec[1] };
  medPost.blue = [0, 10.6]; medPost.orange = [0, -17.7];
  const kit = boxBatch(new THREE.MeshLambertMaterial({ color: 0xe8e4da })); kit.add(0.62, 0.84, 0.66, 0.82, 10.0, 10.3); kit.add(-0.2, 0.2, 1.04, 1.24, -19.5, -19.2); kit.done();
}
// ---- 機内の始まり：静かな客室（乗客として席に座る娘たち）→ 8〜15 秒後、乗客に紛れた橙組が突然立ち上がって襲う ----
const SEAT_SINK = 0.36;   // 座ると体が沈む量（m）
function seatPassenger(team, seat, kind) {
  const e = spawnEnemy(seat.x, seat.z, kind, false, team);
  if (!e) return null;
  seat.taken = e;
  e.seated = { x: seat.x, z: seat.z, seat }; e.home = [seat.x, seat.z]; e.state = 'idle'; e.passive = true;
  e.s.rotation.y = e.face = e.faceWant = 0;   // 機首（+Z）の方を向いて座る
  e.crouch = SEAT_SINK / (0.42 * e.figH);
  e.mk.visible = false; e.tagKey = '';
  return e;
}
function seatedBrain(e, dt) {
  const p = e.s.position;
  p.x = e.seated.x; p.z = e.seated.z; e.knock.set(0, 0, 0);
  e.tgt = null; e.state = 'idle'; e.t += dt; e.faceWant = 0; e.passive = true;
  if (e.standAt != null && time >= e.standAt) standUp(e);
}
function standUp(e) {
  if (!e.seated) return;
  if (e.seated.seat && e.seated.seat.taken === e) e.seated.seat.taken = null;
  e.seated = null; e.standAt = null; e.passive = false; e.mk.visible = true; e.tagKey = '';
  e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.t = 0; e.cd = rand(0.2, 0.8);
  if (e.team === 'orange') { puff(e.s.position.clone().setY(1.2), 0xffffff, 3, 0.25, 1.2, 0.25); npcSay(e, 'spot', 0, 0.5); }
  else if (Math.random() < 0.35) npcSay(e, Math.random() < 0.5 ? 'callR' : 'spot', 0, 0.6);
}
function planeIntro() {
  // 味方：個室に数人、残りはエコノミー。橙組：エコノミーの乗客に紛れる（約 2/3）、残りは奇襲と同時に後方ギャレーから
  for (const q of PLANE.seats) q.taken = null; for (const q of PLANE.suiteSeats) q.taken = null;
  const free = PLANE.seats.slice(), take = () => free.splice((Math.random() * free.length) | 0, 1)[0];
  const nb = wave.blueToSpawn, no = Math.round(wave.toSpawn * 0.66);
  const suites = PLANE.suiteSeats.slice().sort(() => Math.random() - 0.5);
  let placed = 0;
  for (let i = 0; i < nb; i++) {
    const seat = i < Math.min(3, suites.length) ? suites[i] : take(); if (!seat) break;
    if (seatPassenger('blue', seat, Math.random() < wave.archerRate ? 'archer' : 'mob')) placed++;
  }
  let po = 0;
  for (let i = 0; i < no; i++) { const seat = take(); if (!seat) break; if (seatPassenger('orange', seat, Math.random() < wave.archerRate ? 'archer' : 'mob')) po++; }
  wave.blueToSpawn = Math.max(0, nb - placed); wave.blueOwed = 0; wave.toSpawn -= po;
  PLANE.intro = true; PLANE.introT = window.__planeIntroT || rand(8, 15); PLANE.alarm = 0;
  player.seated = true;
  showBanner('機内の戦い', '穏やかな空の旅……');
  setStripColor(false);
  setTimeout(() => { if (state === 'play' && PLANE.intro) Sfx.chime(); }, 900);
}
function planeAmbush() {
  if (!PLANE.intro) return;
  PLANE.intro = false; PLANE.introT = 0; PLANE.alarm = 1.6; player.seated = false;
  for (const e of enemies) if (e.seated) e.standAt = time + (e.team === 'orange' ? rand(0, 0.55) : rand(0.5, 2.0));
  wave.spawnT = 0.4;   // 後方ギャレーからも
  showBanner('奇襲！', '乗客に紛れた橙組が襲いかかる！ 青組の乗客も席を立って迎え撃つ');
  setStripColor(true); Sfx.chime(true); Sfx.fluteCall();
  setTimeout(() => { if (state === 'play' && !VoicePack.extra('command', 0)) Voice.say('かかれーっ！', { pitch: 1.3, rate: 1.1 }, 1); }, 700);
}
function setStripColor(alert) { if (PLANE.strip) { PLANE.strip[0].color.setHex(alert ? 0xffc89a : 0xfff3dc); PLANE.strip[1].color.setHex(alert ? 0xffb0a0 : 0xe6ecff); } }
function updatePlaneFx(dt) {
  if (PLANE.winMat) PLANE.winMat.uniforms.time.value = time;
  if (PLANE.alarm > 0 && PLANE.strip) {   // 奇襲の瞬間：客室の照明が数回またたく
    PLANE.alarm -= dt; const on = PLANE.alarm <= 0 || Math.sin(PLANE.alarm * 26) > -0.2;
    PLANE.strip[0].color.setHex(on ? 0xffc89a : 0x5a4a40); PLANE.strip[1].color.setHex(on ? 0xffb0a0 : 0x504048);
    hemiL.intensity = on ? 1.25 : 0.7;
  }
}
// ステージごとの光・霧・屋外の物
const LOOK0 = { fogN: 35, fogF: 200, bg: FOG, hemi: [0xeaf2ff, 0x55603a, 1.6], amb: 0.75, sun: 2.2 };
function stageLook(name) {
  const pl = name === 'plane';
  PLANE.on = pl;
  ground.visible = !pl; sky.visible = !pl; for (const m of mountains) m.visible = !pl;
  scene.fog.near = pl ? 200 : LOOK0.fogN; scene.fog.far = pl ? 600 : LOOK0.fogF;
  scene.background.setHex(pl ? 0x1a1a1e : LOOK0.bg);
  hemiL.color.setHex(pl ? 0xfff2df : LOOK0.hemi[0]); hemiL.groundColor.setHex(pl ? 0x6a5a4a : LOOK0.hemi[1]); hemiL.intensity = pl ? 1.25 : LOOK0.hemi[2];
  ambL.intensity = pl ? 0.95 : LOOK0.amb; sun.intensity = pl ? 0.9 : LOOK0.sun;
  SUN_DIR.copy(pl ? new V3(0.12, 1, 0.08).normalize() : SUN_DIR0);
}
let builtStage = null, stageName = 'plains';
try { stageName = localStorage.getItem('onna_stage') || 'plains'; } catch (e) {}
// 足元の床の高さ（櫃・武者走り）。y より 0.4 以上高い床には乗らない
function floorUnder(x, z, y) {
  let g = 0;
  for (const f of floors) if (x > f.x0 - 0.2 && x < f.x1 + 0.2 && z > f.z0 - 0.2 && z < f.z1 + 0.2 && f.y <= y + 0.4 && f.y > g) g = f.y;
  return g;
}
function ladderAt(x, z, y) {
  for (const l of ladders) { const m = l.seiran ? 0.35 : 0;   // 動く井闌の梯子は少し広めに取る
    if (x > l.x0 - m && x < l.x1 + m && z > l.z0 - 0.3 - m && z < l.z1 + 0.3 && y > l.y0 - 0.1 && y < l.y1 + 0.3) return l; }
  return null;
}
// 殿の近くの梯子（案内表示・自動で上り下り用）：下の足元か上の降り口から 1.8m 以内
function ladderNear(P) {
  let best = null, bd = 1.8;
  for (const L of ladders) {
    ladMeta(L); const x = (L.x0 + L.x1) / 2, zc = (L.z0 + L.z1) / 2;
    const atBottom = P.y < L.y0 + 0.6, atTop = Math.abs(P.y - L.y1) < 0.5;
    if (!atBottom && !atTop) continue;
    const zz = atBottom ? zc - L.dir * 0.6 : zc + L.dir * 0.9, d = Math.hypot(P.x - x, P.z - zz);
    if (d < bd) { bd = d; best = { L, up: atBottom }; }
  }
  return best;
}
const STAGES = {
  plains: { name: '平原の戦い', desc: '竹林の点在する平原で、青組と橙組が正面からぶつかる。' },
  fort: { name: '櫃の戦い', desc: '青組は砦を守る。二基の櫃（やぐら）と壁の足場から射下ろし、門の外の竹束に隠れる橙組を迎え撃つ。梯子で上り下りできる。' },
  plane: { name: '機内の戦い', desc: '空の上の旅客機。殿はラウンジの席に、秘書課が客室乗務員のように控える。穏やかな機内で、乗客に紛れた橙組が突然襲いかかる。通路は一人分の幅、座席の背もたれが矢を防ぐ。' },
};
function loadStage(name) {
  if (builtStage === name) return;
  for (const c of [...stageRoot.children]) stageRoot.remove(c);
  colliders.length = covers.length = flags.length = boxes.length = floors.length = ladders.length = perches.length = 0;
  fortGate = null; hq = null; seirans.length = 0;
  road.visible = name === 'plains';
  stageLook(name);
  if (name === 'fort') buildFort(); else if (name === 'plane') buildPlane(); else buildPlains();
  builtStage = name;
  stageReceiveShadows();
}

// ====================================================================
//  スプライト読み込み（近接兵 assets/mobNN / 弓兵 assets/archerNN）
//   http(s) で配信時は PNG を直接読む（差し替えが楽）。
//   file:// で開いた時は WebGL の制約上、assets/sprites.js の埋め込みデータを使う。
//   枚数は sprites.js の配列長で決まる（tools/make_sprites.py で再生成）。
// ====================================================================
const SPR = { mob: [], archer: [] };
let texLoaded = 0;
function loadSprites(done) {
  const useFiles = /^https?:/.test(location.protocol);
  const sets = [['mob', window.MOB_SPRITES || [], window.MOB_HEADTOP || []],
                ['archer', window.ARCHER_SPRITES || [], window.ARCHER_HEADTOP || []]];
  let remaining = sets.reduce((n, s) => n + s[1].length, 0);
  if (!remaining) { done(); return; }
  const loader = new THREE.TextureLoader();
  const fin = () => { if (--remaining === 0) { SPR.mob = SPR.mob.filter(Boolean); SPR.archer = SPR.archer.filter(Boolean); done(); } };
  for (const [kind, emb, tops] of sets) emb.forEach((data, i) => {
    const file = `assets/${kind}${String(i + 1).padStart(2, '0')}.png`;
    const ok = t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      SPR[kind][i] = { id: kind + String(i + 1).padStart(2, '0'), tex: t, img: t.image, aspect: t.image.width / t.image.height, top: tops[i] || 0 };
      texLoaded++; fin();
    };
    const fb = () => loader.load(data, ok, undefined, () => { console.warn('sprite load failed', kind, i + 1); fin(); });
    if (useFiles) loader.load(file, ok, undefined, fb); else fb();
  });
}

// ====================================================================
//  パーティクル（砂埃・閃光）とラベル
// ====================================================================
const puffTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const particles = [];
function puff(pos, color, n, size, speed, life) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.position.copy(pos); s.scale.setScalar(size); s.renderOrder = 3;
    scene.add(s);
    particles.push({ s, v: new V3(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).multiplyScalar(speed), life, t: 0, size });
  }
}
const kiaTex = canvasTex(256, 64, g => {
  g.font = 'bold 46px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 9; g.strokeStyle = 'rgba(20,20,30,.85)'; g.strokeText('戦死判定', 128, 34);
  g.fillStyle = '#ffe38a'; g.fillText('戦死判定', 128, 34);
});
const labels = [];
function kiaLabel(pos, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: kiaTex, transparent: true, depthTest: false }));
  s.scale.set(1.5, 0.375, 1); s.position.set(pos.x, h + 0.35, pos.z); s.renderOrder = 6; scene.add(s);
  labels.push({ s, t: 0, y: h + 0.35 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.t += dt;
    p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.exp(-3 * dt));
    const k = p.t / p.life;
    p.s.scale.setScalar(p.size * (1 + k * 1.8)); p.s.material.opacity = 0.8 * (1 - k);
    if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); particles.splice(i, 1); }
  }
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i]; l.t += dt;
    l.s.position.y = l.y + Math.min(l.t, 1) * 0.35;
    const ld = l.s.position.distanceTo(camera.position), ls = clamp(ld / 6, 0.35, 1);   // 至近距離で巨大にならないように
    l.s.scale.set(1.5 * ls, 0.375 * ls, 1);
    l.s.material.opacity = l.t < 1.6 ? 1 : Math.max(0, 1 - (l.t - 1.6) / 0.5);
    if (l.t > 2.1) { scene.remove(l.s); l.s.material.dispose(); labels.splice(i, 1); }
  }
}

// ====================================================================
//  写真の侍女（20人の元写真）をビルボードで描く。
//   見る角度で 正面／横（右向きの写真を左右反転して左向きにも）／後ろ を切り替え、歩くと歩きフレーム（反転と交互で歩幅を表現）、
//   攻撃中は構えフレーム（弓兵＝弓を引く、近接兵＝突き）。足りないフレームは正面写真で代用。
//   縁を少し暗くして厚みを出し、接地影を付ける。倒れると横向きの写真が倒れる方向へ地面に伏せ、そのまま動かない。
// ====================================================================
const PAINT = ['#d9d4c6', '#f2efe6'];          // 練習用の先端（たんぽ・刃引き）の色。塗料の跡は付けない。赤・血は使わない
const TEAM_PAINT = { blue: PAINT, orange: PAINT };
const tipMat = new THREE.MeshLambertMaterial({ color: 0xd9d4c6 });   // たんぽ（布で包んだ練習用の矢先）
const _v = new V3(), _v2 = new V3(), _q = new THREE.Quaternion();
const qsId = k => { const m = location.search.match(new RegExp('[?&]' + k + '=(\\w+)')); return m ? m[1] : null; };
let SEC2_ID = qsId('sec2') || 'mob07';   // 二人目の秘書（荷物持ち・靴磨き）
let SEC_ID = qsId('sec') || 'mob06', FLUTE_ID = qsId('flute') || 'mob03', MEDIC_ID = qsId('medic') || 'medic';   // 医療係：専用写真（frames の medic）、無ければ ?medic= の娘   // 秘書・笛役に使う写真（?sec=mob05 などで変更可）
const GIRLS = {};      // id -> { id, type: 'mob'|'archer', spr, front, side, back, walk, bow, stab, action, flute }
function buildGirls() {
  for (const kind of ['mob', 'archer']) for (const sp of SPR[kind]) {
    if (!sp) continue;
    GIRLS[sp.id] = { id: sp.id, type: kind, spr: sp, front: { tex: sp.tex, aspect: sp.aspect, hk: 1 / Math.max(0.5, 1 - (sp.top || 0)), ax: 0.5, dir: 0 } };
  }
  if (!GIRLS[SEC_ID]) SEC_ID = Object.keys(GIRLS)[0];
  if (!GIRLS[FLUTE_ID]) FLUTE_ID = Object.keys(GIRLS).find(k => k !== SEC_ID) || SEC_ID;
}
// 追加フレーム（tools/make_frames.py が作る assets/frames/）。http ならファイル、file:// なら埋め込み
let framesLoaded = 0;
const CYCLE_ON = new URLSearchParams(location.search).get('cycle') !== '0';
// 歩行サイクルの絵：一歩ごとに stepT が π 進む（モーションの歩調＝実際の移動距離から決まる）。サイクル（steps 歩）の中の位置で絵を選ぶ
function cycleFrame(C, stepT) {
  const u = stepT / (Math.PI * C.steps); const k = Math.floor((u - Math.floor(u)) * C.n);
  return C.frs[C.seq[(k + C.contact) % C.n]];
}
function loadFrames(done) {
  const meta = window.FRAME_META || {}, data = window.FRAME_DATA || {};
  const useFiles = /^https?:/.test(location.protocol), loader = new THREE.TextureLoader();
  const jobs = [];
  // 元の写真が無く、frames に正面がある娘（医療係など）
  for (const gid in meta) if (!GIRLS[gid] && meta[gid].front) {
    const x = EXTRA_GIRLS[gid] || {};
    GIRLS[gid] = Object.assign({ id: gid, type: gid === 'medic' || gid === 'surgeon' ? 'medic' : 'extra', spr: null, front: null }, x);
  }
  for (const gid in meta) for (const k in meta[gid]) if (GIRLS[gid]) jobs.push([gid, k, meta[gid][k]]);
  // 歩行サイクル（tools/make_walkcycle.py → assets/frames/cycles.js）：横から見た歩きの連続写真。?cycle=0 で使わない
  const cyc = CYCLE_ON ? window.FRAME_CYCLES || {} : {}, cdata = window.CYCLE_DATA || {};
  for (const gid in cyc) for (const key in cyc[gid]) if (GIRLS[gid]) {
    const c = cyc[gid][key], C = { key, seq: c.seq, n: c.seq.length, steps: c.steps || 2, contact: c.contact || 0, frs: [] };
    (GIRLS[gid].cycles = GIRLS[gid].cycles || {})[key] = C;
    c.files.forEach((file, i) => jobs.push([gid, null, { file, hk: c.hk, aspect: c.aspect, ax: c.ax, dir: c.dir, cyc: C, i, emb: cdata[gid + '_' + key + '_' + String(i).padStart(2, '0')] }]));
  }
  const done2 = () => {
    for (const gid in GIRLS) { const g = GIRLS[gid]; if (!g.front) { delete GIRLS[gid]; continue; }
      if (g.cycles) for (const k in g.cycles) { const C = g.cycles[k]; if (C.seq.some(i => !C.frs[i])) delete g.cycles[k]; }   // 読めなかった絵があれば使わない
      g.cycle = g.cycles && g.cycles.walk_side || null;
      if (g.bowOnly) {   // 弓を引く写真しか無い娘：どの見え方もその写真（横は向きに合わせて反転）。倒れたあとは写真のまま横たわる
        const b = g.bow || g.front; g.bow = b; g.front = b; g.side = g.side || b; g.walk = g.walk || b;
      }
      if (!g.spr) g.spr = { id: gid, img: g.front.tex.image, top: Math.max(0, 1 - 1 / g.front.hk), tex: g.front.tex, aspect: g.front.aspect }; }
    if (!GIRLS[SEC2_ID]) SEC2_ID = Object.keys(GIRLS).find(k => GIRLS[k].type === 'mob' && k !== SEC_ID && k !== FLUTE_ID) || SEC_ID;
    if (!GIRLS[MEDIC_ID]) MEDIC_ID = GIRLS.mob05 ? 'mob05' : SEC_ID;
    done();
  };
  let left = jobs.length; if (!left) { done2(); return; }
  const fin = () => { if (--left === 0) done2(); };
  for (const [gid, k, m] of jobs) {
    const ok = t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const fr = { tex: t, aspect: m.aspect || t.image.width / t.image.height, hk: m.hk || 1, ax: m.ax == null ? 0.5 : m.ax, dir: m.dir || 0 };
      if (m.cyc) { fr.cyc = m.cyc; m.cyc.frs[m.i] = fr; } else GIRLS[gid][k] = fr;
      framesLoaded++; fin(); };
    const emb = m.cyc ? m.emb : data[gid + '_' + k];
    const fb = () => emb ? loader.load(emb, ok, undefined, () => fin()) : fin();
    if (useFiles) loader.load(m.file + '?v=' + (m.hk || 1), ok, undefined, fb); else fb();
  }
}
// 追加の娘（frames/manifest.json）：役割と固定のプロフィール（名前・性格・身長・声の高さ vv 0 低〜2 高）
const EXTRA_GIRLS = {
  sec5: { type: 'mob', anyRole: true, prof: { name: '小日向 ひより', pers: '慎重', cm: 152, vv: 2, pitch: 1.3 } },   // 小柄
  sec6: { type: 'mob', anyRole: true, prof: { name: '氷室 しのぶ', pers: '冷静', cm: 170, vv: 0, pitch: 0.85 } },    // 長身・細身
  sec7: { type: 'mob', anyRole: true, prof: { name: '夏目 あかり', pers: '陽気', cm: 162, vv: 1, pitch: 1.35 } },    // 快活
  arch01: { type: 'archer', bowOnly: true }, arch02: { type: 'archer', bowOnly: true }, arch03: { type: 'archer', bowOnly: true },
  arch04: { type: 'archer', bowOnly: true }, arch05: { type: 'archer', bowOnly: true }, arch06: { type: 'archer', bowOnly: true },
  sec3: { type: 'aide' }, sec4: { type: 'aide' },
  // v5：新しい兵の娘（両軍に出る。固有の名前・性格・身長・声の高さ）
  girl21: { type: 'mob', anyRole: true, prof: { name: '星野 ゆな', pers: '慎重', cm: 166, vv: 2, pitch: 1.3 } },     // 韓国風の雰囲気・やさしく甘い
  girl22: { type: 'mob', anyRole: true, prof: { name: '林 玲奈', pers: '好戦的', cm: 163, vv: 1, pitch: 1.1 } },     // 中国風の雰囲気・落ち着いて自信がある
  girl23: { type: 'mob', anyRole: true, prof: { name: '桐谷 理紗', pers: '冷静', cm: 160, vv: 0, pitch: 0.9 } },     // 眼鏡・冷静で知的
  girl24: { type: 'mob', anyRole: true, prof: { name: '日比野 夏海', pers: '陽気', cm: 165, vv: 2, pitch: 1.45 } },  // ごく短い髪・日焼け・元気
  girl25: { type: 'mob', anyRole: true, prof: { name: '雨宮 小夜', pers: '臆病', cm: 157, vv: 1, pitch: 1.2 } },     // 横の三つ編み・物静か
};
// 見え方ごとのフレーム（無ければ正面）
function girlFrame(g, k, kind) {
  if (k === 'action') {
    const f = kind === 'archer' ? (g.bow || (g.type === 'archer' ? g.action : null)) : (g.stab || (g.type === 'mob' ? g.action : null));
    return f || g.front;
  }
  return g[k] || g.front;
}
function pickGirl(kind) {
  const all = Object.values(GIRLS).filter(g => g.id !== SEC_ID && g.id !== SEC2_ID && g.id !== FLUTE_ID && g.id !== MEDIC_ID && (g.type === 'mob' || g.type === 'archer'));
  // 弓兵：弓を引く写真（bow）のある娘、または横・後ろがそろった弓兵の写真。近接兵：侍女（mob）
  let fit = all.filter(g => kind === 'archer' ? (g.bow || g.anyRole || (g.type === 'archer' && g.side && g.back)) : g.type === 'mob');
  if (!fit.length) fit = all.filter(g => kind === 'archer' ? g.type === 'archer' : g.stab);
  const pool = fit.length ? fit : (all.length ? all : Object.values(GIRLS));
  const inUse = new Set(enemies.map(e => e.girl && e.girl.id));
  const fresh = pool.filter(g => !inUse.has(g.id));
  return (fresh.length ? pick(fresh) : pick(pool)) || null;
}
// 写真用の材質：縁（透明に近い所）を暗く、左右の端を少し暗くして厚みを出す。uAdd で被弾の白い閃光・構えの色
const spriteGeo = new THREE.PlaneGeometry(1, 1); spriteGeo.translate(0, 0.5, 0);
function spriteMat(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide });
  const uAdd = { value: new THREE.Color(0, 0, 0) }, uTexel = { value: new THREE.Vector2(1 / 256, 1 / 640) };
  m.userData.uAdd = uAdd; m.userData.uTexel = uTexel;
  m.onBeforeCompile = sh => {
    sh.uniforms.uAdd = uAdd; sh.uniforms.uTexel = uTexel;
    sh.fragmentShader = 'uniform vec3 uAdd;\nuniform vec2 uTexel;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  {
    float e = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; e += 1.0 - texture2D(map, vMapUv + vec2(cos(a), sin(a)) * uTexel * 5.0).a; }
    e = clamp(e / 8.0 * 1.7, 0.0, 1.0);
    float cx = abs(vMapUv.x - 0.5) * 2.0;
    diffuseColor.rgb *= (1.0 - 0.36 * e) * (1.0 - 0.1 * cx * cx);
  }
#endif`)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.rgb += uAdd;');
  };
  m.customProgramCacheKey = () => 'girlRim1';
  return m;
}
function setFrame(e, fr, mirror) {
  if (e.fr !== fr) { e.fr = fr; e.mat.map = fr.tex; e.mat.userData.uTexel.value.set(1 / fr.tex.image.width, 1 / fr.tex.image.height); }
  const h = e.figH * fr.hk, w = h * fr.aspect, sg = mirror ? -1 : 1;
  e.bb.scale.set(w * sg, h, 1);
  e.bb.position.x = (0.5 - fr.ax) * w * sg;   // 足元の中心を立ち位置に
}
// 照準情報パネル用の顔写真（元の写真の上部を切り抜く）
const portraitCache = new Map();
function portraitOf(spr) {
  if (!spr || !spr.img) return '';
  if (portraitCache.has(spr)) return portraitCache.get(spr);
  let url = '';
  try {
    const img = spr.img, H = img.height, W = img.width, top = (spr.top || 0) * H;
    const sz = Math.min(W, H * 0.24), sx = W / 2 - sz / 2, sy = Math.max(0, top - sz * 0.08);
    const c = document.createElement('canvas'); c.width = c.height = 72;
    c.getContext('2d').drawImage(img, sx, sy, sz, sz, 0, 0, 72, 72);
    url = c.toDataURL('image/png');
  } catch (err) { url = ''; }
  portraitCache.set(spr, url); return url;
}
// 当たった場所（体の表面）。塗料の跡は付けない（白い閃光と砂埃だけ）
function hitSurface(e, pt, from) {
  const p = e.s.position, n = new V3(from.x - p.x, 0, from.z - p.z);
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1); n.normalize();
  return new V3(p.x + n.x * 0.14, clamp(pt.y, e.baseY + 0.1, e.baseY + e.figH), p.z + n.z * 0.14);
}
// 刺さった練習矢：体に取り付ける（倒れると一緒に伏せる）
function stickArrow(e, pt, dir) {
  const d = dir.clone().normalize(), p = e.s.position;
  const hz = new V3(-d.x, 0, -d.z); if (hz.lengthSq() < 1e-6) hz.set(0, 0, 1); hz.normalize();
  const m = arrowTpl.player.clone();
  const surf = new V3(p.x + hz.x * 0.1, clamp(pt.y, e.baseY + 0.2, e.baseY + e.figH * 0.92), p.z + hz.z * 0.1);
  m.quaternion.setFromUnitVectors(Z, d);
  m.position.copy(surf).addScaledVector(d, -0.36); m.updateMatrixWorld(true);
  e.s.attach(m);
  e.stuck.push(m); if (e.stuck.length > 10) { const o = e.stuck.shift(); o.parent && o.parent.remove(o); }
}
function disposeNpc(e) {
  if (MOTION) Mo.free(e);
  scene.remove(e.s);
  for (const m of e.mats) m.dispose();
  scene.remove(e.bg); scene.remove(e.fg); e.fg.material.dispose(); scene.remove(e.mk);
  if (e.extra) for (const o of e.extra) o.parent && o.parent.remove(o);
}
// 接地影
const shadowTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
// 被弾の閃光（白）と、攻撃の溜め（暖色）
function npcGlow(e, r, g, b) { const t = e.tintBase || ZERO3; for (const m of e.mats) if (m.userData.uAdd) m.userData.uAdd.value.setRGB(r * 0.75 + t[0], g * 0.75 + t[1], b * 0.75 + t[2]); }
const ZERO3 = [0, 0, 0];
// ====================================================================
//  モーション（?motion=0 で無効）
//   実在の人の歩き・小走り・走り（CMU モーションキャプチャ）と、膝から崩れて倒れる動き（Quaternius CC0）を
//   lib/motion_data.js に関節位置の表として焼き込み、写真の侍女の「動き」と「影・厚み」にだけ使う。
//   ・写真の板：歩幅・足の運びに合わせた上下動・左右の揺れ・前傾・胴のひねり（性格・身長で個人差）
//   ・見えない人形（円柱と球）：影だけを落とす（画面には描かない＝別人の体や顔は一切表示しない）
//   ・倒れるとき：膝が抜けて沈み、腰を支点に前へ倒れる。倒れた体は人形の影と凸凹の接地影で厚みを出す
// ====================================================================
const MOTION = !/[?&]motion=0/.test(location.search) && !!window.MOTION_DATA;
const MOTION_DBG = MOTION && /[?&]motiondbg=1/.test(location.search);   // 開発用：人形を半透明で表示
const MSHADOW = MOTION && !/[?&]mshadow=0/.test(location.search);
// 性格ごとの動きの癖（bob＝上下, sway＝左右, lean＝前傾, twist＝ひねり, cad＝歩調）
const MSTYLE = { 好戦的: { bob: 1.0, sway: 0.85, lean: 1.35, twist: 1.1, cad: 1.05 }, 慎重: { bob: 0.8, sway: 0.9, lean: 1.0, twist: 0.8, cad: 0.97 },
  臆病: { bob: 0.75, sway: 1.15, lean: 1.2, twist: 0.7, cad: 1.08 }, 冷静: { bob: 0.8, sway: 0.75, lean: 0.9, twist: 0.85, cad: 0.95 },
  陽気: { bob: 1.35, sway: 1.2, lean: 0.95, twist: 1.25, cad: 1.02 } };
const Mo = MOTION ? (() => {
  const D = window.MOTION_DATA, JN = D.joints.length, N3 = JN * 3, I = {};
  D.joints.forEach((k, i) => { I[k] = i * 3; });
  const C = {};
  for (const k in D.clips) {
    const c = Object.assign({}, D.clips[k]); c.f = new Float32Array(c.f);
    let hy = 0, lf = 0, ll = 0;
    for (let i = 0; i < c.n; i++) { const o = i * N3; hy += c.f[o + I.hips + 1];
      const uy = c.f[o + I.neck + 1] - c.f[o + I.hips + 1]; lf += Math.atan2(c.f[o + I.neck + 2] - c.f[o + I.hips + 2], uy); ll += Math.atan2(c.f[o + I.neck] - c.f[o + I.hips], uy); }
    c.hipY = hy / c.n; c.leanF = lf / c.n; c.leanL = ll / c.n;   // 腰の平均の高さ、上体の平均の傾き（人による癖なので差し引く）
    C[k] = c;
  }
  const GAITS = [C.walk, C.jog, C.run];
  // 速さによる前傾（度）：小走り・走りは計測値（待機姿勢との差 約6°/12°）を写真向けに控えめに、歩きはほぼ直立
  const LEAN_T = [1.5, 4.7, 8.5].map(d => d * Math.PI / 180);
  const tmpA = new Float32Array(N3), tmpB = new Float32Array(N3);
  function sample(c, u, out, w, acc) {
    const n = c.n, x = c.loop ? (((u % 1) + 1) % 1) * n : clamp(u, 0, 1) * (n - 1);
    const i0 = Math.floor(x), f = x - i0, i1 = c.loop ? (i0 + 1) % n : Math.min(n - 1, i0 + 1), a = i0 * N3, b = i1 * N3, F = c.f;
    for (let j = 0; j < N3; j++) { const v = F[a + j] + (F[b + j] - F[a + j]) * f; out[j] = acc ? out[j] + v * w : v * w; }
  }
  // 速さ（身長/秒）→ 歩き・小走り・走りの重み
  function gaitW(sh, w) {
    w[0] = w[1] = w[2] = 0;
    if (sh <= GAITS[0].speed) w[0] = 1;
    else if (sh <= GAITS[1].speed) { const t = (sh - GAITS[0].speed) / (GAITS[1].speed - GAITS[0].speed); w[0] = 1 - t; w[1] = t; }
    else if (sh <= GAITS[2].speed) { const t = (sh - GAITS[1].speed) / (GAITS[2].speed - GAITS[1].speed); w[1] = 1 - t; w[2] = t; }
    else w[2] = 1;
  }
  // ---- 影だけを落とす人形（InstancedMesh 2つ＝影の描画は2回だけ） ----
  const CAP = 300, FAR = 37;
  const far = new Uint8Array(CAP);
  const SEG = [['lHip', 'lKnee', 0.058], ['lKnee', 'lAnkle', 0.042], ['lAnkle', 'lToe', 0.03], ['rHip', 'rKnee', 0.058], ['rKnee', 'rAnkle', 0.042], ['rAnkle', 'rToe', 0.03],
    ['hips', 'chest', 0.085], ['chest', 'neck', 0.075], ['neck', 'head', 0.03], ['lSh', 'lEl', 0.03], ['lEl', 'lWr', 0.025], ['rSh', 'rEl', 0.03], ['rEl', 'rWr', 0.025],
    ['lSh', 'rSh', 0.04]].map(([a, b, r]) => [I[a], I[b], r]);
  const SPH = [['head', 0.068, 0.012], ['hips', 0.09, 0], ['lHip', 0.065, 0], ['rHip', 0.065, 0], ['chest', 0.088, 0], ['lKnee', 0.045, 0], ['rKnee', 0.045, 0],
    ['lAnkle', 0.034, 0], ['rAnkle', 0.034, 0], ['lSh', 0.04, 0], ['rSh', 0.04, 0], ['lEl', 0.028, 0], ['rEl', 0.028, 0], ['lWr', 0.026, 0], ['rWr', 0.026, 0]]
    .map(([a, r, up]) => [I[a], r, up]);
  const NS = SEG.length, NP = SPH.length;
  let cyl = null, sph = null;
  const free = []; for (let i = CAP - 1; i >= 0; i--) free.push(i);
  let maxUsed = 0, dirty = false;
  if (MSHADOW || MOTION_DBG) {
    const mat = MOTION_DBG ? new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true, opacity: 0.45 })
      : new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    cyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1), mat, CAP * NS);
    sph = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), mat, CAP * NP);
    for (const m of [cyl, sph]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.array = m.instanceMatrix.array; m.array.fill(0);
      m.frustumCulled = false; m.castShadow = true; m.count = 0;
      // 色も深度も書かない材質：画面には何も描かれず、太陽の影の描画にだけ使われる
      scene.add(m);
    }
  }
  function alloc() { if (!cyl || !free.length) return -1; const s = free.pop(); maxUsed = Math.max(maxUsed, s + 1); return s; }
  function release(s) {
    if (s < 0 || !cyl) return;
    cyl.array.fill(0, s * NS * 16, (s + 1) * NS * 16); sph.array.fill(0, s * NP * 16, (s + 1) * NP * 16);
    free.push(s); far[s] = 0; dirty = true;
  }
  // 人形の関節（体の座標：x=左, y=上, z=前、身長=1）を世界へ置き、円柱と球の行列を書く
  const W = new Float32Array(N3);
  function write(slot, P, ox, oy, oz, yaw, h) {
    if (slot < 0 || !cyl) return;
    // 影の届く範囲（±34m）の外の人形は書かない（大軍でも影の描画を軽く）
    if (Math.abs(ox - player.pos.x) > FAR || Math.abs(oz - player.pos.z) > FAR) {
      if (!far[slot]) { far[slot] = 1; cyl.array.fill(0, slot * NS * 16, (slot + 1) * NS * 16); sph.array.fill(0, slot * NP * 16, (slot + 1) * NP * 16); dirty = true; }
      return;
    }
    far[slot] = 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let j = 0; j < N3; j += 3) { const x = P[j], z = P[j + 2]; W[j] = ox + (x * c + z * s) * h; W[j + 1] = oy + Math.max(0.02, P[j + 1]) * h; W[j + 2] = oz + (-x * s + z * c) * h; }
    let a = cyl.array, o = slot * NS * 16;
    for (const [ia, ib, r0] of SEG) {
      const ax = W[ia], ay = W[ia + 1], az = W[ia + 2];
      let dx = W[ib] - ax, dy = W[ib + 1] - ay, dz = W[ib + 2] - az; const L = Math.hypot(dx, dy, dz) || 1e-4; dx /= L; dy /= L; dz /= L;
      // 軸に垂直な2本
      let px, py, pz;
      if (Math.abs(dz) < 0.9) { px = dy; py = -dx; pz = 0; } else { px = 0; py = dz; pz = -dy; }   // dir × z（z に近いときは dir × x）
      const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
      const qx = py * dz - pz * dy, qy = pz * dx - px * dz, qz = px * dy - py * dx, r = r0 * h;
      a[o] = px * r; a[o + 1] = py * r; a[o + 2] = pz * r; a[o + 3] = 0;
      a[o + 4] = dx * L; a[o + 5] = dy * L; a[o + 6] = dz * L; a[o + 7] = 0;
      a[o + 8] = qx * r; a[o + 9] = qy * r; a[o + 10] = qz * r; a[o + 11] = 0;
      a[o + 12] = ax + dx * L / 2; a[o + 13] = ay + dy * L / 2; a[o + 14] = az + dz * L / 2; a[o + 15] = 1; o += 16;
    }
    a = sph.array; o = slot * NP * 16;
    for (const [ij, r0, up] of SPH) {
      const r = r0 * h;
      a.fill(0, o, o + 16); a[o] = a[o + 5] = a[o + 10] = r; a[o + 12] = W[ij]; a[o + 13] = W[ij + 1] + up * h; a[o + 14] = W[ij + 2]; a[o + 15] = 1; o += 16;
    }
    dirty = true;
  }
  // 2関節の IK（股関節・足首を固定し、膝を前へ出す）
  function legIK(P, h, k, a) {
    const hx = P[h], hy = P[h + 1], hz = P[h + 2], ax = P[a], ay = P[a + 1], az = P[a + 2];
    const d = Math.hypot(ax - hx, ay - hy, az - hz), L = 0.245, m = Math.min(d / 2, L * 0.999), e = Math.sqrt(L * L - m * m);
    let ux = (ax - hx) / (d || 1), uy = (ay - hy) / (d || 1), uz = (az - hz) / (d || 1);
    let fx = -ux * uz, fy = -uy * uz, fz = 1 - uz * uz; const fl = Math.hypot(fx, fy, fz) || 1;   // 前方向から軸成分を除く
    P[k] = (hx + ax) / 2 + fx / fl * e; P[k + 1] = (hy + ay) / 2 + fy / fl * e; P[k + 2] = (hz + az) / 2 + fz / fl * e;
  }
  const UPPER = ['hips', 'lHip', 'rHip', 'chest', 'neck', 'head', 'lSh', 'lEl', 'lWr', 'rSh', 'rEl', 'rWr'].map(k => I[k]);
  const ARMS_L = [I.lEl, I.lWr], ARMS_R = [I.rEl, I.rWr];
  function setRel(P, j, base, x, y, z, w) { P[j] += (P[base] + x - P[j]) * w; P[j + 1] += (P[base + 1] + y - P[j + 1]) * w; P[j + 2] += (P[base + 2] + z - P[j + 2]) * w; }
  const out = { bob: 0, sway: 0, surge: 0, roll: 0, twist: 0, w: 0 };
  const _fm = new THREE.Matrix4(), ghosts = [];
  return {
    C, I, N3,
    init(e) {
      e.mo = { ph: Math.random(), gw: 0, aw: 0, cw: 0, wts: [1, 0, 0], st: MSTYLE[e.prof.pers] || MSTYLE.冷静, pose: new Float32Array(N3), slot: alloc(), lie: 0 };
      e.stepT = e.mo.ph * Math.PI * 2;
    },
    free(e) { if (e.mo) { release(e.mo.slot); e.mo.slot = -1; } if (e.aoMesh) { e.aoMesh.parent && e.aoMesh.parent.remove(e.aoMesh); e.aoMesh.geometry.dispose(); e.aoMesh = null; } },
    // 足の運び：実際の移動速度から歩調を決め、位相（0＝左足が前で接地）を進める。戻り値は従来の stepT（π ごとに一歩）
    step(e, dt, sv) {
      const mo = e.mo, sh = sv / e.figH; gaitW(sh, mo.wts);
      let stride = 0; for (let i = 0; i < 3; i++) stride += GAITS[i].stride * mo.wts[i];
      if (sh < GAITS[0].speed) stride *= Math.max(0.55, Math.sqrt(sh / GAITS[0].speed));   // ゆっくりのときは歩幅も縮む
      mo.ph += dt * sh / stride * mo.st.cad;
      return mo.ph * Math.PI * 2;
    },
    // 立っている・歩いている娘：姿勢を作り、板の動き（out）を返す。rel = カメラ方向 − 体の向き
    drive(e, dt, sv, moving, acting, rel) {
      const mo = e.mo, P = mo.pose, st = mo.st;
      mo.gw += ((moving ? 1 : 0) - mo.gw) * Math.min(1, dt * 7);
      mo.aw += ((acting ? 1 : 0) - mo.aw) * Math.min(1, dt * 8);
      const crouch = Math.max(e.crouch || 0, e.kneel ? 1 : 0);
      // 歩容（3つを同じ位相で混ぜる）と待機
      tmpA.fill(0);
      for (let i = 0; i < 3; i++) if (mo.wts[i] > 0.001) sample(GAITS[i], mo.ph, tmpA, mo.wts[i], true);
      sample(C.idle, time / C.idle.dur + e.ph, tmpB, 1, false);
      const g = mo.gw;
      let hipMean = 0; for (let i = 0; i < 3; i++) hipMean += GAITS[i].hipY * mo.wts[i];
      for (let j = 0; j < N3; j++) P[j] = tmpB[j] + (tmpA[j] - tmpB[j]) * g;
      // ---- 板の動き（腰の上下・左右・前後、上体の傾き、肩と腰のひねり） ----
      const amp = e.figH;
      out.w = g;
      out.bob = (tmpA[I.hips + 1] - hipMean) * amp * st.bob * 0.9;
      out.sway = tmpA[I.hips] * amp * st.sway * 0.8;
      out.surge = tmpA[I.hips + 2] * amp * 0.5;
      const uy = tmpA[I.neck + 1] - tmpA[I.hips + 1];
      let aF = Math.atan2(tmpA[I.neck + 2] - tmpA[I.hips + 2], uy), aL = Math.atan2(tmpA[I.neck] - tmpA[I.hips], uy);
      for (let i = 0; i < 3; i++) { const w = mo.wts[i]; aF += w * (LEAN_T[i] - GAITS[i].leanF); aL -= w * GAITS[i].leanL; }
      aF *= st.lean;
      const ca = Math.cos(rel), sa = Math.sin(rel);
      out.roll = -Math.asin(clamp(Math.sin(aL) * ca - Math.sin(aF) * sa, -0.5, 0.5)) * 0.85;   // 画面の上での体の傾き（横から見ると前傾、正面からは左右の揺れ）
      const shY = Math.atan2(tmpA[I.lSh + 2] - tmpA[I.rSh + 2], tmpA[I.lSh] - tmpA[I.rSh]), hpY = Math.atan2(tmpA[I.lHip + 2] - tmpA[I.rHip + 2], tmpA[I.lHip] - tmpA[I.rHip]);
      out.twist = angDiff(hpY, shY) * 0.35 * st.twist;
      // ---- 影の人形：しゃがみ（IK）・構え ----
      mo.cw += (crouch - mo.cw) * Math.min(1, dt * 6);
      const cw = mo.cw;
      if (cw > 0.01) {
        const dy = cw * 0.27, hy = P[I.hips + 1];
        for (const j of UPPER) { P[j + 1] -= dy; P[j + 2] += cw * 0.22 * Math.max(0, P[j + 1] + dy - hy); }
        legIK(P, I.lHip, I.lKnee, I.lAnkle); legIK(P, I.rHip, I.rKnee, I.rAnkle);
      }
      const aw = mo.aw;
      if (aw > 0.01) {
        if (e.kind === 'archer') {   // 弓：左腕を的へ、右手は引き分けて肩口へ
          setRel(P, I.lEl, I.lSh, 0.02, 0.01, 0.15, aw); setRel(P, I.lWr, I.lSh, 0.03, 0.03, 0.31, aw);
          setRel(P, I.rEl, I.rSh, -0.07, 0.03, -0.05, aw); setRel(P, I.rWr, I.rSh, 0.05, 0.07, 0.04, aw);
        } else {                      // 懐刀：右手を前へ突く
          setRel(P, I.rEl, I.rSh, 0.0, -0.06, 0.15, aw); setRel(P, I.rWr, I.rSh, 0.04, -0.05, 0.3, aw);
        }
      }
      if (mo.slot >= 0) { const p = e.s.position; write(mo.slot, P, p.x, p.y, p.z, e.s.rotation.y, e.figH); }
      return out;
    },
    // 倒れる（u: 0→1）。人形は倒れる向き fallYaw の座標で死の動きをたどる。板には腰の位置と上体の角度を返す
    death(e, u) {
      const mo = e.mo, P = mo.pose;
      if (!isFinite(e.fallYaw)) e.fallYaw = e.s.rotation.y;
      sample(C.death, u, P, 1, false);
      if (mo.slot >= 0) { const p = e.s.position; write(mo.slot, P, p.x, p.y, p.z, e.fallYaw, e.figH); }
      const hx = P[I.hips], hy = P[I.hips + 1], hz = P[I.hips + 2];
      const th = Math.atan2(P[I.neck + 2] - hz, P[I.neck + 1] - hy);
      return { hx, hy, hz, th, hr: C.death.f[I.hips + 1] };
    },
    // 倒れる写真：体の軸（腰→首）を人形と同じに傾け、板はできるだけカメラへ向ける（横から見れば画面の中で倒れ、
    // 手前・奥へ倒れるときは縮んで見える）。腰を支点にするので、膝が抜けると脚は地面の下に沈んで見えない
    fallSprite(e, D, bounce) {
      // 足を地面に置いたまま（写真は決して地面の下に入らない）：膝が抜ける間は写真を少し縦に縮め、上体が倒れるにつれて足元を支点に倒す
      const H = e.figH, r = e.s.rotation.y, ry = e.fallYaw - r;
      // 写真は膝を曲げられないので、膝が抜けて腰が落ちる分も「足元を支点に傾く」角度に足し、いったん傾いたら起き上がらない（単調）
      const drop = clamp(1 - D.hy / Math.max(0.05, D.hr), 0, 1), thE = Math.max(D.th, drop * 0.95);
      if (thE > 0.02) e.fallTh = Math.max(e.fallTh || 0, thE);
      const th = e.fallTh ? Math.min(1.55, e.fallTh) : clamp(D.th * 0.3, -0.2, 0), s = Math.sin(th), c = Math.cos(th);   // 最初の反り返り（攻撃側へ）は控えめに
      const ux = Math.sin(ry) * s, uy = c, uz = Math.cos(ry) * s;
      const p = e.s.position, wx = camera.position.x - p.x, wy = camera.position.y - (p.y + 0.4), wz = camera.position.z - p.z;
      let cx = wx * Math.cos(r) - wz * Math.sin(r), cy = wy, cz = wx * Math.sin(r) + wz * Math.cos(r);
      const d = cx * ux + cy * uy + cz * uz; cx -= d * ux; cy -= d * uy; cz -= d * uz;
      let cl = Math.hypot(cx, cy, cz);
      if (cl < 1e-3) { cx = 0; cy = 1; cz = 0; cl = 1; }
      cx /= cl; cy /= cl; cz /= cl;
      const xx = uy * cz - uz * cy, xy = uz * cx - ux * cz, xz = ux * cy - uy * cx;
      _fm.set(xx, ux, cx, 0, xy, uy, cy, 0, xz, uz, cz, 0, 0, 0, 0, 1);
      e.tilt.quaternion.setFromRotationMatrix(_fm);
      // 膝が抜ける量（腰の沈み）→ 写真の縦の縮み（最大 16%）。横たわるにつれ元の長さへ
      if (e.fallSY0 == null) e.fallSY0 = e.bb.scale.y;
      const buckle = clamp((D.hr - D.hy) / Math.max(0.05, D.hr - 0.2), 0, 1);
      const h = e.fallSY0 * (1 - 0.16 * buckle * (1 - s)); e.bb.scale.y = h;
      // 足元の位置（倒れる向きへ少し滑る）
      const fz = Math.max(0, D.hz - s * D.hr) * H, fx = D.hx * H;
      const lx = fx * Math.cos(ry) + fz * Math.sin(ry), lz = -fx * Math.sin(ry) + fz * Math.cos(ry);
      // 板の四隅のうち一番低い所が地面より上に来るよう持ち上げる
      const w = Math.abs(e.bb.scale.x), bx = e.bb.position.x;
      let minY = 0;
      for (const qx of [bx - w / 2, bx + w / 2]) for (const qy of [0, h]) minY = Math.min(minY, xy * qx + uy * qy);
      e.tilt.position.set(lx, -minY + 0.01 + bounce, lz);
    },
    // 倒れ終わりの写真を 0.3 秒かけて薄くし、横たわった写真（down）へつなぐ
    ghost(e) {
      if (!e.fr) return;
      e.bb.updateMatrixWorld(true);
      const m = new THREE.Mesh(spriteGeo, new THREE.MeshBasicMaterial({ map: e.fr.tex, transparent: true, depthWrite: false, alphaTest: 0.05, side: THREE.DoubleSide }));
      m.matrixAutoUpdate = false; m.matrix.copy(e.bb.matrixWorld); scene.add(m); ghosts.push({ m, t: 0 });
    },
    fade(dt) {
      for (let i = ghosts.length - 1; i >= 0; i--) { const g = ghosts[i]; g.t += dt; g.m.material.opacity = Math.max(0, 1 - g.t / 0.3);
        if (g.t >= 0.3) { scene.remove(g.m); g.m.material.dispose(); ghosts.splice(i, 1); } }
    },
    // 倒れた体の接地影（関節ごとの柔らかい影を1枚の形にまとめる）。e.s の座標（体の向き＝fallYaw）で作る
    contactAO(e) {
      if (!isFinite(e.fallYaw)) e.fallYaw = e.s.rotation.y;
      const P = e.mo.pose, h = e.figH, ry = e.fallYaw - e.s.rotation.y, cr = Math.cos(ry), sr = Math.sin(ry), pts = [['hips', 0.17, 0.8], ['chest', 0.16, 0.85], ['head', 0.1, 0.7], ['lKnee', 0.075, 0.55], ['rKnee', 0.075, 0.55],
        ['lAnkle', 0.06, 0.45], ['rAnkle', 0.06, 0.45], ['lEl', 0.06, 0.4], ['rEl', 0.06, 0.4], ['lSh', 0.08, 0.5], ['rSh', 0.08, 0.5]];
      const pos = [], uv = [], col = [], idx = [];
      pts.forEach(([k, r, a], n) => {
        const j = I[k], x0 = P[j] * h, z0 = P[j + 2] * h, x = x0 * cr + z0 * sr, z = -x0 * sr + z0 * cr, R = r * h * 1.6;
        pos.push(x - R, 0, z - R, x + R, 0, z - R, x + R, 0, z + R, x - R, 0, z + R);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        for (let q = 0; q < 4; q++) col.push(1, 1, 1, a);
        const b = n * 4; idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      });
      const gq = new THREE.BufferGeometry();
      gq.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gq.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      gq.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); gq.setIndex(idx);
      const m = new THREE.Mesh(gq, aoMat); m.position.y = 0.018; m.renderOrder = 1;
      e.s.add(m); e.aoMesh = m;
    },
    flush() {
      if (!cyl || !dirty) return;
      cyl.count = maxUsed * NS; sph.count = maxUsed * NP;
      cyl.instanceMatrix.needsUpdate = sph.instanceMatrix.needsUpdate = true; dirty = false;
    },
    get used() { return CAP - free.length; },
  };
})() : null;
const aoMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, vertexColors: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
// 太陽の影（人形だけが落とす）：プレイヤーの周り ±34m を追いかける
if (MSHADOW) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  const S = sun.shadow, R = 34;
  S.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  Object.assign(S.camera, { left: -R, right: R, top: R, bottom: -R, near: 20, far: 320 }); S.camera.updateProjectionMatrix();
  S.bias = -0.0004; S.normalBias = 0.02; S.radius = 3;
  scene.add(sun.target);
  ground.receiveShadow = true; road.receiveShadow = true;
  shadowMat.opacity = 0.6;   // 足元の丸い影は接地の陰りとして薄めに残す
}
const SUN_DIR = sun.position.clone().normalize(), SUN_DIR0 = SUN_DIR.clone();
const MSHADOW_FORCE = /[?&]mshadow=1/.test(location.search);   // 自動の軽量化をしない（テスト撮影用）
const shadowGuard = { t: 0, n: 0, sum: 0, level: 0, frame: 0 };
if (MSHADOW && MOBILE) renderer.shadowMap.autoUpdate = false;   // スマホ：影は1フレームおきに更新
function updateSunShadow(realDt) {
  if (!MSHADOW || !sun.castShadow) return;
  if (MOBILE) renderer.shadowMap.needsUpdate = (++shadowGuard.frame & 1) === 0;
  // 重い端末では自動で軽く：まず影の解像度を下げ、それでも遅ければ太陽の影を止める（動き・接地影は残る）
  if (state === 'play' && !MSHADOW_FORCE && realDt > 0) {
    const G = shadowGuard; G.t += realDt; G.sum += realDt; G.n++;
    if (G.t > 5) {
      const avg = G.sum / G.n; G.t = G.sum = G.n = 0;
      if (avg > 0.03) {
        if (G.level === 0) { G.level = 1; sun.shadow.mapSize.set(1024, 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
        else { G.level = 2; sun.castShadow = false; shadowMat.opacity = 1; console.info('motion: sun shadows off (slow device)'); return; }
      }
    }
  }
  const c = player.pos, step = 68 / sun.shadow.mapSize.x;
  const x = Math.round(c.x / step) * step, z = Math.round(c.z / step) * step;
  sun.target.position.set(x, 0, z); sun.position.set(x + SUN_DIR.x * 160, SUN_DIR.y * 160, z + SUN_DIR.z * 160);
  sun.target.updateMatrixWorld();
}
function stageReceiveShadows() {
  if (!MSHADOW) return;
  stageRoot.traverse(o => { if (o.isMesh && o.material && (o.material.isMeshLambertMaterial || o.material.isMeshStandardMaterial)) o.receiveShadow = true; });
}
function npcTint(e, k) { if (e.flash > 0) return; npcGlow(e, 0.3 * k, 0.14 * k, 0); }
// 笛役の娘が正面写真しか無いときに持たせる横笛
const fluteMat = { body: new THREE.MeshBasicMaterial({ color: 0x3a2416 }), band: new THREE.MeshBasicMaterial({ color: 0x0f0c0a }) };
function makeFlute() {
  const g = new THREE.Group(), L = 0.42;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, L, 8), fluteMat.body); tube.rotation.z = Math.PI / 2; g.add(tube);
  for (const x of [-0.19, -0.12, 0.17, 0.2]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 8), fluteMat.band); b.rotation.z = Math.PI / 2; b.position.x = x; g.add(b); }
  return g;
}

// ====================================================================
//  侍女（NPC）の個性：名前・身長・性格・声・台詞
// ====================================================================
const SURN = ['朝倉', '浅野', '一条', '今井', '上原', '大谷', '尾上', '片桐', '北村', '九条', '黒川', '小早瀬', '斎木', '佐伯', '柴崎',
  '白石', '杉浦', '高遠', '竹内', '立野', '月岡', '長浜', '西園', '野々宮', '橋本', '早瀬', '日向', '藤堂', '松浦', '水瀬', '宮園', '村雨', '森川', '結城', '吉野', '若松'];
const GIVEN = ['千代', '小春', '楓', '椿', 'あやめ', '葵', '鈴', '雪乃', '静', '琴', '茜', 'なでしこ', '桔梗', '綾', '初音', '紅葉', '澪', '凛',
  '若菜', '早苗', '志乃', '八重', '花', '蓮', '菫', '朱里', '霞', '千鶴', 'ひなた', '詩織', '咲良', '真白', '夕霧', '桃', '小雪', '藍'];
const PERS = {
  好戦的: { desc: '好戦的', pitch: 1.25, rate: 1.2, speed: 1.2, atkCd: [0.6, 1.1], hideT: [0.5, 1.2], aimErr: 0.035, aimT: 0.65, keep: [10, 20], retreat: false,
    lines: { spot: ['見つけたっ！ いくよ！', 'いたいた、勝負だよ！', 'よーし、腕が鳴るね！'], attack: ['てやぁっ！', '覚悟しなっ！', 'もらったぁ！'], hit: ['まだまだっ！', 'ふん、効かないね！', 'やるじゃない…！', 'ぐっ…やってくれるね！', 'くっ…！ まだいける！', 'はっ…この程度！', 'いたっ！', 'うっ！ やるじゃん！', 'あっ…！ もう一回！', 'いたた…上等！', 'ちょ、今の反則でしょ！', 'えっ、私！？ 上等じゃん！'], defeat: ['くっ…ここまでか…！', 'あーもう、覚えてなさい！', '次は負けないからね！', 'ぐっ…不覚…！', 'くっ…悔しい！', 'うっ…あとは頼んだよ！', 'やられたー…！', 'くやしい…次は勝つ！', 'ごめん…先に抜けるね！', 'あーもう、やられたー！'], callR: ['右から来てる！'], callL: ['左、回り込まれてる！'], cover: ['援護お願い！ 早く！'], ammo: ['矢、あと少ししかない！'], push: ['いける、押して！'], fall: ['無理無理、いったん下がる！'], seiran: ['せいらん狙って！'], ladder: ['はしご、登ってきてる！'], allydown: ['うそでしょ…！', '仇とるから！', 'よくも！'], kill: ['よっしゃ！', 'やった！', 'おつかれー！'], order_m: ['分隊、前へ！', '一気に行くよ、前へ！'], order_a: ['撃てー！', 'たけたばに隠れて！'], lead: ['私が指揮をとる！ ついてきて！'] } },
  慎重: { desc: '慎重', pitch: 1.1, rate: 1.0, speed: 0.9, atkCd: [1.2, 2.0], hideT: [3.5, 6.0], aimErr: 0.022, aimT: 1.1, keep: [20, 32], retreat: false, cautious: true,
    lines: { spot: ['…敵、発見。', '慎重に、いきましょう。', 'しっ…気づかれないように。'], attack: ['…今っ！', 'そこ、ですね。', '狙って…はいっ！'], hit: ['くっ…油断しました。', 'しまった…！', '…悔しい、当てられました。', 'うっ…！ 下がります。', 'はっ…危なかった。', 'くっ…位置がばれましたか。', 'うっ…！', 'あっ…当てられました。', 'えっ、私ですか…？', 'いたっ…油断しました。', 'ひっ…！ 見られていました。', 'うそ、当たった…？'], defeat: ['…無念です。', '読み違えましたね…', '慎重すぎた、かしら…', 'くっ…不覚…！', 'あとは、頼みます…', 'うっ…戦死判定、ですね。', '無念…です。', 'ごめんなさい…先に抜けますね。', 'くやしいです…', '…ここで脱落ですね。'], callR: ['右から来ています！'], callL: ['左、回り込まれています！'], cover: ['援護をお願いします！'], ammo: ['矢が、あと少ししかありません！'], push: ['いけます、押しましょう！'], fall: ['無理です、下がります！'], seiran: ['せいらんを狙ってください！'], ladder: ['はしご、登ってきています！'], allydown: ['うそでしょう…', '仇はとりますから。', 'そんな…！'], kill: ['やりました。', 'よし…！', 'おつかれさまでした。'], order_m: ['分隊、前へ。', '慎重に、前へ進みます！'], order_a: ['撃て！', 'たけたばに隠れてください！'], lead: ['私が指揮をとります。ついてきてください！'] } },
  臆病: { desc: '臆病', pitch: 1.55, rate: 1.25, speed: 1.0, atkCd: [1.3, 2.2], hideT: [2.0, 3.5], aimErr: 0.06, aimT: 1.0, keep: [24, 34], retreat: true,
    lines: { spot: ['ひっ、き、来た…！', 'こ、怖くなんかないもん！', 'え、えっと…敵です！'], attack: ['え、えいっ…！', '当たって…！ お願い！', 'やぁっ…！'], hit: ['わわっ！', 'む、無理〜！', 'いったん、下がりますっ！', 'きゃっ！', 'ひっ…！ こ、来ないで！', 'いやっ！ なんで私ばっかり！', 'ひっ！', 'いたい…！', 'いやっ！', 'ちょ、待って！ 待って！', 'うそ、当たった…', 'えっ、私！？ なんで！？'], defeat: ['やられた〜！', 'もう、だめ〜…', 'うう、負けちゃった…', 'きゃあっ！ やられちゃった…', 'すみません、脱落です！', 'ひっ…！ ここまでです…', 'やられたー…', 'ごめん…先に抜けるね…', 'くやしい…', 'うう…もう抜けます…'], callR: ['み、右から来てる！'], callL: ['ひ、左！ 回り込まれてる！'], cover: ['え、援護お願い！'], ammo: ['や、矢がもうないよ〜！'], push: ['い、いけるかも！ 押して！'], fall: ['無理無理、下がる！'], seiran: ['せ、せいらん狙って！'], ladder: ['はしご！ 登ってきてる！'], allydown: ['うそでしょ…', 'やだ…！', 'か、仇とるから…！'], kill: ['や、やった…！', '当たった…！', 'お、おつかれー…！'], order_m: ['ぶ、分隊、前へ！', 'み、みんな、前へ！'], order_a: ['う、撃てー！', 'たけたばに隠れて！'], lead: ['わ、私が指揮をとる…！ ついてきて！'] } },
  冷静: { desc: '冷静', pitch: 0.95, rate: 0.95, speed: 1.0, atkCd: [1.0, 1.5], hideT: [1.5, 2.5], aimErr: 0.008, aimT: 1.2, keep: [18, 28], retreat: false,
    lines: { spot: ['目標、確認。', '捕捉しました。', '…見えています。'], attack: ['射ます。', '狙い通りです。', 'そこです。'], hit: ['…被弾。問題ありません。', 'なるほど、やりますね。', '想定内です。', 'っ…かすっただけです。', 'はっ…いい腕ですね。', 'うっ…！ 修正します。', 'っ…！', 'あっ…。', 'うっ…想定外です。', 'いたっ…問題ありません。', 'えっ、私ですか。', '…当たりましたね。'], defeat: ['…戦死判定、了解です。', '完敗ですね。', '見事な腕前です。', '無念…ここまでですね。', 'くっ…計算違いでした。', 'あとは頼みます…', '無念…。', '脱落します。あとは任せました。', 'くやしいですが、ここまでです。', 'ごめんなさい、先に抜けます。'], callR: ['右、来ます。'], callL: ['左、回り込まれています。'], cover: ['援護を。'], ammo: ['矢、残りわずかです。'], push: ['押せます。前へ。'], fall: ['不利です。下がります。'], seiran: ['せいらんを狙って。'], ladder: ['はしご、登ってきます。'], allydown: ['…うそでしょう。', '仇はとります。', '…了解。続けます。'], kill: ['一人。', 'やりました。', 'おつかれさまでした。'], order_m: ['分隊、前へ。', '間合いを詰めます。前へ。'], order_a: ['撃て。', 'たけたばに隠れて。'], lead: ['指揮を引き継ぎます。ついてきて。'] } },
  陽気: { desc: '陽気', pitch: 1.4, rate: 1.15, speed: 1.1, atkCd: [0.9, 1.5], hideT: [1.0, 2.0], aimErr: 0.045, aimT: 0.8, keep: [14, 24], retreat: false,
    lines: { spot: ['みーつけたっ！', 'いっくよー！', 'あ、いたいた！ 勝負〜！'], attack: ['それっ！', 'くらえ〜っ！', 'えーいっ！'], hit: ['わっ、やったなー！', 'あはは、当たっちゃった！', 'もー、ずるい〜！', 'きゃっ！ やったなー！', 'うっ…！ 今のは効いた！', 'いやっ！ 当てられちゃった！', 'きゃっ！', 'いたっ！ もー！', 'あっ…！ やられたかも！', 'ちょ、待って！', 'うそ、当たった…', 'えっ、私？ うそでしょ！'], defeat: ['やられた〜！', 'あちゃ〜、負けちゃった！', 'あー、楽しかった〜！', 'きゃあっ！ やられた〜！', '悔しい〜！ 次は勝つからね！', 'すみません、脱落です！', 'やられたー…！', 'ごめん…先に抜けるね！', 'くやしい〜！', 'おつかれー…私はここまで！'], callR: ['右から来てるよー！'], callL: ['左、回り込まれてる！'], cover: ['援護お願い！'], ammo: ['矢、あと少ししかないよー！'], push: ['いけるいける、押して！'], fall: ['無理無理、下がるー！'], seiran: ['せいらん狙ってー！'], ladder: ['はしご、登ってきてるよ！'], allydown: ['うそでしょ…！', '仇とるからね！', 'えっ、やだ…！'], kill: ['よっしゃ！', 'やったー！', 'おつかれー！'], order_m: ['分隊、前へー！', 'みんな、行くよー！'], order_a: ['撃てー！', 'たけたばに隠れてー！'], lead: ['私が指揮とるね！ ついてきて！'] } },
};
const PERS_KEYS = Object.keys(PERS);
let usedNames = new Set();
function makeProfile() {
  let name = '';
  for (let k = 0; k < 30; k++) { name = pick(SURN) + ' ' + pick(GIVEN); if (!usedNames.has(name)) break; }
  usedNames.add(name);
  const pers = pick(PERS_KEYS), P = PERS[pers];
  const cm = Math.round(rand(150, 175));
  const pitch = clamp(P.pitch + rand(-0.15, 0.15) + (163 - cm) * 0.01, 0.6, 2);
  const dp = pitch - P.pitch;
  return { name, pers, cm, pitch, rate: clamp(P.rate + rand(-0.08, 0.08), 0.7, 1.6),
    vv: dp < -0.06 ? 0 : (dp > 0.06 ? 2 : 1) };   // 収録音声の声の高さ（3段階）
}
function npcSay(e, kind, prio = 0, chance = 1) {
  if (Math.random() > chance) return;
  if (e.silenced || (e.state === 'down' && kind !== 'defeat')) return;
  return Talk.as(e, () => npcSay0(e, kind, prio));
}
function npcSay0(e, kind, prio) {
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
  if (e.ojou || e.wasOjou) {
    const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra['ojou_' + kind];
    if (L && L.length) { const j = (Math.random() * L.length) | 0; if (!VoicePack.play(L[j].files[0], d, prio)) Voice.say(L[j].text, { pitch: 0.95, rate: 0.88 }, prio); }
    return;
  }
  if (e.sec2 || e.wasSec2) {
    const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra['sec2_' + kind];
    if (L && L.length) { const j = (Math.random() * L.length) | 0; if (!VoicePack.play(L[j].files[0], d, prio)) Voice.say(L[j].text, { pitch: 1.3, rate: 1.05 }, prio); }
    return;
  }
  if (e.secretary || e.wasSecretary) {
    const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra['sec_' + kind];
    if (L && L.length) {
      const j = (Math.random() * L.length) | 0;
      if (!VoicePack.play(L[j].files[0], d, prio)) Voice.say(L[j].text, { pitch: 1.05, rate: 0.95 }, prio);
    }
    return;
  }
  const lines = e.P.lines[kind], i = (Math.random() * lines.length) | 0;
  if (VoicePack.say(e.prof.pers, kind, i, e.prof.vv, d, prio)) return;
  Voice.say(lines[i], e.prof, prio);
}

// ====================================================================
//  ゲーム状態
// ====================================================================
const player = { pos: new V3(), speedT: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, kills: 0, allyKills: 0, arrows: 30, weapon: 0,
  drawing: false, charge: 0, swingT: -1, swingCd: 0, regenT: 0, hurtT: 0, switchT: 0, bob: 0, onGround: true, shake: 0 };
const keys = {};
let enemies = [], bodies = [], arrows = [], pickups = [];
let state = 'title';   // title | play | pause | over
let wave = { n: 0, toSpawn: 0, spawnT: 0, inter: 0, maxAlive: 8 };
let time = 0;

const barBgMat = new THREE.SpriteMaterial({ color: 0x000000, opacity: 0.6, transparent: true, depthWrite: false });
// 頭上のチームマーカー（青組＝青▼、橙組＝橙▼）
const markerTex = {};
for (const [team, col] of [['blue', '#2a8cff'], ['orange', '#ff8a12']]) {
  markerTex[team] = canvasTex(64, 64, g => {
    g.beginPath(); g.moveTo(8, 10); g.lineTo(56, 10); g.lineTo(32, 54); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  });
}
const markerMat = { blue: new THREE.SpriteMaterial({ map: markerTex.blue, transparent: true, depthWrite: false }),
                    orange: new THREE.SpriteMaterial({ map: markerTex.orange, transparent: true, depthWrite: false }) };
let npcId = 0;
// 医療係の目印（白い丸に組の色の「救」）と腕章
// 負傷の印（頭上の小さな白い札「負傷」。血の表現は使わない）
const woundMarkMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, map: canvasTex(96, 48, g => {
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.roundRect ? g.roundRect(4, 6, 88, 36, 10) : g.rect(4, 6, 88, 36); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#7a6a50'; g.stroke(); g.fillStyle = '#5a4a30'; g.font = 'bold 24px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('負傷', 48, 25);
}) });
const WOUND_K = 0.5, WOUND_SPEED = 0.55;   // 体力が半分以下で負傷（動きが遅くなる）
function setWounded(e, on) {
  if (on === !!e.wounded) return;
  e.wounded = on;
  if (on) {
    if (!e.wmk) { e.wmk = new THREE.Sprite(woundMarkMat); e.wmk.scale.set(0.36, 0.18, 1); e.wmk.renderOrder = 5; scene.add(e.wmk); e.extra.push(e.wmk); }
    e.wmk.visible = true; e.woundFight = Math.random() < 0.3;   // 約3割は遅いまま戦い続ける。残りは救護班のほうへ下がる
    e.cover = null; if (e.state === 'windup') { e.state = 'approach'; e.t = 0; }
  } else { if (e.wmk) e.wmk.visible = false; e.kneel = false; e.woundWait = false; }
}
// 負傷した娘（救護を待つ）：救護班が向かっていれば止まって膝をつく。そうでなければ自陣の救護所へ下がる。すぐ近くの敵には応戦する
function woundedBrain(e, dt) {
  if (e.perch || e.lad || e.onFloor || e.special) return false;
  const p = e.s.position;
  if (e.woundFight && !(e.medBy && e.medBy.state !== 'down' && Math.hypot(e.medBy.s.position.x - p.x, e.medBy.s.position.z - p.z) < 4)) return false;   // 戦い続ける娘も救護班が来れば止まって手当てを受ける
  for (const o of enemies) if (o.team !== e.team && o.state !== 'down' && !o.special && Math.abs(o.baseY - e.baseY) < 1.2 && Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < 2.4) { e.kneel = false; return false; }
  e.tgt = null; e.state = 'idle'; e.t += dt; e.cd -= dt;
  const m = e.medBy, mp = medPost[e.team];
  if (m && m.state !== 'down' && Math.hypot(m.s.position.x - p.x, m.s.position.z - p.z) < 7) { e.kneel = true; e.woundWait = true; e.faceWant = Math.atan2(m.s.position.x - p.x, m.s.position.z - p.z); e.passive = true; return true; }
  const [hx, hz] = mp || e.home || [p.x, p.z], d = Math.hypot(hx - p.x, hz - p.z);
  if (d > 4.5) { e.kneel = false; e.woundWait = false; steer(e, hx, hz, e.speed, dt); }
  else { e.kneel = true; e.woundWait = true; e.passive = true; e.faceWant = Math.atan2(hx - p.x, hz - p.z); }
  return true;
}
// ---- 秘書たちの武器：腰の帯に差した懐刀（鞘）。突くときは抜いた懐刀。弓で戦う秘書は弓を背負う（弓を引く写真の間は写真の弓） ----
const propGeo = new THREE.PlaneGeometry(1, 1);
const propMat = draw => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.05, map: canvasTex(32, 192, draw) });
const sayaMat = propMat((g, w, h) => {   // 柄（白い組紐の菱）・鍔・黒漆の鞘
  g.fillStyle = '#3a2618'; g.fillRect(10, 2, 12, 52); g.fillStyle = '#efe9da';
  for (let y = 6; y < 50; y += 10) { g.beginPath(); g.moveTo(16, y); g.lineTo(21, y + 5); g.lineTo(16, y + 10); g.lineTo(11, y + 5); g.closePath(); g.fill(); }
  g.fillStyle = '#b08a3a'; g.fillRect(7, 54, 18, 6);
  g.fillStyle = '#16120f'; g.fillRect(10, 60, 12, 128); g.fillStyle = '#6b4a2a'; g.fillRect(10, 182, 12, 6); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(12, 62, 2, 118);
});
const bladeMat = propMat((g, w, h) => {   // 抜いた懐刀（刃は銀、先は細く）
  g.fillStyle = '#3a2618'; g.fillRect(10, 128, 12, 62); g.fillStyle = '#efe9da';
  for (let y = 132; y < 186; y += 10) { g.beginPath(); g.moveTo(16, y); g.lineTo(21, y + 5); g.lineTo(16, y + 10); g.lineTo(11, y + 5); g.closePath(); g.fill(); }
  g.fillStyle = '#b08a3a'; g.fillRect(7, 120, 18, 8);
  const gr = g.createLinearGradient(9, 0, 23, 0); gr.addColorStop(0, '#9aa3ad'); gr.addColorStop(0.5, '#f4f7fa'); gr.addColorStop(1, '#8a929b');
  g.fillStyle = gr; g.beginPath(); g.moveTo(10, 120); g.lineTo(22, 120); g.lineTo(21, 20); g.lineTo(16, 4); g.lineTo(11, 20); g.closePath(); g.fill();
});
const slungBowMat = propMat((g, w, h) => {   // 背負った弓（弧と弦）
  g.strokeStyle = '#5a3418'; g.lineWidth = 4; g.beginPath(); g.moveTo(8, 4); g.quadraticCurveTo(30, 96, 8, 188); g.stroke();
  g.strokeStyle = 'rgba(240,235,220,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(8, 4); g.lineTo(8, 188); g.stroke();
  g.fillStyle = '#e8e0cc'; g.fillRect(19, 84, 6, 24);
});
function armSecretary(e) {
  const mk = (mat, w, h) => { const m = new THREE.Mesh(propGeo, mat); m.scale.set(w, h, 1); m.renderOrder = 3; e.tilt.add(m); return m; };
  e.armed = true;
  e.saya = mk(sayaMat, 0.065, 0.4);   // 実物より少し大きめ（遠目にも見えるように）
  e.blade = mk(bladeMat, 0.06, 0.36); e.blade.visible = false;
  if (e.kind === 'archer') e.slung = mk(slungBowMat, 0.16, 1.05);
}
// 写真に武器が写っていない見え方のとき、懐刀・弓を板の上に添える（板と同じ向き・左右反転）
function updateProps(e, fr, mirror, sgn) {
  const g = e.girl, h = e.figH, sg = mirror ? -1 : 1;
  const weaponPhoto = fr === g.stab || fr === g.bow || (fr === g.action && fr !== g.front);
  const down = e.state === 'down' || fr === g.kneel;
  const front = fr === g.front || fr === g.walk || fr === g.front_diag, back = fr === g.back || fr === g.back_diag;
  const striking = (e.state === 'windup' || e.state === 'recover') && e.kind !== 'archer';
  // 鞘：正面は左の腰（画面の右）、後ろ姿は画面の左、横は腰の後ろへ斜めに
  e.saya.visible = !down && !weaponPhoto;
  if (front) { e.saya.position.set(0.085 * h, 0.5 * h, 0.03); e.saya.rotation.z = 0.35; }
  else if (back) { e.saya.position.set(-0.085 * h, 0.5 * h, 0.03); e.saya.rotation.z = -0.35; }
  else { e.saya.position.set(-0.035 * h * sgn, 0.5 * h, 0.03); e.saya.rotation.z = 1.05 * sgn; }
  // 抜いた懐刀：突きの写真が無い娘が突くとき、胸の前で相手へ向ける
  e.blade.visible = striking && !weaponPhoto && !down;
  if (e.blade.visible) {
    const u = e.state === 'windup' ? 0 : 1;
    if (front) { e.blade.position.set(0.04 * h, (0.6 + 0.04 * u) * h, 0.06); e.blade.rotation.z = 0.2; }
    else { e.blade.position.set((0.12 + 0.1 * u) * h * sgn, 0.6 * h, 0.06); e.blade.rotation.z = -1.35 * sgn; }
    e.saya.scale.y = 0.24;   // 抜いている間は鞘だけ（短く見せる）
  } else e.saya.scale.y = 0.4;
  if (e.slung) {
    e.slung.visible = !down && fr !== g.bow && !(e.kind === 'archer' && (e.state === 'aim' || e.state === 'zanshin'));
    if (back) { e.slung.position.set(0.02 * h, 0.62 * h, 0.04); e.slung.rotation.z = 0.5; }
    else if (front) { e.slung.position.set(-0.13 * h, 0.62 * h, -0.03); e.slung.rotation.z = 0.5; }
    else { e.slung.position.set(-0.07 * h * sgn, 0.62 * h, -0.03); e.slung.rotation.z = 0.45 * sgn; }
  }
}
// ---- 秘書たちは身を守る：近く（本陣では 6.5m、殿についている間は殿か自分の 9m 以内）に来た橙組に懐刀（弓の秘書は弓）で応戦する ----
function secThreat(e) {
  const p = e.s.position, fol = (e.sec2 && sec2.mode !== 'hq') || (e.ojou && ojou.mode === 'follow') || (e.aide && e.aide.follow) || (e.secretary && sec.mode !== 'hq');
  const R = fol ? 9 : 6.5;
  if (e.defending && e.defending.state !== 'down' && enemies.includes(e.defending) && Math.hypot(e.defending.s.position.x - p.x, e.defending.s.position.z - p.z) < R + 3) return e.defending;
  let best = null, bd = R;
  for (const o of enemies) {
    if (o.team !== 'orange' || o.state === 'down' || o.special || o.seated || Math.abs(o.baseY - e.baseY) > 1.2) continue;
    const q = o.s.position, d = Math.hypot(q.x - p.x, q.z - p.z), dk = fol ? Math.hypot(q.x - player.pos.x, q.z - player.pos.z) + 1 : 99;
    const dd = Math.min(d, dk); if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}
const medicMarkMat = {};
for (const [team, col] of [['blue', '#2a8cff'], ['orange', '#ff8a12']]) {
  medicMarkMat[team] = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, map: canvasTex(64, 64, g => {
    g.beginPath(); g.arc(32, 32, 27, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 5; g.strokeStyle = col; g.stroke();
    g.fillStyle = col; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('救', 32, 34);
  }) });
}
const armbandGeo = new THREE.PlaneGeometry(1, 1);
const armbandMat = { blue: new THREE.MeshBasicMaterial({ color: 0x2a7ae0, side: THREE.DoubleSide }), orange: new THREE.MeshBasicMaterial({ color: 0xf08a20, side: THREE.DoubleSide }) };
const MEDIC_NAMES = { blue: '医療係 朝比奈 しずく', orange: '医療係 楠 かおる' };
const isFoe = e => e.team === 'orange' && !e.special && e.state !== 'down';   // 波の残り：橙組の救護班（非戦闘員）は数えない（v5 修正：以前は救護班が残ると波が終わらなかった）
// 秘書・笛役（special）は人数に数えない
const aliveOf = team => enemies.filter(e => e.team === team && e.state !== 'down' && !e.special);
// team: 'orange'（敵・橙組） / 'blue'（味方・青組）
function spawnEnemy(x, z, kind, captain, team = 'orange', opt = {}) {
  const g = (opt.girl && GIRLS[opt.girl]) || pickGirl(kind);
  if (!g) return null;
  const spr = g.spr;                                    // 照準パネルの顔写真
  const prof = makeProfile(), n = wave.n;
  prof.glasses = false;
  if (g.prof && !opt.medic && !opt.aide && !enemies.some(o => o.girl === g && o.state !== 'down')) Object.assign(prof, g.prof);   // 固有の娘（同じ写真が同時に二人いれば二人目は無名）
  if (opt.secretary) Object.assign(prof, { name: sec.name, pers: '冷静', cm: 160, vv: 1 });
  if (opt.fluter) Object.assign(prof, { name: fluter.name, pers: '陽気', cm: 156, vv: 2 });
  if (opt.sec2) Object.assign(prof, { name: sec2.name, pers: '陽気', cm: 158, vv: 2 });
  if (opt.medic) Object.assign(prof, { name: opt.medName, pers: opt.role === 'nurse' ? '陽気' : '冷静', cm: opt.role === 'nurse' ? 157 : 163, vv: opt.role === 'nurse' ? 2 : 1 });
  if (opt.aide) Object.assign(prof, { name: opt.aide.name, pers: opt.aide.pers, cm: opt.aide.cm, vv: opt.aide.vv });
  if (opt.ojou) Object.assign(prof, { name: ojou.name, pers: '冷静', cm: 158, vv: 0 });
  const P = PERS[prof.pers];
  if (captain) prof.name = '組頭 ' + prof.name;
  const figH = prof.cm / 100;
  const mat = spriteMat(g.front.tex), mats = [mat];
  const s = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.order = 'YXZ';
  const bb = new THREE.Mesh(spriteGeo, mat); tilt.add(bb); s.add(tilt);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.scale.set(0.75, 1, 0.6); shadow.position.y = 0.02; s.add(shadow);
  const baseY = opt.y || 0;
  s.position.set(x, baseY, z); s.rotation.y = team === 'orange' ? 0 : Math.PI; scene.add(s);
  const hpMax = opt.secretary ? 8 : opt.fluter || opt.medic ? 5 : opt.runner ? 4 : opt.sec2 || opt.aide || opt.ojou ? 6 : Math.max(2, Math.round((3 + Math.floor((n - 1) / 3)) * (captain ? 2.5 : 1)) - (kind === 'archer' ? 1 : 0));
  const bg = new THREE.Sprite(barBgMat); bg.scale.set(0.8, 0.08, 1); bg.visible = false; bg.renderOrder = 4; scene.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: team === 'blue' ? 0x5ab0ff : (captain ? 0xffd040 : 0xffa040), depthWrite: false }));
  fg.scale.set(0.76, 0.05, 1); fg.visible = false; fg.renderOrder = 5; scene.add(fg);
  const mk = new THREE.Sprite(opt.medic ? medicMarkMat[team] : markerMat[team]); mk.scale.set(0.22, 0.22, 1); mk.renderOrder = 5; scene.add(mk);
  const e = {
    id: ++npcId, team, kind, prof, P, spr, girl: g, s, tilt, bb, mat, mats, fr: null, view: 'front', shadow, figH, hp: hpMax, hpMax, captain,
    baseY, perch: opt.perch || null, crouch: 0, px: x, pz: z, face: s.rotation.y, stepT: Math.random() * 6,
    speed: Math.min(4.6, rand(2.0, 2.6) + n * 0.12) * P.speed * (captain ? 0.85 : 1) * (kind === 'archer' ? 0.9 : 1),
    dmg: (captain ? 14 : 8) + Math.min(8, n),
    state: kind === 'archer' ? 'advance' : 'approach', t: 0, cd: rand(0.5, 1.5),
    knock: new V3(), flash: 0, ph: Math.random() * 6, strafe: Math.random() < 0.5 ? -1 : 1,
    bg, fg, mk, stuck: [], extra: [], spotted: false, hid: false, cover: null, cp: null, hideT: 0, retreated: false, evalT: 0,
    tgt: null, tgtT: 0,
  };
  setFrame(e, g.front, false);
  if (MOTION) Mo.init(e);
  if (e.perch) { e.perch.taken = e; e.state = 'hide'; e.hideT = rand(0.5, 2); e.crouch = 1; }
  if (opt.secretary) { e.secretary = true; e.special = true; e.speed = 4.2; s.rotation.y = e.face = Math.PI; e.home = [x, z]; }
  if (opt.sec2) {   // 二人目の秘書：青組の腕章とほんのり青
    e.sec2 = true; e.special = true; e.speed = 4.0; s.rotation.y = e.face = Math.PI; e.home = [x, z]; e.state = 'idle';
    e.tintBase = [0, 0.015, 0.05]; npcGlow(e, 0, 0, 0);
    const band = new THREE.Mesh(armbandGeo, armbandMat.blue); e.band = band; tilt.add(band);
  }
  if (opt.medic) {   // 医療係：組の色の腕章と、ほんのり組の色
    e.medic = true; e.role = opt.role || 'nurse'; e.slot = opt.slot; e.special = true; e.speed = e.role === 'nurse' ? 3.8 : 3.5; s.rotation.y = e.face = team === 'blue' ? Math.PI : 0; e.home = [x, z]; e.state = 'idle';
    e.tintBase = team === 'blue' ? [0, 0.015, 0.05] : [0.045, 0.022, 0]; npcGlow(e, 0, 0, 0);
    mk.scale.set(0.3, 0.3, 1);
    const band = new THREE.Mesh(armbandGeo, armbandMat[team]); e.band = band; tilt.add(band);
  }
  if (opt.ojou) {   // お嬢さま秘書：青組の腕章とほんのり青
    e.ojou = true; e.special = true; e.speed = 3.9; s.rotation.y = e.face = Math.PI; e.home = [x, z]; e.state = 'idle';
    e.tintBase = [0, 0.015, 0.05]; npcGlow(e, 0, 0, 0);
    const band = new THREE.Mesh(armbandGeo, armbandMat.blue); e.band = band; tilt.add(band);
  }
  if (opt.aide) {   // 三人目・四人目の秘書（本陣で気配り）：青組の腕章とほんのり青
    e.aide = opt.aide; e.special = true; e.speed = 3.6; s.rotation.y = e.face = Math.PI; e.home = opt.aide.home; e.state = 'idle';
    e.tintBase = [0, 0.015, 0.05]; npcGlow(e, 0, 0, 0);
    const band = new THREE.Mesh(armbandGeo, armbandMat.blue); e.band = band; tilt.add(band);
  }
  if (opt.runner) {   // 伝令：青組の腕章とほんのり青、足が速い
    e.runner = opt.runner; e.special = true; e.speed = 5.0; s.rotation.y = e.face = Math.PI; e.home = [x, z]; e.state = 'idle';
    e.tintBase = [0, 0.015, 0.05]; npcGlow(e, 0, 0, 0);
    const band = new THREE.Mesh(armbandGeo, armbandMat.blue); e.band = band; tilt.add(band);
  }
  if (opt.fluter) {
    e.fluter = true; e.special = true; e.speed = 2.5; s.rotation.y = e.face = Math.PI; e.home = [x, z]; e.state = 'idle';
    if (!g.flute) {   // 笛を構えた写真が無いときは、正面写真の口元に横笛を添える
      const fl = makeFlute(); fl.position.set(-0.17 * figH * 0.6, figH * 0.885, 0.06); fl.rotation.z = 0.12; tilt.add(fl); e.fluteMesh = fl;
    }
  }
  if (opt.secretary || opt.sec2 || opt.ojou || opt.aide) armSecretary(e);
  e.screen = kind === 'mob' && !e.special && Math.random() < SCREEN.rate;   // 守り役（約半数）
  e.climber = kind === 'archer' && team === 'orange' && Math.random() < 0.25;
  e.raider = kind === 'mob' && team === 'orange' && !e.special && Math.random() < 0.35;   // 梯子攻め役（約1/3）：砦の中に入ると櫓・足場の弓兵を狙って梯子を上る   // 砦の中で梯子を上る弓兵（約1/4）
  enemies.push(e);
  assignSquad(e);
  if (VoicePack.ok && VoicePack.man && VoicePack.man._extra) { const c = VoicePack.man._extra['call_' + givenOf(e)]; if (c) VoicePack.load(c[0].files[Math.min(2, e.prof.vv || 0)]); }   // 倒れたとき名前を呼ばれる声
  return e;
}
// 弓道の間合い：胴造り（0.3s）→ 打起し・引分け（0.5s、少し上がって収まる）→ 会（性格で 0.6〜1.0s）→ 離れ → 残心（0.3s）
const KAI = { 冷静: 1.0, 慎重: 0.95, 臆病: 0.75, 陽気: 0.65, 好戦的: 0.6 };
const KY_SET = 0.3, KY_DRAW = 0.5, KY_ZAN = 0.3;
function aimTotal(e, close) { const k = close ? 0.6 : 1; e.aimK = k; return (KY_SET + KY_DRAW + (KAI[e.prof.pers] || 0.8) + (e.ph % 1) * 0.12) * k; }
// 射のあとの隠れる時間は、間合いで長くなった分だけ短くして射る間隔を以前とほぼ同じに
const zanHide = (e, h, T) => Math.max(0.25, h - (T + KY_ZAN - e.P.aimT));
const ARCHER_RATE = 0.7;   // 両軍とも弓兵が約7割
const ENEMY_RATIO = (() => { const q = new URLSearchParams(location.search), v = parseFloat(q.get('eratio')); return isFinite(v) && v > 0 ? v : q.has('troops') && parseFloat(q.get('troops')) === 1 ? 1 : 1.3; })();   // 敵は味方の約 1.3 倍（?troops=1 なら以前と同じ 1:1、?eratio= で指定）
const TROOP_K = (() => { const v = parseFloat(new URLSearchParams(location.search).get('troops')); return isFinite(v) && v > 0 ? v : 1.75; })();   // ?troops=1 で以前の人数
// 青組（味方）を一人出す。平原：プレイヤーの後方。櫃の戦い：弓兵は櫃・武者走りの射撃位置、近接兵は門の内側
function spawnAlly() {
  const kind = Math.random() < (PLANE.on ? 0.3 : ARCHER_RATE) ? 'archer' : 'mob';
  if (PLANE.on) return spawnEnemy(rand(-1.0, 1.0), rand(12.5, 13.3), kind, false, 'blue');   // 機内：前方（ラウンジ側）から援軍
  if (builtStage === 'fort') {
    if (kind === 'archer') {
      const free = perches.filter(q => !q.taken && !q.seiran);
      const roam = SQUAD_ON && squads.blue.length ? (sqBy('blue', 'roam') ? sqAlive(sqBy('blue', 'roam')).length : 99) : 99;   // 遊撃弓隊（櫃に上がらず竹束の間を動く）を 3 人ほど確保
      if (free.length && !(roam < 3 && Math.random() < 0.35)) {
        const tw = free.filter(q => q.tower), q = tw.length && Math.random() < 0.5 ? pick(tw) : pick(free);
        return spawnEnemy(q.x, q.z, 'archer', false, 'blue', { y: q.y, perch: q });
      }
      return spawnEnemy(rand(-25, 25), rand(12, 22), 'archer', false, 'blue');
    }
    return spawnEnemy(rand(-8, 8), rand(5, 13), 'mob', false, 'blue');
  }
  const a = rand(0.6, 2.5), r = rand(10, 18);   // プレイヤーの後方（+Z 側）
  const x = clamp(player.pos.x + Math.cos(a) * r, -CFG.field + 3, CFG.field - 3);
  const z = clamp(player.pos.z + Math.sin(a) * r, -CFG.field + 3, CFG.field - 3);
  return spawnEnemy(x, z, kind, false, 'blue');
}
// ====================================================================
//  分隊（v5）：既存の役割（櫃・武者走りの弓兵／守り役／梯子攻め役／井闌の乗員…）に名前の付いた分隊を割り当てる。
//  隊長は能力差なし（同じ数値）。短い号令を出すだけで、隊員は交戦していないとき隊長のまわりにゆるく集まる。`?squads=0` で無効
// ====================================================================
const SQUAD_ON = new URLSearchParams(location.search).get('squads') !== '0';
const SQUAD_DEFS = {
  fort: { blue: [['gate', '城門分隊'], ['melee', '近接分隊'], ['tw1', '第1櫃分隊'], ['tw2', '第2櫃分隊'], ['roam', '遊撃弓隊']],
          orange: [['seiran', '井闌隊'], ['ladder', 'はしご隊'], ['m1', '第1近接部隊'], ['m2', '第2近接部隊'], ['roam', '遊撃弓隊']] },
  plane: { blue: [['front', '前方客室分隊'], ['rear', '後方客室分隊']], orange: [['front', '前方奴襲隊'], ['rear', '後方奴襲隊']] },   // 機内：客室の前と後ろ
  plains: { blue: [['front', '前衛分隊'], ['melee', '近接分隊'], ['a1', '第1弓分隊'], ['a2', '第2弓分隊'], ['roam', '遊撃弓隊']],   // 平原には櫃がないので弓分隊
            orange: [['m1', '第1近接部隊'], ['m2', '第2近接部隊'], ['a1', '第1弓分隊'], ['a2', '第2弓分隊'], ['roam', '遊撃弓隊']] },
};
const squads = { blue: [], orange: [] };
const SQ = { callT: 0, tickT: 0, pending: [], log: [] };   // log：最近の掛け声（確認用）
const sqLog = (k, e) => { SQ.log.push(k + ':' + (e.sq ? e.sq.name : e.team) + ':' + e.prof.name); if (SQ.log.length > 60) SQ.log.shift(); };
const AMMO_MAX = 24;   // 青組の弓兵の矢（伝令が補給する）。橙組は矢切れなし
function resetSquads() {
  const D = SQUAD_DEFS[builtStage] || SQUAD_DEFS.plains;
  for (const t of ['blue', 'orange']) squads[t] = D[t].map(([k, name]) => ({ k, name, team: t, members: [], leader: null, lost: 0, joined: 0, cd: {}, needAmmo: false, served: null, archers: /^(tw|a\d|roam|seiran)/.test(k) }));
  SQ.callT = 0; SQ.pending.length = 0;
}
const sqBy = (t, k) => squads[t].find(s => s.k === k);
const isUp = m => m && m.state !== 'down' && enemies.includes(m);
const sqAlive = s => s.members.filter(isUp);
function pickBalanced(t, keys) {   // 援軍は人数の少ない分隊へ
  let best = null, bn = 1e9;
  for (const k of keys) { const s = sqBy(t, k); if (!s) continue; const n = sqAlive(s).length; if (n < bn) { bn = n; best = s; } }
  return best;
}
function assignSquad(e) {
  if (!SQUAD_ON || e.special || !squads[e.team].length) return;
  const t = e.team, fort = builtStage === 'fort'; let s = null;
  if (PLANE.on) s = e.seated || PLANE.intro ? sqBy(t, e.s.position.z > -4 ? 'front' : 'rear') : pickBalanced(t, ['front', 'rear']);   // 席の位置で前・後ろ、援軍は少ない方へ
  else if (t === 'blue') {
    if (fort) s = e.kind === 'archer' ? (e.perch ? sqBy(t, e.perch.tower ? (e.perch.x < 0 ? 'tw1' : 'tw2') : 'gate') : sqBy(t, 'roam')) : sqBy(t, e.screen ? 'gate' : 'melee');
    else s = e.kind === 'archer' ? pickBalanced(t, ['a1', 'a2', 'roam']) : sqBy(t, e.screen ? 'front' : 'melee');
  } else if (fort) s = e.kind === 'archer' ? ((e.perch && e.perch.seiran) || e.climber ? sqBy(t, 'seiran') : sqBy(t, 'roam')) : (e.raider ? sqBy(t, 'ladder') : pickBalanced(t, ['m1', 'm2']));
  else s = e.kind === 'archer' ? pickBalanced(t, ['a1', 'a2', 'roam']) : pickBalanced(t, ['m1', 'm2']);
  if (!s) return;
  e.sq = s; s.members.push(e); s.joined++;
  if (t === 'blue' && e.kind === 'archer') e.ammo = AMMO_MAX;
  if (!isUp(s.leader)) setLeader(s, e, false);
}
function setLeader(s, e, announce) {
  const old = s.leader; s.leader = e;
  if (old && old.tag) old.tagKey = '';
  if (e) { e.tagKey = ''; if (announce) { npcSay(e, 'lead', 1, 0.85); sqLog('lead', e); } }
}
const ammoOK = e => e.ammo === undefined || e.ammo > 0;
// 交戦していない隊員は隊長のまわり（ゆるい隊形）へ寄る。true のとき今フレームの動きはこれで決まり
function squadRegroup(e, dt) {
  const s = e.sq;
  if (!SQUAD_ON || !s) return false;
  const L = s.leader;
  if (!isUp(L) || L === e || L.perch || L.lad || L.onFloor || L.climb || e.perch || e.lad || e.onFloor || e.climb || e.wounded || e.defending || e.returning || !e.tgt
    || !['approach', 'advance'].includes(e.state) || Math.abs(L.baseY - e.baseY) > 0.5) { e.regroup = false; return false; }
  const p = e.s.position, lp = L.s.position, tp = tgtPos(e.tgt);
  if (Math.hypot(tp.x - p.x, tp.z - p.z) < (e.kind === 'archer' ? 20 : 13)) { e.regroup = false; return false; }   // 交戦中は各自の判断
  const R = e.kind === 'archer' ? 11 : 8, d = Math.hypot(lp.x - p.x, lp.z - p.z);
  if (!e.regroup && d < R) return false;
  if (e.regroup && d < R * 0.45) { e.regroup = false; return false; }
  e.regroup = true;
  const i = Math.max(0, s.members.indexOf(e)), a = i * 2.4 + (e.team === 'blue' ? 0 : Math.PI), r = 2 + (i % 3) * 1.3;
  steer(e, lp.x + Math.cos(a) * r, lp.z + Math.sin(a) * r, e.speed * 1.1, dt);
  return true;
}
function squadSpot(s) {   // 分隊のいる所（櫃の上の弓兵は櫃の真下）
  const A = sqAlive(s); if (!A.length) return null;
  let x = 0, z = 0; for (const m of A) { x += m.s.position.x; z += m.s.position.z; }
  return { x: x / A.length, z: z / A.length, n: A.length };
}
// 倒れた味方の名前を呼ぶ（収録音声があれば「〇〇ちゃん！」）
const givenOf = e => { const p = (e.prof.name || '').split(' '); return p[p.length - 1]; };
function callName(m, dead) {
  const X = VoicePack.man && VoicePack.man._extra, L = X && X['call_' + givenOf(dead)];
  if (!L) return false;
  sqLog('call_' + givenOf(dead), m);
  Talk.as(m, () => {
    const d = Math.hypot(m.s.position.x - player.pos.x, m.s.position.z - player.pos.z), f = L[0].files;
    if (!VoicePack.play(f[Math.min(f.length - 1, m.prof.vv || 0)], d, 1, VV_RATE[m.prof.vv] || 1)) Voice.say(L[0].text, m.prof, 1);
  });
  return true;
}
function squadOnDeath(e) {
  const s = e.sq;
  if (e.killer && isUp(e.killer) && !e.killer.special) { const k = e.killer; SQ.pending.push({ t: time + 0.5, fn: () => { if (isUp(k) && Math.random() < 0.35) { npcSay(k, 'kill', 0); sqLog('kill', k); } } }); }
  if (!s) return;
  s.lost++;
  if (s.leader === e) {   // 隊長が倒れたら、近くの隊員が指揮を引き継ぐ
    const A = sqAlive(s).filter(m => m !== e); let nb = null, nd = 1e9;
    for (const m of A) { const d = Math.hypot(m.s.position.x - e.s.position.x, m.s.position.z - e.s.position.z) + (m.wounded ? 20 : 0); if (d < nd) { nd = d; nb = m; } }
    s.leader = null; if (nb) SQ.pending.push({ t: time + 1.6, fn: () => { if (isUp(nb) && !isUp(s.leader)) setLeader(s, nb, true); } });
  }
  // 近くの隊員が名前を呼ぶ／「うそでしょ…」「仇とるから！」
  let mate = null, md = 16;
  for (const m of sqAlive(s)) { if (m === e || m.silenced) continue; const d = Math.hypot(m.s.position.x - e.s.position.x, m.s.position.z - e.s.position.z); if (d < md) { md = d; mate = m; } }
  if (mate && Math.random() < 0.7) SQ.pending.push({ t: time + 0.7 + Math.random() * 0.5, fn: () => { if (!isUp(mate)) return; if (!(Math.random() < 0.55 && callName(mate, e))) { npcSay(mate, 'allydown', 1); sqLog('allydown', mate); } } });
}
function sqCall(s, m, kind, cd, prio = 0) {   // 掛け声（全体で 1.6 秒に一つまで、分隊ごとの間隔）
  if (SQ.callT > 0 || (s.cd[kind] || 0) > time || !isUp(m) || m.silenced) return false;
  s.cd[kind] = time + cd; SQ.callT = 1.6; npcSay(m, kind, prio); sqLog(kind, m);
  return true;
}
function updateSquads(dt) {
  if (!SQUAD_ON) return;
  SQ.callT -= dt;
  if (PLANE.intro) return;   // 静かな機内（奇襲の前）は掛け声なし
  for (let i = SQ.pending.length - 1; i >= 0; i--) if (time >= SQ.pending[i].t) { const f = SQ.pending[i].fn; SQ.pending.splice(i, 1); f(); }
  if ((SQ.tickT -= dt) > 0) return;
  SQ.tickT = 0.5;
  const fort = builtStage === 'fort';
  for (const t of ['blue', 'orange']) for (const s of squads[t]) {
    s.members = s.members.filter(m => isUp(m) || m.state === 'down' && enemies.includes(m));
    if (s.served && !isUp(s.served)) s.served = null;
    const A = sqAlive(s); if (!A.length) continue;
    if (!isUp(s.leader) && !SQ.pending.length) setLeader(s, A[0], false);
    const L = isUp(s.leader) ? s.leader : A[0], lp = L.s.position;
    if (t === 'blue' && (s.archers || PLANE.on)) {   // 矢の残り
      const ar = A.filter(m => m.ammo !== undefined); const f = ar.length ? ar.reduce((a, m) => a + m.ammo, 0) / (ar.length * AMMO_MAX) : 1;
      if (f < 0.35 && !s.needAmmo) { s.needAmmo = true; sqCall(s, L, 'ammo', 20, 1); }
      if (f > 0.6) s.needAmmo = false;
    }
    if (Math.hypot(lp.x - player.pos.x, lp.z - player.pos.z) > 45) continue;   // 聞こえる所の分隊だけ
    const foes = []; for (const o of enemies) if (o.team !== t && isUp(o) && !o.special && Math.hypot(o.s.position.x - lp.x, o.s.position.z - lp.z) < 22) foes.push(o);
    const near = A.filter(m => Math.hypot(m.s.position.x - lp.x, m.s.position.z - lp.z) < 22).length;
    const lt = L.tgt && !L.tgt.isPlayer ? L.tgt : L.tgt;
    if (lt && !L.passive) { const tp = tgtPos(lt), td = Math.hypot(tp.x - lp.x, tp.z - lp.z); if (td < (s.archers ? 36 : 24)) sqCall(s, L, s.archers ? 'order_a' : 'order_m', 25, 1); }
    if (foes.length && near >= foes.length * 1.6 && near >= 3) sqCall(s, pick(A), 'push', 30);
    if (foes.length >= 3 && foes.length >= near * 2) sqCall(s, pick(A), 'fall', 30);
    const m = pick(A), mp = m.s.position;
    let nf = null, nd = 14; for (const o of foes) { const d = Math.hypot(o.s.position.x - mp.x, o.s.position.z - mp.z); if (d < nd) { nd = d; nf = o; } }
    if (nf) {   // 横から来る敵（青組の前は -z、橙組の前は +z）
      const fw = t === 'blue' ? -1 : 1, lat = (nf.s.position.x - mp.x) * -fw, fwd = (nf.s.position.z - mp.z) * fw;
      if (Math.abs(lat) > 5 && Math.abs(lat) > Math.abs(fwd) * 0.8) sqCall(s, m, lat > 0 ? 'callR' : 'callL', 14);
    }
    const hurt = A.find(x => x.hp <= x.hpMax * 0.5 && foes.some(o => Math.hypot(o.s.position.x - x.s.position.x, o.s.position.z - x.s.position.z) < 10));
    if (hurt) sqCall(s, hurt, 'cover', 18);
    if (fort && t === 'blue') {
      if (seirans.some(T => T.active && Math.hypot(T.x - lp.x, T.z - lp.z) < 45 && enemies.some(o => o.onSeiran === T && isUp(o)))) sqCall(s, pick(A), 'seiran', 40);
      if (enemies.some(o => o.team === 'orange' && o.lad && isUp(o) && Math.hypot(o.s.position.x - lp.x, o.s.position.z - lp.z) < 15)) sqCall(s, pick(A), 'ladder', 20);
    }
  }
}
// 分隊の一覧（秘書の戦況報告・一時停止メニュー）
function squadRows(t) {
  const rows = squads[t].map(s => ({ name: s.name, n: sqAlive(s).length, lost: s.lost, lead: isUp(s.leader) ? s.leader.prof.name : '' }));
  const sp = (name, list) => rows.push({ name, n: list.filter(isUp).length, lost: null, lead: '' });
  if (t === 'blue') { sp('伝令', runners.map(R => R.e)); sp('秘書課', [sec.e, sec2.e, ojou.e, ...aides.map(a => a.e)]); }
  sp('医務班', medics[t].map(m => m.e));
  return rows;
}
function squadTable(t, withLead) {
  const tm = t === 'blue' ? '<b style="color:#7cc0ff">青組</b>' : '<b style="color:#ffa040">橙組</b>';
  return '<div>' + tm + '<table>' + squadRows(t).map(r => `<tr><td>${r.name}</td><td>${r.n}名</td><td>${r.lost === null ? '' : r.lost ? '脱落' + r.lost : ''}</td>${withLead ? `<td>${r.lead ? '隊長 ' + r.lead.replace('組頭 ', '') : ''}</td>` : ''}</tr>`).join('') + '</table></div>';
}
function showSquadReport() {
  const el = $('sqrep'); if (!el || !SQUAD_ON) return;
  el.innerHTML = '<div class="h">分隊ごとの戦況（残り）</div><div class="cols">' + squadTable('blue', false) + squadTable('orange', false) + '</div>';
  el.style.display = 'block'; clearTimeout(el._t); el._t = setTimeout(() => { el.style.display = 'none'; }, 11000);
}
// ---- 伝令（青組、本陣と分隊の間を走る二人）：矢の少ない分隊へ矢を運ぶ。ときどき本陣の言葉を伝えに走る ----
const runners = [{ e: null, dead: false, i: 0 }, { e: null, dead: false, i: 1 }];
function spawnRunner(R) {
  if (!hq) return;
  const [x, z] = hqSpot(R.i ? 'run1' : 'run0', R.i ? 2.6 : -2.6, -1.2);
  const e = spawnEnemy(x, z, 'mob', false, 'blue', { runner: R });
  R.e = e; R.dead = false; R.job = null; R.waitT = rand(10, 20);
}
function removeRunner(R) { const e = R.e; R.e = null; if (e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); } }
function runSay(e, cat) {
  const X = VoicePack.man && VoicePack.man._extra, L = X && X[cat]; if (!L || !L.length) return;
  Talk.as(e, () => { const j = (Math.random() * L.length) | 0, d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z); if (!VoicePack.play(L[j].files[0], d, 1)) Voice.say(L[j].text, e.prof, 0); if (d < 14 && !menuOpen) subtitle(L[j].text); });
}
function runnerBrain(e, dt) {
  const R = e.runner, p = e.s.position; e.tgt = null; e.state = 'idle'; e.t += dt; e.cd -= dt;
  if (!R.job) {
    const [hx, hz] = e.home, d = Math.hypot(hx - p.x, hz - p.z);
    if (d > 0.6) { const rt = routeTo(p, hx, hz); steer(e, rt[0], rt[1], e.speed * (d > 4 ? 1 : 0.6), dt); e.faceWant = Math.atan2(hx - p.x, hz - p.z); }
    else e.faceWant = Math.PI;
    if ((R.waitT -= dt) <= 0 && d < 3 && state === 'play') {
      const need = squads.blue.find(s => s.needAmmo && !isUp(s.served) && sqAlive(s).length);
      if (need) { R.job = { s: need, ammo: true, ph: 'go', t: 0 }; need.served = e; runSay(e, 'den_take'); }
      else {
        const L = squads.blue.filter(s => sqAlive(s).length >= 2);
        if (L.length && Math.random() < 0.45) { R.job = { s: pick(L), ammo: false, ph: 'go', t: 0 }; runSay(e, 'den_go'); }
        R.waitT = rand(4, 8);
      }
    }
    return;
  }
  const J = R.job; J.t += dt;
  if (J.ph === 'go') {
    const sp = squadSpot(J.s);
    if (!sp || J.t > 45) { J.ph = 'back'; J.t = 0; if (J.s.served === e) J.s.served = null; return; }
    const d = Math.hypot(sp.x - p.x, sp.z - p.z);
    if (d > 6 && !(J.t > 15 && d < 11)) { const rt = routeTo(p, sp.x, sp.z); steer(e, rt[0], rt[1], e.speed, dt); e.faceWant = Math.atan2(rt[0] - p.x, rt[1] - p.z); return; }
    if (J.ammo) {
      let k = 0; for (const m of sqAlive(J.s)) if (m.ammo !== undefined && Math.hypot(m.s.position.x - p.x, m.s.position.z - p.z) < 14) { m.ammo = AMMO_MAX; k++; }
      J.s.needAmmo = false; J.s.served = null; runSay(e, 'den_arrows');
      if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 40) popup(`伝令が${J.s.name}に矢を届けた（${k}名）`);
    } else runSay(e, 'den_msg');
    J.ph = 'back'; J.t = 0;
  } else {
    const [hx, hz] = e.home, d = Math.hypot(hx - p.x, hz - p.z);
    if (d > 0.8 && J.t < 60) { const rt = routeTo(p, hx, hz); steer(e, rt[0], rt[1], e.speed * 0.9, dt); e.faceWant = Math.atan2(rt[0] - p.x, rt[1] - p.z); }
    else { R.job = null; R.waitT = rand(6, 12); }
  }
}
// ---- 頭上の小さな名札（分隊名＋名前）。近くの娘だけ（最大 14 人） ----
const TAG_R = 20, TAG_MAX = 14;
function tagLabel(e) {
  const p = (e.prof.name || '').split(' '), nm = p.length >= 2 ? p.slice(0, -2).concat(p.slice(-2).join('')).join(' ') : e.prof.name;
  if (e.seated && PLANE.intro) return nm;   // 奇襲の前：乗客として名前だけ
  const pre = e.sq ? e.sq.name + (e.sq.leader === e ? '長' : '') : e.runner ? '伝令' : e.medic ? '医務班' : '';
  return (pre ? pre + ' ' : '') + nm;
}
function makeTag(e, text) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d'); g.font = 'bold 30px "Hiragino Mincho ProN","Yu Mincho",serif';
  const w = Math.min(500, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(10,12,18,.55)'; g.beginPath(); g.roundRect ? g.roundRect(256 - w / 2, 8, w, 48, 12) : g.rect(256 - w / 2, 8, w, 48); g.fill();
  g.fillStyle = e.team === 'blue' ? '#dcefff' : '#ffe6c8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 33);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  if (!e.tag) { e.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false })); e.tag.renderOrder = 6; e.tag.scale.set(0.46, 0.0575, 1); scene.add(e.tag); e.extra.push(e.tag); }
  else { e.tag.material.map.dispose(); e.tag.material.map = tex; e.tag.material.needsUpdate = true; }
}
const tagNear = [];
function updateTags() {
  tagNear.length = 0;
  for (const e of enemies) {
    if (e.tag) e.tag.visible = false;
    if (e.state === 'down') continue;
    const d = Math.hypot(e.s.position.x - camera.position.x, e.s.position.z - camera.position.z);
    if (d < TAG_R && (e.sq || e.runner || e.medic)) tagNear.push([d, e]);
  }
  tagNear.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < Math.min(TAG_MAX, tagNear.length); i++) {
    const e = tagNear[i][1], txt = tagLabel(e);
    if (e.tagKey !== txt) { makeTag(e, txt); e.tagKey = txt; }
    const top = e.baseY + e.figH * (1 - 0.38 * e.crouch);
    e.tag.position.set(e.s.position.x, top + (e.hp < e.hpMax ? 0.68 : 0.55), e.s.position.z);
    e.tag.visible = true; e.tag.material.opacity = clamp((TAG_R - tagNear[i][0]) / 5, 0, 1);
  }
}
// ---- 倒れた娘：横たわった写真（down）を地面に沿った低いビルボードで。上から見ると地面の写真へ切り替わる ----
const lieShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
function startLying(e) {
  const fr = e.girl.down;
  if (MOTION && e.mo) Mo.ghost(e);
  // 体の向き（足→頭＝fallYaw）に e.s を回し、刺さった矢を胴のあたりに残す
  e.s.rotation.y = e.fallYaw; e.tilt.rotation.y = 0;
  if (e.lieTilt) { e.s.rotation.order = 'YXZ'; e.s.rotation.x = -e.lieTilt; }   // 機内：頭の側が座席・肘掛けに乗る（または通路へ落ちる）
  e.s.updateMatrixWorld(true);
  for (const a of e.stuck) e.s.attach(a);
  e.lying = { t: 0 };
  e.tilt.rotation.set(0, 0, 0); e.tilt.position.set(0, -0.04, e.figH * 0.5);
  setFrame(e, fr, false); e.bb.position.x = 0;
  e.mat.transparent = true; e.mat.needsUpdate = true;
  // 地面に置く写真（真上から見たとき用）
  const dm = new THREE.MeshBasicMaterial({ map: fr.tex, transparent: true, opacity: 0, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const L = e.figH, H = clamp(e.figH * fr.hk, 0.45, 0.55);
  const dc = new THREE.Mesh(new THREE.PlaneGeometry(L, H), dm);
  dc.rotation.order = 'YXZ'; dc.rotation.set(-Math.PI / 2, Math.PI / 2, 0);   // 写真の左（頭）を体の頭の側へ
  dc.position.set(0, 0.025, e.figH * 0.5); e.s.add(dc); e.decal = dc; e.mats.push(dm);
  if (e.seg) { dc.renderOrder = 2 + e.seg.layer; e.bb.renderOrder = 2 + e.seg.layer; dm.polygonOffsetFactor = -3 - e.seg.layer; }   // 重なった体：上の体を後から描く（ちらつかない）
  e.shadow.material = lieShadowMat; e.shadow.visible = true; e.shadow.position.set(0, 0.015, e.figH * 0.5); e.shadow.scale.set(0.6, 1, e.figH * 1.1);
  if (MOTION && e.mo) {   // 厚み：人形の形の凸凹した接地影＋太陽の影。写真は沈めず、地面の写真も少し浮かせる
    e.shadow.visible = false; Mo.contactAO(e);
    e.tilt.position.y = 0.0; dc.position.y = 0.05;
  }
}
function stopLying(e) {   // 手当てで起き上がるとき
  if (!e.lying) return;
  e.lying = null;
  if (e.decal) { e.s.remove(e.decal); e.decal = null; }
  if (e.aoMesh) { e.s.remove(e.aoMesh); e.aoMesh.geometry.dispose(); e.aoMesh = null; }
  e.mat.transparent = false; e.mat.opacity = 1; e.mat.alphaTest = 0.42; e.mat.needsUpdate = true;
  e.tilt.position.set(0, 0, 0); e.tilt.rotation.set(Math.PI / 2, 0, 0);
  e.shadow.material = shadowMat; e.shadow.position.set(0, 0.02, 0); e.shadow.visible = true;
  setFrame(e, girlFrame(e.girl, 'side'), false);
}
function updateBodies(dt) {
  if (MOTION) Mo.fade(dt);
  for (const b of bodies) {
    const ly = b.lying;
    if (b.slump) { b.tilt.rotation.y = Math.atan2(camera.position.x - b.s.position.x, camera.position.z - b.s.position.z) - b.s.rotation.y; continue; }
    if (!ly) { if (MOTION && b.mo && b.mo.D && b.state === 'down') Mo.fallSprite(b, b.mo.D, 0); continue; }   // down の写真が無い娘：倒れた写真をカメラへ向け続ける
    ly.t += dt;
    const p = b.s.position, fy = b.fallYaw;
    const cx = p.x + Math.sin(fy) * b.figH * 0.5, cz = p.z + Math.cos(fy) * b.figH * 0.5;
    const dx = camera.position.x - cx, dz = camera.position.z - cz, hd = Math.hypot(dx, dz);
    const camYaw = Math.atan2(dx, dz);
    // 頭の端が画面の右にあれば写真（頭が左）を左右反転。体の軸を横から見るほど長く、縦に見るほど短く
    const sr = Math.sin(fy) * Math.cos(player.yaw) - Math.cos(fy) * Math.sin(player.yaw);
    const fr = b.girl.down, grow = Math.min(1, ly.t / 0.25);
    const h = clamp(b.figH * fr.hk, 0.45, 0.55) * grow, w = b.figH * Math.max(0.35, Math.abs(Math.sin(angDiff(fy, camYaw))));
    b.bb.scale.set(w * (sr > 0 ? -1 : 1), h, 1); b.bb.position.x = 0;
    b.tilt.rotation.y = camYaw - b.s.rotation.y;
    // 上から見下ろすほど地面の写真へ
    const el = Math.atan2(camera.position.y - b.baseY, Math.max(0.1, hd));
    const f = clamp((el - 0.55) / 0.35, 0, 1);
    b.mat.opacity = 1 - f; b.mat.alphaTest = Math.max(0.02, 0.42 * (1 - f));
    b.bb.visible = f < 0.98;
    if (b.decal) b.decal.material.opacity = f;
  }
}
function startWave(n) {
  if (sec.mode === 'dead') { sec.mode = 'hq'; spawnSecretary(); if (n > 1) popup('秘書課の侍女が本陣に戻りました'); }
  if (ojou.dead || (!ojou.e && hq)) { const was = ojou.dead; spawnOjou(); if (n > 1 && was) popup('秘書課 西園寺 すみれが本陣に戻りました'); }
  if (sec2.dead || (!sec2.e && hq)) { const was = sec2.dead; spawnSec2(); if (n > 1 && was) popup('秘書課の侍女（二人目）が本陣に戻りました'); }
  for (const t of ['blue', 'orange']) { let was = false; for (const m of medics[t]) if (m.dead || !m.e) { was = was || m.dead; spawnMedic(t, m); } if (n > 1 && was && t === 'blue') popup('救護班が持ち場に戻りました'); }
  for (const A of aides) if (A.dead || (!A.e && hq)) { const was = A.dead; spawnAide(A); if (n > 1 && was) popup(A.name + 'が本陣に戻りました'); }
  for (const R of runners) if (R.dead || (!R.e && hq)) { const was = R.dead; spawnRunner(R); if (n > 1 && was) popup('伝令が本陣に戻りました'); }
  if (fluter.dead || (!fluter.e && hq)) { spawnFluter(); if (n > 1 && fluter.dead) popup('笛役の娘が本陣に戻りました'); fluter.dead = false; }
  // 兵数：以前（5+3n、同時 8+2n≦28）の約 1.75 倍。第1波 14 対 14 から
  // v3：味方の人数はそのまま、敵はその約 1.3 倍（第1波 14 対 18）
  wave.n = n; wave.blueToSpawn = Math.round((5 + n * 3) * TROOP_K); wave.spawnT = 1.0; wave.inter = 0;
  wave.toSpawn = Math.round(wave.blueToSpawn * ENEMY_RATIO);
  wave.blueMax = Math.min(Math.round((8 + n * 2) * TROOP_K), 40);
  wave.maxAlive = Math.min(Math.round(wave.blueMax * ENEMY_RATIO), 52); wave.captain = n >= 2;
  wave.total = { blue: wave.blueToSpawn, orange: wave.toSpawn };
  const sk = seiranWave(n);                      // 櫃の戦い：井闌の上の弓兵（同じ人数だけ味方も増やす）
  if (sk) { wave.blueToSpawn += sk; wave.blueOwed = (wave.blueOwed || 0) + sk; }
  wave.archerRate = ARCHER_RATE;
  if (PLANE.on) { wave.archerRate = 0.3; if (n === 1) { planeIntro(); return; } }   // 機内：狭いので弓は少なめ（懐刀が中心）
  showBanner(`第${waveName(n)}波`, n === 1 ? '模擬戦、開始！ 青組の味方と共に戦え' : PLANE.on ? '後方ギャレーから新手！ 前方から青組の援軍' : '新手の橙組が迫る！ 青組の援軍が到着');
  Sfx.fluteCall();
  setTimeout(() => { if (state === 'play' && !VoicePack.extra('command', 0)) Voice.say('かかれーっ！', { pitch: 1.3, rate: 1.1 }, 1); }, 600);
}
function waveUpdate(dt) {
  if (PLANE.intro) { PLANE.introT -= dt; if (PLANE.introT <= 0) planeAmbush(); return; }
  if (wave.inter > 0) { wave.inter -= dt; if (wave.inter <= 0) startWave(wave.n + 1); return; }
  wave.spawnT -= dt;
  const foes = enemies.filter(isFoe).length;
  if (wave.toSpawn > 0 && wave.spawnT <= 0 && foes < wave.maxAlive) {
    let cx, cz;
    if (builtStage === 'fort') { cx = rand(-30, 30); cz = rand(-80, -62); }   // 門の外、竹束の列の向こうから
    else if (PLANE.on) { cx = 0; cz = -17.6; }   // 機内：後方ギャレーから
    else {
      const front = Math.random() < 0.7;
      const a = front ? -Math.PI / 2 + rand(-1.2, 1.2) : rand(0, Math.PI * 2);
      const r = rand(42, 58);
      cx = clamp(player.pos.x + Math.cos(a) * r, -CFG.field + 5, CFG.field - 5);
      cz = clamp(player.pos.z + Math.sin(a) * r, -CFG.field + 5, CFG.field - 5);
    }
    const grp = Math.min(wave.toSpawn, 2 + ((Math.random() * Math.min(5, 1 + wave.n)) | 0));
    for (let i = 0; i < grp; i++) {
      const cap = wave.captain && wave.toSpawn === 1;
      const sp = PLANE.on ? [cx + rand(-1.4, 1.4), cz + rand(-1.0, 1.0)] : [cx + rand(-3, 3), cz + rand(-3, 3)];
      spawnEnemy(sp[0], sp[1], Math.random() < wave.archerRate ? 'archer' : 'mob', cap, 'orange');
      wave.toSpawn--;
      if (cap) wave.captain = false;
    }
    wave.blueOwed = (wave.blueOwed || 0) + grp / ENEMY_RATIO;   // 敵の人数に見合う味方を出す
    if (wave.toSpawn <= 0) wave.blueOwed = Math.max(wave.blueOwed, wave.blueToSpawn);   // 端数を残さない
    wave.spawnT = rand(0.6, 1.4);
  }
  if (wave.blueOwed >= 1 && wave.blueToSpawn > 0 && aliveOf('blue').length < (wave.blueMax || wave.maxAlive)) {
    const k = Math.min(Math.floor(wave.blueOwed), wave.blueToSpawn);
    for (let i = 0; i < k; i++) spawnAlly();
    wave.blueOwed -= k; wave.blueToSpawn -= k;
  }
  if (wave.toSpawn <= 0 && foes === 0) {
    wave.inter = 5;
    showBanner(`第${waveName(wave.n)}波 制圧！`, '矢と体力が少し回復した');
    Sfx.fanfare();
    player.arrows = Math.min(arrowsMax(), player.arrows + 10);
    for (const e of enemies) if (e.ammo !== undefined) e.ammo = AMMO_MAX;   // 波の合間に矢を補充
    for (const s of squads.blue) s.needAmmo = false;
    player.hp = Math.min(CFG.maxHp, player.hp + 20);
  }
}

// ---- 命中・戦死判定 ----
// by: 'player' | 攻撃した NPC。hit: { u, y, arrow, thrust }
function damageEnemy(e, dmg, from, crit, hit, by = 'player') {
  if (e.state === 'down') return;
  const byPlayer = by === 'player';
  if (PLANE.intro) planeAmbush();   // 静かな機内で攻撃すれば、その場で奇襲が始まる
  if (e.seated && e.standAt == null) e.standAt = time + rand(0.1, 0.4);
  // 話している最中の娘が撃たれた：会話を打ち切る（メニューを閉じ、声と字幕を止める。短い悲鳴だけ）
  const partner = menuOpen && menuGirl() === e;
  e.wasTalking = partner || Talk.speaking(e);
  if (e.wasTalking) { if (partner) closeSecMenu(false); Talk.hush(e); }
  e.hp -= dmg; e.flash = 0.12; npcGlow(e, 0.9, 0.9, 0.9);
  let hitPos = null;
  if (hit && hit.pt) {
    hitPos = hitSurface(e, hit.pt, from);
    if (hit.arrow && hit.dir) stickArrow(e, hit.pt, hit.dir);
  }
  if (!hitPos) { hitPos = e.s.position.clone(); hitPos.y += e.figH * 0.6; }
  puff(hitPos, 0xffffff, 3, 0.25, 1.6, 0.22);                             // 白い閃光
  puff(e.s.position.clone().setY(e.baseY + 0.3), 0xc8b48a, 3, 0.6, 1.2, 0.6);   // 砂埃
  const k = new V3(e.s.position.x - from.x, 0, e.s.position.z - from.z).normalize();
  if (!e.perch) e.knock.addScaledVector(k, crit ? 4 : 2.5);
  if (e.state === 'windup' || e.state === 'aim' || e.state === 'zanshin') { e.state = 'stagger'; e.t = 0; }
  if (byPlayer) { hitMarker(); Sfx.hit(); if (crit) popup('急所！'); else if (e.team === 'blue') popup('味方に命中！'); }
  else if (!(hit && hit.arrow)) Sfx.impactBody(hitPos);   // 矢は updateArrows で「ズブッ」
  if (by !== 'player' && by.state !== 'down') { e.tgt = by; e.tgtT = 2; }   // 撃ってきた相手に向き直る
  if (e.perch && e.perch.tower && e.team === 'blue') { const t = e.perch.x < 0 ? towers.west : towers.east; t.press += 1.5; }
  if (e.hp <= 0) { if (!byPlayer && by && by.prof) e.killer = by;
    if (window.__kstat) window.__kstat.push({ team: e.team, kind: e.kind, by: byPlayer ? 'player' : by && by.kind }); killEnemy(e, byPlayer, from); return; }
  if (e.wasTalking) npcSay(e, 'hit', 1); else npcSay(e, 'hit', 0, byPlayer ? 0.5 : 0.25);
  if (!e.medic && e.hp <= e.hpMax * WOUND_K) setWounded(e, true);
  if (e.P.retreat && !e.perch && !e.retreated && e.hp / e.hpMax <= 0.5) { e.retreated = true; e.state = 'retreat'; e.t = 0; e.retreatT = rand(3, 4.5); }
}
// 戦死判定：倒れるアニメを一度だけ再生し、その姿勢のまま地面に残る（以後は動かない・しゃべらない）
function killEnemy(e, byPlayer, from) {
  e.state = 'down'; e.t = 0;
  e.knock.set(0, 0, 0);
  if (from) e.face = Math.atan2(from.x - e.s.position.x, from.z - e.s.position.z);   // 攻撃側を向いてから倒れる
  if (e.perch) { e.perch.taken = null; }
  if (e.climb) { if (e.climb.q.taken === e) e.climb.q.taken = null; e.climb = null; e.baseY = 0; e.s.position.y = 0; }
  if (e.climbPerch) { if (e.climbPerch.taken === e) e.climbPerch.taken = null; e.climbPerch = null; }
  if (e.lad) {   // 梯子の途中で倒れた：梯子の下へ落ちる
    const c = e.lad; if (c.L.occ === e) c.L.occ = null;
    if (c.ph === 'climb' || (c.ph === 'step' && !c.up) || (c.ph === 'exit' && !c.up)) { const P = ladPts(c.L); e.s.position.x = P.base[0]; e.s.position.z = P.base[1]; e.baseY = 0; e.s.position.y = 0; e.onFloor = null; }
    e.lad = null;
  }
  if (e.secretary) { sec.mode = 'dead'; sec.esc = null; sec.e = null; e.secretary = false; e.wasSecretary = true; if (menuOpen) closeSecMenu(false); popup('秘書課の侍女に戦死判定…次の波で本陣に戻ります'); }
  e.downAt = time;
  if (e.sec2) { sec2.dead = true; sec2.e = null; sec2.mode = 'dead'; e.sec2 = false; e.wasSec2 = true; e.kneel = false; if (menuOpen && menuWho === 'sec2') closeSecMenu(false); popup('秘書課の侍女（二人目）に戦死判定…次の波で本陣に戻ります'); }
  if (e.medBy) { const m = e.medBy; e.medBy = null; if (m.patient === e) endTreat(m); }
  if (e.medic) { const m = medics[e.team][e.slot]; if (m && m.e === e) { m.dead = true; m.e = null; } endTreat(e); e.kneel = false; if (e.band) e.band.visible = false; const rn = e.role === 'surgeon' ? '外科医' : '看護師'; popup(e.team === 'blue' ? rn + 'に戦死判定…（次の波で持ち場に戻ります）' : '橙組の' + rn + 'に戦死判定'); }
  if (e.ojou) { ojou.dead = true; ojou.e = null; ojou.mode = 'dead'; e.ojou = false; e.wasOjou = true; if (menuOpen && menuWho === 'ojou') closeSecMenu(false); popup('秘書課 西園寺 すみれに戦死判定…次の波で本陣に戻ります'); }
  if (e.aide) { const A = e.aide; if (A.e === e) { A.e = null; A.dead = true; } e.wasAide = A; e.aide = null; if (e.band) e.band.visible = false; popup(A.name + 'に戦死判定…次の波で本陣に戻ります'); }
  if (e.runner) { const R = e.runner; if (R.e === e) { R.e = null; R.dead = true; if (R.job && R.job.s.served === e) R.job.s.served = null; R.job = null; } e.runner = null; e.wasRunner = true; if (e.band) e.band.visible = false; popup('伝令に戦死判定…次の波で本陣に戻ります'); }
  if (e.tag) e.tag.visible = false;
  squadOnDeath(e);
  if (e.fluter) { fluter.dead = true; fluter.e = null; popup('笛役の娘に戦死判定…遠くの笛だけが続く（次の波で戻ります）'); }
  // 倒れる向き：攻撃してきた側から離れる方向
  const fx = from ? e.s.position.x - from.x : Math.sin(e.s.rotation.y), fz = from ? e.s.position.z - from.z : Math.cos(e.s.rotation.y);
  e.fallYaw = Math.atan2(fx, fz) + rand(-0.35, 0.35);
  if (PLANE.on) planeFall(e);
  e.bg.visible = e.fg.visible = e.mk.visible = false; if (e.wmk) e.wmk.visible = false; e.wounded = false; e.kneel = false;
  e.fallT = rand(0.5, 0.62);
  if (byPlayer) {
    if (e.team === 'orange') player.kills++;
    else { player.allyKills++; popup('味方撃破…！'); }
  }
  if (e.wasTalking) { Talk.hush(e); e.silenced = true; }   // 話していた相手：そのまま黙る（最後の台詞も無し）
  else npcSay(e, 'defeat', 2);           // 最後の台詞（これ以降は一切しゃべらない）
  e.silenced = true;
  kiaLabel(e.s.position, e.baseY + e.figH);
  if (e.team === 'orange') {
    const r = Math.random();
    if (r < 0.38) addPickup('arrow', e.s.position);
    else if (r < 0.38 + (player.hp < 60 ? 0.18 : 0.08)) addPickup('food', e.s.position);
  }
}
function toBodies(e) {
  enemies.splice(enemies.indexOf(e), 1);
  scene.remove(e.bg); scene.remove(e.fg); scene.remove(e.mk);
  npcGlow(e, 0, 0, 0);
  e.shadow.visible = false;
  if (e.landY !== undefined) { e.baseY = e.landY; e.s.position.y = e.landY; }
  if (e.slump) { /* 席で崩れたまま */ }
  else if (e.girl.down) startLying(e);
  else if (MOTION && e.mo) Mo.contactAO(e);
  bodies.push(e);
  while (bodies.length > CFG.maxBodies) disposeNpc(bodies.shift());
}

// ---- 標的選び：最も近い敵対者（橙組→プレイヤーか青組、青組→橙組） ----
const PLAYER_T = { isPlayer: true };
function tgtPos(t) { return t.isPlayer ? player.pos : t.s.position; }
const tgtY = t => t.isPlayer ? player.pos.y : t.baseY;
// 近接兵は高所（櫃・武者走り）の相手には届かないので、地上の相手を優先する
// 近接兵の守り：自分の組の弓兵に迫る近接兵を優先して迎え撃ち、守られた弓兵は後回し
const SCREEN = { rate: 0.45, guardR: 10, interceptK: 0.45, archerK: 1.3, kiteR: 8, kiteAggR: 4, holdOut: 4.5 };
if (/[?&]screen=0/.test(location.search)) Object.assign(SCREEN, { rate: 0, guardR: 0, interceptK: 1, archerK: 1, kiteR: 0, kiteAggR: 0 });   // 比較用：以前の動き
function groundArchers(team) { return enemies.filter(o => o.team === team && o.kind === 'archer' && !o.perch && !o.special && o.state !== 'down'); }
function chooseTarget(e) {
  const p = e.s.position, melee = e.kind === 'mob';
  let best = null, bd = 1e9;
  const mine = melee && !e.special ? groundArchers(e.team) : null;
  const consider = (t, x, z, y) => {
    let d = Math.hypot(x - p.x, z - p.z);
    if (t.medic) d *= t.medPhase === 'treat' ? 0.55 : 0.85;   // 医療係は狙われやすい（手当て中は止まっている）
    if (mine && t.kind === 'mob' && !t.special && !t.isPlayer && mine.some(a => Math.hypot(a.s.position.x - x, a.s.position.z - z) < SCREEN.guardR)) d *= SCREEN.interceptK;   // 味方の弓兵に迫る近接兵を迎え撃つ
    else if (melee && t.kind === 'archer' && d > 5 && !e.raider) d *= SCREEN.archerK;   // 弓兵より先に前に立つ近接兵と当たる
    if (melee && Math.abs(y - e.baseY) > 1.5) d += fortGate && !e.special && (e.onFloor || tgtFloor(t)) ? (e.raider && inFort(p.x, p.z) ? 2 : 14) : 80;   // 梯子で届く高所は少し遠い扱い（梯子攻め役は砦に入ると櫓を狙う）
    if (melee && t.lad && t.team !== e.team && t.baseY < 1.6) d *= 0.6;   // 梯子に取り付いた敵を下で迎え撃つ
    if (d < bd) { bd = d; best = t; }
  };
  if (e.secretary) {   // 護衛：プレイヤーから 40m 以内の敵だけ
    for (const o of enemies) if (o.team === 'orange' && o.state !== 'down' && Math.hypot(o.s.position.x - player.pos.x, o.s.position.z - player.pos.z) < 40) consider(o, o.s.position.x, o.s.position.z, o.baseY);
    return best;
  }
  if (e.team === 'orange' && !inHQ()) consider(PLAYER_T, player.pos.x, player.pos.z, player.pos.y);   // 本陣にいる間は狙われない
  for (const o of enemies) {
    if (o.team === e.team || o.state === 'down') continue;
    consider(o, o.s.position.x, o.s.position.z, o.baseY);
  }
  return best;
}
// 砦の壁を越える移動は門を通る（櫃の戦いのみ）
function inFort(x, z) { return z > 0.3 && Math.abs(x) < 42; }
function routeTo(p, tx, tz) {
  if (PLANE.on) return planeRoute(p, tx, tz);
  const g = fortGate; if (!g) return [tx, tz];
  const pin = inFort(p.x, p.z);
  if (pin === inFort(tx, tz)) return [tx, tz];
  if (Math.abs(p.x) < g.half && Math.abs(p.z) < 3.4) return [p.x * 0.5, pin ? -4.5 : 4.5];   // 門の中：そのまま抜ける
  return [clamp(p.x, -1, 1) * 0.8, pin ? 3 : -3];                                              // まず門の前へ
}
// 当たり箱（壁・柱）から押し出す
function pushOutBoxes(pos, r, y0, y1) {
  for (const b of boxes) {
    if (b.y1 <= y0 || b.y0 >= y1) continue;
    if (pos.x < b.x0 - r || pos.x > b.x1 + r || pos.z < b.z0 - r || pos.z > b.z1 + r) continue;
    const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = cx + dx / d * r; pos.z = cz + dz / d * r; }
    else {
      const l = pos.x - b.x0, rr = b.x1 - pos.x, n = pos.z - b.z0, f = b.z1 - pos.z, m = Math.min(l, rr, n, f);
      if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === n) pos.z = b.z0 - r; else pos.z = b.z1 + r;
    }
  }
}
function hitsBox(p) {
  for (const b of boxes) if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y > b.y0 && p.y < b.y1) return true;
  return false;
}

function nearestFoeMelee(e, R) {
  const p = e.s.position; let best = null, bd = R;
  for (const o of enemies) {
    if (o.team === e.team || o.kind !== 'mob' || o.special || o.state === 'down' || Math.abs(o.baseY - e.baseY) > 1.2) continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z); if (d < bd) { bd = d; best = o; }
  }
  return best;
}
// 守り役の近接兵：近くの味方弓兵と敵の間（弓兵から 4.5m 前、左右に散らばる）に立つ。敵が 10m 内に来れば普段どおり突く
function screenHold(e, tx, tz, dt) {
  const p = e.s.position;
  if ((e.wardT = (e.wardT || 0) - dt) <= 0) {
    e.wardT = 1.2; e.ward = null; let bd = 25;
    for (const a of groundArchers(e.team)) { const d = Math.hypot(a.s.position.x - p.x, a.s.position.z - p.z); if (d < bd) { bd = d; e.ward = a; } }
  }
  const a = e.ward; if (!a || a.state === 'down') return false;
  const ap = a.s.position; let dx = tx - ap.x, dz = tz - ap.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  if (dl < SCREEN.holdOut + 3) return false;   // 敵が弓兵のすぐそば：迎え撃つ
  const side = ((e.ph * 7) % 2 - 1) * 2.2;
  const gx = ap.x + dx * SCREEN.holdOut - dz * side, gz = ap.z + dz * SCREEN.holdOut + dx * side;
  const rt = routeTo(p, gx, gz);
  if (Math.hypot(gx - p.x, gz - p.z) > 0.8) steer(e, rt[0], rt[1], e.speed * 0.9, dt);
  else e.faceWant = Math.atan2(tx - p.x, tz - p.z);
  return true;
}
// 橙組の弓兵：近くの井闌に空きがあれば後ろの梯子から上る（高所を取る）
function seiranBoard(e) {
  const p = e.s.position;
  for (const T of seirans) {
    if (!T.active) continue;
    const q = T.perches.find(q => !q.taken); if (!q) continue;
    if (Math.hypot(T.x - p.x, T.z - p.z) > 26) continue;
    q.taken = e; e.climb = { T, q, t: 0 }; return;
  }
}
function seiranClimb(e, dt) {
  const c = e.climb, T = c.T, q = c.q, p = e.s.position;
  if (q.taken !== e) { e.climb = null; e.baseY = 0; return; }
  const lx = T.x, lz = T.z - 2.9;
  if (c.t === 0 && Math.hypot(lx - p.x, lz - p.z) > 0.6) { const rt = routeTo(p, lx, lz); steer(e, rt[0], rt[1], e.speed * 1.1, dt); e.state = 'advance'; c.walk = (c.walk || 0) + dt; if (c.walk > 25) { q.taken = null; e.climb = null; } return; }
  c.t += dt; e.faceWant = 0; e.state = 'idle';
  p.y = e.baseY = Math.min(q.y, c.t / 3.2 * q.y); p.x = lx; p.z = lz;   // 梯子を上る（約3秒）
  if (c.t >= 3.2) {
    e.climb = null; e.perch = q; e.onSeiran = T; e.baseY = q.y; p.set(q.x, q.y, q.z); e.px = q.x; e.pz = q.z;
    e.state = 'hide'; e.hideT = rand(0.5, 1.5); e.crouch = 1; e.cover = null;
  }
}
// ---- 梯子を使う NPC（櫃の戦い）：近接兵は高所の敵を追って梯子を上り、そこで戦い、敵がいなくなれば下りる。
//      一本の梯子は一人ずつ（順番待ち）。上り下りは約 1.6m/秒（櫃 6m で約4秒）、梯子の途中では攻撃できない（無防備）。
//      同じ床へ同時に攻め上がるのは各組 2 人まで（井闌へは 3 人）、同じ床への上り始めは 3 秒以上あける。
const CLIMB_V = 1.6, CLIMB_CAP = 2, CLIMB_GAP = 3;
const ladX = L => (L.x0 + L.x1) / 2, ladZ = L => (L.z0 + L.z1) / 2;
function ladMeta(L) {
  if (L.F !== undefined) return L;
  const xc = ladX(L), zc = ladZ(L); let best = null, bd = 3;
  for (const f of floors) {
    if (Math.abs(f.y - L.y1) > 0.15) continue;
    const d = Math.hypot(clamp(xc, f.x0, f.x1) - xc, clamp(zc, f.z0, f.z1) - zc); if (d < bd) { bd = d; best = f; }
  }
  L.F = best; L.dir = best ? (Math.sign((best.z0 + best.z1) / 2 - zc) || 1) : 1;
  return L;
}
function ladPts(L) {
  ladMeta(L); const x = ladX(L), zc = ladZ(L), d = L.dir, F = L.F;
  return { base: [x, zc - d * 0.8], rung: [x, zc], top: [clamp(x, F.x0 + 0.4, F.x1 - 0.4), clamp(zc + d * 1.3, F.z0 + 0.35, F.z1 - 0.35)] };
}
function floorAt(x, z, y) {
  for (const f of floors) if (Math.abs(f.y - y) < 0.35 && x > f.x0 - 0.3 && x < f.x1 + 0.3 && z > f.z0 - 0.3 && z < f.z1 + 0.3) return f;
  return null;
}
function tgtFloor(t) { return t.isPlayer ? (player.pos.y > 0.5 ? floorAt(player.pos.x, player.pos.z, player.pos.y) : null) : t.onFloor || (t.baseY > 0.5 ? floorAt(t.s.position.x, t.s.position.z, t.baseY) : null); }
function ladderTo(F, x, z) {
  let best = null, bd = 1e9;
  for (const L of ladders) { ladMeta(L); if (L.F !== F) continue; const d = Math.hypot(ladX(L) - x, ladZ(L) - z); if (d < bd) { bd = d; best = L; } }
  return best;
}
const onOrTo = (o, F) => o.onFloor === F || (o.lad && o.lad.L.F === F && o.lad.up);
function tryClimb(e, F) {   // 高所の標的を追って上る
  if (!F || (e.noClimbT || 0) > 0 || e.special) return false;
  const L = ladderTo(F, e.s.position.x, e.s.position.z); if (!L) return false;
  const cap = F.seiran ? 3 : CLIMB_CAP;
  if (enemies.filter(o => o.team === e.team && o.state !== 'down' && onOrTo(o, F)).length >= cap) return false;
  const k = e.team + '_climbT'; if (time - (F[k] || -99) < CLIMB_GAP) return false;
  F[k] = time; startClimb(e, L, true); return true;
}
function startClimb(e, L, up) { e.lad = { L, up, ph: 'go', t: 0, wait: 0 }; e.cover = null; e.state = 'approach'; }
function endClimb(e, cool) { const c = e.lad; if (!c) return; if (c.L.occ === e) c.L.occ = null; if (e.climbPerch) { if (e.climbPerch.taken === e) e.climbPerch.taken = null; e.climbPerch = null; } e.lad = null; e.noClimbT = cool; e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.t = 0; }
function npcLadder(e, dt) {
  const c = e.lad, L = c.L, P = ladPts(L), p = e.s.position; c.t += dt;
  if (!L.F) { endClimb(e, 10); return; }
  if (c.ph === 'go') {
    const [gx, gz] = c.up ? P.base : P.top, d = Math.hypot(gx - p.x, gz - p.z);
    if (c.up && e.tgt && Math.abs(tgtY(e.tgt) - e.baseY) < 1.2 && Math.hypot((e.tgt.isPlayer ? player.pos : e.tgt.s.position).x - p.x, (e.tgt.isPlayer ? player.pos : e.tgt.s.position).z - p.z) < 7) { endClimb(e, 4); return; }   // 下で敵に迫られたら上るのをやめて戦う
    if (d > 0.45) {
      if (c.up) {
        let wx = gx, wz = gz; const T = L.seiran;
        if (T && p.z > T.z - 2.3 - 0.6) {   // 井闌の前や横から：車体を回り込んで後ろの梯子へ
          const side = Math.sign(p.x - T.x) || 1;
          if (Math.abs(p.x - T.x) < 2.3 + 1.0) { wx = T.x + side * (2.3 + 1.5); wz = p.z; } else { wx = T.x + side * (2.3 + 1.5); wz = T.z - 2.3 - 1.4; }
        }
        const rt = routeTo(p, wx, wz); steer(e, rt[0], rt[1], e.speed, dt);
      } else steer(e, gx, gz, e.speed * 0.8, dt);
      e.state = 'approach'; if (c.t > 30) endClimb(e, 12); return;
    }
    if (L.occ && L.occ !== e && L.occ.lad && L.occ.lad.L === L && L.occ.state !== 'down' && enemies.includes(L.occ)) {   // 順番待ち
      c.wait += dt; e.state = 'idle'; e.faceWant = Math.atan2(P.rung[0] - p.x, P.rung[1] - p.z);
      if (c.wait > 9) endClimb(e, 10); return;
    }
    L.occ = e; c.ph = 'step'; c.st = 0; c.from = [p.x, p.z]; c.to = c.up ? P.rung : P.rung;
  }
  if (c.ph === 'step' || c.ph === 'exit') {   // 梯子の前⇔梯子／梯子の上⇔床 を 0.45 秒で
    c.st += dt; const k = Math.min(1, c.st / 0.45);
    p.x = c.from[0] + (c.to[0] - c.from[0]) * k; p.z = c.from[1] + (c.to[1] - c.from[1]) * k;
    e.state = 'climb'; e.faceWant = c.ph === 'exit' === c.up ? Math.atan2(c.to[0] - c.from[0], c.to[1] - c.from[1]) || e.face : Math.atan2(P.rung[0] - P.base[0], P.rung[1] - P.base[1]);
    if (k < 1) return;
    if (c.ph === 'step') { c.ph = 'climb'; return; }
    // exit 完了
    if (c.up) { e.onFloor = L.F; if (e.kind === 'archer' && e.climbPerch) { const q = e.climbPerch; e.climbPerch = null; e.perch = q; p.set(q.x, e.baseY, q.z); e.crouch = 1; endClimb(e, 4); e.state = 'hide'; e.hideT = rand(0.4, 1); return; } }
    else e.onFloor = null;
    endClimb(e, c.up ? 3 : 6); return;
  }
  if (c.ph === 'climb') {
    p.x = P.rung[0]; p.z = P.rung[1]; e.px = p.x; e.pz = p.z;
    e.state = 'climb'; e.faceWant = L.dir > 0 ? 0 : Math.PI;   // 梯子（床の側）を向く＝背中が見える
    const y0 = e.baseY;
    e.baseY = clamp(e.baseY + (c.up ? 1 : -1) * CLIMB_V * dt, 0, L.y1);
    if (Math.floor(y0 / 0.4) !== Math.floor(e.baseY / 0.4) && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 14) Sfx.step(true, 0.35, p);   // 梯子の段
    if (c.up && e.baseY >= L.y1 - 1e-3) { e.baseY = L.y1; c.ph = 'exit'; c.st = 0; c.from = [p.x, p.z]; c.to = e.climbPerch ? [e.climbPerch.x, e.climbPerch.z] : P.top; }
    if (!c.up && e.baseY <= 1e-3) { e.baseY = 0; c.ph = 'exit'; c.st = 0; c.from = [p.x, p.z]; c.to = P.base; }
  }
}
// 床の上で戦う NPC：同じ高さに相手がいなくなったら最寄りの梯子で下りる
function maybeDescend(e) {
  if (!e.onFloor || e.lad || e.perch || (e.noClimbT || 0) > 0) return;
  if (e.tgt && Math.abs(tgtY(e.tgt) - e.baseY) < 1.2) return;
  const L = ladderTo(e.onFloor, e.s.position.x, e.s.position.z);
  if (L) startClimb(e, L, false); else e.onFloor = null;
}
// 橙組の弓兵（一部）：砦の中で味方の櫃・武者走りの梯子の近くまで来たら、空いた射撃位置へ上る
function tryArcherClimb(e) {
  if (e.team !== 'orange' || !e.climber || e.onFloor || (e.noClimbT || 0) > 0 || !fortGate) return false;
  const p = e.s.position; if (!inFort(p.x, p.z)) return false;
  for (const L of ladders) {
    ladMeta(L); if (!L.F || L.F.seiran || Math.hypot(ladX(L) - p.x, ladZ(L) - p.z) > 16) continue;
    const q = perches.find(q => !q.taken && !q.seiran && Math.abs(q.y - L.F.y) < 0.2 && q.x > L.F.x0 && q.x < L.F.x1 && q.z > L.F.z0 && q.z < L.F.z1 && Math.hypot(q.x - ladX(L), q.z - ladZ(L)) < 9);
    if (!q) continue;
    if (enemies.filter(o => o.team === 'orange' && o.state !== 'down' && onOrTo(o, L.F)).length >= CLIMB_CAP) continue;
    q.taken = e; e.climbPerch = q; startClimb(e, L, true); return true;
  }
  e.noClimbT = 4; return false;
}
// ---- 遮蔽（竹林）を使う。基準は自分の標的の位置 ----
function findCover(e, minD, maxD, tx, tz) {
  let best = null, bd = 1e9;
  for (const c of covers) {
    if (fortGate && e.team === 'blue' && !inFort(c.x, c.z)) continue;   // 味方は砦の外の竹束を使わない
    if (e.secretary && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 10) continue;   // 護衛はプレイヤーの近くの遮蔽物だけ
    const dp = Math.hypot(c.x - tx, c.z - tz);
    if (dp < minD || dp > maxD) continue;
    const de = Math.hypot(c.x - e.s.position.x, c.z - e.s.position.z);
    if (de < bd) { bd = de; best = c; }
  }
  return best;
}
function coverPoint(c, tx, tz) {   // 竹林の、標的から見て裏側
  if (c.row) return { x: c.x, z: c.z + (tz < c.z ? 0.42 : -0.42), px: 1, pz: 0 };   // 機内：座席の背もたれの陰（列の間）
  const dx = c.x - tx, dz = c.z - tz, d = Math.hypot(dx, dz) || 1;
  return { x: c.x + dx / d * (c.r + 0.8), z: c.z + dz / d * (c.r + 0.8), px: -dz / d, pz: dx / d };
}
function steer(e, tx, tz, sp, dt) {
  if (e.perch) return 0;
  if (e.wounded) sp *= WOUND_SPEED;
  const p = e.s.position;
  if (PLANE.on && bodies.length) { const h = pileAt(p.x, p.z); if (h > 0) sp *= h > 0.5 ? 0.3 : 0.5; }   // 倒れた娘をまたぐ・乗り越える
  const rt = routeTo(p, tx, tz), routed = rt[0] !== tx || rt[1] !== tz;
  const dx = rt[0] - p.x, dz = rt[1] - p.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const k = Math.min(d, sp * dt) / d; p.x += dx * k; p.z += dz * k; e.moving = true; }
  return routed ? Math.max(d, 1) + 5 : d;
}

// ====================================================================
//  本陣：休める安全地帯。秘書課の侍女に用事を頼める（秘書・笛役も戦死判定を受ける。次の波で本陣に戻る）
// ====================================================================
let hq = null;          // { x0, x1, z0, z1, sx, sz }
const sec = { e: null, name: '秘書課 白瀬 澄', near: false, teaT: 0, buffT: 0, fanT: 0, mode: 'hq', esc: null, cook: null, dish: null, eatT: 0, mealWave: -1 };
let menuOpen = false, allyStance = 'off', inHqPrev = false;
const inHQ = (x = player.pos.x, z = player.pos.z) => !!hq && player.pos.y < 0.5 && x > hq.x0 && x < hq.x1 && z > hq.z0 && z < hq.z1;
const hqMat = { cloth: new THREE.MeshLambertMaterial({ color: 0x2b2420 }), tea: new THREE.MeshLambertMaterial({ color: 0x6b8a3a }),
  cup: new THREE.MeshLambertMaterial({ color: 0xece6d6 }), stool: new THREE.MeshLambertMaterial({ color: 0x3a2a1c }) };
// 本陣の小物（床几・茶の卓）を stageRoot に置く
function buildHQ(x0, x1, z0, z1, sx, sz) {
  hq = { x0, x1, z0, z1, sx, sz };
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.6), WOOD_L); table.position.set(sx + 1.5, 0.7, sz); stageRoot.add(table);
  for (const [dx, dz] of [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), WOOD_D); l.position.set(sx + 1.5 + dx, 0.35, sz + dz); stageRoot.add(l);
  }
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hqMat.tea); pot.scale.y = 0.85; pot.position.set(sx + 1.25, 0.82, sz); stageRoot.add(pot);
  for (const dx of [0.1, 0.3]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 10), hqMat.cup); c.position.set(sx + 1.5 + dx, 0.775, sz + 0.05); stageRoot.add(c); }
  for (const dx of [-1.6, 3.2]) {   // 床几（休む腰掛け）
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), hqMat.cloth); st.position.set(sx + dx, 0.45, sz - 1.2); stageRoot.add(st);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), hqMat.stool); l.position.set(sx + dx + s * 0.2, 0.22, sz - 1.2); l.rotation.z = s * 0.5; stageRoot.add(l); }
  }
}
// 秘書課の侍女：写真の侍女（既定 mob06）。本陣では立って用事を聞き、「一緒に来て」で弓兵として同行
function spawnSecretary() {
  removeSecretary();
  if (!fluter.e && !fluter.dead) spawnFluter();
  if (!hq || !GIRLS[SEC_ID]) return;
  const e = spawnEnemy(hq.sx, hq.sz, 'archer', false, 'blue', { secretary: true, girl: SEC_ID });
  if (!e) return;
  sec.e = e; sec.esc = null; sec.mode = 'hq';
}
function removeSecretary() {
  const e = sec.e; sec.e = null; sec.esc = null;
  if (e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
// 護衛（一緒に来て）：青組の弓兵として同行
function startEscort() {
  if (sec.mode === 'escort' || sec.mode === 'returning') { secReply('sec_already', 0); return; }
  if (sec.mode !== 'hq' || !sec.e) return;
  sec.esc = sec.e; sec.e.returning = false; sec.mode = 'escort'; sec.stayHQ = false; sec.auto = false;
  sec.e.state = 'advance'; sec.e.t = 0;
  secReply('sec_follow');
  closeSecMenu(false);
}
function sendBack() {
  sec.stayHQ = true; sec.auto = false;   // 「本陣に戻って」：殿が本陣を出ても追わずに本陣で待つ
  if (sec.mode !== 'escort' || !sec.esc) { secReply('sec_already', 0); return; }
  sec.esc.returning = true; sec.mode = 'returning';
  secReply('sec_return', 0);
  closeSecMenu(false);
}
// ---- 笛役の娘（味方・非戦闘員、写真の侍女。既定 mob03）：本陣のそばで横笛を吹く。戦死判定を受けると笛が止む ----
const fluter = { e: null, dead: false, name: '笛役 小鳥遊 ひびき' };
function spawnFluter() {
  removeFluter();
  if (!hq || !GIRLS[FLUTE_ID]) return;
  const fp = hqSpot('fluter', -4, 0.5), e = spawnEnemy(fp[0], fp[1], 'mob', false, 'blue', { fluter: true, girl: FLUTE_ID });
  fluter.e = e; fluter.dead = false;
}
function removeFluter() {
  const e = fluter.e; fluter.e = null;
  if (e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
function updateFluter(dt) {}
// ---- 二人目の秘書（秘書課 早瀬 ことね、陽気）：靴を磨いて（しばらく足が速い）／荷物を持って（矢筒を持ってついて来る：矢の上限+10、そばにいると少しずつ補充） ----
const sec2 = { e: null, dead: false, mode: 'hq', name: '秘書課 早瀬 ことね', refT: 0, shoesCd: 0 };
let menuWho = 'sec', talkWho = null;
function spawnSec2() {
  removeSec2();
  if (!hq || !GIRLS[SEC2_ID]) return;
  const sp2 = hqSpot('sec2', -2.2, -2.4), e = spawnEnemy(sp2[0], sp2[1], 'mob', false, 'blue', { sec2: true, girl: SEC2_ID });
  sec2.e = e; sec2.dead = false; sec2.mode = 'hq';
}
function removeSec2() {
  const e = sec2.e; sec2.e = null;
  if (e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
const sec2Near = (r = 8) => !!(sec2.e && sec2.e.state !== 'down' && Math.hypot(sec2.e.s.position.x - player.pos.x, sec2.e.s.position.z - player.pos.z) < r && Math.abs(player.pos.y - sec2.e.baseY) < 3);
const carrying = () => sec2.mode === 'carry' && sec2Near(8);
function arrowsMax() { return CFG.arrowsMax + (carrying() ? 10 : 0); }
function sec2Brain(e, dt) {
  const p = e.s.position; e.t += dt; e.tgt = null; e.state = 'idle';
  const dpx = player.pos.x - p.x, dpz = player.pos.z - p.z, dp = Math.hypot(dpx, dpz);
  if (e.polishT > 0) {   // 靴磨き：膝をついて手元を動かす
    e.polishT -= dt; e.kneel = true; e.faceWant = Math.atan2(dpx, dpz);
    if (e.polishT <= 0) { e.kneel = false; player.speedT = 60; popup('60秒間 足が軽い（移動が速い）'); secReply('sec2_shoes_done', 0); }
    return;
  }
  e.kneel = false;
  if (sec2.mode === 'carry' || sec2.mode === 'follow') {   // 荷物持ち／慌てて後を追う：プレイヤーの左斜め後ろ
    const fx = player.pos.x + Math.sin(player.yaw) * 2.0 - Math.cos(player.yaw) * 1.4, fz = player.pos.z + Math.cos(player.yaw) * 2.0 + Math.sin(player.yaw) * 1.4;
    const d = Math.hypot(fx - p.x, fz - p.z);
    if (d > 0.8) { const rt = routeTo(p, fx, fz); steer(e, rt[0], rt[1], d > 6 ? e.speed * 1.4 : e.speed, dt); e.faceWant = Math.atan2(fx - p.x, fz - p.z); }
    else e.faceWant = Math.atan2(dpx, dpz);
    return;
  }
  const [hx, hz] = e.home, d = Math.hypot(hx - p.x, hz - p.z);
  if (d > 0.5) { steer(e, hx, hz, e.speed * (d > 6 ? 1 : 0.6), dt); e.faceWant = Math.atan2(hx - p.x, hz - p.z); }
  else e.faceWant = dp < 8 ? Math.atan2(dpx, dpz) : Math.PI;
  if (sec2.mode === 'returning' && d < 1.2) { sec2.mode = 'hq'; secReply('sec2_back', 0); }
}
const SEC2_REQ = {
  tea() { SEC_REQ.tea(); },
  report() { SEC_REQ.report(); },
  shoes() {
    if (player.speedT > 0) { secReply('sec2_shoes_wait', 0); return; }
    const e = sec2.e; if (!e) return;
    e.polishT = 3.2; secReply('sec2_shoes'); closeSecMenu(false);
    Sfx.noiseBurst(0.8, 'bandpass', 1800, 900, 0.06, 0.8);
  },
  carry() {
    if (sec2.mode === 'carry') { secReply('sec2_carry_already', 0); return; }
    sec2.stayHQ = false; sec2.mode = 'carry'; sec2.refT = 0; secReply('sec2_carry'); popup('荷物持ち：そばにいる間 矢の上限+10・少しずつ補充'); closeSecMenu(false);
  },
  home() {
    sec2.stayHQ = true;
    if (sec2.mode !== 'carry' && sec2.mode !== 'follow') { secReply('sec2_already_hq', 0); return; }
    sec2.mode = 'returning'; secReply('sec2_return', 0); closeSecMenu(false);
  },
};
function updateSec2(dt) {
  if (player.speedT > 0) player.speedT -= dt;
  if (carrying() && player.arrows < arrowsMax()) { sec2.refT += dt; if (sec2.refT >= 2.5) { sec2.refT = 0; player.arrows++; } }
}
// ---- お嬢さま秘書（秘書課 西園寺 すみれ）：王様（殿）の遠縁の親戚。上品で物腰やわらか、少し改まった丁寧語。
//      お茶・戦況報告・「一緒に来て」（優雅について歩く。戦わない）・「本陣に戻って」。本陣で王様の体力が減っていれば先回りしてお茶（+20、50秒に一度）。
//      褒められると控えめに、上品にかわす。戦死判定を受けると次の波で本陣に戻る。
const OJOU_ID = 'ojou';
const ojou = { e: null, dead: false, mode: 'hq', name: '秘書課 西園寺 すみれ', stayHQ: false, careT: 20 };
function spawnOjou() {
  removeOjou();
  if (!hq || !GIRLS[OJOU_ID]) return;
  const op = hqSpot('ojou', 1.8, -2.4), e = spawnEnemy(op[0], op[1], 'mob', false, 'blue', { ojou: true, girl: OJOU_ID });
  ojou.e = e; ojou.dead = false; ojou.mode = 'hq';
}
function removeOjou() {
  const e = ojou.e; ojou.e = null;
  if (e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
function ojouBrain(e, dt) {
  const p = e.s.position; e.t += dt; e.tgt = null; e.state = 'idle'; e.kneel = false;
  const dpx = player.pos.x - p.x, dpz = player.pos.z - p.z, dp = Math.hypot(dpx, dpz);
  if (ojou.mode === 'follow') {   // 王様の右斜め後ろ
    const fx = player.pos.x + Math.sin(player.yaw) * 2.6 + Math.cos(player.yaw) * 1.8, fz = player.pos.z + Math.cos(player.yaw) * 2.6 - Math.sin(player.yaw) * 1.8;
    const d = Math.hypot(fx - p.x, fz - p.z);
    if (d > 0.8) { const rt = routeTo(p, fx, fz); steer(e, rt[0], rt[1], d > 6 ? e.speed * 1.35 : e.speed * 0.9, dt); e.faceWant = Math.atan2(fx - p.x, fz - p.z); }
    else e.faceWant = Math.atan2(dpx, dpz);
    return;
  }
  const [hx, hz] = e.home, d = Math.hypot(hx - p.x, hz - p.z);
  if (d > 0.5) { const rt = routeTo(p, hx, hz); steer(e, rt[0], rt[1], e.speed * (d > 6 ? 1 : 0.6), dt); e.faceWant = Math.atan2(hx - p.x, hz - p.z); }
  else e.faceWant = dp < 8 ? Math.atan2(dpx, dpz) : Math.PI;
  if (ojou.mode === 'returning' && d < 1.2) { ojou.mode = 'hq'; ojouSay('ojou_back', 0); }
}
function ojouSay(cat, i = null) {
  if (!ojou.e || ojou.e.state === 'down') return;
  Talk.as(ojou.e, () => { const save = menuWho; menuWho = 'ojou'; try { secReply0(cat, i); } finally { menuWho = save; } });
}
function updateOjou(dt) {
  ojou.careT = Math.max(0, ojou.careT - dt);
  const e = ojou.e; if (!e || e.state === 'down' || menuOpen) return;
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
  if (d < 3.4 && ojou.careT <= 0 && player.hp < CFG.maxHp * 0.6) {   // 先回りの気配り
    ojou.careT = 50; player.hp = Math.min(CFG.maxHp, player.hp + 20); popup('お茶 体力+20（西園寺）'); Sfx.pickup(); ojouSay('ojou_care');
  }
}
const OJOU_REQ = {
  tea() { SEC_REQ.tea(); },
  report() { SEC_REQ.report(); },
  follow() {
    if (ojou.mode === 'follow') { secReply('ojou_follow_already', 0); return; }
    ojou.stayHQ = false; ojou.mode = 'follow'; ojou.auto = false; secReply('ojou_follow'); closeSecMenu(false);
  },
  home() {
    ojou.stayHQ = true; ojou.auto = false;
    if (ojou.mode !== 'follow') { secReply('ojou_already_hq', 0); return; }
    ojou.mode = 'returning'; secReply('ojou_return', 0); closeSecMenu(false);
  },
  praise() { secReply('ojou_praise'); },
};
// ---- 医療係（両軍の本陣に一人ずつ。非戦闘員だが戦死判定は受ける）：倒れた味方へ駆け寄り、膝をついて手当て ----
// 手当ては膝をつく姿・白い布・声だけ（傷などの表現は一切なし）。倒れて間もない娘ほど復帰しやすい
// ---- 救護班（両軍とも外科医2人＋看護師2人）。外科医は矢を抜いて手当てし起こす（少し助けやすい）。看護師は外科医の手伝い・包帯・声かけ、
//      手の空いた外科医がいないときは自分で手当てする。一人の娘を二人で取り合わない（medBy＝主に手当てする人、assistBy＝手伝い）
const MED_TEAM = role => [0, 1].map(i => ({ role, e: null, dead: false }));
const MED_NAMES = { blue: { surgeon: ['外科医 鷹司 玲子', '外科医 東雲 真琴'], nurse: ['看護師 朝比奈 しずく', '看護師 白石 のぞみ'] },
  orange: { surgeon: ['外科医 楠 かおる', '外科医 柊 理沙'], nurse: ['看護師 若葉 つばさ', '看護師 小野寺 結衣'] } };
const medics = { blue: [...MED_TEAM('surgeon'), ...MED_TEAM('nurse')], orange: [...MED_TEAM('surgeon'), ...MED_TEAM('nurse')] };
const MED_HOME = [[0, 0], [1.4, 0.9], [-1.0, 1.0], [2.4, -0.6]];   // 持ち場の中の立ち位置
const medPost = { blue: null, orange: null };
const MED_R = 60;          // 救護班が出向く範囲（持ち場から）
const SURGEON_ID = 'surgeon';
const clothMat = new THREE.SpriteMaterial({ map: canvasTex(64, 48, (g, w, h) => {
  g.fillStyle = '#fbfaf6'; g.beginPath(); g.moveTo(6, 10); g.lineTo(56, 4); g.lineTo(60, 40); g.lineTo(8, 44); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(160,160,150,.6)'; g.lineWidth = 2; for (const y of [16, 26, 34]) { g.beginPath(); g.moveTo(10, y); g.lineTo(56, y - 4); g.stroke(); }
}), transparent: true, depthWrite: false });
function buildMedPost(x, z, team) {
  medPost[team] = [x, z];
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 1.9), new THREE.MeshLambertMaterial({ color: 0xece8dc })); mat.position.set(x + 1.2, 0.03, z); stageRoot.add(mat);   // 担架の敷布
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), WOOD_L); box.position.set(x - 0.9, 0.15, z + 0.3); stageRoot.add(box);   // 薬箱
  if (team === 'orange') { nobori(x - 2, z - 1, '#d9741c', '#fff6e8', '救護'); maku(x + 0.5, z - 2.5, 6, 0); }
}
function spawnMedic(team, m) {
  removeMedic(m);
  const hp = medPost[team]; if (!hp) return;
  const i = medics[team].indexOf(m), gid = m.role === 'surgeon' && GIRLS[SURGEON_ID] ? SURGEON_ID : MEDIC_ID;
  if (!GIRLS[gid]) return;
  const [dx, dz] = (PLANE.on ? PLANE_MED[team][i] : MED_HOME[i]) || [0, 0], sg = PLANE.on || team === 'blue' ? 1 : -1;
  const e = spawnEnemy(hp[0] + dx * sg, hp[1] + dz * sg, 'mob', false, team, { medic: true, role: m.role, slot: i, girl: gid, medName: MED_NAMES[team][m.role][i % 2] });
  m.e = e; m.dead = false;
}
function removeMedic(m) {
  const e = m.e; m.e = null;
  if (e) { endTreat(e); const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
// 声：外科医は従来の医療係の声（med_）、看護師は nurse_（無ければ med_ → 合成音声）
function medSay(e, key, quiet) { if (e.state === 'down') return; Talk.as(e, () => medSay0(e, key, quiet)); }
function medSay0(e, key, quiet) {
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z) + (quiet ? 6 : 0);
  if (d > 45) return;
  const X = VoicePack.man && VoicePack.man._extra;
  const L = X && ((e.role === 'nurse' && X['nurse_' + key]) || X['med_' + key]);
  const txt = NURSE_TEXT[key];
  const near = d - (quiet ? 6 : 0) < 16 && !menuOpen;   // 近くの救護班の言葉は字幕でも見せる（御臨終です・矢を抜きます など）
  if (!L || !L.length) { if (txt) { const t = pick(txt); if (near) subtitle(t); if (e.role === 'nurse') Voice.say(t, { pitch: 1.2, rate: 1.0 }, 1); } return; }
  const j = (Math.random() * L.length) | 0;
  if (near) subtitle(L[j].text);
  if (!VoicePack.play(L[j].files[0], d, 1)) Voice.say(L[j].text, { pitch: e.role === 'nurse' ? 1.2 : 0.95, rate: e.role === 'nurse' ? 1.0 : 0.9 }, 1);
}
const NURSE_TEXT = { go: ['今行きます！', '待っててね、すぐ行きます！'], assist: ['先生、お手伝いします。', '押さえていますね、先生。'], bandage: ['包帯を巻きますね。', 'きつくないですか？ 少し巻きますね。'],
  comfort: ['大丈夫、そばにいますからね。', 'ゆっくり息をして…もう少しですよ。'], start: ['しっかりして、すぐ手当てしますね。'], ok: ['よく頑張りましたね。もう大丈夫です。'], lost: ['…御臨終です。'] };
const bodyMid = b => [b.s.position.x + Math.sin(b.fallYaw || 0) * b.figH * 0.45, b.s.position.z + Math.cos(b.fallYaw || 0) * b.figH * 0.45];
const medAlive = (team, role) => medics[team].map(m => m.e).filter(e => e && e.state !== 'down' && e.role === role && !e.hold);
// v4：倒れた娘（戦死判定）はもう助からない。救護班は負傷した生きている娘を優先して手当てし（矢を抜く・包帯。血の表現なし）、体力を戻して戦列へ返す。
//     倒れた娘には、手の空いたときに短く確かめに行き「…御臨終です」と告げて離れる（起こさない）
const isLiving = b => b.state !== 'down' && enemies.includes(b);
const ptPos = b => isLiving(b) ? [b.s.position.x, b.s.position.z] : bodyMid(b);
function patientOK(e, b) {
  if (b.team !== e.team || b.special || b.medDone) return false;
  if (isLiving(b) ? !b.wounded || b.perch || b.lad || b.onFloor : time - (b.downAt || 0) > 90) return false;
  const [bx, bz] = ptPos(b), hp = e.follow ? [player.pos.x, player.pos.z] : medPost[e.team] || e.home;
  return Math.hypot(bx - hp[0], bz - hp[1]) <= (e.follow ? 22 : MED_R) && Math.abs(b.baseY - e.baseY) <= 0.5;
}
function findPatient(e, livingOnly) {   // 負傷者（生きている）を先に、いなければ倒れた娘（確かめるだけ）。誰も向かっていない一番近い娘
  const p = e.s.position; let best = null, bd = 1e9;
  for (const L of [enemies, livingOnly ? [] : bodies]) {
    for (const b of L) {
      if (b.medBy || !patientOK(e, b)) continue;
      const [bx, bz] = ptPos(b), d = Math.hypot(bx - p.x, bz - p.z); if (d < bd) { bd = d; best = b; }
    }
    if (best) return best;
  }
  return best;
}
function findAssist(e) {   // 外科医が手当て中の負傷者で、手伝いのいない娘
  const p = e.s.position; let best = null, bd = 1e9;
  for (const b of enemies) {
    if (!b.medBy || b.medBy.role !== 'surgeon' || b.assistBy || !b.wounded || b.team !== e.team || b.state === 'down') continue;
    const [bx, bz] = ptPos(b), d = Math.hypot(bx - p.x, bz - p.z); if (d < bd && d < MED_R) { bd = d; best = b; }
  }
  return best;
}
function endTreat(e) {
  if (e.cloth) { scene.remove(e.cloth); e.cloth = null; }
  if (e.patient) { if (e.patient.medBy === e) e.patient.medBy = null; if (e.patient.assistBy === e) e.patient.assistBy = null; }
  e.patient = null; e.kneel = false; e.medPhase = null; e.assisting = false;
}
function healPatient(b) {   // 手当て完了：体力を戻して戦列へ
  b.hp = Math.max(b.hp, Math.ceil(b.hpMax * 0.85));
  for (const a of b.stuck) a.parent && a.parent.remove(a);
  b.stuck = []; b.medBy = null; b.assistBy = null; b.retreated = false;
  setWounded(b, false);
  if (b.state === 'idle') { b.state = b.kind === 'archer' ? 'advance' : 'approach'; b.t = 0; }
  if (b.team === 'blue') popup('負傷した味方が手当てを受けて戦列に戻った');
}
function revivePatient() { /* v4：倒れた娘は起こさない（戦死判定＝助からない） */ }
function medicBrain(e, dt) {
  const p = e.s.position; e.t += dt; e.tgt = null; e.state = 'idle'; e.cd -= dt;
  let pt = e.patient;
  if (pt) {
    const live = isLiving(pt);
    const bad = live ? (!pt.wounded || pt.team !== e.team) : (!bodies.includes(pt) || (pt.medDone && e.medPhase !== 'treat'));
    if (bad || (e.assisting && (!pt.medBy || !live))) { endTreat(e); pt = null; }
  }
  // 倒れた娘を確かめに向かっている途中で負傷者が出たら、そちらを先に
  if (pt && !isLiving(pt) && e.medPhase === 'go' && (e.scanT2 = (e.scanT2 || 0) - dt) <= 0) {
    e.scanT2 = 0.8; const w = findPatient(e, true); if (w) { endTreat(e); pt = null; }
  }
  if (!pt) {
    e.kneel = false;
    if ((e.scanT = (e.scanT || 0) - dt) <= 0) {
      e.scanT = 0.6;
      if (e.role === 'surgeon') {
        pt = findPatient(e);
        if (pt) { e.patient = pt; pt.medBy = e; e.medPhase = 'go'; e.medT = 0; if (isLiving(pt) && Math.random() < 0.5) medSay(e, 'go'); }
      } else {
        // 看護師：手の空いた外科医がいれば、負傷者は外科医に任せて手伝いに回る。いなければ自分で手当て。倒れた娘の確認は看護師も行く
        const freeSurgeon = medAlive(e.team, 'surgeon').some(s => !s.patient);
        let as = freeSurgeon ? null : findAssist(e);
        const un = freeSurgeon ? null : findPatient(e, true);
        if (un) { e.patient = pt = un; un.medBy = e; e.medPhase = 'go'; e.medT = 0; e.assisting = false; if (Math.random() < 0.6) medSay(e, 'go'); }
        else if (as || (as = findAssist(e))) { e.patient = pt = as; as.assistBy = e; e.medPhase = 'go'; e.medT = 0; e.assisting = true; if (Math.random() < 0.5) medSay(e, 'assist'); }
        else if (!freeSurgeon) { const b = findPatient(e); if (b) { e.patient = pt = b; b.medBy = e; e.medPhase = 'go'; e.medT = 0; e.assisting = false; } }
      }
    }
  }
  if (!pt) {   // 持ち場へ戻る／待つ（殿について来た者は殿の後ろ）
    const [hx, hz] = e.follow ? followPt(e.fi) : e.home, d = Math.hypot(hx - p.x, hz - p.z);
    if (d > 0.5) { const rt = routeTo(p, hx, hz); steer(e, rt[0], rt[1], e.speed * (d > 6 ? (e.follow ? 1.35 : 0.9) : 0.5), dt); e.faceWant = Math.atan2(hx - p.x, hz - p.z); }
    else e.faceWant = e.follow ? Math.atan2(player.pos.x - p.x, player.pos.z - p.z) : e.team === 'blue' ? Math.PI : 0;
    return;
  }
  const live = isLiving(pt), [bx, bz] = ptPos(pt);
  // 体の横に膝をつく（手当てする人は右側、手伝いは左側）
  const sd = e.assisting ? -1 : 1, ry = live ? pt.s.rotation.y + Math.PI / 2 : pt.fallYaw;
  const off = live ? 0.75 : 0.62;
  const sx = bx + Math.cos(ry) * off * sd, sz = bz - Math.sin(ry) * off * sd;
  const dp = Math.hypot(bx - p.x, bz - p.z);   // 生きている相手は押し合いで横の位置に届かないことがあるので、すぐそばまで来れば手当てに入る
  if (e.medPhase === 'go' || (live && e.medPhase === 'treat' && dp > 2.0)) {   // 相手が動いたら追い直す
    if (e.medPhase !== 'go') { e.medPhase = 'go'; if (e.cloth) { scene.remove(e.cloth); e.cloth = null; } }
    e.kneel = false;
    const d = Math.hypot(sx - p.x, sz - p.z);
    if (d > 0.35 && !(live && dp < 1.2)) { const rt = routeTo(p, sx, sz); steer(e, rt[0], rt[1], e.speed * (d < 4 ? 0.7 : 1), dt); e.faceWant = Math.atan2(sx - p.x, sz - p.z); }
    else if (!live || pt.woundWait || (pt.vs || 0) < 0.3) {
      e.medPhase = 'treat'; e.medT = 0; e.medStep = 0;
      if (live) { e.cloth = new THREE.Sprite(clothMat); e.cloth.scale.set(0.26, 0.19, 1); scene.add(e.cloth); }
    }
    return;
  }
  // 確認／手当て
  e.medT += dt; e.kneel = true; e.faceWant = Math.atan2(bx - p.x, bz - p.z);
  const T = e.medT;
  if (!live) {   // 倒れた娘：脈を確かめるだけ（短く）。起こさない
    if (e.medStep === 0) { e.medStep = 1; }
    if (e.medStep === 1 && T > 1.3) { e.medStep = 2; pt.medDone = true; medSay(e, 'lost', true); }
    if (e.medStep === 2 && T > 2.4) endTreat(e);
    return;
  }
  const ch = live ? pt.baseY + pt.figH * 0.5 : pt.baseY + 0.16;
  if (e.cloth) e.cloth.position.set(bx + Math.cos(ry) * 0.2 * sd + Math.sin(time * 3 + sd) * 0.05, ch + Math.abs(Math.sin(time * 4.2 + sd)) * 0.05, bz - Math.sin(ry) * 0.2 * sd);
  if (e.assisting) {   // 手伝い：押さえる・包帯・声かけ。主の手当てが終われば離れる
    if (e.medStep === 0) { e.medStep = 1; }
    if (e.medStep === 1 && T > 1.2) { e.medStep = 2; medSay(e, Math.random() < 0.5 ? 'bandage' : 'comfort', true); }
    if (!pt.medBy || !pt.wounded) { if (T > 0.5) endTreat(e); }
    return;
  }
  if (e.medStep === 0) { e.medStep = 1; medSay(e, pt.stuck.length ? 'arrow' : 'start'); }
  if (e.medStep === 1 && T > 1.6) {
    e.medStep = 2;
    if (pt.stuck.length) { for (const a of pt.stuck) a.parent && a.parent.remove(a); pt.stuck = []; Sfx.whoosh && Sfx.whoosh(new V3(bx, ch, bz), 3); }
  }
  if (e.medStep === 2 && T > 2.4) { e.medStep = 3; medSay(e, e.role === 'surgeon' ? (Math.random() < 0.5 ? 'care' : 'start') : (Math.random() < 0.6 ? 'bandage' : 'comfort')); }
  const dur = (e.role === 'surgeon' ? 4.2 : 4.8) * (pt.assistBy && pt.assistBy.patient === pt ? 0.8 : 1);   // 手伝いがいると少し早い
  if (e.medStep === 3 && T > dur) { e.medStep = 4; medSay(e, 'ok'); healPatient(pt); }
  if (e.medStep === 4 && T > dur + 0.8) endTreat(e);
}
// ---- 殿（プレイヤー）が戦の最中に本陣を出ると、秘書たちと救護班の一部（外科医1・看護師1）が慌てて後を追う ----
//   少し離れて（3.5〜6m 後ろ）ついて歩き、救護班は殿の近くで倒れた娘を手当てする。殿が本陣に戻ると皆も持ち場へ戻る。
//   「本陣に戻って」と言われた秘書は追わない。本陣には外科医1・看護師1が必ず残る。
const FOLLOW = { out: false, outT: 0, inT: 0, says: [] };
const FOLLOW_TEXT = {
  sec: ['お待ちください、殿！', '殿、お一人では危のうございます！'], ojou: ['お待ちになって、王様！', '王様、お一人では危のうございますわ！'], sec2: ['あっ、待ってくださーい！', '危ないですよ、殿！'],
  sec3: ['お待ちください、殿！ お怪我をされては…！'], sec4: ['危ないですよ！ 私もお供します！'],
  surgeon: ['殿、お待ちを！ 救護班もお供します。'], nurse: ['危ないですよ、殿！ 待ってください！'],
};
function followPt(i) {   // 殿の後ろに扇形に並ぶ位置
  const a = player.yaw + Math.PI + ((i % 5) - 2) * 0.42, r = 3.6 + (i % 3) * 1.1;
  return [player.pos.x + Math.sin(a) * r, player.pos.z + Math.cos(a) * r];
}
function followers() {
  const L = [];
  if (sec.e && !sec.stayHQ) L.push({ kind: 'sec', e: sec.e });
  if (sec2.e && !sec2.stayHQ) L.push({ kind: 'sec2', e: sec2.e });
  if (ojou.e && !ojou.stayHQ) L.push({ kind: 'ojou', e: ojou.e });
  for (const A of aides) if (A.e) L.push({ kind: A.id, e: A.e, A });
  for (const i of [1, 3]) { const m = medics.blue[i]; if (m && m.e) L.push({ kind: m.role, e: m.e, m }); }
  return L;
}
function followSay(e, kind) {
  if (!e || e.state === 'down') return;
  const X = VoicePack.man && VoicePack.man._extra, L = X && X[kind + '_flust'];
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
  Talk.as(e, () => {
    let text;
    if (L && L.length) { const j = (Math.random() * L.length) | 0; text = L[j].text; if (!VoicePack.play(L[j].files[0], d, 1)) Voice.say(text, { pitch: 1.25, rate: 1.15 }, 1); }
    else { text = pick(FOLLOW_TEXT[kind] || FOLLOW_TEXT.sec); Voice.say(text, { pitch: 1.25, rate: 1.15 }, 1); }
    subtitle(text);
  });
}
function updateFollow(dt) {
  if (!hq || state !== 'play') return;
  const battle = wave.n > 0 && wave.inter <= 0, inside = inHQ() || Math.hypot(player.pos.x - hq.sx, player.pos.z - hq.sz) < 7;
  if (inside) FOLLOW.wasIn = true;   // 本陣に一度入ってから出たときだけ（開始位置は本陣の外）
  if (!FOLLOW.out) {
    FOLLOW.outT = !inside && battle && FOLLOW.wasIn ? FOLLOW.outT + dt : 0;
    if (FOLLOW.outT > 1.2) {
      FOLLOW.out = true; FOLLOW.inT = 0; FOLLOW.says = [];
      let k = 0;
      for (const f of followers()) {
        f.e.flust = 2.5;   // しばらく小走り
        if (f.kind === 'sec') { if (sec.mode === 'hq') { sec.esc = sec.e; sec.e.returning = false; sec.mode = 'escort'; sec.auto = true; sec.e.state = 'advance'; sec.e.t = 0; } else continue; }
        else if (f.kind === 'sec2') { if (sec2.mode === 'hq') { sec2.mode = 'follow'; } else continue; }
        else if (f.kind === 'ojou') { if (ojou.mode === 'hq') { ojou.mode = 'follow'; ojou.auto = true; } else continue; }
        else if (f.A) { f.A.follow = true; f.A.fi = 1 + k; }
        else if (f.m) { f.e.follow = true; f.e.fi = 2 + k; }
        if (FOLLOW.says.length < 3) FOLLOW.says.push({ t: 0.2 + FOLLOW.says.length * 1.6, e: f.e, kind: f.kind });
        k++;
      }
      if (k) popup('秘書たちと救護班が慌てて後を追ってくる');
    }
  } else {
    FOLLOW.inT = inside ? FOLLOW.inT + dt : 0;
    if (FOLLOW.inT > 0.8) {   // 殿が本陣に戻った：皆も持ち場へ
      FOLLOW.out = false; FOLLOW.outT = 0; FOLLOW.says = [];
      if (sec.auto && sec.mode === 'escort' && sec.esc) { sec.esc.returning = true; sec.mode = 'returning'; }
      sec.auto = false;
      if (sec2.mode === 'follow') sec2.mode = 'returning';
      if (ojou.auto && ojou.mode === 'follow') ojou.mode = 'returning';
      ojou.auto = false;
      for (const A of aides) A.follow = false;
      for (const m of medics.blue) if (m.e) m.e.follow = false;
    }
  }
  for (const s of FOLLOW.says) if (s.t > 0 && (s.t -= dt) <= 0) followSay(s.e, s.kind);
}
// ---- 三人目・四人目の秘書（心優しく気配りのできる秘書課）：本陣で控え、近づくと向き直る。
//      桜井 ゆかり：体力が減っていれば手当て（+15）。宮下 千尋：矢が少なければ矢を持ってくる（+8）。各 45 秒に一度。死ぬと次の波で戻る
const aides = [
  { id: 'sec3', name: '秘書課 桜井 ゆかり', pers: '冷静', cm: 158, vv: 1, dx: -1.3, dz: 2.2, e: null, dead: false, cd: { heal: 0, arrows: 0, greet: 0 } },
  { id: 'sec4', name: '秘書課 宮下 千尋', pers: '慎重', cm: 161, vv: 1, dx: 2.9, dz: 2.2, e: null, dead: false, cd: { heal: 0, arrows: 0, greet: 0 } },
];
const AIDE_TEXT = { greet: ['お帰りなさいませ。ご無事で何よりです。', 'お疲れさまです。少し休んでいってくださいね。'],
  heal: ['お怪我はありませんか？ 少し手当てしますね。', '無理をなさらないでください。…はい、これで大丈夫です。'],
  arrows: ['矢が少なくなっていますね。こちらをどうぞ。', '矢をお持ちしました。お気をつけて。'] };
function spawnAide(A) {
  removeAide(A);
  if (!hq || !GIRLS[A.id]) return;
  A.home = hqSpot(A.id, A.dx, A.dz);
  const e = spawnEnemy(A.home[0], A.home[1], 'mob', false, 'blue', { aide: A, girl: A.id });
  A.e = e; A.dead = false;
}
function removeAide(A) {
  const e = A.e; A.e = null;
  if (e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
function aideSay(A, key) { if (!A.e || A.e.state === 'down') return; Talk.as(A.e, () => aideSay0(A, key)); }
function aideSay0(A, key) {
  const X = VoicePack.man && VoicePack.man._extra, L = X && X[A.id + '_' + key];
  const d = A.e ? Math.hypot(A.e.s.position.x - player.pos.x, A.e.s.position.z - player.pos.z) : 0;
  let text;
  if (L && L.length) { const j = (Math.random() * L.length) | 0; text = L[j].text; if (!VoicePack.play(L[j].files[0], d, 1)) Voice.say(text, { pitch: 1.05, rate: 0.95 }, 1); }
  else { text = pick(AIDE_TEXT[key]); Voice.say(text, { pitch: 1.05, rate: 0.95 }, 1); }
  subtitle(A.name.replace('秘書課 ', '') + '「' + text + '」');
}
function updateAides(dt) {
  updateFollow(dt);
  for (const A of aides) {
    if (A.e && hq) A.e.home = A.follow ? followPt(A.fi) : hqSpot(A.id, A.dx, A.dz);
    for (const k in A.cd) A.cd[k] = Math.max(0, A.cd[k] - dt);
    const e = A.e; if (!e || e.state === 'down' || e.hold) continue;
    const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
    if (d > 3.2 || Math.abs(player.pos.y - e.baseY) > 1.5) continue;
    if (A.id === 'sec3' && player.hp < CFG.maxHp * 0.75 && A.cd.heal <= 0) { A.cd.heal = 45; player.hp = Math.min(CFG.maxHp, player.hp + 15); aideSay(A, 'heal'); popup('体力 +15'); }
    else if (A.id === 'sec4' && player.arrows < arrowsMax() * 0.5 && A.cd.arrows <= 0) { A.cd.arrows = 45; player.arrows = Math.min(arrowsMax(), player.arrows + 8); aideSay(A, 'arrows'); popup('矢 +8'); }
    else if (A.cd.greet <= 0 && aides.every(o => o.cd.greet <= 0 || o === A)) { A.cd.greet = 60; for (const o of aides) o.cd.greet = Math.max(o.cd.greet, 20); aideSay(A, 'greet'); }
  }
}
// 収録音声を順につなげて再生（足りなければ Web Speech で全文）
let subTimer = 0;
function subtitle(text) {   // 秘書の返事（メニューを閉じても字幕で見える）
  const el = $('subtitle'); if (!el) return;
  el.textContent = text ? `「${text}」` : ''; el.style.opacity = text ? 1 : 0;
  Talk.sub = Talk.cur; Talk.subT = performance.now() + 2500 + (text ? text.length : 0) * 120;
  clearTimeout(subTimer); subTimer = setTimeout(() => { el.style.opacity = 0; }, 2500 + text.length * 120);
}
function secSay(parts, text) {
  if (!Talk.cur && menuOpen) { const m = menuGirl(); if (m) return Talk.as(m, () => secSay(parts, text)); }
  subtitle(text);
  if (VoicePack.ok) {
    const L = VoicePack.man && VoicePack.man._extra, fns = [];
    for (const [cat, i] of parts) { const e = L && L[cat] && L[cat][i]; if (!e) { fns.length = 0; break; } fns.push(e.files[0]); }
    if (fns.length && fns.every(f => VoicePack.buf[f])) {
      const c = Sfx.ctx; let t = c.currentTime + 0.02;
      VoicePack.room(3, 0, true); AudioGuard.kick();
      for (const f of fns) { const src = c.createBufferSource(), g = c.createGain(); src.buffer = VoicePack.buf[f]; g.gain.value = 1.1; src.connect(g); g.connect(VoicePack.out); src.start(t); Talk.track(src); VoicePack.add(src, 3, 0, true, VoicePack.buf[f].duration, t); t += VoicePack.buf[f].duration - 0.05; }
      return;
    }
    fns.forEach(f => VoicePack.load(f));
  }
  Voice.say(text, { pitch: 1.05, rate: 0.95 }, 1);
}
const secLine = (cat, i) => { const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra[cat]; return L ? L[i].text : ''; };
const menuGirl = () => menuWho === 'sec2' ? sec2.e : menuWho === 'ojou' ? ojou.e : sec.e;
function secCat(cat) {   // 二人目の秘書と話しているときは sec2_ の台詞（あれば）。お嬢さま秘書は ojou_
  const X = VoicePack.man && VoicePack.man._extra;
  if (menuWho === 'ojou' && cat.startsWith('sec_')) { const c3 = 'ojou_' + cat.slice(4); if (!X || X[c3]) return c3; }
  if (menuWho === 'sec2' && cat.startsWith('sec_')) { const c2 = 'sec2_' + cat.slice(4); if (!X || X[c2]) return c2; }
  return cat;
}
function secReply(cat, i = null) {
  const c = secCat(cat), who = /^ojou_/.test(c) ? ojou.e : /^sec2_/.test(c) || (menuOpen && menuWho === 'sec2') ? sec2.e : sec.e || sec.esc;
  if (who && who.state === 'down') return;   // 戦死判定を受けた娘はもう話さない
  return Talk.as(who, () => secReply0(cat, i));
}
function secReply0(cat, i = null) {
  cat = secCat(cat);
  const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra[cat];
  const n = L ? L.length : 1; if (i === null) i = (Math.random() * n) | 0;
  const text = secLine(cat, i);
  $('secsay').textContent = text ? `「${text}」` : '';
  secSay([[cat, i]], text);
}
const SEC_REQ = {
  tea() {
    if (sec.teaT > 0) { secReply('sec_tea_wait', 0); return; }
    player.hp = Math.min(CFG.maxHp, player.hp + 45); sec.teaT = 20; popup('お茶 体力+45'); Sfx.pickup(); secReply('sec_tea');
  },
  report() {
    const a = Math.min(30, aliveOf('blue').length), e = Math.min(30, aliveOf('orange').length + Math.max(0, wave.toSpawn)), w = clamp(wave.n, 1, 20);
    const oj = menuWho === 'ojou';
    const text = oj ? `王様、ご報告いたしますわ。味方は${a}名、敵は${e}名。ただいま、第${w}波ですわ。` : `ご報告いたします。味方は${a}名、敵は${e}名。ただいま、第${w}波です。`;
    $('secsay').textContent = `「${text}」`;
    const s2 = menuWho === 'sec2' ? 'sec2_' : oj ? 'ojou_' : '';
    secSay([[s2 ? s2 + 'report' : 'sec_report', 0], [s2 + 'num_ally', a], [s2 + 'num_enemy', e], [s2 + 'num_wave', w - 1]], text);
    showSquadReport();   // 分隊ごとの残りの人数を画面に
  },
  plan() {
    allyStance = allyStance === 'off' ? 'def' : 'off';
    secReply(allyStance === 'def' ? 'sec_plan_def' : 'sec_plan_off', 0);
    popup(allyStance === 'def' ? '青組：守勢' : '青組：攻勢');
    $('stance').textContent = allyStance === 'def' ? '守勢' : '攻勢';
  },
  meal() { askMeal(); },
  shoulder() { sec.buffT = 60; popup('60秒間 矢の回復が速くなる'); secReply('sec_shoulder'); },
  fan() { sec.fanT = 4; Sfx.noiseBurst(1.2, 'bandpass', 500, 300, 0.12, 0.6); secReply('sec_fan'); },
  follow() { startEscort(); },
  back() { sendBack(); },
  arrows() {
    if (player.arrows >= arrowsMax()) { secReply('sec_arrows_full', 0); return; }
    player.arrows = arrowsMax(); popup('矢を補充した'); Sfx.pickup(); secReply('sec_arrows', 0);
  },
};
// ---- ご飯（「お腹減った、ご飯今すぐ作って」）：1つの波につき1回。約5秒で作り、卓に出す。食べると数秒かけて体力回復 ----
const MEALS = { onigiri: 'おむすび', miso: 'お味噌汁', chazuke: 'お茶漬け' };
const MEAL_TIME = 5, MEAL_HP = 60, EAT_TIME = 4;
const mealMat = { plate: new THREE.MeshLambertMaterial({ color: 0xf1ede2 }), rice: new THREE.MeshLambertMaterial({ color: 0xfbfaf4 }),
  nori: new THREE.MeshLambertMaterial({ color: 0x1d2418 }), bowl: new THREE.MeshLambertMaterial({ color: 0x1a1512 }),
  miso: new THREE.MeshLambertMaterial({ color: 0xb08a55 }), tea: new THREE.MeshLambertMaterial({ color: 0xc9b77a }),
  green: new THREE.MeshLambertMaterial({ color: 0x5d8a3a }), tofu: new THREE.MeshLambertMaterial({ color: 0xf6f3e8 }) };
function makeDish(kind) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.015, 18), mealMat.plate); g.add(plate);
  if (kind === 'onigiri') {
    for (const [x, ry] of [[-0.045, 0.2], [0.045, -0.15]]) {   // 三角のおむすび2つ＋海苔
      const o = new THREE.Group();
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 3), mealMat.rice);
      r.rotation.x = Math.PI / 2; r.rotation.y = Math.PI / 2; o.add(r);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.032), mealMat.nori); n.position.y = -0.016; o.add(n);
      o.position.set(x, 0.03, 0); o.rotation.y = ry; g.add(o);
    }
  } else {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.055, 16, 1, true), mealMat.bowl); bowl.position.y = 0.035; g.add(bowl);
    const bot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), mealMat.bowl); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.009; g.add(bot);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.056, 16), kind === 'miso' ? mealMat.miso : mealMat.tea); top.rotation.x = -Math.PI / 2; top.position.y = 0.052; g.add(top);
    const bits = kind === 'miso' ? [[mealMat.tofu, 0.012, 5], [mealMat.green, 0.006, 6]] : [[mealMat.rice, 0.01, 7], [mealMat.green, 0.006, 5], [mealMat.nori, 0.008, 4]];
    for (const [m, sz, n] of bits) for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.5, sz), m); const a = rand(0, 6.28), rr = rand(0, 0.04);
      b.position.set(Math.cos(a) * rr, 0.054, Math.sin(a) * rr); g.add(b);
    }
  }
  return g;
}
function removeDish() { if (sec.dish) { scene.remove(sec.dish); sec.dish = null; } sec.eatT = 0; }
// おむすびを食べている間だけ言える感想（1皿に1回）
const canOnigiriRemark = () => !!(sec.dish && sec.dish.userData.kind === 'onigiri' && !sec.dish.userData.remarked);
function onigiriRemark() {
  if (!canOnigiriRemark()) return;
  sec.dish.userData.remarked = true;
  if (!menuOpen) $('secsay').textContent = '';
  secReply('sec_c_onigiri');
  const t = $('secsay').textContent; if (t && !menuOpen) popup(t.replace(/^「|」$/g, '').slice(0, 30));
}
function askMeal() {
  if (sec.cook) { secReply('sec_meal_busy', 0); return; }
  if (sec.dish) { secReply('sec_meal_ready', 0); return; }
  if (sec.mode !== 'hq') { secReply('sec_meal_away', 0); return; }
  if (sec.mealWave === wave.n) { secReply('sec_meal_wait', 0); return; }
  secReply('sec_meal_ask');
  showSub('secmeals');
}
function orderMeal(kind) {
  if (!MEALS[kind] || sec.cook || sec.dish || sec.mode !== 'hq' || sec.mealWave === wave.n) return;
  sec.cook = { kind, t: 0 }; sec.mealWave = wave.n;
  showSub(null);
  secReply('sec_meal_ok', 0);
}
function updateMeal(dt) {
  const el = $('cook');
  if (sec.cook) {
    sec.cook.t += dt;
    const f = Math.min(1, sec.cook.t / MEAL_TIME);
    el.style.display = 'block';
    el.firstChild.textContent = `${MEALS[sec.cook.kind]}を作っています…`;
    $('cookbar').style.width = (f * 100).toFixed(0) + '%';
    if (f >= 1) {
      const k = sec.cook.kind; sec.cook = null;
      if (hq) {
        const dp = hqSpot('dish', 1.8, -0.12), d = makeDish(k); d.position.set(dp[0], 0.748, dp[1]); scene.add(d); sec.dish = d; sec.dish.userData.kind = k;
        secReply('sec_meal_done_' + k, 0); popup(`${MEALS[k]}ができた（本陣の卓）`);
      }
    }
  } else if (sec.dish) {
    el.style.display = 'block';
    if (sec.eatT > 0) {
      // 食べている：数秒かけて体力回復
      const step = Math.min(dt, sec.eatT); sec.eatT -= step;
      player.hp = Math.min(CFG.maxHp, player.hp + MEAL_HP / EAT_TIME * step);
      const f = 1 - sec.eatT / EAT_TIME;
      el.firstChild.textContent = `${MEALS[sec.dish.userData.kind]}をいただいています…`;
      $('cookbar').style.width = (f * 100).toFixed(0) + '%';
      sec.dish.scale.setScalar(Math.max(0.35, 1 - f * 0.65));
      if (sec.eatT <= 0) { removeDish(); popup('ごちそうさまでした'); }
    } else {
      el.firstChild.textContent = `${MEALS[sec.dish.userData.kind]}が本陣の卓にあります（本陣に入ると食べる）`;
      $('cookbar').style.width = '100%';
      if (inHQ()) { sec.eatT = EAT_TIME; popup('いただきます'); Sfx.pickup(); }
    }
  } else el.style.display = 'none';
  const can = canOnigiriRemark();
  $('onigiriRem').style.display = can ? 'inline-block' : 'none';
  $('secOnigiri').style.display = can && menuOpen ? 'block' : 'none';
}
// ---- 櫃の状況（「感想を言う」用）：櫃に当たった矢の数と、最近どれだけ狙われたか ----
const towers = { west: { x: -12, z: 8, paint: 0, press: 0 }, east: { x: 12, z: 8, paint: 0, press: 0 } };
function towerAt(p) {
  if (builtStage !== 'fort') return null;
  for (const k in towers) { const t = towers[k]; if (Math.abs(p.x - t.x) < 3.2 && Math.abs(p.z - t.z) < 3.2 && p.y > 4.5) return t; }
  return null;
}
// 木の壁・櫃に当たった練習矢：小さな埃が立つだけ（跡は残さない）
function hitWood(p) { puff(p.clone(), 0xd8cfbf, 3, 0.25, 0.9, 0.35); }
function noteTowerHit(p, team) {
  const t = towerAt(p); if (!t) return;
  t.paint++; if (team === 'orange') t.press += 1;
}
const REMARKS = {
  paint() {
    if (builtStage !== 'fort') return [['sec_c_notower', 0]];
    const tot = towers.west.paint + towers.east.paint;
    const k = tot >= 15 ? 'sec_c_paint_hi' : tot >= 5 ? 'sec_c_paint_mid' : 'sec_c_paint_lo';
    return [[k, 0]];
  },
  east() {
    if (builtStage !== 'fort') return [['sec_c_notower', 0]];
    const e = towers.east.press, w = towers.west.press;
    const k = e + w < 1.5 ? 'sec_c_quiet' : e > w * 1.3 ? 'sec_c_east' : w > e * 1.3 ? 'sec_c_west' : 'sec_c_even';
    return [[k, 0]];
  },
  allies() {
    const a = aliveOf('blue').length, o = aliveOf('orange').length;
    if (!o && wave.inter > 0) return [['sec_c_none', 0]];
    const r = a / Math.max(1, o);
    const k = r >= 1.2 ? 'sec_c_ally_hi' : r >= 0.8 ? 'sec_c_ally_mid' : 'sec_c_ally_lo';
    return [[k, 0], ['num_ally', Math.min(30, a)], ['num_enemy', Math.min(30, o)]];
  },
  archers() {
    const o = aliveOf('orange'), ar = o.filter(x => x.kind === 'archer').length;
    if (!o.length) return [['sec_c_none', 0]];
    const f = ar / o.length;
    const k = f >= 0.65 ? 'sec_c_arch_hi' : f >= 0.4 ? 'sec_c_arch_mid' : 'sec_c_arch_lo';
    return [[k, 0]];
  },
};
function sayRemark(key) {
  const fn = REMARKS[key]; if (!fn) return;
  let parts = fn(), note = '';
  if (key === 'paint' || key === 'east' || key === 'archers') {
    // 補足の数字（画面表示のみ）
    note = (key === 'paint' && builtStage === 'fort') ? `（当たった矢：東の櫃 ${towers.east.paint}本／西の櫃 ${towers.west.paint}本）` :
      (key === 'east' && builtStage === 'fort') ? `（最近狙われた度合い：東 ${Math.round(towers.east.press)}／西 ${Math.round(towers.west.press)}）` :
      key === 'archers' ? `（敵の弓兵 ${aliveOf('orange').filter(x => x.kind === 'archer').length}名／近接兵 ${aliveOf('orange').filter(x => x.kind !== 'archer').length}名）` : '';
  }
  const text = parts.map(([c, i]) => secLine(c, i)).join('');
  $('secsay').textContent = `「${text}」${note}`;
  secSay(parts, text);
}
// 小メニュー（感想・ご飯）を開くと用件の一覧を隠す。「戻る」で一覧へ（一覧の「戻る」は閉じて戦場へ）
function showSub(id) {
  for (const k of ['secremarks', 'secmeals']) $(k).style.display = k === id ? 'grid' : 'none';
  $('secmain').style.display = id || menuWho !== 'sec' ? 'none' : 'grid';
  $('sec2main').style.display = id || menuWho !== 'sec2' ? 'none' : 'grid';
  $('ojoumain').style.display = id || menuWho !== 'ojou' ? 'none' : 'grid';
  $('secClose').style.display = id ? 'none' : 'block';
}
function openSecMenu() {
  if (menuOpen || state !== 'play') return;
  menuOpen = true; player.drawing = false; player.charge = 0;
  menuWho = talkWho || 'sec';
  $('secName').textContent = menuWho === 'sec2' ? sec2.name : menuWho === 'ojou' ? ojou.name : sec.name;
  $('secmenu').style.display = 'flex'; showSub(null);
  if (document.exitPointerLock && locked()) document.exitPointerLock();
  secReply('sec_greet');
}
function closeSecMenu(bye = true) {
  if (!menuOpen) return;
  menuOpen = false; $('secmenu').style.display = 'none';
  if (bye) secReply('sec_bye');
  if (state === 'play') lock();
}
function updateHQ(dt) {
  updateFluter(dt);
  if (sec.teaT > 0) sec.teaT -= dt;
  if (sec.buffT > 0) sec.buffT -= dt;
  if (sec.fanT > 0) sec.fanT -= dt;
  updateMeal(dt);
  for (const k in towers) towers[k].press *= Math.exp(-dt / 40);
  const inside = inHQ();
  if (inside !== inHqPrev) { inHqPrev = inside; if (inside) popup('本陣：ここは安全'); }
  $('hqtag').style.display = inside ? 'block' : 'none';
  $('hqtag').textContent = inside ? '本陣（安全）' + (sec.buffT > 0 ? `　肩もみ ${Math.ceil(sec.buffT)}秒` : '') + (player.speedT > 0 ? `　靴 ${Math.ceil(player.speedT)}秒` : '') : '';
  // 護衛から本陣に戻り着いた
  if (sec.mode === 'returning' && sec.esc && hq && sec.esc.state !== 'down' && Math.hypot(sec.esc.s.position.x - hq.sx, sec.esc.s.position.z - hq.sz) < 1.6) {
    sec.esc.returning = false; sec.esc = null; sec.mode = 'hq'; secReply('sec_back', 0);
  }
  updateSec2(dt); updateOjou(dt);
  // 話しかけられる相手：そばにいる秘書（二人いれば近いほう）
  let best = null, bd = 3;
  for (const [who, se] of [['sec', sec.e], ['sec2', sec2.e], ['ojou', ojou.e]]) {
    if (!se || se.state === 'down' || se.polishT > 0 || Math.abs(player.pos.y - se.baseY) > 0.8) continue;
    const d = Math.hypot(player.pos.x - se.s.position.x, player.pos.z - se.s.position.z);
    if (d < bd) { bd = d; best = who; }
  }
  if (!menuOpen) talkWho = best;
  sec.near = !!best;
  $('talk').style.opacity = sec.near && !menuOpen ? 1 : 0;
  document.documentElement.classList.toggle('cantalk', sec.near && !menuOpen);
  if (menuOpen) {
    const se = menuGirl();
    if (!se || se.state === 'down' || Math.hypot(player.pos.x - se.s.position.x, player.pos.z - se.s.position.z) > 3.4) closeSecMenu(false);
  }
}

// ---- NPC の見た目：向き・アニメーション（歩き/走りは実際の移動速度から選ぶ） ----
let frameNo = 0;
let stepBudget = 3;   // 1フレームに鳴らす娘の足音の上限
function animateNpc(e, dt, lean) {
  const p = e.s.position;
  const vx = p.x - e.px, vz = p.z - e.pz, v = Math.hypot(vx, vz) / Math.max(dt, 1e-4);
  e.px = p.x; e.pz = p.z;
  e.vs = (e.vs || 0) + (v - (e.vs || 0)) * Math.min(1, dt * 8);   // 速度（平滑化）
  const sv = e.vs;
  const covered = e.state === 'hide' && (e.perch || (e.cover && e.cover.type === 'bundle'));
  const kyu = e.kind === 'archer' && e.state === 'aim', ka = e.aimK || 1;
  const acting = e.state === 'windup' || e.state === 'recover' || e.state === 'zanshin' || (e.state === 'aim' && (!kyu || e.t >= KY_SET * ka));   // 胴造りの間はまだ構えない
  const moving = !acting && sv > 0.35;
  // 足音
  if (moving) {
    const ph = Math.floor((MOTION ? (e.stepT = Mo.step(e, dt, sv)) : (e.stepT += dt * sv * 1.5)) / Math.PI);   // モーション：実際の歩調（左右の接地）で一歩
    if (ph !== e.stepPh) {
      e.stepPh = ph;
      if (stepBudget > 0) { const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < 16) { stepBudget--; Sfx.step(e.baseY > 0.3, sv > 3.1 ? 0.9 : 0.6, p); } }
    }
  }
  const kneelFr = e.kneel && e.girl.kneel;
  e.crouch += ((e.seated ? SEAT_SINK / (0.42 * e.figH) : (covered && sv < 0.5) || (e.kneel && !kneelFr) ? 1 : 0) - e.crouch) * Math.min(1, dt * 5);   // 席：腰が座面の高さまで沈む
  // 向き：移動中は進む方向、構え・射撃・待機は標的の方向（なめらかに回る）
  let face = e.face;
  if (e.passive) face = e.faceWant;
  else if (e.tgt && (!moving || e.state === 'backoff')) { const tp = tgtPos(e.tgt); face = Math.atan2(tp.x - p.x, tp.z - p.z); }
  else if (sv > 0.35) face = Math.atan2(vx, vz);
  e.face = face;
  e.s.rotation.y += angDiff(e.s.rotation.y, face) * Math.min(1, dt * 6);
  // ---- 見え方の選択：カメラと娘の向きの角度で 正面／横／後ろ（境目は少し粘る） ----
  const camYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  const f = e.s.rotation.y, c = Math.cos(angDiff(f, camYaw)), m = 0.08;
  e.view = c > 0.5 + (e.view === 'front' ? -m : m) ? 'front' : c < -0.5 - (e.view === 'back' ? -m : m) ? 'back' : 'side';
  // 斜めの写真（front_diag / back_diag）があれば8方向：正面±22.5°、斜め、横、斜め後ろ、後ろ
  const gd = e.girl, hy = k => (e.view2 === k ? -0.04 : 0.04);
  e.view2 = e.view;
  if (gd.front_diag && c > 0.38 + hy('front_diag') && c < 0.92 - hy('front_diag') + (e.view2 === 'front' ? 0 : 0)) e.view2 = 'front_diag';
  else if (gd.front_diag && c >= 0.92 - hy('front_diag') && c > 0.5) e.view2 = 'front';
  if (gd.back_diag && c < -0.38 - hy('back_diag') && c > -0.92 + hy('back_diag')) e.view2 = 'back_diag';
  else if (gd.back_diag && c <= -0.92 + hy('back_diag') && c < -0.5) e.view2 = 'back';
  if (gd.front_diag && e.view2 === 'side' && c > 0.38) e.view2 = 'front_diag';
  if (gd.back_diag && e.view2 === 'side' && c < -0.38) e.view2 = 'back_diag';
  // 真上・真下から見るとき（top / low があれば）
  const el = Math.atan2(camera.position.y - (e.baseY + e.figH * 0.6), Math.hypot(camera.position.x - p.x, camera.position.z - p.z));
  if (gd.top && el > 0.9) e.view2 = 'top'; else if (gd.low && el < -0.6) e.view2 = 'low';
  // 画面の右を向いているか（横・構えの写真の左右反転に使う）
  const sgn = Math.sin(f) * Math.cos(player.yaw) - Math.cos(f) * Math.sin(player.yaw) > 0 ? 1 : -1;
  const g = e.girl;
  let fr, mirror = false, bob = 0, rock = 0, cyc = false;
  if (e.kneel) {   // 医療係の手当て：膝をつく写真（無ければしゃがむ）。手元が小さく動く
    fr = g.kneel || g.front; mirror = fr.dir ? fr.dir !== sgn : false;
    if (fr === g.kneel && e.view === 'back') mirror = !mirror;
    rock = Math.sin(time * 4.2) * 0.02;
  } else if (e.fluter) {
    fr = g.flute || g.front; mirror = fr.dir ? fr.dir !== sgn : false;
    bob = Math.abs(Math.sin(time * (wave.inter > 0 ? 2.2 : 3.6))) * 0.012;
    if (e.view !== 'front' && !g.flute) { fr = e.view === 'back' ? girlFrame(g, 'back') : girlFrame(g, 'side'); mirror = fr.dir ? fr.dir !== sgn : false; }
    if (e.fluteMesh) e.fluteMesh.visible = fr === g.front;
  } else if (acting) {
    fr = girlFrame(g, 'action', e.kind); mirror = fr.dir ? fr.dir !== sgn : false;
    if (kyu) { const u = (e.t - KY_SET * ka) / (KY_DRAW * ka); if (u < 1) bob = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.03 * e.figH * (1 - 0.4 * u); }   // 打起し：少し上がって収まる
    else if (e.state !== 'windup' && e.state !== 'recover') bob = Math.sin(time * 1.6 + e.ph) * 0.003 * e.figH;
  } else if (moving && (e.view2 === 'front_diag' || e.view2 === 'back_diag' || e.view2 === 'top' || e.view2 === 'low')) {
    fr = girlFrame(g, e.view2); mirror = fr.dir ? fr.dir !== sgn : false;
    bob = Math.abs(Math.sin(e.stepT)) * 0.025 * e.figH; rock = Math.sin(e.stepT) * 0.03;
  } else if (moving) {
    const stride = Math.floor(e.stepT / Math.PI) & 1;
    bob = Math.abs(Math.sin(e.stepT)) * 0.025 * e.figH;
    if (e.view === 'front') { fr = girlFrame(g, 'walk'); mirror = fr === g.front ? false : !!stride; }
    else if (e.view === 'back') { fr = girlFrame(g, 'back'); rock = Math.sin(e.stepT) * 0.025; }
    else if (g.cycle) { fr = cycleFrame(g.cycle, e.stepT); mirror = fr.dir ? fr.dir !== sgn : false; bob = 0; rock = 0; cyc = true; }   // 横から：歩きの連続写真（上下動は写真に含まれる）
    else { fr = girlFrame(g, 'side'); mirror = fr.dir ? fr.dir !== sgn : false; rock = Math.sin(e.stepT) * 0.03; }
  } else {
    fr = girlFrame(g, e.view2 || e.view);
    mirror = fr.dir ? fr.dir !== sgn : false;
    bob = Math.sin(time * 1.6 + e.ph) * 0.004 * e.figH;   // 待機中のわずかな呼吸
    rock = Math.sin(time * 0.8 + e.ph * 2) * 0.007;        // ゆるやかな揺れ
    if ((e.secretary || e.sec2) && e.view === 'front') {   // 秘書：ときどき首をかしげる／横を見る
      if (!e.glNext) e.glNext = time + rand(4, 9);
      if (time > e.glNext) { e.glEnd = time + rand(0.9, 1.6); e.glNext = e.glEnd + rand(5, 10); e.glKind = Math.random() < 0.55 ? 'look' : 'tilt'; e.glDir = Math.random() < 0.5 ? 1 : -1; }
      if (time < (e.glEnd || 0)) {
        if (e.glKind === 'look' && g.side) { fr = g.side; mirror = fr.dir ? fr.dir !== e.glDir : false; }
        else rock += Math.sin(Math.min(1, (e.glEnd - time) * 2, (time - e.glEnd + 1.6) * 2) * Math.PI / 2) * 0.05 * e.glDir;
      }
    }
  }
  setFrame(e, fr, mirror);
  if (e.armed) updateProps(e, fr, mirror, sgn);
  if (e.band) e.band.visible = !(fr === g.kneel && !e.medic);
  if (e.band) {   // 腕章：正面・後ろの写真では左の二の腕、横・膝つきでは手前の腕のあたり
    const h = e.figH, sg = mirror ? -1 : 1, front = fr === g.front || fr === g.back || fr === g.walk;
    e.band.scale.set(front ? 0.075 : 0.085, 0.05, 1);
    e.band.position.set(front ? (fr === g.back ? 0.115 : -0.115) * h : (fr === g.kneel ? 0.135 : 0.01) * h * sg, (fr === g.kneel ? 0.44 : 0.73) * h, 0.03);
  }
  // モーション：実際の歩き・走りの腰と上体の動き（上下・左右・前後・傾き・ひねり）を板に移す。止まると元の呼吸へ戻る
  let sway = 0, surge = 0, twist = 0;
  if (MOTION) {
    const o = Mo.drive(e, dt, sv, moving && !e.kneel, acting, camYaw - f), w = o.w;
    const kc = cyc ? CYCLE_DAMP : null;   // 歩行サイクルの写真は上下動・前傾をすでに含むので、板の動きは控えめに
    bob += (o.bob * (kc ? kc.bob : 1) - bob) * w; rock += (o.roll * (kc ? kc.roll : 1) - rock) * w;
    sway = o.sway * w * (kc ? kc.sway : 1); surge = o.surge * w * (kc ? kc.surge : 1); twist = o.twist * w * (kc ? kc.twist : 1);
  }
  // ビルボード（Y 軸のみ）：板をカメラへ向ける
  e.tilt.rotation.set(0, camYaw - f + twist, lean * 0.5 + rock);
  e.tilt.position.set(sway, bob - e.crouch * 0.42 * e.figH, surge);          // 物陰ではしゃがむ（体が沈む）
}
// 歩行サイクルを使っているときのモーションの効き（1＝そのまま）。横から見るので左右の揺れ（画面の奥行き）とひねりも小さく
const CYCLE_DAMP = { bob: 0.2, roll: 0.25, sway: 0.5, surge: 0.6, twist: 0.3 };
// ---- NPC の行動 ----
const tmp = new V3();
const MELEE_RANGE = 1.8;   // 懐刀の突き：短く狭い
function updateEnemies(dt) {
  frameNo++;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], p = e.s.position, P = e.P;
    if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) npcGlow(e, 0, 0, 0); }
    if (e.state === 'rise') {   // 手当てを受けて起き上がる
      e.t += dt; p.y = e.baseY;
      const k = Math.min(1, e.t / 0.9), q = 1 - (1 - k) * (1 - k);
      e.tilt.rotation.x = (1 - q) * Math.PI / 2; e.tilt.position.y = 0;
      if (MOTION && e.mo) Mo.death(e, 1 - q);   // 影の人形も倒れた姿勢から起き上がる
      e.shadow.scale.set(0.75 + (1 - q) * 0.4, 1, 0.6 + (1 - q) * 0.9 * e.figH);
      if (k >= 1) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.t = 0; e.cd = 1; e.tilt.rotation.x = 0; e.shadow.scale.set(0.75, 1, 0.6); }
      continue;
    }
    if (e.state === 'down') {
      // 戦死判定：横向きの写真が倒れる方向へ伏せる（一度きり）。伏せたらそのまま静止して残る
      e.t += dt;
      if (e.slump) {   // 機内：席に座ったまま崩れる（横へ傾き、少し前へうなだれる）
        const k = Math.min(1, e.t / 0.7), q = 1 - (1 - k) * (1 - k);
        p.y = e.baseY; e.tilt.rotation.x = q * e.slump.fwd; e.tilt.rotation.z = q * 0.34 * e.slump.side;
        e.tilt.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z) - e.s.rotation.y;
        if (!e.thud && k >= 1) { e.thud = true; Sfx.thudAt(Math.hypot(p.x - player.pos.x, p.z - player.pos.z) + 8); }
        if (e.t >= 0.95) toBodies(e);
        continue;
      }
      const lk = Math.min(1, e.t / 0.5);
      p.y = e.landY !== undefined ? e.baseY + (e.landY - e.baseY) * lk : e.baseY;   // 機内：先に倒れた娘・座面の上へ
      if (e.slideTo) { p.x += (e.slideTo.x - p.x) * Math.min(1, dt * 6); p.z += (e.slideTo.z - p.z) * Math.min(1, dt * 6); }
      if (!e.fallInit && MOTION) {   // モーション：今の写真のまま（切り替えのちらつきなし）倒れる
        e.fallInit = true; e.tilt.updateMatrixWorld(true);
        for (const a of e.stuck) e.tilt.attach(a);
        if (e.fluteMesh) e.fluteMesh.visible = false;
      }
      if (!e.fallInit) {
        e.fallInit = true;
        const fr = girlFrame(e.girl, 'side');
        setFrame(e, fr, Math.random() < 0.5);
        e.tilt.rotation.set(0, e.fallYaw - e.s.rotation.y, 0);
        e.tilt.position.y = 0; e.tilt.updateMatrixWorld(true);
        for (const a of e.stuck) e.tilt.attach(a);
        if (e.fluteMesh) e.fluteMesh.visible = false;
      }
      if (MOTION) {   // 膝が抜けて沈み、腰を支点に倒れる（Quaternius の倒れる動きの腰と上体の角度）
        const T = e.fallT2 || (e.fallT2 = rand(0.82, 1.0)), u = Math.min(1, e.t / T), D = Mo.death(e, u), H = e.figH;
        e.mo.D = D;
        Mo.fallSprite(e, D, u >= 1 ? Math.sin(Math.min(1, (e.t - T) / 0.22) * Math.PI) * 0.015 : 0);   // 地面で小さく弾む（上へ）
        const ry = e.fallYaw - e.s.rotation.y;
        const k = Math.min(1, u * 1.4);
        e.shadow.scale.set(0.75 + k * 0.3, 1, 0.6 + k * 0.6 * H); e.shadow.position.set(Math.sin(ry) * D.hz * H * 0.8, 0.02, Math.cos(ry) * D.hz * H * 0.8);
        if (!e.thud && u >= 0.84) { e.thud = true; Sfx.impactBody(p.clone().setY(e.baseY + 0.2)); Sfx.thudAt(Math.hypot(p.x - player.pos.x, p.z - player.pos.z)); puff(p.clone().setY(e.baseY + 0.2).addScaledVector(new V3(Math.sin(e.fallYaw), 0, Math.cos(e.fallYaw)), e.figH * 0.5), 0xc8b48a, 5, 0.8, 1.5, 0.8); }
        if (e.t >= T + 0.25) toBodies(e);
        continue;
      }
      const T = e.fallT || 0.55, k = Math.min(1, e.t / T);
      let ang = k * k * Math.PI / 2;
      if (e.t > T) ang = Math.PI / 2 - Math.sin(Math.min(1, (e.t - T) / 0.22) * Math.PI) * 0.07;   // 地面で小さく弾む
      e.tilt.rotation.x = ang; e.tilt.position.y = k * 0.03;
      e.shadow.scale.set(0.75 + k * 0.4, 1, 0.6 + k * 0.9 * e.figH);
      if (!e.thud && e.t >= T) { e.thud = true; Sfx.impactBody(p.clone().setY(e.baseY + 0.2)); Sfx.thudAt(Math.hypot(p.x - player.pos.x, p.z - player.pos.z)); puff(p.clone().setY(e.baseY + 0.2).addScaledVector(new V3(Math.sin(e.fallYaw), 0, Math.cos(e.fallYaw)), e.figH * 0.5), 0xc8b48a, 5, 0.8, 1.5, 0.8); }
      if (e.t >= T + 0.3) toBodies(e);
      continue;
    }
    p.addScaledVector(e.knock, dt); e.knock.multiplyScalar(Math.exp(-7 * dt));
    let lean = 0;
    e.passive = (e.secretary && sec.mode === 'hq') || e.fluter || e.medic || e.aide || e.runner || !!e.hold || !!e.seated;   // hold: テスト用に止める／seated: 機内の席に座っている
    e.defending = e.armed && !e.hold && !(e.polishT > 0) && !(e.secretary && sec.mode !== 'hq') ? secThreat(e) : null;   // 護衛中の秘書は通常の戦い方
    if (e.defending) { e.passive = false; e.kneel = false; if (e.state === 'idle') { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.t = 0; } }
    if (e.seated) seatedBrain(e, dt);
    else if (e.sec2 && !e.hold && !e.defending) { e.passive = true; sec2Brain(e, dt); }
    else if (e.ojou && !e.hold && !e.defending) { e.passive = true; ojouBrain(e, dt); }
    else if (e.medic && !e.hold) medicBrain(e, dt);
    else if (e.runner && !e.hold) runnerBrain(e, dt);
    else if (e.passive) {
      const [hx, hz] = e.hold ? [p.x, p.z] : e.home || [p.x, p.z];
      e.cd -= dt; e.t += dt;
      const hd = Math.hypot(hx - p.x, hz - p.z), fol = e.aide && e.aide.follow;
      if (hd > 0.4) { const rt = routeTo(p, hx, hz); steer(e, rt[0], rt[1], e.speed * (fol || hd > 8 ? (hd > 5 ? 1.45 : 0.9) : 0.7), dt); }
      e.tgt = null; if (!e.hold) e.state = 'idle';
      const dpx = player.pos.x - p.x, dpz = player.pos.z - p.z;
      e.faceWant = e.hold ? e.hold.face : (e.secretary || e.aide) && (fol || Math.hypot(dpx, dpz) < 8) && hd < 1 ? Math.atan2(dpx, dpz) : hd >= 1 ? Math.atan2(hx - p.x, hz - p.z) : Math.PI;
    } else if (e.wounded && woundedBrain(e, dt)) {
      /* 負傷：救護を待つ・下がる */
    } else {
    // 標的の更新
    e.tgtT -= dt;
    if (e.defending) { e.tgt = e.defending; e.tgtT = 0.5; }
    else if (e.returning) { e.tgt = null; e.tgtT = 1; }
    else if (!e.tgt || e.tgtT <= 0 || (!e.tgt.isPlayer && e.tgt.state === 'down')) {
      const nt = chooseTarget(e);
      if (nt !== e.tgt && e.kind === 'archer' && !['aim', 'zanshin', 'retreat', 'stagger'].includes(e.state)) { e.cover = null; if (e.state !== 'advance') { e.state = 'advance'; e.t = 0; } }
      e.tgt = nt; e.tgtT = 0.6;
    }
    e.cd -= dt; e.t += dt; e.moving = false;
    const tint = k => npcTint(e, k);

    if (e.noClimbT > 0) e.noClimbT -= dt;
    if (!e.lad && e.onFloor) maybeDescend(e);
    if (e.lad) npcLadder(e, dt);
    else if (squadRegroup(e, dt)) { /* 分隊：隊長のまわりへ寄る */ }
    else if (!e.tgt) {
      // 敵がいない：青組はプレイヤーの近くに集まる
      if (e.perch) { if (e.state !== 'hide') { e.state = 'hide'; e.hideT = 1; npcTint(e, 0); } }
      else if (e.returning && hq) steer(e, hq.sx, hq.sz, e.speed, dt);
      else if (e.secretary) {   // 護衛：プレイヤーの斜め後ろについて歩く
        const fx = player.pos.x + Math.sin(player.yaw) * 2.2 + Math.cos(player.yaw) * 1.4, fz = player.pos.z + Math.cos(player.yaw) * 2.2 - Math.sin(player.yaw) * 1.4;
        if (Math.hypot(fx - p.x, fz - p.z) > 0.8) steer(e, fx, fz, Math.hypot(fx - p.x, fz - p.z) > 6 ? e.speed * 1.4 : e.speed, dt);
      } else {
        const fx = fortGate ? Math.cos(e.ph) * 7 : player.pos.x + Math.cos(e.ph) * 5;
        const fz = fortGate ? 9 + Math.sin(e.ph) * 3 : player.pos.z + 4 + Math.sin(e.ph) * 3;
        if (Math.hypot(fx - p.x, fz - p.z) > 1.5) steer(e, fx, fz, e.speed, dt);
      }
      if (!e.perch && ['windup', 'aim', 'zanshin', 'peek', 'return', 'hide', 'tocover'].includes(e.state)) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; npcTint(e, 0); }
    } else {
      const tp = tgtPos(e.tgt), tx = tp.x, tz = tp.z;
      const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist, nz = dz / dist;
      if (!e.spotted && dist < 32) { e.spotted = true; npcSay(e, 'spot', 0, e.team === 'orange' ? 0.45 : 0.25); }

      if (e.state === 'retreat') {            // 臆病：被弾すると一旦下がる
        steer(e, p.x - nx * 10, p.z - nz * 10, e.speed * 1.2, dt);
        e.retreatT -= dt;
        if (e.retreatT <= 0) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.cover = null; }
      } else if (e.state === 'stagger') {
        lean = Math.sin(e.t * 30) * 0.08;
        if (e.t > 0.4) { e.state = e.kind === 'archer' ? 'hide' : 'approach'; e.hideT = 0.6; e.cd = Math.max(e.cd, 0.4); }
      } else if (e.perch) {
        // ===== 櫃・武者走りの弓兵：胸壁の陰にしゃがみ、立ち上がって射る =====
        if (e.state === 'zanshin') {
          if (e.t >= KY_ZAN) e.zanNext();
        } else if (e.state === 'aim') {
          const T = aimTotal(e, false);
          tint(e.t / T);
          if (e.t >= T) {
            enemyShoot(e, e.tgt);
            if (e.tgt.isPlayer || Math.random() < 0.4) npcSay(e, 'attack', 0, 0.3);
            npcTint(e, 0);
            e.state = 'zanshin'; e.t = 0;
            e.zanNext = () => { e.state = 'hide'; e.t = 0; e.hideT = zanHide(e, rand(P.hideT[0], P.hideT[1]) * 0.6, T); };
          }
        } else {
          if (e.state !== 'hide') { e.state = 'hide'; e.hideT = rand(0.4, 1.2); }
          e.hideT -= dt;
          if (e.hideT <= 0 && dist < 80 && ammoOK(e)) { e.state = 'aim'; e.t = 0; }   // 矢が切れたら伝令を待つ
        }
      } else if (e.secretary && e.state !== 'aim' && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) > 12) {
        steer(e, player.pos.x, player.pos.z, e.speed * 1.3, dt); e.state = 'advance'; e.cover = null;   // 離れすぎたら戻る
      } else if (e.kind === 'archer') {
        // ===== 弓兵 =====
        // 近接兵に詰められたら下がって距離を取る（守り役の近接兵の後ろへ）。好戦的な娘は 4m まで粘る
        if ((e.thrT = (e.thrT || 0) - dt) <= 0) { e.thrT = 0.3; e.threat = nearestFoeMelee(e, 12); }
        const th = e.threat && e.threat.state !== 'down' && enemies.includes(e.threat) ? e.threat : null;
        const thd = th ? Math.hypot(th.s.position.x - p.x, th.s.position.z - p.z) : 99;
        if (!e.climb && !['backoff', 'aim', 'zanshin'].includes(e.state) && (thd < (P === PERS.好戦的 ? SCREEN.kiteAggR : SCREEN.kiteR) * (PLANE.on ? 0.45 : 1) || (dist < (PLANE.on ? 2.5 : 6) && P !== PERS.好戦的))) { e.state = 'backoff'; e.t = 0; e.kite = th; e.cover = null; }
        if (e.state === 'advance' && e.team === 'orange' && seirans.length && !e.climb && (e.clT = (e.clT || 0) - dt) <= 0) { e.clT = 2; if (!tryArcherClimb(e)) seiranBoard(e); }
        if (e.climb) seiranClimb(e, dt);
        else if (e.state === 'advance') {
          if (!e.cover || e.t > 8) {
            e.t = 0;
            const kf = (e.team === 'blue' && allyStance === 'def' ? 1.4 : 1) * (PLANE.on ? 0.28 : 1);   // 守勢：距離を取る／機内：通路に沿った短い間合い
            e.cover = findCover(e, P.keep[0] * kf, P.keep[1] * kf, tx, tz) || { x: tx - nx * rand(P.keep[0], P.keep[1]) * kf, z: tz - nz * rand(P.keep[0], P.keep[1]) * kf, r: 0, open: true };
            if (e.secretary && e.cover.open) e.cover = { x: player.pos.x + rand(-2, 2), z: player.pos.z + rand(1, 3), r: 0, open: true };
          }
          e.cp = e.cover.open ? { x: e.cover.x, z: e.cover.z, px: -nz, pz: nx } : coverPoint(e.cover, tx, tz);
          if (steer(e, e.cp.x, e.cp.z, e.speed, dt) < 0.6) {
            e.state = 'hide'; e.t = 0; e.hideT = rand(P.hideT[0], P.hideT[1]) * (e.cover.open ? 0.4 : 1);
          }
        } else if (e.state === 'hide') {
          e.hideT -= dt;
          if (e.hideT <= 0 && !ammoOK(e)) e.hideT = 1;   // 矢切れ：遮蔽物の陰で伝令を待つ
          if (e.hideT <= 0) {
            if (e.cover && !e.cover.open && e.cover.type !== 'bundle') {   // 竹林：横から覗く
              const side = Math.random() < 0.5 ? -1 : 1, c = e.cover;
              e.peek = { x: c.x + e.cp.px * side * (c.r + 1.3) + (e.cp.x - c.x) * 0.3, z: c.z + e.cp.pz * side * (c.r + 1.3) + (e.cp.z - c.z) * 0.3 };
              e.state = 'peek';
            } else e.state = 'aim';                                        // 竹束：その場で立ち上がる
            e.t = 0;
          }
          e.evalT -= dt;
          if (e.evalT <= 0) {
            e.evalT = 2;
            const dc = e.cover ? Math.hypot(e.cover.x - tx, e.cover.z - tz) : 0;
            if (!e.cover || dc < P.keep[0] * 0.6 || dc > P.keep[1] * 1.5) { e.state = 'advance'; e.cover = null; }
          }
        } else if (e.state === 'peek') {
          if (steer(e, e.peek.x, e.peek.z, e.speed * 1.3, dt) < 0.4 || e.t > 3) { e.state = 'aim'; e.t = 0; }
        } else if (e.state === 'aim') {
          const T = aimTotal(e, dist < 6);
          tint(e.t / T);
          if (e.t >= T) {
            enemyShoot(e, e.tgt);
            if (e.tgt.isPlayer || Math.random() < 0.5) npcSay(e, 'attack', 0, 0.35);
            npcTint(e, 0);
            e.t = 0; e.state = 'zanshin';   // 残心：射たあと少しそのまま
            e.zanNext = () => {
              e.t = 0;
              if (P === PERS.好戦的 && Math.random() < 0.6) { e.state = 'advance'; e.cover = null; }       // さらに前へ
              else if (e.cover && !e.cover.open) { e.state = 'return'; }
              else { e.state = 'hide'; e.hideT = zanHide(e, rand(P.hideT[0], P.hideT[1]) * 0.5, T); }
            };
          }
        } else if (e.state === 'zanshin') {
          if (e.t >= KY_ZAN) e.zanNext();
        } else if (e.state === 'return') {
          if (steer(e, e.cp.x, e.cp.z, e.speed * 1.2, dt) < 0.5 || e.t > 3) { e.state = 'hide'; e.t = 0; e.hideT = rand(P.hideT[0], P.hideT[1]); }
        } else if (e.state === 'backoff') {
          const k = e.kite && e.kite.state !== 'down' ? e.kite.s.position : null;
          let ax = k ? p.x - k.x : -nx, az = k ? p.z - k.z : -nz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
          az += (e.team === 'orange' ? -0.45 : 0.45);   // 自分の陣の側（守り役の後ろ）へ寄せて下がる
          steer(e, p.x + ax * 10 + e.strafe * az * 3, p.z + az * 10 - e.strafe * ax * 3, e.speed * 1.15, dt);
          if (e.t > 1.6) {
            const kd = k ? Math.hypot(k.x - p.x, k.z - p.z) : 99;
            if (kd < 5 && ammoOK(e)) { e.tgt = e.kite; e.tgtT = 1.2; e.state = 'aim'; }   // 振り切れない：至近で射返す
            else if (kd < SCREEN.kiteR && e.t < 3.2) { /* もう少し下がる */ }
            else e.state = dist < 8 && ammoOK(e) ? 'aim' : 'advance';
            if (e.state !== 'backoff') { e.t = 0; e.cover = null; e.kite = null; }
          }
        } else { e.state = 'advance'; e.t = 0; }
      } else {
        // ===== 近接兵（練習用の懐刀：突きのみ・正面の一人だけ） =====
        if (e.state === 'approach') {
          if (P.cautious && !e.hid && dist < 32 && dist > 9) {
            const c = findCover(e, 5, Math.min(dist - 2, 22), tx, tz);
            if (c) { e.cover = c; e.state = 'tocover'; e.t = 0; }
            else e.hid = true;
          }
          const elev = Math.abs(tgtY(e.tgt) - e.baseY) > 1.5;      // 櫃の上などには届かない
          const rt = routeTo(p, tx, tz), routed = rt[0] !== tx || rt[1] !== tz;
          if (e.team === 'blue' && allyStance === 'def' && dist > 16 && e.state === 'approach') {   // 守勢：持ち場で待つ
            const gx = fortGate ? clamp(e.px, -8, 8) : player.pos.x + Math.cos(e.ph) * 6, gz = fortGate ? 6 + (e.ph % 3) : player.pos.z - 4 + Math.sin(e.ph) * 3;
            if (Math.hypot(gx - p.x, gz - p.z) > 1.5) steer(e, gx, gz, e.speed, dt);
            e.state = 'approach';
          } else
          if (e.state === 'approach' && elev && fortGate && tgtY(e.tgt) > e.baseY && tryClimb(e, tgtFloor(e.tgt))) { /* 梯子へ */ }
          else if (e.state === 'approach' && routed) steer(e, rt[0], rt[1], e.speed, dt);
          else if (e.state === 'approach' && elev) { if (dist > 4) steer(e, tx, tz, e.speed, dt); }
          else if (e.state === 'approach' && e.screen && dist > SCREEN.guardR && screenHold(e, tx, tz, dt)) { /* 弓兵の前に立って待つ */ }
          else if (e.state === 'approach') {
            if (dist > MELEE_RANGE - 0.35) {
              const side = Math.sin(time * 0.7 + e.ph) * (P.cautious ? 0.6 : 0.35) * e.strafe * Math.min(1, dist / 6);
              steer(e, p.x + (nx - nz * side) * 3, p.z + (nz + nx * side) * 3, e.speed, dt);
            } else if (e.cd <= 0) {
              e.state = 'windup'; e.t = 0;
              const T = P === PERS.好戦的 ? 0.4 : 0.5;
              if (e.tgt.isPlayer || Math.random() < 0.4) npcSay(e, 'attack', 0, 0.3);
            }
          }
        } else if (e.state === 'tocover') {
          e.cp = coverPoint(e.cover, tx, tz);
          if (steer(e, e.cp.x, e.cp.z, e.speed, dt) < 0.6 || e.t > 10) { e.state = 'hide'; e.t = 0; e.hideT = rand(P.hideT[0], P.hideT[1]); }
        } else if (e.state === 'hide') {
          e.hideT -= dt;
          if (e.hideT <= 0 || dist < 5) { e.state = 'approach'; e.hid = true; }
        } else if (e.state === 'windup') {
          // 構え：少し引いてから…
          const T = P === PERS.好戦的 ? 0.4 : 0.5, k = e.t / T;
          tint(k);
          p.x -= nx * 0.6 * dt; p.z -= nz * 0.6 * dt;
          if (e.t >= T) {
            // 突き：正面に踏み込み、標的一人だけを判定
            e.state = 'recover'; e.t = 0; e.cd = rand(P.atkCd[0], P.atkCd[1]); npcTint(e, 0);
            p.x += nx * 0.45; p.z += nz * 0.45;
            const d2 = Math.hypot(tx - p.x, tz - p.z);
            if (d2 < MELEE_RANGE && Math.abs(tgtY(e.tgt) - e.baseY) < 1.2) {
              if (e.tgt.isPlayer) hurtPlayer(e.dmg);
              else {
                const tp2 = e.tgt.s.position;
                damageEnemy(e.tgt, 1, p, false, { pt: new V3(tp2.x - nx * 0.15, e.tgt.baseY + e.tgt.figH * rand(0.5, 0.68), tp2.z - nz * 0.15), thrust: true }, e);
              }
            }
          }
        } else if (e.state === 'recover') {
          if (e.t > 0.35) e.state = 'approach';
        } else e.state = 'approach';
      }
    }
    }
    // 群れの分離
    if (!e.perch && !e.seated && !(e.lad && e.lad.ph !== 'go')) for (const o of enemies) {
      if (o === e || o.state === 'down' || o.seated || Math.abs(o.baseY - e.baseY) > 1) continue;
      const ox = p.x - o.s.position.x, oz = p.z - o.s.position.z, d2 = ox * ox + oz * oz;
      if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += ox / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); p.z += oz / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); }
    }
    const pdx = player.pos.x - p.x, pdz = player.pos.z - p.z, pd = Math.hypot(pdx, pdz);
    if (!e.perch && !e.seated && pd < 0.9 && pd > 1e-4 && Math.abs(player.pos.y - e.baseY) < 1) { p.x -= pdx / pd * (0.9 - pd); p.z -= pdz / pd * (0.9 - pd); }
    p.x = clamp(p.x, -CFG.field, CFG.field); p.z = clamp(p.z, -CFG.field, CFG.field);
    if (!e.perch && !e.seated && !(e.lad && e.lad.ph !== 'go') && boxes.length) pushOutBoxes(p, 0.3, e.baseY + 0.1, e.baseY + 1.6);
    if (e.onFloor && !e.lad && !e.perch) { const F = e.onFloor; p.x = clamp(p.x, F.x0 + 0.25, F.x1 - 0.25); p.z = clamp(p.z, F.z0 + 0.25, F.z1 - 0.25); }   // 床から落ちない
    p.y = e.baseY;
    if (PLANE.on && !e.seated) { const h = bodies.length ? pileAt(p.x, p.z) * 0.8 : 0; e.overY = (e.overY || 0) + (h - (e.overY || 0)) * Math.min(1, dt * 8); p.y += e.overY; }   // 倒れた娘の上に足を載せる
    animateNpc(e, dt, lean);
    const top = e.baseY + e.figH * (1 - 0.38 * e.crouch);
    e.mk.position.set(p.x, top + (e.hp < e.hpMax ? 0.5 : 0.32), p.z);
    if (e.wmk && e.wounded) e.wmk.position.set(p.x, top + 0.74, p.z);
    if (e.hp < e.hpMax) {
      const f = Math.max(0, e.hp / e.hpMax);
      e.bg.visible = e.fg.visible = true;
      e.bg.position.set(p.x, top + 0.25, p.z);
      e.fg.position.set(p.x, top + 0.25, p.z);
      // 左端を固定して縮める（スプライトの center で左寄せ）
      e.fg.scale.x = Math.max(0.001, 0.76 * f); e.fg.center.set(0.38 / Math.max(0.001, 0.76 * f), 0.5);
    }
  }
}

// ---- プレイヤー被弾（画面の縁が一瞬白く光る。塗料は付かない） ----
function hurtPlayer(dmg) {
  if (state !== 'play' || inHQ()) return;
  player.hp -= dmg; player.hurtT = 0.5; player.shake = 0.25;
  Sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

// ---- 矢（矢先は布で包んだたんぽ）。team: 'player' | 'blue' | 'orange' ----
function makeArrowTemplate(tipColor) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 5), new THREE.MeshLambertMaterial({ color: 0xc8a96a }));
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshLambertMaterial({ color: tipColor, emissive: tipColor, emissiveIntensity: 0.3 }));
  head.position.z = 0.45; g.add(head);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), new THREE.MeshLambertMaterial({ color: 0xf0f0f0, side: THREE.DoubleSide }));
  fl.rotation.x = Math.PI / 2; fl.rotation.y = Math.PI / 2; fl.position.z = -0.34; g.add(fl);
  const fl2 = fl.clone(); fl2.rotation.y = 0; fl2.rotation.z = Math.PI / 2; g.add(fl2);
  return g;
}
const arrowTpl = { player: makeArrowTemplate(0xd9d4c6), orange: makeArrowTemplate(0xd9d4c6) };
arrowTpl.blue = arrowTpl.player;
const Z = new V3(0, 0, 1);
function addArrow(team, pos, vel, extra) {
  const m = arrowTpl[team].clone(); m.position.copy(pos); scene.add(m);
  m.quaternion.setFromUnitVectors(Z, tmp.copy(vel).normalize());
  arrows.push(Object.assign({ m, vel, team, stuck: false, life: 0 }, extra));
  if (arrows.length > 120) { const a = arrows.shift(); scene.remove(a.m); }
}
function fireArrow(charge) {
  if (player.arrows <= 0) { Sfx.empty(); return; }
  player.arrows--;
  const dir = new V3(); camera.getWorldDirection(dir);
  const pos = camera.position.clone().addScaledVector(dir, 0.6); pos.y -= 0.05;
  addArrow('player', pos, dir.multiplyScalar(16 + 46 * charge), { charge });
  Sfx.twang(charge);
}
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
function enemyShoot(e, t) {
  if (e.ammo !== undefined) e.ammo = Math.max(0, e.ammo - 1);
  const from = e.s.position.clone(); from.y = e.baseY + e.figH * 0.85;
  const tp = tgtPos(t);
  const target = new V3(tp.x, t.isPlayer ? player.pos.y + 1.2 : t.baseY + t.figH * (t.baseY > 0.5 ? 0.78 : 0.65), tp.z);
  const v = 30, d = from.distanceTo(target), tf = d / v;
  const dir = target.sub(from).normalize();
  const err = e.P.aimErr * (1 + d / 40);
  dir.x += gauss() * err; dir.y += gauss() * err; dir.z += gauss() * err; dir.normalize();
  const vel = dir.multiplyScalar(v); vel.y += 0.5 * 9.8 * tf;
  from.addScaledVector(dir, 0.5);
  addArrow(e.team, from, vel, { dmg: (e.captain ? 12 : 8) + Math.min(6, wave.n), shooter: e });
  Sfx.twangAt(e.s.position.clone().setY(e.baseY + 1.3));
}
function hitsCover(p) {
  if (p.y > 9) return false;
  for (const c of covers) if (p.y < (c.h || 7.5) && Math.hypot(p.x - c.x, p.z - c.z) < c.r * 0.85) return c;
  return null;
}
function updateArrows(dt) {
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);   // カメラの右方向
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i]; a.life += dt;
    if (a.stuck) { if (a.life > 8) { scene.remove(a.m); arrows.splice(i, 1); } continue; }
    const p0 = a.m.position.clone();
    a.vel.y -= 9.8 * dt;
    a.m.position.addScaledVector(a.vel, dt);
    const p1 = a.m.position;
    a.m.quaternion.setFromUnitVectors(Z, tmp.copy(a.vel).normalize());
    const sx = p1.x - p0.x, sz = p1.z - p0.z, sl = sx * sx + sz * sz || 1e-6;
    // NPC との当たり判定（線分 vs 縦の円柱）
    //  プレイヤーの矢＝両軍に当たる（同士討ちあり）／NPC の矢＝相手チームにだけ当たる
    let hit = null, best = 2;
    for (const e of enemies) {
      if (e.state === 'down') continue;
      if (a.team !== 'player' && e.team === a.team) continue;
      const ep = e.s.position;
      const t = clamp(((ep.x - p0.x) * sx + (ep.z - p0.z) * sz) / sl, 0, 1);
      const cx = p0.x + sx * t, cz = p0.z + sz * t;
      const d = Math.hypot(cx - ep.x, cz - ep.z);
      const y = p0.y + (p1.y - p0.y) * t - e.baseY;
      const top = e.figH * (1 - 0.38 * e.crouch);         // しゃがむと当たりも低くなる
      if (d < 0.3 && y > 0 && y < top && t < best) { best = t; hit = { e, y, top, pt: new V3(cx, y + e.baseY, cz) }; }
    }
    // プレイヤーへの当たり判定（橙組の矢のみ）
    if (a.team === 'orange') {
      const t = clamp(((player.pos.x - p0.x) * sx + (player.pos.z - p0.z) * sz) / sl, 0, 1);
      const d = Math.hypot(p0.x + sx * t - player.pos.x, p0.z + sz * t - player.pos.z);
      const y = p0.y + (p1.y - p0.y) * t - player.pos.y;
      if (d < 0.45 && y > 0 && y < 1.85 && t < best) {
        hurtPlayer(a.dmg); popup('被弾！'); if (!inHQ()) Sfx.arrowFlesh(null, true);
        scene.remove(a.m); arrows.splice(i, 1); continue;
      }
    }
    // 矢がそばをかすめた（敵味方どちらの矢も。自分の矢は除く）：カメラに一番近づいた瞬間に1回だけ
    if (!hit && a.team !== 'player' && !a.wh && a.life > 0.05) {
      const hx = camera.position.x, hy = camera.position.y, hz = camera.position.z, syy = p1.y - p0.y;
      const tr = ((hx - p0.x) * sx + (hy - p0.y) * syy + (hz - p0.z) * sz) / (sl + syy * syy);
      if (tr >= 0 && tr <= 1) {   // この1フレームの間に最接近点を通過
        const cx = p0.x + sx * tr - hx, cy = p0.y + syy * tr - hy, cz = p0.z + sz * tr - hz, d = Math.hypot(cx, cy, cz);
        if (d < 3) { a.wh = true; Sfx.flyby((cx * rx + cz * rz) / Math.max(0.3, d) * 0.9, 1 - d / 3); }
      }
    }
    if (hit) {
      const e = hit.e, info = { pt: hit.pt, dir: a.vel.clone(), arrow: true };
      Sfx.arrowFlesh(hit.pt);   // ズブッ
      if (a.team === 'player') {
        const crit = hit.y > hit.top - e.figH * 0.14;
        let dmg = a.charge >= 0.95 ? 3 : (a.charge > 0.5 ? 2 : 1);
        if (crit) dmg *= 2;
        damageEnemy(e, dmg, p0, crit, info, 'player');
      } else {
        damageEnemy(e, 1, p0, false, info, a.shooter || { team: a.team, state: 'down' });
      }
      scene.remove(a.m); arrows.splice(i, 1); continue;      // 3D の矢は消え、スプライトに刺さった矢が残る
    }
    const boxHit = (a.team === 'player' || a.life > 0.08) && boxes.length && hitsBox(p1);
    if (boxHit) { hitWood(p1); noteTowerHit(p1, a.team === 'orange' ? 'orange' : 'blue'); }
    const cv = boxHit ? null : hitsCover(p1);
    if (cv || boxHit) {   // 竹林・竹束・木の壁が矢を防ぐ
      a.stuck = true; a.life = 0;
      if (boxHit) Sfx.impactWood(p1); else Sfx.impactBamboo(p1);
      continue;
    }
    const fl = floorUnder(p1.x, p1.z, p1.y);
    if (p1.y <= fl + 0.02) {
      p1.y = fl + 0.05; a.stuck = true; a.life = 0;
      if (fl > 0.1) Sfx.impactWood(p1);
      else { puff(p1.clone(), 0xc8b48a, 3, 0.4, 0.9, 0.5); Sfx.impactGround(p1); }   // 土埃
    }
    if (a.life > 6) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}

// ---- 懐刀（練習用・刃引き）：突きのみ。正面・短距離・単体 ----
function swing() {
  if (player.swingCd > 0) return;
  player.swingT = 0; player.swingCd = 0.45; player.swingHit = false;
  Sfx.stab();
}
function swingResolve() {
  const fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  let best = null, bd = 1e9;
  for (const e of enemies) {                      // 同士討ちあり：両軍が対象（秘書は除く）
    if (e.state === 'down') continue;
    const dx = e.s.position.x - player.pos.x, dz = e.s.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.9 || Math.abs(e.baseY - player.pos.y) > 1.2) continue;
    const along = dx * fwd.x + dz * fwd.z, lateral = Math.abs(dx * fwd.z - dz * fwd.x);
    if (along <= 0.2 || lateral > 0.45) continue;     // 正面の細い範囲だけ
    if (along < bd) { bd = along; best = e; }
  }
  if (best) {
    const bp = best.s.position, yy = best.baseY + clamp(camera.position.y - 0.25 - best.baseY, best.figH * 0.45, best.figH * 0.75);
    damageEnemy(best, 2, player.pos, false, { pt: new V3(bp.x - fwd.x * 0.15, yy, bp.z - fwd.z * 0.15), thrust: true }, 'player');
    Sfx.clash(); player.shake = Math.max(player.shake, 0.08);
  }
}

// ---- 拾い物 ----
const pickGeo = {
  arrowBundle: (() => {
    const g = new THREE.Group();
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.55, 8), new THREE.MeshLambertMaterial({ color: 0x3b2b20 }));
    g.add(quiver);
    for (let i = 0; i < 5; i++) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      a.position.set(Math.cos(i) * 0.04, 0.4, Math.sin(i) * 0.04); a.rotation.z = (i - 2) * 0.06; g.add(a);
    }
    g.rotation.z = 0.3; return g;
  })(),
  food: (() => {
    const g = new THREE.Group();
    const rice = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    rice.rotation.x = Math.PI / 2; rice.rotation.y = Math.PI / 2; g.add(rice);
    const nori = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.13), new THREE.MeshLambertMaterial({ color: 0x1d2a1d }));
    nori.position.y = -0.06; g.add(nori);
    return g;
  })(),
};
const ringMat = { arrow: new THREE.MeshBasicMaterial({ color: 0xffe38a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
                  food: new THREE.MeshBasicMaterial({ color: 0x9fffb0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }) };
const ringGeo = new THREE.RingGeometry(0.45, 0.55, 24);
function addPickup(type, pos) {
  const g = new THREE.Group();
  const item = (type === 'arrow' ? pickGeo.arrowBundle : pickGeo.food).clone(); item.position.y = 0.6; g.add(item);
  const ring = new THREE.Mesh(ringGeo, ringMat[type]); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.position.set(pos.x + rand(-.4, .4), 0, pos.z + rand(-.4, .4)); scene.add(g);
  pickups.push({ g, item, type, t: 0 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    p.item.rotation.y += dt * 2; p.item.position.y = 0.6 + Math.sin(p.t * 3) * 0.08;
    p.g.visible = p.t < 22 || Math.sin(p.t * 20) > 0;
    const d = Math.hypot(p.g.position.x - player.pos.x, p.g.position.z - player.pos.z);
    let take = false;
    if (d < 1.6) {
      if (p.type === 'arrow' && player.arrows < arrowsMax()) { player.arrows = Math.min(arrowsMax(), player.arrows + 6); popup('矢 +6'); take = true; }
      if (p.type === 'food' && player.hp < CFG.maxHp) { player.hp = Math.min(CFG.maxHp, player.hp + 25); popup('兵糧 体力+25'); take = true; }
    }
    if (take) Sfx.pickup();
    if (take || p.t > 26) { scene.remove(p.g); pickups.splice(i, 1); }
  }
}

// ====================================================================
//  HUD
// ====================================================================
let bannerTimer = 0, popupTimer = 0, hitTimer = 0;
function showBanner(t, sub) { $('banner').innerHTML = t + (sub ? `<small>${sub}</small>` : ''); $('banner').style.opacity = 1; bannerTimer = 2.6; }
function popup(t) { $('popup').textContent = t; popupTimer = 0.9; }
function hitMarker() { hitTimer = 0.15; }
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
const radar = $('radar').getContext('2d');
function updateHud(dt) {
  setText('hptxt', String(Math.ceil(player.hp)));
  $('hpfill').style.width = (player.hp / CFG.maxHp * 100) + '%';
  $('hpfill').style.background = player.hp < 30 ? 'linear-gradient(#ff8a5a,#c0402a)' : '';
  setText('kills', String(player.kills)); setText('allykills', String(player.allyKills));
  setText('arrowcnt', String(player.arrows)); setText('arrowmax', String(arrowsMax()));
  setText('wavetxt', `第${waveName(Math.max(1, wave.n))}波`);
  setText('remain', wave.inter > 0 ? '次の波まで ' + Math.ceil(wave.inter) + ' 秒' : `残敵 ${wave.toSpawn + enemies.filter(e => e.team === 'orange').length}　味方 ${enemies.filter(e => e.team === 'blue' && e.state !== 'down').length}`);
  $('wp0').className = player.weapon === 0 ? 'on' : ''; $('wp1').className = player.weapon === 1 ? 'on' : '';
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').style.opacity = 0; }
  popupTimer -= dt; $('popup').style.opacity = clamp(popupTimer * 2, 0, 1);
  $('popup').style.transform = `translate(-50%,${-50 - (0.9 - Math.max(0, popupTimer)) * 40}%)`;
  hitTimer -= dt; $('hitmark').style.opacity = hitTimer > 0 ? 1 : 0;
  player.hurtT -= dt; $('hurt').style.opacity = Math.max(0, player.hurtT * 1.6) + (player.hp < 25 ? 0.25 + Math.sin(time * 5) * 0.1 : 0);
  updateTargetInfo(dt);
  // レーダー
  const R = 75, sc = R / 45;
  radar.clearRect(0, 0, 150, 150);
  radar.save(); radar.translate(R, R);
  radar.strokeStyle = 'rgba(232,217,168,.3)'; radar.beginPath(); radar.arc(0, 0, R * 0.5, 0, 7); radar.stroke();
  radar.fillStyle = '#ffe38a'; radar.beginPath(); radar.moveTo(0, -7); radar.lineTo(5, 5); radar.lineTo(-5, 5); radar.fill();
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  for (const e of enemies) {
    const dx = e.s.position.x - player.pos.x, dz = e.s.position.z - player.pos.z;
    let rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;
    let x = rx * sc, y = rz * sc; const l = Math.hypot(x, y);
    if (l > R - 5) { x *= (R - 5) / l; y *= (R - 5) / l; }
    radar.fillStyle = e.team === 'blue' ? '#4aa8ff' : (e.captain ? '#ffd040' : '#ff8a12');
    radar.beginPath();
    if (e.kind === 'archer') { radar.moveTo(x, y - 4); radar.lineTo(x + 3.5, y + 3); radar.lineTo(x - 3.5, y + 3); }
    else radar.arc(x, y, e.captain ? 4 : 3, 0, 7);
    radar.fill();
  }
  for (const p of pickups) {
    const dx = p.g.position.x - player.pos.x, dz = p.g.position.z - player.pos.z;
    const x = (dx * cy - dz * sy) * sc, y = (dx * sy + dz * cy) * sc;
    if (Math.hypot(x, y) < R - 4) { radar.fillStyle = p.type === 'arrow' ? '#fff2a0' : '#9fffb0'; radar.fillRect(x - 2, y - 2, 4, 4); }
  }
  radar.restore();
}

// ---- 照準の先の侍女の名前・性格 ----
const rayDir = new V3();
let targetShown = null, targetHold = 0;
function pickTarget() {
  camera.getWorldDirection(rayDir);
  const o = camera.position;
  let best = null, bt = 80;
  const hl2 = rayDir.x * rayDir.x + rayDir.z * rayDir.z || 1e-6;
  for (const e of enemies) {
    if (e.state === 'down') continue;
    const ex = e.s.position.x - o.x, ez = e.s.position.z - o.z;
    const t = (ex * rayDir.x + ez * rayDir.z) / hl2;
    if (t <= 0 || t > bt) continue;
    const cx = rayDir.x * t - ex, cz = rayDir.z * t - ez, y = o.y + rayDir.y * t - e.baseY;
    if (Math.hypot(cx, cz) < 0.35 && y > 0 && y < e.figH * (1 - 0.38 * e.crouch) + 0.1) { best = e; bt = t; }
  }
  if (best) return best;
  // 倒れている侍女（腰の位置の高さの面との交点で判定）
  if (rayDir.y < -0.02) {
    for (const b of bodies) {
      const hp = _v.set(b.s.position.x + Math.sin(b.fallYaw || 0) * b.figH * 0.45, b.baseY + 0.05, b.s.position.z + Math.cos(b.fallYaw || 0) * b.figH * 0.45);
      const t = (hp.y - o.y) / rayDir.y;
      if (t <= 0 || t > 60) continue;
      if (Math.hypot(o.x + rayDir.x * t - hp.x, o.z + rayDir.z * t - hp.z) < 0.7) return b;
    }
  }
  return null;
}
function updateTargetInfo(dt) {
  const e = sec.near || menuOpen ? null : pickTarget();
  if (e) { targetShown = e; targetHold = 0.6; }
  else targetHold -= dt;
  const el = $('target');
  if (targetShown && targetHold > 0) {
    const t = targetShown, dead = t.state === 'down';
    const disg = t.seated && PLANE.intro && !dead;   // 奇襲の前は誰が橙組か分からない
    const tm = disg ? '<u style="color:#e8e0cc">乗客</u>' : t.team === 'blue' ? '<u style="color:#7cc0ff">青組（味方）</u>' : '<u style="color:#ffa040">橙組</u>';
    const pic = portraitOf(t.spr);
    const html = (pic ? `<img src="${pic}" alt="">` : '') + `${tm}${t.sq && !disg ? `<small class="sq">${t.sq.name}${t.sq.leader === t ? '・隊長' : ''}</small>` : t.runner || t.wasRunner ? '<small class="sq">伝令</small>' : t.medic ? '<small class="sq">医務班</small>' : ''}<b>${t.prof.name}</b><span>${t.P.desc}・${t.medic ? (t.role === 'surgeon' ? '外科医' : '看護師') : t.fluter ? '笛役' : t.runner || t.wasRunner ? '伝令' : t.secretary || t.wasSecretary || t.sec2 || t.wasSec2 || t.aide || t.wasAide || t.ojou || t.wasOjou ? '秘書課' : t.kind === 'archer' ? '弓兵' : '近接兵'}　${t.prof.cm}cm</span>` +
      (dead ? '<em>戦死判定</em>' : `<i style="width:${Math.max(0, t.hp / t.hpMax * 100)}%;background:${t.team === 'blue' ? '#5ab0ff' : '#ffb040'}"></i>`);
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.opacity = Math.min(1, targetHold * 3);
  } else el.style.opacity = 0;
}

// ---- 演出用のキャンバス（扇の風など） ----
const paintCv = $('paint'), paintG = paintCv.getContext('2d');
function drawScreenPaint(dt) {   // 画面に塗料は描かない（扇の風の表現用にキャンバスを消すだけ）
  paintG.clearRect(0, 0, innerWidth, innerHeight);
}

// ====================================================================
//  一人称の武器グラフィック (2D キャンバス)
// ====================================================================
const wc = $('wcanvas'), wg = wc.getContext('2d');
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  wc.width = innerWidth * dpr; wc.height = innerHeight * dpr; wc.style.width = innerWidth + 'px'; wc.style.height = innerHeight + 'px';
  wg.setTransform(dpr, 0, 0, dpr, 0, 0); 
  paintCv.width = innerWidth * dpr; paintCv.height = innerHeight * dpr; paintCv.style.width = innerWidth + 'px'; paintCv.style.height = innerHeight + 'px';
  paintG.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', () => { resize(); if (typeof checkOrientation === 'function') checkOrientation(); });
function drawWeapon() {
  const W = innerWidth, H = innerHeight;
  wg.clearRect(0, 0, W, H);
  if (state !== 'play' && state !== 'pause') return;
  const sw = player.switchT > 0 ? Math.sin(player.switchT / 0.3 * Math.PI) : 0;
  const bobX = Math.cos(player.bob) * H * 0.012, bobY = Math.abs(Math.sin(player.bob)) * H * 0.015 + sw * H * 0.35;
  // 弓の引き具合の照準リング
  if (player.weapon === 0 && player.drawing) {
    wg.strokeStyle = player.charge >= 0.95 ? '#ffe38a' : 'rgba(255,255,255,.7)'; wg.lineWidth = 3;
    wg.beginPath(); wg.arc(W / 2, H / 2, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.charge); wg.stroke();
  }
  if (player.weapon === 0) drawBow(W, H, bobX, bobY); else drawDagger(W, H, bobX, bobY);
}
function drawBow(W, H, bx, by) {
  const c = player.drawing ? player.charge : 0;
  const lower = player.drawing ? 0 : H * 0.08;
  const gx = W / 2 - H * 0.2 + bx - c * H * 0.02, gy = H * 0.66 + by + lower;
  const L = H * 0.95, bend = H * (0.07 + c * 0.05);
  wg.save(); wg.translate(gx, gy); wg.rotate(-0.12 - c * 0.05);
  const top = { x: bend * 0.6, y: -L * 0.62 }, bot = { x: bend * 0.6, y: L * 0.38 };
  // 弦
  const nock = { x: bend * 0.6 + H * 0.05 + c * H * 0.26, y: -L * 0.12 + c * H * 0.02 };
  wg.strokeStyle = '#eee7d0'; wg.lineWidth = 1.6;
  wg.beginPath(); wg.moveTo(top.x, top.y); wg.lineTo(nock.x, nock.y); wg.lineTo(bot.x, bot.y); wg.stroke();
  // 弓本体（漆塗り）
  wg.lineCap = 'round';
  wg.strokeStyle = '#1b1210'; wg.lineWidth = H * 0.024;
  wg.beginPath(); wg.moveTo(top.x, top.y); wg.quadraticCurveTo(-bend, -L * 0.12, bot.x, bot.y); wg.stroke();
  wg.strokeStyle = '#5a2a1a'; wg.lineWidth = H * 0.012;
  wg.beginPath(); wg.moveTo(top.x, top.y); wg.quadraticCurveTo(-bend, -L * 0.12, bot.x, bot.y); wg.stroke();
  // 籐巻き
  for (let i = 0; i < 6; i++) { const t = 0.15 + i * 0.13; const x = (1 - t) * (1 - t) * top.x + 2 * (1 - t) * t * -bend + t * t * bot.x, y = (1 - t) * (1 - t) * top.y + 2 * (1 - t) * t * (-L * .12) + t * t * bot.y;
    wg.fillStyle = '#c9b48a'; wg.fillRect(x - H * 0.014, y, H * 0.028, H * 0.006); }
  // 握り手（弓手）
  const hx = -bend * 0.5, hy = -L * 0.08;
  wg.fillStyle = '#6b4a2e'; wg.beginPath(); wg.ellipse(hx, hy, H * 0.035, H * 0.05, 0, 0, 7); wg.fill();
  // 矢
  if (player.arrows > 0) {
    // 矢先は画面中央（照準）へ向ける：照準位置をローカル座標へ逆変換
    const rot = -0.12 - c * 0.05, cx0 = W / 2 - gx, cy0 = H / 2 - gy;
    const lx = cx0 * Math.cos(-rot) - cy0 * Math.sin(-rot), ly = cx0 * Math.sin(-rot) + cy0 * Math.cos(-rot);
    const ax = lx - nock.x, ay = ly - nock.y, al = Math.hypot(ax, ay) || 1, len = Math.min(al * 0.8, H * 0.55);
    const ux = ax / al, uy = ay / al, tx = nock.x + ux * len, ty = nock.y + uy * len;
    wg.strokeStyle = '#c8a96a'; wg.lineWidth = H * 0.006;
    wg.beginPath(); wg.moveTo(nock.x, nock.y); wg.lineTo(tx, ty); wg.stroke();
    const px_ = -uy, py_ = ux, hl = H * 0.04, hw = H * 0.012;
    wg.fillStyle = PAINT[0]; wg.beginPath(); wg.moveTo(tx + ux * hl, ty + uy * hl); wg.lineTo(tx + px_ * hw, ty + py_ * hw); wg.lineTo(tx - px_ * hw, ty - py_ * hw); wg.fill();
    wg.fillStyle = '#f2f2f2'; wg.beginPath(); wg.moveTo(nock.x - H * 0.01, nock.y); wg.lineTo(nock.x - H * 0.07, nock.y - H * 0.018); wg.lineTo(nock.x - H * 0.075, nock.y); wg.fill();
    wg.beginPath(); wg.moveTo(nock.x - H * 0.01, nock.y); wg.lineTo(nock.x - H * 0.07, nock.y + H * 0.018); wg.lineTo(nock.x - H * 0.075, nock.y); wg.fill();
  }
  // 馬手（弽）
  wg.fillStyle = '#4a3320'; wg.beginPath(); wg.ellipse(nock.x + H * 0.02, nock.y + H * 0.02, H * 0.04, H * 0.032, 0.4, 0, 7); wg.fill();
  wg.fillStyle = '#7a5a3a'; wg.fillRect(nock.x + H * 0.03, nock.y + H * 0.03, H * 0.09, H * 0.05);
  wg.restore();
}
// 懐刀：突きのみ。引いてから画面中央へまっすぐ突き出す
function drawDagger(W, H, bx, by) {
  let ox = W / 2 + H * 0.3 + bx, oy = H * 0.97 + by, ang = -0.62, sc = 1;
  if (player.swingT >= 0) {
    const s = player.swingT / 0.3;
    let k;                                   // 負＝引き、1＝突き切り
    if (s < 0.2) k = -s / 0.2 * 0.3;
    else if (s < 0.45) k = -0.3 + (s - 0.2) / 0.25 * 1.3;
    else k = Math.max(0, 1 - (s - 0.45) / 0.55);
    ox -= k * H * 0.24; oy -= k * H * 0.24; ang += k * 0.3; sc = 1 - k * 0.25;
    if (s > 0.3 && s < 0.65) {               // 突きの集中線（中央へ）
      const a = 1 - (s - 0.3) / 0.35;
      wg.strokeStyle = `rgba(255,255,255,${0.55 * a})`; wg.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const t = -Math.PI / 2 + (i - 2.5) * 0.35, r0 = H * 0.09, r1 = H * 0.17;
        wg.beginPath(); wg.moveTo(W / 2 + Math.cos(t) * r0, H / 2 - Math.sin(t) * r0 * -1);
        wg.lineTo(W / 2 + Math.cos(t) * r1, H / 2 - Math.sin(t) * r1 * -1); wg.stroke();
      }
    }
  }
  wg.save(); wg.translate(ox, oy); wg.rotate(ang); wg.scale(sc, sc);
  // 柄
  wg.fillStyle = '#16121a'; wg.fillRect(-H * 0.02, -H * 0.02, H * 0.04, H * 0.2);
  wg.strokeStyle = '#d8cfb8'; wg.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const y = i * H * 0.03; wg.beginPath(); wg.moveTo(-H * 0.02, y); wg.lineTo(H * 0.02, y + H * 0.015); wg.moveTo(H * 0.02, y); wg.lineTo(-H * 0.02, y + H * 0.015); wg.stroke(); }
  // 鍔
  wg.fillStyle = '#8a7340'; wg.beginPath(); wg.ellipse(0, -H * 0.025, H * 0.045, H * 0.012, 0, 0, 7); wg.fill();
  // 刃（練習用・木製風）
  const gr = wg.createLinearGradient(-H * 0.02, 0, H * 0.02, 0);
  gr.addColorStop(0, '#9aa3ab'); gr.addColorStop(0.5, '#f4f7fa'); gr.addColorStop(1, '#7c858d');
  wg.fillStyle = gr;
  wg.beginPath(); wg.moveTo(-H * 0.018, -H * 0.035); wg.lineTo(H * 0.018, -H * 0.035); wg.lineTo(H * 0.012, -H * 0.27); wg.quadraticCurveTo(H * 0.005, -H * 0.31, -H * 0.012, -H * 0.33); wg.lineTo(-H * 0.018, -H * 0.27); wg.fill();
  wg.strokeStyle = 'rgba(255,255,255,.8)'; wg.lineWidth = 1; wg.beginPath(); wg.moveTo(H * 0.006, -H * 0.04); wg.lineTo(H * 0.002, -H * 0.3); wg.stroke();
  // 刃先（刃引き・布で包んだ練習用）
  wg.fillStyle = PAINT[0]; wg.beginPath(); wg.ellipse(-H * 0.003, -H * 0.305, H * 0.016, H * 0.03, 0, 0, 7); wg.fill();
  // 手
  wg.fillStyle = '#6b4a2e'; wg.beginPath(); wg.ellipse(0, H * 0.07, H * 0.05, H * 0.06, 0, 0, 7); wg.fill();
  wg.restore();
}

// ====================================================================
//  タッチ操作（スマホ）：左＝仮想スティック、右半分ドラッグ＝視点、ボタン類
// ====================================================================
const touch = { joyId: null, jx: 0, jy: 0, jox: 0, joy: 0, lookId: null, lx: 0, ly: 0, fireId: null, fx: 0, fy: 0, run: false };
const JOY_R = 60;
function lookBy(dx, dy) {
  const sens = 0.0055 * (camera.fov / 75);
  player.yaw -= dx * sens; player.pitch = clamp(player.pitch - dy * sens, -1.45, 1.45);
}
function placeJoy(x, y, kx, ky, active) {
  const j = $('joy'), k = $('knob');
  j.style.left = x + 'px'; j.style.top = y + 'px';
  k.style.transform = `translate(${kx}px,${ky}px)`;
  j.classList.toggle('on', !!active);
}
function joyHome() { placeJoy(Math.max(110, 90 + safeL()), innerHeight - 110, 0, 0, false); }
function safeL() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sal')) || 0; }
function resetTouch() {
  touch.joyId = touch.lookId = touch.fireId = null; touch.jx = touch.jy = 0;
  if (MOBILE) joyHome();
}
function setupTouch() {
  if (!MOBILE) return;
  document.documentElement.classList.add('touch');
  const layer = $('touchlayer');
  const opt = { passive: false };
  layer.addEventListener('touchstart', ev => {
    ev.preventDefault();
    if (state !== 'play') return;
    Sfx.init();
    for (const t of ev.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && touch.joyId === null) {
        touch.joyId = t.identifier; touch.jox = t.clientX; touch.joy = t.clientY; touch.jx = touch.jy = 0;
        placeJoy(t.clientX, t.clientY, 0, 0, true);
      } else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
    }
  }, opt);
  layer.addEventListener('touchmove', ev => {
    ev.preventDefault();
    for (const t of ev.changedTouches) {
      if (t.identifier === touch.joyId) {
        let dx = t.clientX - touch.jox, dy = t.clientY - touch.joy; const l = Math.hypot(dx, dy);
        if (l > JOY_R) { dx *= JOY_R / l; dy *= JOY_R / l; }
        touch.jx = dx / JOY_R; touch.jy = dy / JOY_R;
        placeJoy(touch.jox, touch.joy, dx, dy, true);
      } else if (t.identifier === touch.lookId) {
        if (state === 'play') lookBy(t.clientX - touch.lx, t.clientY - touch.ly);
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
  }, opt);
  const end = ev => {
    ev.preventDefault();
    for (const t of ev.changedTouches) {
      if (t.identifier === touch.joyId) { touch.joyId = null; touch.jx = touch.jy = 0; joyHome(); }
      if (t.identifier === touch.lookId) touch.lookId = null;
    }
  };
  layer.addEventListener('touchend', end, opt); layer.addEventListener('touchcancel', end, opt);
  // 攻撃：押している間は弓を引く（離して射る）／懐刀はタップで突く。押したままドラッグで視点も動かせる
  const atk = $('bAtk');
  atk.addEventListener('touchstart', ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (state !== 'play' || touch.fireId !== null) return;
    Sfx.init();
    const t = ev.changedTouches[0]; touch.fireId = t.identifier; touch.fx = t.clientX; touch.fy = t.clientY;
    atk.classList.add('on'); primaryDown();
  }, opt);
  atk.addEventListener('touchmove', ev => {
    ev.preventDefault(); ev.stopPropagation();
    for (const t of ev.changedTouches) if (t.identifier === touch.fireId) {
      if (state === 'play') lookBy((t.clientX - touch.fx) * 0.7, (t.clientY - touch.fy) * 0.7);
      touch.fx = t.clientX; touch.fy = t.clientY;
    }
  }, opt);
  const atkEnd = ev => {
    ev.preventDefault(); ev.stopPropagation();
    for (const t of ev.changedTouches) if (t.identifier === touch.fireId) {
      touch.fireId = null; atk.classList.remove('on');
      if (state === 'play') primaryUp();
    }
  };
  atk.addEventListener('touchend', atkEnd, opt); atk.addEventListener('touchcancel', atkEnd, opt);
  const tapBtn = (id, fn) => {
    const b = $(id);
    b.addEventListener('touchstart', ev => { ev.preventDefault(); ev.stopPropagation(); if (state === 'play') fn(b); }, opt);
    b.addEventListener('touchend', ev => { ev.preventDefault(); ev.stopPropagation(); }, opt);
  };
  tapBtn('bWpn', () => setWeapon(player.weapon ^ 1));
  tapBtn('bRun', b => { touch.run = !touch.run; b.classList.toggle('on', touch.run); });
  tapBtn('bJump', () => { if (player.onGround) { player.vy = 5.2; player.onGround = false; player.pos.y += 0.01; } });
  tapBtn('bPause', () => pauseGame());
  tapBtn('bTalk', () => { if (menuOpen) closeSecMenu(); else if (sec.near) openSecMenu(); });
  tapBtn('bLad', () => ladderGo());
  // iOS のピンチ・ダブルタップ拡大やスクロールを止める
  document.addEventListener('gesturestart', e => e.preventDefault(), opt);
  document.addEventListener('touchmove', e => { if (e.target.closest && !e.target.closest('.screen')) e.preventDefault(); }, opt);
  let lastTap = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTap < 320 && !(e.target.closest && e.target.closest('button'))) e.preventDefault(); lastTap = n; }, opt);
  joyHome();
}
// 縦向きなら一時停止（「横向きにしてください」を表示）
function checkOrientation() {
  if (MOBILE && innerHeight > innerWidth && state === 'play') pauseGame();
}
// iOS: 音声合成と WebAudio はユーザー操作中に一度鳴らしておく必要がある
function unlockAudio() {
  Sfx.init(); VoicePack.init(); VoicePack.preload();
  try {
    if (Sfx.ctx) { const b = Sfx.ctx.createBuffer(1, 1, 22050), s = Sfx.ctx.createBufferSource(); s.buffer = b; s.connect(Sfx.ctx.destination); s.start(0); }
  } catch (e) {}
  if (Voice.ok) {
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'ja-JP'; speechSynthesis.speak(u); } catch (e) {}
  }
}
function goFullscreen() {
  if (!MOBILE) return;
  try {
    const de = document.documentElement, rf = de.requestFullscreen || de.webkitRequestFullscreen;
    if (rf && !document.fullscreenElement && !document.webkitFullscreenElement) {
      const r = rf.call(de, { navigationUI: 'hide' });
      const lockO = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) {} };
      if (r && r.then) r.then(lockO).catch(() => {}); else lockO();
    }
  } catch (e) {}
}

// ====================================================================
//  入力
// ====================================================================
const locked = () => document.pointerLockElement === canvas;
function lock() { if (TEST || MOBILE) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
document.addEventListener('pointerlockchange', () => {
  if (menuOpen) return;
  if (!locked() && state === 'play') pauseGame();
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'Digit1') setWeapon(0);
  if (e.code === 'Digit2') setWeapon(1);
  if (e.code === 'KeyT') onigiriRemark();
  if (e.code === 'KeyE') { if (menuOpen) closeSecMenu(); else if (sec.near) openSecMenu(); else ladderGo(); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('mousemove', e => {
  if (MOBILE) return;
  if (state !== 'play' || !locked()) return;
  const sens = 0.0022 * (camera.fov / 75);
  player.yaw -= e.movementX * sens; player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
});
document.addEventListener('mousedown', e => {
  if (MOBILE) return;
  if (state !== 'play') return;
  if (menuOpen) return;
  if (!locked() && !TEST) { lock(); return; }
  if (e.button === 0) primaryDown();
  if (e.button === 2 && player.drawing) { player.drawing = false; player.charge = 0; }
});
document.addEventListener('mouseup', e => { if (MOBILE) return; if (state === 'play' && e.button === 0) primaryUp(); });
document.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (!MOBILE && state === 'play') setWeapon(player.weapon ^ 1); }, { passive: true });
function primaryDown() {
  if (player.switchT > 0.15) return;
  if (player.weapon === 0) {
    if (player.arrows <= 0) { Sfx.empty(); popup('矢がない！'); return; }
    player.drawing = true; player.charge = 0; Sfx.drawCreak();
  } else swing();
}
function primaryUp() {
  if (player.weapon === 0 && player.drawing) {
    player.drawing = false;
    if (player.charge > 0.08) fireArrow(player.charge);
    player.charge = 0;
  }
}
function setWeapon(w) {
  if (w === player.weapon) return;
  player.weapon = w; player.drawing = false; player.charge = 0; player.switchT = 0.3; player.swingT = -1;
}

// ====================================================================
//  ゲーム進行
// ====================================================================
function resetGame() {
  if (menuOpen) closeSecMenu(false);
  for (const k in towers) towers[k].paint = towers[k].press = 0;
  removeFluter(); fluter.dead = false;
  removeOjou(); ojou.dead = false; ojou.mode = 'hq'; ojou.stayHQ = false; ojou.auto = false; ojou.careT = 20;
  removeSec2(); sec2.dead = false; sec2.mode = 'hq'; player.speedT = 0; menuWho = 'sec'; talkWho = null;
  for (const t of ['blue', 'orange']) for (const m of medics[t]) { removeMedic(m); m.dead = false; }
  for (const R of runners) { removeRunner(R); R.dead = false; R.job = null; }
  resetSquads();
  for (const A of aides) { removeAide(A); A.dead = false; A.follow = false; A.cd = { heal: 0, arrows: 0, greet: 0 }; }
  FOLLOW.out = false; FOLLOW.wasIn = false; FOLLOW.outT = FOLLOW.inT = 0; FOLLOW.says = []; sec.stayHQ = sec2.stayHQ = false; sec.auto = false;
  sec.mode = 'hq'; sec.esc = null; sec.e = null; sec.cook = null; sec.mealWave = -1; removeDish(); if ($('cook')) $('cook').style.display = 'none';
  allyStance = 'off'; sec.teaT = sec.buffT = sec.fanT = 0; if ($('stance')) $('stance').textContent = '攻勢';
  for (const e of enemies) disposeNpc(e);
  for (const b of bodies) disposeNpc(b);
  for (const l of labels) scene.remove(l.s);
  labels.length = 0; usedNames = new Set(); targetShown = null;
  if (Voice.ok) speechSynthesis.cancel();
  for (const a of arrows) scene.remove(a.m);
  for (const p of pickups) scene.remove(p.g);
  for (const p of particles) scene.remove(p.s);
  enemies = []; bodies = []; arrows = []; pickups = []; particles.length = 0;
  Object.assign(player, { hp: CFG.maxHp, kills: 0, allyKills: 0, arrows: CFG.arrowsStart, weapon: 0, drawing: false, charge: 0, swingT: -1, swingCd: 0,
    regenT: 0, hurtT: 0, switchT: 0, vy: 0, yaw: 0, pitch: 0, shake: 0 });
  for (const q of perches) q.taken = null;
  seiranReset();
  if (builtStage === 'fort') player.pos.set(-12, 6, 8.6);   // 左の櫃の上から
  else if (builtStage === 'plane') player.pos.set(-0.95, 0, 17.8);   // ラウンジの殿の席
  else player.pos.set(0, 0, 0);
  PLANE.intro = false; PLANE.introT = 0; PLANE.alarm = 0; player.seated = false; setStripColor(false); hemiL.intensity = PLANE.on ? 1.25 : LOOK0.hemi[2];
  wave = { n: 0, toSpawn: 0, spawnT: 0, inter: 0, maxAlive: 8 };
}
function startGame() {
  Sfx.init(); if (Voice.ok) { Voice.pick(); speechSynthesis.cancel(); }
  loadStage(stageName);
  resetGame();
  spawnSecretary(); spawnSec2(); spawnOjou(); for (const t of ['blue', 'orange']) for (const m of medics[t]) spawnMedic(t, m);
  for (const A of aides) spawnAide(A);
  for (const R of runners) spawnRunner(R);
  unlockAudio(); goFullscreen(); resetTouch();
  $('title').style.display = 'none'; $('over').style.display = 'none'; $('pause').style.display = 'none';
  $('hud').style.display = 'block';
  state = 'play'; lock();
  startWave(1);
}
function pauseGame() {
  if (state !== 'play') return;
  if (menuOpen) closeSecMenu(false);
  state = 'pause'; player.drawing = false; $('pause').style.display = 'flex';
  const ro = $('roster'); if (ro) { ro.innerHTML = SQUAD_ON ? squadTable('blue', true) + squadTable('orange', true) : ''; ro.style.display = SQUAD_ON ? 'flex' : 'none'; }
}
function resumeGame() {
  if (MOBILE && innerHeight > innerWidth) return;   // 縦向きのままでは再開しない
  state = 'play'; $('pause').style.display = 'none'; unlockAudio(); goFullscreen(); resetTouch(); lock();
}
function toTitle() {
  state = 'title'; resetGame(); removeSecretary(); removeFluter();
  $('pause').style.display = 'none'; $('over').style.display = 'none'; $('hud').style.display = 'none'; $('title').style.display = 'flex';
}
function gameOver() {
  state = 'over'; player.drawing = false;
  if (document.exitPointerLock) document.exitPointerLock();
  $('result').innerHTML = `撃破数（戦死判定） <b>${player.kills}</b>　／　味方撃破 <b>${player.allyKills}</b>　／　到達 第${waveName(wave.n)}波`;
  $('over').style.display = 'flex';
}
$('startBtn').onclick = startGame;
$('retryBtn').onclick = startGame;
$('titleBtn').onclick = toTitle;
$('resumeBtn').onclick = resumeGame;
$('quitBtn').onclick = toTitle;

// 梯子の案内：近くに梯子があれば「W で上る／E で自動」などを出す（スマホは「梯子」ボタン）
function ladderGo() {
  if (player.autoClimb) { player.autoClimb = null; return; }
  const n = ladderNear(player.pos); if (!n) return;
  player.autoClimb = { L: n.L, up: n.up, t: 0 };
}
let ladHintTxt = '';
function updateLadderHint() {
  const n = state === 'play' && !menuOpen ? ladderNear(player.pos) : null, el = $('ladhint');
  let t = '';
  if (player.autoClimb) t = player.autoClimb.up ? '上っています…' : '下りています…';
  else if (n) { const what = n.L.seiran ? '井闌の梯子' : '梯子'; t = MOBILE ? `${what}：スティックを${n.up ? '前' : '後ろ'}に倒す／「梯子」ボタン` : `${what}：${n.up ? 'W（前進）で上る' : 'S（後退）で下りる'}　E で自動`; }
  if (t !== ladHintTxt) { ladHintTxt = t; if (el) { el.textContent = t; el.classList.toggle('on', !!t); } document.documentElement.classList.toggle('canlad', !!n || !!player.autoClimb);
    const bl = $('bLadL'); if (bl) bl.textContent = player.autoClimb ? '止める' : n && !n.up ? '下りる' : '上る'; }
}
function updatePlayer(dt) {
  updateLadderHint();
  // 移動
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW) { mx += fx; mz += fz; } if (keys.KeyS) { mx -= fx; mz -= fz; }
  if (keys.KeyA) { mx += fz; mz -= fx; } if (keys.KeyD) { mx -= fz; mz += fx; }
  if (touch.jx || touch.jy) { const jf = -touch.jy, jr = touch.jx; mx += fx * jf - fz * jr; mz += fz * jf + fx * jr; }   // 仮想スティック
  const ml = Math.hypot(mx, mz), mag = Math.min(1, ml);
  let sp = ((keys.ShiftLeft || keys.ShiftRight || touch.run) && !player.drawing ? CFG.run : CFG.walk) * (player.speedT > 0 ? 1.2 : 1);   // 靴を磨いてもらうと少し速い
  if (player.drawing) sp *= 0.5;
  if (PLANE.on && bodies.length) { const h = pileAt(player.pos.x, player.pos.z); if (h > 0) sp *= h > 0.5 ? 0.45 : 0.65; }   // 倒れた娘をまたぐ
  // 梯子：前進で上る・後退で下りる（途中は横移動しない）
  let fin = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - touch.jy;
  // 自動で上り下り（E キー／スマホの「梯子」ボタン）：梯子の中心へ寄せ、端まで運ぶ。逆の入力・跳ぶで止める
  const AC = player.autoClimb;
  if (AC) {
    const L = AC.L, cx = (L.x0 + L.x1) / 2, zc = (L.z0 + L.z1) / 2, F = L.F;
    AC.t += dt;
    if ((AC.up ? fin < -0.3 : fin > 0.3) || keys.Space || AC.t > 12 || !ladders.includes(L)) player.autoClimb = null;
    else {
      const onL = player.pos.y > L.y0 + 0.05 && player.pos.y < L.y1 - 0.05;
      const tx = AC.up ? (player.pos.y >= L.y1 - 0.1 ? cx : cx) : cx;
      let tz = player.pos.y < L.y1 - 0.1 || !AC.up ? zc - L.dir * 0.05 : zc + L.dir * 1.2;   // 上に着いたら床へ一歩
      if (!AC.up && player.pos.y > L.y1 - 0.3 && Math.hypot(player.pos.x - cx, player.pos.z - zc) > 0.5) tz = zc;   // 上から：まず降り口へ
      const k = Math.min(1, dt * 8); player.pos.x += (tx - player.pos.x) * k; player.pos.z += (tz - player.pos.z) * k * (onL ? 1 : 0.6);
      if (Math.hypot(player.pos.x - cx, player.pos.z - zc) < 0.6 || onL) fin = AC.up ? 1 : -1;
      if (AC.up && player.pos.y >= L.y1 - 0.02 && F && player.pos.z * L.dir >= (zc + L.dir * 1.0) * L.dir) player.autoClimb = null;
      if (!AC.up && player.pos.y <= L.y0 + 0.02) { player.autoClimb = null; player.pos.z = zc - L.dir * 0.7; }
    }
  }
  const lad = player.autoClimb ? player.autoClimb.L : ladderAt(player.pos.x, player.pos.z, player.pos.y);
  const midLadder = lad && player.pos.y > lad.y0 + 0.08 && player.pos.y < lad.y1 - 0.45;
  player.climbing = !!lad && (Math.abs(fin) > 0.2 || midLadder);
  if (ml > 0 && !(player.climbing && midLadder) && !player.autoClimb) {
    const hk = player.climbing && fin < 0 && player.pos.y > lad.y0 + 0.08 ? 0.2 : 1;
    player.pos.x += mx / ml * sp * mag * dt * hk; player.pos.z += mz / ml * sp * mag * dt * hk; player.seated = false;
    if (player.onGround) {
      player.bob += dt * sp * 1.6;
      const ph = Math.floor(player.bob / Math.PI);
      if (ph !== player.stepPh) { player.stepPh = ph; Sfx.step(player.pos.y > 0.3, sp > 6 ? 1 : 0.75); }
    }
  }
  if (player.climbing) {
    player.vy = 0;
    const y0 = player.pos.y;
    player.pos.y = clamp(player.pos.y + clamp(fin, -1, 1) * 3.2 * dt, 0, lad.y1 + 0.05);
    player.climbAcc = (player.climbAcc || 0) + Math.abs(player.pos.y - y0);
    if (player.climbAcc > 0.45) { player.climbAcc = 0; Sfx.step(true, 0.7); }   // はしごの段
    player.onGround = true;
    if (keys.Space) { player.climbing = false; player.vy = 3; player.onGround = false; player.pos.x += Math.sin(player.yaw) * 0.6; player.pos.z += Math.cos(player.yaw) * 0.6; }
  } else {
    if (keys.Space && player.onGround) { player.vy = PLANE.on ? 2.6 : 5.2; player.onGround = false; player.seated = false; }   // 機内は天井が低い
    player.vy -= 14 * dt; player.pos.y += player.vy * dt;
  }
  player.pos.x = clamp(player.pos.x, -CFG.field, CFG.field); player.pos.z = clamp(player.pos.z, -CFG.field, CFG.field);
  for (const c of colliders) {
    if (player.pos.y > 2) continue;
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.35;
    if (d < r && d > 1e-4) { player.pos.x = c.x + dx / d * r; player.pos.z = c.z + dz / d * r; }
  }
  if (boxes.length) pushOutBoxes(player.pos, 0.35, player.pos.y + 0.15, player.pos.y + 1.75);
  let gh = floorUnder(player.pos.x, player.pos.z, player.pos.y);
  if (PLANE.on) {   // 倒れた娘の上に乗る（なめらかに）・天井に頭をぶつけない
    const ph = bodies.length ? pileAt(player.pos.x, player.pos.z) * 0.8 : 0;
    if (ph > gh && player.pos.y < ph) { player.pos.y += (ph - player.pos.y) * Math.min(1, dt * 10); player.vy = Math.max(0, player.vy); player.onGround = true; }
    gh = Math.max(gh, Math.min(ph, player.pos.y));
    if (player.pos.y > 0.62) { player.pos.y = 0.62; player.vy = Math.min(0, player.vy); }
  }
  if (player.pos.y <= gh && !player.climbing) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  else if (!player.climbing && player.pos.y > gh + 0.05 && player.vy <= 0) player.onGround = false;
  // 武器
  if (player.switchT > 0) player.switchT -= dt;
  if (player.drawing) player.charge = Math.min(1, player.charge + dt / 0.85);
  if (player.swingCd > 0) player.swingCd -= dt;
  if (player.swingT >= 0) {
    player.swingT += dt;
    if (!player.swingHit && player.swingT > 0.1) { player.swingHit = true; swingResolve(); }
    if (player.swingT > 0.3) player.swingT = -1;
  }
  // 矢の自然回復
  if (player.arrows < arrowsMax()) { player.regenT += dt; if (player.regenT >= CFG.arrowRegen * (sec.buffT > 0 ? 0.5 : 1)) { player.regenT = 0; player.arrows++; } }
  // カメラ
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * 0.25;
  camera.position.set(player.pos.x, player.pos.y + CFG.eyeH - (player.seated ? 0.48 : 0) + (player.onGround ? Math.abs(Math.sin(player.bob)) * 0.05 : 0), player.pos.z);
  camera.rotation.set(player.pitch + rand(-sh, sh) * 0.3, player.yaw + rand(-sh, sh) * 0.3, 0);
  const fov = 75 - (player.drawing ? player.charge * 18 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
}

// ---- テストモード（?test=1）：ポインタロック無しで自動プレイ ----
let testT = 0;
function testBot(dt) {
  testT += dt;
  if (PASSIVE) return;
  const alive = enemies.filter(e => e.state !== 'down' && e.team === 'orange');
  if (!alive.length) return;
  let t = alive[0], bd = 1e9;
  for (const e of alive) { const d = e.s.position.distanceTo(player.pos); if (d < bd) { bd = d; t = e; } }
  const dx = t.s.position.x - player.pos.x, dz = t.s.position.z - player.pos.z, d = Math.hypot(dx, dz);
  player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(1.0 - CFG.eyeH + d * d * 0.004, d);
  if (d < 1.8) { if (player.weapon !== 1) setWeapon(1); else swing(); }
  else {
    if (player.weapon !== 0) setWeapon(0);
    if (!player.drawing && player.switchT <= 0) primaryDown();
    else if (player.charge >= 1) primaryUp();
  }
}

// ====================================================================
//  ループ
// ====================================================================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000) * (window.__slowmo || 1); last = now;   // __slowmo：テスト撮影用のスロー
  if (state === 'play') {
    time += dt;
    if (TEST) testBot(dt);
    stepBudget = 3;
    updatePlayer(dt); updateHQ(dt); updateAides(dt); waveUpdate(dt); if (seirans.length) updateSeiran(dt); updateEnemies(dt); updateBodies(dt); updateArrows(dt); updatePickups(dt); updateHud(dt); updateSquads(dt);
    if (window.__cam) { const C = window.__cam; camera.position.set(C.p[0], C.p[1], C.p[2]); camera.lookAt(C.t[0], C.t[1], C.t[2]); }   // テスト撮影用の視点
    updateTags();
  } else if (state === 'title') {
    time += dt;
    if (builtStage === 'plane') {   // 機内：ラウンジから客室の奥を眺める
      camera.position.set(Math.sin(time * 0.1) * 0.5, 1.5, 14.8 - Math.sin(time * 0.07) * 1.5);
      camera.rotation.set(-0.03, Math.sin(time * 0.08) * 0.35, 0);
    } else if (builtStage === 'fort') {
      camera.position.set(Math.sin(time * 0.06) * 14, 9, 30 + Math.cos(time * 0.06) * 4);
      camera.rotation.set(-0.2, Math.sin(time * 0.06) * 0.25, 0);
    } else {
      camera.position.set(Math.sin(time * 0.05) * 6, 2.2, 6 + Math.cos(time * 0.05) * 6);
      camera.rotation.set(-0.02, time * 0.05 + Math.PI * 0.02, 0);
    }
  }
  updateParticles(state === 'pause' || state === 'over' ? 0 : dt);
  drawScreenPaint(state === 'play' ? dt : 0);
  { const playing = state === 'play', combat = playing && !(wave.inter > 0) && !PLANE.intro;
    Sfx.ambience(dt, playing, combat); Sfx.flute(!playing ? false : fluter.e && fluter.e.state !== 'down' ? fluter.e.s.position.clone().setY(1.5) : null, combat); AudioGuard.tick(dt); }
  if (sec.fanT > 0 && state === 'play') {   // 扇の風（画面の端に流れる線）
    paintG.strokeStyle = `rgba(255,255,255,${Math.min(0.35, sec.fanT * 0.15)})`; paintG.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = innerHeight * (0.2 + i * 0.1) + Math.sin(time * 3 + i) * 10, x = ((time * 400 + i * 180) % (innerWidth + 300)) - 150;
      paintG.beginPath(); paintG.moveTo(x, y); paintG.quadraticCurveTo(x + 60, y - 12, x + 140, y); paintG.stroke(); }
  }
  for (const f of flags) f.mesh.rotation.y = Math.sin(time * 1.7 + f.ph) * 0.35;
  if (document.body.classList.contains('playing') !== (state === 'play')) document.body.classList.toggle('playing', state === 'play');
  if (MOBILE) { const wl = player.weapon === 0 ? '弓矢' : '懐刀'; if ($('bWpnL').textContent !== wl) { $('bWpnL').textContent = wl; $('bAtkL').textContent = player.weapon === 0 ? '長押しで引く' : 'タップで突く'; } }
  sky.position.copy(camera.position);
  if (PLANE.on) updatePlaneFx(state === 'play' ? dt : state === 'title' ? dt : 0);
  if (MOTION) { updateSunShadow((now - (frame.prev || now)) / 1000); frame.prev = now; Mo.flush(); }
  renderer.render(scene, camera);
  drawWeapon();
}
resize();
setupTouch();
// ステージ選択（タイトル画面）
const STAGE_Q = (location.search.match(/[?&]stage=(\w+)/) || [])[1];
if (STAGE_Q && STAGES[STAGE_Q]) stageName = STAGE_Q;
if (!STAGES[stageName]) stageName = 'plains';
function selectStage(name) {
  stageName = name; try { localStorage.setItem('onna_stage', name); } catch (e) {}
  for (const b of document.querySelectorAll('#stagesel button')) b.classList.toggle('on', b.dataset.st === name);
  $('stagedesc').textContent = STAGES[name].desc;
  loadStage(name);
}
for (const b of document.querySelectorAll('#stagesel button')) b.addEventListener('click', () => selectStage(b.dataset.st));
selectStage(stageName);
// 用件を選んだらメニューを閉じて、その様子を画面で見せる（返事は字幕）。小メニュー（ご飯・感想）を開くだけのときは開いたまま
function secAct(fn) {
  if (!menuOpen || state !== 'play') return;
  fn();
  const sub = ['secremarks', 'secmeals'].some(k => $(k).style.display === 'grid');
  if (menuOpen && !sub) closeSecMenu(false);
}
for (const b of document.querySelectorAll('#secmenu [data-req3]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => OJOU_REQ[b.dataset.req3]()); });
for (const b of document.querySelectorAll('#secmenu [data-req2]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => SEC2_REQ[b.dataset.req2]()); });
for (const b of document.querySelectorAll('#secmenu [data-req]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => SEC_REQ[b.dataset.req]()); });
$('secRemark').addEventListener('click', ev => { ev.stopPropagation(); showSub('secremarks'); });
for (const b of document.querySelectorAll('#secmenu [data-sub-back]')) b.addEventListener('click', ev => { ev.stopPropagation(); showSub(null); });
for (const id of ['onigiriRem', 'secOnigiri']) $(id).addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); if (state === 'play') { onigiriRemark(); if (menuOpen) closeSecMenu(false); } });
for (const b of document.querySelectorAll('#secmeals [data-meal]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => { orderMeal(b.dataset.meal); showSub(null); }); });
for (const b of document.querySelectorAll('#secremarks [data-rem]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => { sayRemark(b.dataset.rem); showSub(null); }); });
$('secClose').addEventListener('click', ev => { ev.stopPropagation(); closeSecMenu(); });
$('startBtn').disabled = true;
let loadLeft = 1;
const loaded = () => {
  if (--loadLeft) return;
  $('loading').textContent = Object.keys(GIRLS).length ? '' : '侍女の写真の読み込みに失敗しました';
  $('startBtn').disabled = false;
  if (TEST) startGame();
};
loadSprites(() => { buildGirls(); loadFrames(loaded); });
requestAnimationFrame(frame);

window.__game = { get drawCalls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; }, PLANE, PL, pileAt, planeAmbush, plCellAt, planeRoute, hq: () => hq, squads, runners, SQ, updateSquads, AMMO_MAX, tagLabel, showSquadReport, pauseGame, resumeGame, AudioGuard, ladders, floors, ladPts, tryClimb, startClimb, tgtFloor, ladderTo, get gtime() { return time; }, ojou, OJOU_REQ, enemyShoot, seiranSync, spawnEnemy, FOLLOW, Talk, seirans, seiranWave, aides, updateAides, MOTION, Mo, sec2, SEC2_REQ, get menuWho() { return menuWho; }, medics, medPost, revivePatient, get state() { return state; }, towers, sayRemark, sec, SEC_REQ, openSecMenu, closeSecMenu, inHQ, get menuOpen() { return menuOpen; }, get allyStance() { return allyStance; }, GIRLS, get framesLoaded() { return framesLoaded; }, get stage() { return builtStage; }, perches, VoicePack, player, get enemies() { return enemies; }, get bodies() { return bodies; }, get wave() { return wave; }, get texLoaded() { return texLoaded; }, MOBILE, touch, get arrows() { return arrows; }, covers, SPR, startGame, damageEnemy, startWave, startEscort, askMeal, orderMeal, onigiriRemark, fluter, Sfx };
})();
