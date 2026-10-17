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
  // v8：機関銃の一発「ダ」：乾いた破裂（帯域雑音）＋低い胴鳴り。遠いほどこもる（at() の低域通過）
  mg(p) { const o = this.at(p, 170, 1.25); if (!o) return; this.noiseBurst(0.06, 'bandpass', 1700, 900, 0.75, 1.1, 0, o); this.tone('square', 120, 55, 0.07, 0.32, 0, o); this.noiseBurst(0.12, 'lowpass', 500, 260, 0.25, 0.8, 0.01, o); },
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
      F.duck = c.createGain(); F.duck.gain.value = 1; F.out.connect(F.duck); F.duck.connect(F.lp);   // 声が鳴っている間は笛を下げる（ダッキング）
      if (c.createStereoPanner) { F.pan = c.createStereoPanner(); F.lp.connect(F.pan); F.pan.connect(this.master); } else F.lp.connect(this.master);
    }
    const now = c.currentTime;
    if (pos === false) { F.out.gain.setTargetAtTime(0, now, 0.3); F.next = 0; F.idx = 0; return; }   // タイトル・一時停止など
    // 戦の最中は笛が途切れない：笛役の娘がいれば彼女の位置から（近いほど大きく）、倒れていれば遠くの味方の笛として小さく続く
    // （距離で小さくなりすぎないよう下限 0.08。声の再生・会話の中断とは別の経路なので、声が止まっても笛は止まらない）
    const dx = pos ? pos.x - player.pos.x : 0, dz = pos ? pos.z - player.pos.z : 60, d = pos ? Math.hypot(dx, dz) : 90, k = clamp(1 - d / 90, 0, 1);
    F.out.gain.setTargetAtTime(((pos ? 0.08 : 0.13) + k * k * 0.36) * (combat ? 1 : 0.75) * FLUTE_LVL, now, 0.2);   // 笛役が倒れたあとも聞き取れる大きさ（v7：全体で約 -6dB）
    const vo = VoicePack.active.length > 0 || Talk.srcs.length > 0 || (Voice.ok && speechSynthesis.speaking);
    if (vo !== F.ducked) { F.ducked = vo; F.duck.gain.setTargetAtTime(vo ? FLUTE_DUCK : 1, now, vo ? 0.06 : 0.4); }   // 声：すばやく下げ、ゆっくり戻す
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
    if (!text) return;
    if (VoicePack.ok && VoicePack.byText) {   // 収録済みのニューラル音声があればそちらを使う（機械的な合成音声にしない）
      const f = VoicePack.byText(text);
      if (f) { const e = Talk.cur, d = e && e.s ? Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z) : 0;
        const vv = prof && prof.vv != null ? prof.vv : 1, fn = f[Math.min(f.length - 1, f.length > 1 ? vv : 0)];
        if (VoicePack.play(fn, d, Math.max(1, prio), f.length > 1 ? 1 : (VV_RATE[vv] || 1))) return; }
    }
    if (!this.ok) return;
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
const FLUTE_LVL = 0.5, FLUTE_DUCK = 0.5;   // 笛の音量（v7：-6dB）と、声の間のさらに -6dB
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
    if (fn in this.buf) return;
    if (this.loading[fn]) {   // 先読みの列に並んでいる：急ぎなら列の先頭へ
      if (urgent) { const i = this.q.indexOf(fn); if (i > 0) { this.q.splice(i, 1); this.q.unshift(fn); } }
      return;
    }
    this.loading[fn] = true;
    if (urgent) this.q.unshift(fn); else this.q.push(fn);
    this.pump();
  },
  pump() {
    while (this.inflight < 8 && this.q.length) {
      const fn = this.q.shift(); this.inflight++; if (this.pq) this.pq--;
      const get = () => fetch('assets/voices/' + fn).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => Sfx.ctx.decodeAudioData(ab, res, rej)));
      get().catch(() => new Promise(r => setTimeout(r, 1500)).then(get))
        .then(b => { this.buf[fn] = b; this.flush(fn); }, () => { this.buf[fn] = null; this.stats.failed++; this.flush(fn); })
        .finally(() => { this.inflight--; this.pump(); });
    }
  },
  // 読み込み待ちの台詞：1.5 秒以内に届けば鳴らす。届かなければ読み上げ（fb）に切り替える
  wait: [],
  defer(fn, dist, prio, rate, fb) {
    this.wait.push({ fn, dist, prio, rate, fb, owner: Talk.cur, t: performance.now() }); this.stats.deferred = (this.stats.deferred || 0) + 1;
    if (!this.waitT) this.waitT = setInterval(() => this.flush(null), 250);
  },
  flush(fn) {
    const now = performance.now();
    for (let i = this.wait.length - 1; i >= 0; i--) {
      const w = this.wait[i], b = this.buf[w.fn], late = now - w.t > 1500;
      if (b === undefined && !late) continue;
      this.wait.splice(i, 1);
      if (b && !late) { if (w.owner && w.owner.silenced && w.owner.state === 'down' && w.prio < 2) continue; Talk.as(w.owner, () => this.play(w.fn, w.dist, w.prio, w.rate)); this.stats.late = (this.stats.late || 0) + 1; }
      else if (w.fb && w.fb.text) { Talk.as(w.owner, () => Voice.say(w.fb.text, w.fb.prof, w.prio)); this.stats.tts = (this.stats.tts || 0) + 1; }
    }
    if (!this.wait.length && this.waitT) { clearInterval(this.waitT); this.waitT = 0; }
  },
  // 戦場にいる娘の性格の戦闘の台詞を先に読み込む
  pri: new Set(),
  prioritize(pers) {
    if (!this.ok || !this.man || !this.man[pers] || this.pri.has(pers) || !this.q.length) return;
    this.pri.add(pers);
    const want = new Set();
    for (const c of ['hit', 'defeat', 'attack', 'spot', 'kill', 'allydown', 'cover', 'push', 'fall', 'order_m', 'order_a', 'lead']) for (const l of this.man[pers][c] || []) want.add(l.files[Math.min(1, l.files.length - 1)]);   // まず言い方1通りだけ
    const a = [], b = null; for (const f of this.q) if (want.has(f)) a.push(f);
    const pf = Math.min(this.pq || 0, this.q.length);   // すでに優先した分の後ろへ
    const head = this.q.slice(0, pf).filter(f => !want.has(f)), tail = this.q.slice(pf).filter(f => !want.has(f));
    this.q = head.concat(a, tail); this.pq = head.length + a.length; void b;
  },
  preload() {
    if (!this.ok) return;
    for (const k in this.man) for (const c in this.man[k]) { if (c.startsWith('call_')) continue; for (const l of this.man[k][c]) for (const f of l.files) this.load(f); }   // 名前呼び（call_）はその娘が出たときに読む
    this.load('cheer_kill_1_1.mp3');   // 陽気な撃破の「やったー」
    this.pri.clear(); this.pq = 0; for (const e of enemies) if (e.prof && e.prof.pers) this.prioritize(e.prof.pers);
  },
  // true = 収録音声で処理した（再生した・混雑で省略した）／false = フォールバックが必要
  play(fn, dist, prio, rate = 1, fb = null) {
    if (!this.ok || !fn) return false;
    const b = this.buf[fn];
    if (b === null) return false;
    this.stats.req++;
    if (b === undefined) { this.load(fn, true); if (prio < 2 || fb) { this.defer(fn, dist, prio, rate, fb); return true; } return false; }
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
  say(pers, kind, i, vv, dist, prio, fb = null) {
    const L = this.man && this.man[pers] && this.man[pers][kind];
    const ent = L && L[i];
    if (!ent) return false;
    // 言い方の揺れ（3通り）から毎回選ぶ。声の個性は再生速度の個体差（vv）で付ける
    let fn = ent.files[(Math.random() * ent.files.length) | 0];
    if (!this.buf[fn]) { const ok = ent.files.find(f => this.buf[f]); if (ok) fn = ok; else if (ent.files.length > 1) fn = ent.files[1]; }   // 読み込み済みの言い方を使う（無ければ先に読む1通り）
    return this.play(fn, dist, prio, VV_RATE[vv] || 1, fb);
  },
  extra(kind, i) {
    const L = this.man && this.man._extra && this.man._extra[kind];
    return !!(L && L[i]) && this.play(L[i].files[0], 0, 1);
  },
};

// ---- 状況台詞（v9）：青組の娘が戦況に合わせて短く話す（assets/voices/voices_situ.js、tools/make_voices_situ.py）
//   ・声の同時再生上限（VoicePack.MAXV）と低優先の間隔を守り、さらに全体 4.5 秒・同じ種類 16 秒・同じ娘 18 秒の間隔
//   ・撃たれた娘は黙る（被弾から 4 秒・会話を打ち切られた娘・倒れた娘は話さない）
const SITU_ROM = { 好戦的: 'aggr', 慎重: 'caut', 臆病: 'timid', 冷静: 'calm', 陽気: 'cheer' };
const SITU = {
  man: window.VOICE_SITU || null, t: 0, last: -99, catAt: {}, downAt: -99, downWho: null, log: [], said: 0,
  reset() { this.t = 1.5; this.last = -99; this.catAt = {}; this.downAt = -99; this.downWho = null; this.log = []; this.said = 0; },
  preload() {
    if (!VoicePack.ok || !this.man) return;
    const cats = ['spot', 'cover', 'lowarrow', 'allydown', 'wounded', 'win', 'lose', 'king', 'ladder', 'gate', 'st_' + builtStage];
    if (BEACH.on) cats.push('boatfire', 'landing'); if (SNOW.on) cats.push('cold'); if (PLANE.on) cats.push('cabin');
    for (const c of cats) { const C = this.man[c]; if (C) for (const r in C) for (const l of C[r]) VoicePack.load(l.files[0], true); }
  },
  ok(e) { return e && e.team === 'blue' && isUp(e) && e.prof && SITU_ROM[e.prof.pers] && !e.silenced && !e.role && !e.secretary && !e.sec2 && !e.ojou
    && !(e.hurtAt && time - e.hurtAt < 4) && !Talk.speaking(e) && !(e.situAt && time - e.situAt < 18); },
  say(e, cat, force) {
    const C = this.man && this.man[cat], L = C && C[SITU_ROM[e.prof.pers]];
    if (!L || !L.length || !VoicePack.ok) return false;
    if (!force && (time - this.last < 4.5 || (this.catAt[cat] && time - this.catAt[cat] < 16))) return false;
    if (!force && VoicePack.active.length >= VoicePack.MAXV - 1) return false;   // 声が混んでいるときは黙る
    const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
    if (d > 40) return false;
    const it = L[(Math.random() * L.length) | 0];
    if (VoicePack.buf[it.files[0]] === undefined) { VoicePack.load(it.files[0], true); return false; }
    let ok = false;
    Talk.as(e, () => {
      ok = VoicePack.play(it.files[0], d, force ? 2 : 0, VV_RATE[e.prof.vv] || 1);
      if (ok && d < 14 && !menuOpen && state === 'play') { subtitle(it.text); const el = $('subtitle'); if (el) el.textContent = e.prof.name.replace(/^組頭 /, '') + '「' + it.text + '」'; }
    });
    if (!ok) return false;
    this.last = time; this.catAt[cat] = time; e.situAt = time; this.said++;
    this.log.push(cat + ':' + e.prof.name + ':' + it.text); if (this.log.length > 60) this.log.shift();
    return true;
  },
  down(e) { if (e && e.team === 'blue') { this.downAt = time; this.downWho = e; } },
  // 今の状況に合う台詞の種類（重要なものから）
  cats(e) {
    const x = e.s.position.x, z = e.s.position.z, out = [];
    const dP = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (time - this.downAt < 4 && this.downWho && this.downWho !== e && Math.hypot(x - this.downWho.s.position.x, z - this.downWho.s.position.z) < 18) out.push('allydown');
    if (e.wounded && !e.situWound) out.push('wounded');
    if (BEACH.on && e.boat) out.push(e.boat.beached ? 'landing' : 'boatfire');
    if (e.ammo !== undefined && e.ammo > 0 && e.ammo <= 5) out.push('lowarrow');
    if (ladders.some(L => x > L.x0 - 1.5 && x < L.x1 + 1.5 && z > Math.min(L.z0, L.z1) - 1.5 && z < Math.max(L.z0, L.z1) + 1.5)) out.push('ladder');
    if ((MECH.on && MECH.gate && Math.abs(z - MECH.gateZ) < 14 && Math.abs(x) < 16) || (CASTLE.on && CASTLE.gateHP > 0 && CASTLE.gate && CASTLE.gate.position && Math.hypot(x - CASTLE.gate.position.x, z - CASTLE.gate.position.z) < 14)) out.push('gate');
    if (PLANE.on && !PLANE.intro) out.push('cabin');
    if (SNOW.on && Math.random() < 0.4) out.push('cold');
    if (e.state === 'hide' || e.state === 'tocover') out.push('cover');
    if (enemies.some(o => o.team === 'orange' && isUp(o) && Math.hypot(o.s.position.x - x, o.s.position.z - z) < 30)) { if (!e.situSpot) out.push('spot'); }
    if (dP < 5) out.push('king');
    out.push('st_' + builtStage);
    return out;
  },
  tick(dt) {
    if (!this.man || state !== 'play' || PLANE.intro && Math.random() < 0.9) return;
    if ((this.t -= dt) > 0) return; this.t = 1.2 + Math.random() * 0.8;
    if (time - this.last < 4.5) return;
    const cand = enemies.filter(e => this.ok(e) && Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z) < 32);
    if (!cand.length) return;
    // 近い娘ほど選ばれやすい
    cand.sort((a, b) => Math.hypot(a.s.position.x - player.pos.x, a.s.position.z - player.pos.z) - Math.hypot(b.s.position.x - player.pos.x, b.s.position.z - player.pos.z));
    const e = cand[Math.min(cand.length - 1, (Math.random() * Math.random() * cand.length) | 0)];
    for (const c of this.cats(e)) {
      if (c.startsWith('st_') && Math.random() > 0.35) break;   // 場面の台詞はたまに
      if (c === 'king' && Math.random() > 0.4) continue;
      if (this.say(e, c)) { if (c === 'wounded') e.situWound = true; if (c === 'spot') e.situSpot = true; break; }
    }
  },
  // 勝敗：近くに残っている娘がひと言
  end(win) {
    const cand = enemies.filter(e => e.team === 'blue' && isUp(e) && e.prof && SITU_ROM[e.prof.pers] && !e.role && !e.silenced);
    if (!cand.length) return;
    cand.sort((a, b) => Math.hypot(a.s.position.x - player.pos.x, a.s.position.z - player.pos.z) - Math.hypot(b.s.position.x - player.pos.x, b.s.position.z - player.pos.z));
    this.say(cand[0], win ? 'win' : 'lose', true);
  },
};
window.__situ = SITU;
SITU.dbg = () => ({ ok: VoicePack.ok, tx: !!VoicePack.byText('はしご車に石！'), bufs: Object.values(VoicePack.buf).filter(Boolean).length, q: VoicePack.q.length, t: +time.toFixed(1), ctx: Sfx.ctx ? Sfx.ctx.state : 'none', stats: Object.assign({}, VoicePack.stats), blue: enemies.filter(e => SITU.ok(e)).length, cats: (() => { const e = enemies.find(o => SITU.ok(o)); return e ? SITU.cats(e) : null; })() });
// 字幕から台詞の収録音声を引く（端末の音声合成より先に使う）
VoicePack.text = window.VOICE_TEXT || {};
VoicePack.byText = function (text) {
  const t = this.text[text]; if (t) return t.files;
  if (!this.idx) { this.idx = {}; const m = this.man || {}; for (const k in m) for (const c in m[k]) for (const l of m[k][c]) if (!this.idx[l.text]) this.idx[l.text] = l.files; }
  return this.idx[text] || null;
};
{ const pre = VoicePack.preload; VoicePack.preload = function () { pre.call(this); if (this.ok) for (const k in this.text) for (const f of this.text[k].files) this.load(f, true); }; }
// 台詞をいくつか続けて流す（二正面戦の口上など）
VoicePack.seq = function (texts) {
  if (!this.ok) return false;
  const fs = texts.map(t => this.byText(t)).filter(Boolean).map(f => f[0]);
  if (!fs.length) return false;
  let t0 = 0;
  for (const f of fs) { setTimeout(() => { if (this.buf[f]) this.play(f, 0, 2, 1); else this.load(f, true); }, t0 * 1000); t0 += ((this.buf[f] && this.buf[f].duration) || 3) + 0.25; }
  return true;
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
function plainsClear(x, z) {
  if (Math.abs(x) < 16 && z < 40 && z > -400) return true;          // 軽とはしご車の進撃路
  if (Math.abs(x - 8) < 8 && z > -20 && z < 52) return true;        // 本陣近くの街道
  return false;
}

const PLAINMG = { on:false, posts:[], tracers:[], car:null, objectiveCleared:false };
function plainGun(parent,x,y,z,mat) {
  const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);
  const body=new THREE.Mesh(new THREE.BoxGeometry(.22,.18,.62),mat.metal);body.position.z=-.12;g.add(body);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.82,8),mat.metal);barrel.rotation.x=Math.PI/2;barrel.position.z=-.65;g.add(barrel);
  const flash=new THREE.Sprite(beachMats().flash);flash.scale.set(.65,.65,1);flash.visible=false;
  return {g,flash};
}
function buildPlainMG() {
  PLAINMG.on=true;PLAINMG.objectiveCleared=false;PLAINMG.posts=[];PLAINMG.tracers=[];
  const M=carMats();
  if(CAR.g){const q=plainGun(CAR.g,0,1.65,-.35,M);stageRoot.add(q.flash);PLAINMG.car={x:0,y:1.65,z:-.35,gun:q.g,flash:q.flash,aim:new V3(0,1,-20),burst:0,shotT:0,nextT:1.2,target:null,rounds:0,parentYaw:CAR.yaw};}
  for(const [i,x,z] of [[0,-22,-66],[1,22,-91]]){
    const g=new THREE.Group();g.position.set(x,0,z);stageRoot.add(g);
    const cm=new THREE.MeshLambertMaterial({color:0x777b79}),dm=new THREE.MeshLambertMaterial({color:0x242725});
    const wall=new THREE.Mesh(new THREE.BoxGeometry(5.2,2.3,4.2),cm);wall.position.y=1.15;g.add(wall);
    const slit=new THREE.Mesh(new THREE.BoxGeometry(2.1,.35,.08),dm);slit.position.set(0,1.15,2.12);g.add(slit);
    const q=plainGun(g,0,1.2,1.35,M);
    const P={i,x,z,g,gun:q.g,flash:q.flash,aim:new V3(x,1,-10),burst:0,shotT:0,nextT:1.5+i*.7,target:null,rounds:0,gunners:[]};
    PLAINMG.posts.push(P);
  }
  const geo=new THREE.BoxGeometry(.035,.035,1);geo.translate(0,0,-.5);const mat=beachMats().tracer;
  for(let i=0;i<32;i++){const m=new THREE.Mesh(geo,mat);m.visible=false;stageRoot.add(m);PLAINMG.tracers.push({m,t:1,d:0,a:new V3(),b:new V3()});}
}
function plainMGCrewEnsure(){
 if(!PLAINMG.on||builtStage!=='plains')return;
 // startGame() calls resetGame(), which clears enemies after the stage is built.
 // Spawn the four pillbox crew only after that reset so the gun emplacements stay manned.
 for(const P of PLAINMG.posts){
   P.gunners=[];
   for(const dx of [-1.35,-.45,.45,1.35]){
     const e=spawnEnemy(P.x+dx,P.z+.1,'mob',false,'orange',{set:{plainGunner:P.i},yari:-1});
     if(e){e.hold={face:Math.PI};e.passive=true;P.gunners.push(e);}
   }
 }
}
function plainMGShot(S,T,team){
  const from=new V3(S.x,S.y,S.z),to=T.isPlayer?new V3(player.pos.x,player.pos.y+1.1,player.pos.z):new V3(T.s.position.x,T.baseY+T.figH*.58,T.s.position.z);
  const d=from.distanceTo(to),sp=.12+d*.012;to.x+=rand(-sp,sp);to.y+=rand(-sp*.4,sp*.5);to.z+=rand(-sp,sp);
  if(Sfx.mg)Sfx.mg(from);const tr=PLAINMG.tracers.find(t=>t.t>=1);if(tr){tr.a.copy(from);tr.b.copy(to);tr.d=from.distanceTo(to);tr.t=0;tr.m.visible=true;}
  if(Math.random()<clamp(.78-d*.0035,.32,.78)){if(T.isPlayer)hurtPlayer(5);else damageEnemy(T,1,from,false,{pt:to.clone(),thrust:true},{team,state:'idle',mg:true,s:{position:from}});}
  else puff(to.clone().setY(Math.max(.04,to.y)),0xb6a88a,3,.16,1.5,.35);
}
function plainMGUpdate(dt){
 if(!PLAINMG.on||builtStage!=='plains')return;
 const choose=(team,x,z)=>{let best=null,bd=240;for(const e of enemies){if(e.team===team||!isUp(e))continue;const p=e.s.position,d=Math.hypot(p.x-x,p.z-z);if(d<bd){bd=d;best=e;}}
 // Tower archers and catapult crew are ordinary living units too; allow the wider
 // machine-gun range to reach elevated perches and seated crews.
 if(team==='orange'&&state==='play'&&!inHQ()){const d=Math.hypot(player.pos.x-x,player.pos.z-z);if(d<bd)best={isPlayer:true};}return best;};
 const fire=(S,team,dt)=>{
   if(S.gunners&&!S.gunners.some(isUp)){S.flash.visible=false;S.burst=0;return;}
   S.nextT-=dt;if(S.burst<=0){if(S.nextT>0){S.flash.visible=false;return;}S.target=choose(team,S.x,S.z);if(!S.target){S.nextT=.6;return;}S.burst=Math.round(rand(6,8));S.shotT=0;}
   if(S.target&&!S.target.isPlayer&&!isUp(S.target)){S.burst=0;S.nextT=.4;return;}
   const p=S.target.isPlayer?player.pos:S.target.s.position;S.aim.lerp(new V3(p.x,(S.target.isPlayer?player.pos.y:S.target.baseY)+1,p.z),Math.min(1,dt*3));
   const yaw=Math.atan2(S.aim.x-S.x,S.aim.z-S.z),pit=Math.atan2(S.aim.y-S.y,Math.hypot(S.aim.x-S.x,S.aim.z-S.z));S.gun.rotation.set(pit,yaw+Math.PI-(S.parentYaw||0),0,'YXZ');
   S.shotT-=dt;if(S.shotT<=0){S.shotT+=1/MG.rpm;S.burst--;S.flash.position.set(S.x,S.y,S.z);S.flash.visible=true;S.flash.material.rotation=Math.random()*6;plainMGShot(S,S.target,team);
     if(S.burst<=0){S.nextT=rand(MG.gapT[0],MG.gapT[1]);S.rounds++;if(S.rounds>=30){S.rounds=0;S.nextT=rand(4.5,6);}}}else S.flash.visible=false;
 };
 if(CAR.g&&PLAINMG.car){const C=PLAINMG.car,[x,z]=carW(0,-.35);C.x=x;C.y=CAR.g.position.y+1.65;C.z=z;C.parentYaw=CAR.yaw;fire(C,'blue',dt);}
 for(const P of PLAINMG.posts)fire(P,'orange',dt);
 for(const T of PLAINMG.tracers)if(T.t<1){T.t+=dt*Math.min(9,300/Math.max(5,T.d));const k=Math.min(1,T.t),p=T.a.clone().lerp(T.b,k);T.m.position.copy(p);T.m.lookAt(T.b);T.m.rotateY(Math.PI);T.m.scale.set(1,1,Math.min(2.6,T.d*.3));T.m.visible=k<1;}
}
function clearPlainMG(){PLAINMG.on=false;PLAINMG.objectiveCleared=false;for(const P of PLAINMG.posts){stageRoot.remove(P.g);stageRoot.remove(P.flash);}for(const T of PLAINMG.tracers)stageRoot.remove(T.m);PLAINMG.posts=[];PLAINMG.tracers=[];PLAINMG.car=null;}

function buildPlains() {
  // 竹林を中盤に配置
  for (let tries = 0, made = 0; made < 18 && tries < 400; tries++) {
    const a = rand(0, 6.283), r = rand(14, 95), x = Math.cos(a) * r, z = Math.sin(a) * r * 1.1 - 10;
    if (Math.abs(x - 8 - (z + 60) * 0.12) < 7) continue;            // 街道
    if (z > 8 && Math.abs(x) < 14) continue;                          // 自陣
    if (plainsClear(x, z)) continue;
    if (Math.abs(x) < 22 && z < 24 && z > -400) continue;             // 機械化の進撃路
    if (Math.hypot(x, z) < 12) continue;                              // 開始地点
    if (covers.some(c => Math.hypot(c.x - x, c.z - z) < 14)) continue;
    bambooGrove(x, z, rand(2.2, 3.8)); made++;
  }
  finishBamboo();
  // 自陣（後方）
  // 本陣（陣幕で囲み、前に入口を空ける）
  maku(-4, 22, 4, 0); maku(4, 22, 4, 0); maku(-6, 28, 12, Math.PI / 2); maku(6, 28, 12, Math.PI / 2); maku(0, 34, 12, 0);
  buildHQ(-6, 6, 22, 34, 0, 31);
  buildMedPost(3.6, 29.5, 'blue');
  for (let i = -2; i <= 2; i++) nobori(i * 3, 18, '#1f5fb8', '#f4f1e8', i % 2 ? '青組' : '必勝');
  buildCar(4.6, 3.2, Math.PI);   // v8：軽自動車（運転手つき）。開始地点の右手
  buildPlainMG();
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
    if (plainsClear(x, z)) continue;
    if (Math.abs(x) < 22 && z < 24 && z > -400) continue;   // 砦までの進撃路
    if (covers.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue;
    tree(x, z, rand(0.8, 1.6));
  }
  for (let i = 0; i < 12; i++) { const a = rand(0, 6.28), r = rand(8, 30), x = Math.cos(a) * r + 30, z = Math.sin(a) * r - 10; if (plainsClear(x, z) || covers.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue; tree(x, z, rand(.8, 1.3)); }
  for (let i = 0; i < 30; i++) { const x = rand(-120, 120), z = rand(-120, 120); if (plainsClear(x, z)) continue; if (!covers.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2) && Math.hypot(x, z) > 6) rock(x, z, rand(0.4, 1.4)); }
  buildMech();
}

// ====================================================================
//  平原・機械化：広い野の先に少し高い砦。味方が軽自動車とはしご車で攻める
//  門は広く閉じていて狭間がある。はしご車を門に付けてよじ登る。櫓は二つ。
//  投石車は主にはしご車を撃つ。車は奪い合える。弓はタイヤを狙えて、直せる。
//  第2波以降は車を増やさない。
// ====================================================================
const MECH = { on: false, lim: 400, cars: [], trucks: [], tracers: [], rocks: [], catas: [], towers: [], gate: null, walk: null, won: false, crewed: false, sayAt: {}, log: [], gateZ: -176, gateHW: 5, forts: [], fi: 0, hqT: 0 };
const MECH_LINE = {
  go: ['軽で門まで行くよ', 'はしご車は2人いないと動かないよ', '門、広いね。軽なら通れる', '櫓が二つ。上、気をつけて'],
  tire: ['タイヤやられた！', '動けない…タイヤが', '足を狙われてる'],
  fix: ['タイヤ、直したよ', 'もう走れるね'],
  stone: ['投石が来る！', 'はしご車に石！', '石、人にも当たるよ'],
  climb: ['はしご、よじ登るよ', '門の上、行くね'],
  steal: ['車、もらった', 'この軽、いただくね'],
  dock: ['はしご、門にかけたよ', 'ここから登って。門にかかってるよ'],
  cata: ['投石車、こっちで撃つね', '石、人も砦も狙えるよ'],
  hq: ['本陣まで押し返すよ', '優勢だ。車で本陣へ'],
  next: ['奥にも砦がある', '同じ車で次の門へ'],
};
function mechMedEnsure() {
  medics.blue = medics.blue.filter(m => !m.extra);
  if (MED_NAMES.blue.surgeon.length > 2) MED_NAMES.blue.surgeon.length = 2;
  if (MED_NAMES.blue.nurse.length > 2) MED_NAMES.blue.nurse.length = 2;
  const extra = { surgeon: ['外科医 九条 紗英', '外科医 葉山 みどり'], nurse: ['看護師 遠野 あかり', '看護師 水無瀬 ことね'] };
  for (const role of ['surgeon', 'nurse']) for (let k = 0; k < 2; k++) {
    medics.blue.push({ role, e: null, dead: false, extra: true });
    MED_NAMES.blue[role].push(extra[role][k]);
  }
}
function mechMedCenter() {
  const F = mechFort();
  const cars = mechVehicles().filter(C => C.side === 'blue' && !C.wrecked);
  if (cars.length) { cars.sort((a, b) => a.z - b.z); return [0, cars[0].z + 7]; }
  return F ? [0, F.z + 18] : [0, 14];
}
function mechMedFront(e) {
  const [x, z] = mechMedCenter();
  const slot = (e && e.slot) || 0;
  return [((slot % 4) - 1.5) * 3.4, z];
}
function mechVehicles() { return MECH.cars.concat(MECH.trucks); }
function mechClear() {
  for (const r of MECH.rocks) if (r.m && r.m.parent) r.m.parent.remove(r.m);
  for (const C of mechVehicles()) if (C.lad) mechLadderOff(C);
  MECH.on = false; MECH.cars = []; MECH.trucks = []; MECH.rocks = []; MECH.catas = []; MECH.towers = []; MECH.gate = null; MECH.walk = null; MECH.forts = []; MECH.fi = 0;
  MECH.won = false; MECH.crewed = false; MECH.sayAt = {}; MECH.log = []; MECH.hqT = 0;
  if (typeof medics !== 'undefined') {
    medics.blue = medics.blue.filter(m => !m.extra);
    if (MED_NAMES.blue.surgeon.length > 2) MED_NAMES.blue.surgeon.length = 2;
    if (MED_NAMES.blue.nurse.length > 2) MED_NAMES.blue.nurse.length = 2;
  }
}
function mechW(C, lx, lz) { const c = Math.cos(C.yaw), s = Math.sin(C.yaw); return [C.x + lx * c + lz * s, C.z - lx * s + lz * c]; }
function mechL(C, x, z) { const dx = x - C.x, dz = z - C.z, c = Math.cos(C.yaw), s = Math.sin(C.yaw); return [dx * c - dz * s, dx * s + dz * c]; }
function mechSay(e, key) {
  const lines = MECH_LINE[key]; if (!lines || !e || !isUp(e)) return;
  if (MECH.sayAt[key] && time - MECH.sayAt[key] < 7) return;
  MECH.sayAt[key] = time;
  const line = pick(lines), name = (e.prof && e.prof.name) || '戦いの娘';
  Talk.as(e, () => {
    Voice.say(line, e.prof || { pitch: 1.26, rate: 1.06 }, 1);
    subtitle(line);
    const el = $('subtitle'); if (el) el.textContent = name + '「' + line + '」';
  });
  MECH.log.push('say:' + key + ':' + name + ':' + line);
}
function mechSlitWall(x0, x1, z, h) {
  const t = 0.34;
  boxMesh(x0, x1, 0, 1.35, z - t, z + t, WOOD);
  boxMesh(x0, x1, 1.95, h, z - t, z + t, WOOD);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.4, x1 - x0), 0.6), new THREE.MeshBasicMaterial({ color: 0x1a140e }));
  slit.position.set((x0 + x1) / 2, 1.65, z); stageRoot.add(slit);
}
function mechTruckMesh(g) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5434 }), dark = new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), iron = new THREE.MeshLambertMaterial({ color: 0x8d9298 });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  box(2.15, 0.35, 6.0, 0, 0.7, 0, wood);
  box(1.7, 0.7, 1.5, 0, 1.25, 1.7, dark);
  box(0.12, 0.55, 4.2, -0.45, 1.7, -0.5, wood);
  box(0.12, 0.55, 4.2, 0.45, 1.7, -0.5, wood);
  for (let i = 0; i < 7; i++) box(1.05, 0.06, 0.12, 0, 1.15 + i * 0.16, -0.4 - i * 0.28, iron);
  // 平原の味方機関銃車：大きく見える銃架・機関部・銃身・照準器。
  box(0.92, 0.22, 0.88, 0, 1.58, 0.05, dark);
  box(0.38, 0.38, 0.66, 0, 1.82, -0.18, iron);
  box(0.20, 0.22, 0.52, 0, 2.00, -0.50, dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 1.65, 10), iron);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.00, -1.20); g.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), dark);
  muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 2.00, -2.02); g.add(muzzle);
  box(0.12, 0.36, 0.12, 0.30, 1.88, -0.18, dark);
  const wheels = [];
  const locs = [[-1.05, 2.15], [1.05, 2.15], [-1.05, -2.15], [1.05, -2.15]];
  for (const [wx, wz] of locs) {
    const w = new THREE.Group(); w.position.set(wx, 0.38, wz);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 12), new THREE.MeshLambertMaterial({ color: 0x1b1b1c })); t.rotation.z = Math.PI / 2; w.add(t);
    g.add(w); wheels.push(w);
  }
  return { wheels, locs };
}
function mechMake(x, z, kind) {
  const g = new THREE.Group(), M = carMats();
  let wheels, locs;
  if (kind === 'truck') ({ wheels, locs } = mechTruckMesh(g));
  else { const b = keiAssemble(g, M); wheels = b.wheels; locs = [[-CAR_W / 2 + 0.08, 1.1], [CAR_W / 2 - 0.08, 1.1], [-CAR_W / 2 + 0.08, -1.1], [CAR_W / 2 - 0.08, -1.1]]; }
  g.position.set(x, 0, z); g.rotation.y = Math.PI; stageRoot.add(g);
  const C = { g, wheels, locs, x, z, y: 0, yaw: Math.PI, v: 0, kind, seats: [null, null, null, null], side: 'blue', phase: 'wait', tires: [3, 3, 3, 3], lame: false, wrecked: false, hp: kind === 'truck' ? 8 : 5, hpMax: kind === 'truck' ? 8 : 5, docked: false, lad: null, fixT: 0, home: [x, z], lane: x, goalX: x };
  (kind === 'truck' ? MECH.trucks : MECH.cars).push(C);
  return C;
}
function buildMech() {
  mechClear();
  MECH.on = true;
  MECH.lim = 400;
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(20, 400), new THREE.MeshLambertMaterial({ color: 0x9a8458 }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, 0.03, -170); stageRoot.add(dirt);
  MECH.forts = [0, 1, 2].map(mechMakeFort);
  mechUseFort(0);
  buildMedPost(0.6, MECH.forts[0].z - 14, 'orange');
  [[-6, 18], [0, 15], [6, 18], [-3, 12]].forEach(([x, z]) => mechMake(x, z, 'kei'));
  [[-8, 8], [8, 9]].forEach(([x, z], i) => { const C = mechMake(x, z, 'truck'); C.goalX = i ? 8 : -8; });
  mechMedEnsure();
  mechSiege();
}
function mechOpenGate(F) {
  F = F || mechFort(); if (!F) return;
  const was = F.gate && F.gate.open;
  mechSwing(F.gate, true); mechSwing(F.back, true);
  if (!was && F === mechFort()) popup('門が開いた。中も、奥も通れる');
}
function mechShutGate(F) {
  F = F || mechFort(); if (!F) return;
  mechSwing(F.gate, false); mechSwing(F.back, false);
}
function mechSwing(G, open) {
  if (!G || G.open === open) return;
  G.open = open;
  if (open) for (const b of G.doorBoxes) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); }
  else for (const b of G.doorBoxes) if (!boxes.includes(b)) boxes.push(b);
  G.leaves.forEach((m, i) => {
    if (m.userData.ox == null) m.userData.ox = m.position.x;
    m.rotation.y = open ? (i ? 1 : -1) * 1.15 : 0;
    m.position.x = open ? m.userData.ox + (i ? 1 : -1) * Math.min(2.4, G.hw * 0.35) : m.userData.ox;
  });
}
function mechWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function mechVehBlocked(C, x, z) {
  const all = mechVehicles().concat(MECH.catas);
  for (const O of all) {
    if (O === C || O.wrecked) continue;
    const need = (C.kind === 'truck' || O.kind === 'truck') ? 3.3 : 2.5;
    if (Math.hypot(x - O.x, z - O.z) < need) return true;
  }
  return false;
}
function mechGateMouth(C) {
  for (const F of MECH.forts) {
    if (!F.gate || !F.gate.open) continue;
    const front = F.z, back = F.z - 34, hw = F.hw || 5;
    if (C.z > front + 1.1 && C.z < front + 32 && Math.abs(C.x) > hw - 0.2) return { x: 0, z: Math.max(front + 3.4, C.z - 1) };
    if (F.back && F.back.open && C.z < front - 1.2 && C.z > back - 1 && Math.abs(C.x) > 10) return { x: 0, z: Math.max(back + 2.2, C.z - 1) };
  }
  return null;
}
function mechSeek(C, gx, gz, dt, spd) {
  if (C.revT > 0) C.revT -= dt;
  const dx = gx - C.x, dz = gz - C.z, dist = Math.hypot(dx, dz);
  let face = Math.atan2(dx, dz);
  if (C.revT > 0) face = mechWrap(C.yaw + (C.revSide || 1) * 1.2);
  const diff = mechWrap(face - (C.yaw || 0));
  C.yaw = mechWrap((C.yaw || 0) + clamp(diff, -(C.revT > 0 ? 2.5 : 1.7) * dt, (C.revT > 0 ? 2.5 : 1.7) * dt));
  let want = 0;
  if (dist < 1.7 && C.revT <= 0) want = 0;
  else if (C.revT > 0) want = -2.7;
  else want = Math.abs(diff) > 1.15 ? 0.4 : spd;
  if (want > 0.15 && mechAhead(C)) want = 0;
  C.v += clamp(want - C.v, -8 * dt, 3.4 * dt);
  if (Math.abs(C.v) > 0.04) {
    const nx = C.x + Math.sin(C.yaw) * C.v * dt, nz = C.z + Math.cos(C.yaw) * C.v * dt;
    if (mechBlocked(nx, nz) || mechVehBlocked(C, nx, nz)) {
      C.v = 0;
      if (C.revT <= 0) { C.revT = 0.9; C.revSide = ((C.bumpN = (C.bumpN || 0) + 1) % 2) ? 1 : -1; }
    } else { C.x = nx; C.z = nz; }
  }
  return dist;
}
function vehDumpBodies(C) {
  if (!C || !C.seats) return 0;
  const world = C.kind ? (lx, lz) => mechW(C, lx, lz) : (lx, lz) => keiW(C, lx, lz);
  let n = 0;
  for (let s = 0; s < C.seats.length; s++) {
    const o = C.seats[s];
    if (!o || o === 'P' || isUp(o)) continue;
    const [wx, wz] = world((s % 2 ? 1 : -1) * 2.2, -1.7);
    C.seats[s] = null;
    o.keiDead = null; o.slump = null; o.seated = null; endSeatDown(o);
    o.baseY = C.kind ? 0 : groundH(wx, wz);
    o.s.position.set(wx, o.baseY, wz);
    if (o.tilt) { o.tilt.rotation.x = Math.PI / 2; o.tilt.position.y = 0.02; }
    n++;
  }
  if (n && !C.dumpSaid) { C.dumpSaid = true; popup('遺体を車の外に出した'); }
  return n;
}
function mechLiving(C, team) { let n = 0; for (const o of C.seats) if (o && isUp(o) && (!team || o.team === team)) n++; return n; }
function mechPut(C) {
  for (let s = 0; s < C.seats.length; s++) {
    const o = C.seats[s];
    if (!o) continue;
    if (!enemies.includes(o) && !bodies.includes(o)) { C.seats[s] = null; continue; }
    const seat = KEI_SEAT[s] || KEI_SEAT[0], [wx, wz] = mechW(C, seat[0], seat[1]);
    if (o.seated) { o.seated.x = wx; o.seated.z = wz; }
    o.s.position.x = wx; o.s.position.z = wz; o.baseY = 0.48;
    if (isUp(o)) o.s.rotation.y = C.yaw;
  }
}
function mechSit(e, C) {
  if (!e || !C || !isUp(e) || C.wrecked) return false;
  if (e.team !== C.side && mechLiving(C, C.side) > 0) return false;
  let slot = C.seats.findIndex(s => !s);
  const body = keiHasBody(C), other = e.team !== C.side && mechLiving(C, C.side) === 0;
  if (slot < 0) {
    if (!(other && body)) return false;
    keiBloodSay(e); vehDumpBodies(C);
    slot = C.seats.findIndex(s => !s);
    if (slot < 0) return false;
  }
  const seat = KEI_SEAT[slot], [wx, wz] = mechW(C, seat[0], seat[1]);
  C.seats[slot] = e; e.keiSlot = slot; e.keiGo = null;
  e.seated = { x: wx, z: wz, car: true, kei: C }; e.baseY = 0.48; e.s.position.set(wx, e.baseY, wz);
  e.state = 'idle'; e.passive = true; e.tgt = null;
  if (other) { C.side = e.team; C.phase = 'go'; C.docked = false; if (C.lad) mechLadderOff(C); mechSay(e, 'steal'); MECH.log.push('steal:' + C.kind + ':' + e.team); }
  if (body) { keiBloodSay(e); const last = BEACH.log[BEACH.log.length - 1]; if (last && String(last).startsWith('blood:')) MECH.log.push(last); vehDumpBodies(C); }
  return true;
}
function mechDropLiving(C) {
  for (let s = 0; s < C.seats.length; s++) {
    const o = C.seats[s];
    if (!o || !isUp(o)) continue;
    const [wx, wz] = mechW(C, (s % 2 ? 1 : -1) * 1.6, -1.4);
    o.s.position.set(wx, 0, wz); o.baseY = 0;
    if (!o.seated) o.seated = { x: wx, z: wz, kei: C };
    standUp(o); o.s.position.set(wx, 0, wz); o.baseY = 0;
  }
  C.phase = 'hold';
}
function mechAhead(C) {
  for (const o of enemies) {
    if (!isUp(o) || o.seated) continue;
    const [lx, lz] = mechL(C, o.s.position.x, o.s.position.z);
    if (lz > 1.2 && lz < 3.4 && Math.abs(lx) < 1.15) return true;
  }
  if (!player.god && Math.hypot(player.pos.x - C.x, player.pos.z - C.z) < 8) {
    const [lx, lz] = mechL(C, player.pos.x, player.pos.z);
    if (lz > 1.2 && lz < 3.2 && Math.abs(lx) < 1.15 && player.pos.y < 1.2) return true;
  }
  return false;
}
function mechBlocked(x, z) {
  if (Math.abs(x) > MECH.lim - 2 || Math.abs(z) > MECH.lim - 2) return true;
  for (const b of boxes) {
    if (b.y1 < 0.8) continue;
    if (x > b.x0 - 0.8 && x < b.x1 + 0.8 && z > b.z0 - 1.3 && z < b.z1 + 1.3 && b.y0 < 1.2) return true;
  }
  for (const k of colliders) if (Math.hypot(x - k.x, z - k.z) < k.r + 1.15) return true;
  return false;
}
function mechDock(C) {
  if (C.docked || C.kind !== 'truck' || mechLiving(C) < 2) return;
  const F = mechFort(); if (!F || !F.walk) return;
  C.docked = true; C.v = 0; C.phase = 'hold';
  const nose = mechW(C, 0, 2.55);
  const x = nose[0];
  const zFoot = nose[1];
  const zTop = F.z - 1.75;
  const y1 = F.walk.y;
  const vis = mechLadderVis(x, zFoot, zTop, y1);
  const zStand = zFoot + Math.sign(zFoot - F.z || 1) * 1.35;
  const L = { x0: x - 0.85, x1: x + 0.85, z0: Math.min(zStand, zTop) - 0.45, z1: Math.max(zStand, zFoot) + 0.45, y0: 0, y1, mech: true, F: F.walk, dir: -1, zStand, zTop, vis };
  ladders.push(L); C.lad = L; C.ladBase = [x, zStand];
  const who = C.seats.find(isUp); if (who) mechSay(who, 'dock');
  MECH.log.push('dock:' + x.toFixed(1) + ':' + zFoot.toFixed(1) + ':' + zTop.toFixed(1));
  if (!MECH.saidLad) { MECH.saidLad = true; popup('はしごが門にかかった。後ろから E で渡れる'); }
}
function mechCarAhead(C) {
  for (const O of mechVehicles()) {
    if (O === C || O.wrecked) continue;
    const [lx, lz] = mechL(C, O.x, O.z);
    if (lz > 0.6 && lz < 5.2 && Math.abs(lx) < 1.55) return true;
  }
  return false;
}
function mechDrive(C, dt) {
  if (C.wrecked) { C.v = 0; mechPut(C); return; }
  mechStill(C, dt);
  const F0 = mechFort();
  if (C.docked && F0 && F0.gate && F0.gate.open) mechLadderOff(C);
  if (C.docked) { C.v = 0; mechPut(C); return; }
  const crew = mechLiving(C), need = C.kind === 'truck' && !C.solo ? 2 : 1;
  if (crew < need) { C.v = 0; if (C.phase === 'go') C.phase = 'hold'; mechPut(C); return; }
  if (C.phase === 'wait' || C.phase === 'hold') C.phase = 'go';
  if (C.lame) { C.v = 0; mechPut(C); return; }
  const blue = C.side !== 'orange';
  const mouth = mechGateMouth(C);
  const F = mechFort();
  const open = !!(F && F.gate && F.gate.open);
  let gx, gz, dock = false;
  if (!blue) { gx = 0; gz = 26; }
  else if (mouth) { gx = mouth.x; gz = mouth.z; }
  else if (!F) { gx = C.x; gz = C.z; }
  else if (C.kind === 'truck' && !open) { gx = C.goalX; gz = F.z + 4.5; dock = true; }
  else if (C.kind === 'kei' && !open) { gx = clamp(C.lane, -3.2, 3.2); gz = F.z + 8.5; }
  else { gx = clamp((C.lane || C.goalX || 0) * 0.35, -2.2, 2.2); gz = F.z - (C.kind === 'truck' ? 10 : 14); }
  const dist = mechSeek(C, gx, gz, dt, C.kind === 'truck' ? 3.6 : 4.2);
  if (dock && F && dist < 2.8 && C.z < F.z + 8 && C.z > F.z + 2.2 && Math.abs(C.x - C.goalX) < 2.4 && Math.abs(C.v) < 1.1) mechDock(C);
  if (blue && F && C.kind === 'kei' && !open && C.z < F.z + 12 && Math.abs(C.x) < (F.hw || 5) + 1.4 && Math.abs(C.v) < 0.4) mechDropLiving(C);
  if (blue && F && open && !F.done && C.z < F.z - 4 && Math.abs(C.x) < 18 && Math.abs(C.v) < 0.45) mechDropLiving(C);
  if (!blue && C.z > 16 && Math.abs(C.x) < 16 && Math.abs(C.v) < 0.45) { mechDropLiving(C); const who = C.seats.find(isUp); if (who) mechSay(who, 'hq'); }
  C.g.position.set(C.x, 0, C.z); C.g.rotation.y = C.yaw;
  for (const w of C.wheels) { const s = (w.spin = (w.spin || 0) + C.v * dt / 0.34); w.children[0].rotation.x = s; }
  mechPut(C);
}
function mechStill(C, dt) {
  const moved = Math.hypot(C.x - (C.wasX == null ? C.x : C.wasX), C.z - (C.wasZ == null ? C.z : C.wasZ));
  if (C.wasX != null && moved < 0.3 && !C.docked && !C.wrecked) C.stillT = (C.stillT || 0) + dt;
  else C.stillT = 0;
  C.wasX = C.x; C.wasZ = C.z;
  if ((C.stillT || 0) < 30 || (C.kind === 'cata' ? cataLiving(C) : mechLiving(C)) < 1) return;
  C.solo = true; C.phase = 'go'; C.stillT = 0;
  if (!C.lame) { C.revT = 1.15; C.revSide = ((C.bumpN = (C.bumpN || 0) + 1) % 2) ? 1 : -1; }
  if (!C.soloSaid) { C.soloSaid = true; const who = (C.seats || []).find(isUp); if (who) mechSay(who, 'go'); }
}
function mechPuncture(C, i, by) {
  if (!C || C.wrecked || C.tires[i] <= 0) return;
  C.tires[i]--;
  MECH.log.push('tire:' + C.kind + ':' + i + ':' + C.tires[i]);
  if (C.tires[i] <= 0) {
    C.lame = true; C.v = 0;
    const who = enemies.find(e => isUp(e) && (e.seated && e.seated.kei === C || Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z) < 6));
    if (who) mechSay(who, 'tire');
    if (!MECH.tireSaid) { MECH.tireSaid = true; popup('タイヤが破れた。そばで直せる'); }
  }
}
function mechTireHit(p0, p1, team) {
  if (!MECH.on) return null;
  const sx = p1.x - p0.x, sy = p1.y - p0.y, sz = p1.z - p0.z, sl = sx * sx + sy * sy + sz * sz || 1e-6;
  let best = null;
  for (const C of mechVehicles()) {
    if (C.wrecked) continue;
    if (team && team !== 'player' && team === C.side) continue;
    C.locs.forEach((loc, i) => {
      if (C.tires[i] <= 0) return;
      const [wx, wz] = mechW(C, loc[0], loc[1]), wy = 0.36;
      const t = clamp(((wx - p0.x) * sx + (wy - p0.y) * sy + (wz - p0.z) * sz) / sl, 0, 1);
      const d = Math.hypot(p0.x + sx * t - wx, p0.y + sy * t - wy, p0.z + sz * t - wz);
      if (d < 0.46 && (!best || t < best.t)) best = { t, C, i };
    });
  }
  return best;
}
function mechFix(C, who) {
  if (!C) return false;
  C.tires = [3, 3, 3, 3]; C.lame = false; C.fixT = 0;
  if (C.wrecked) { C.wrecked = false; C.hp = Math.max(3, C.hpMax * 0.5); C.phase = 'go'; }
  if (who && isUp(who)) mechSay(who, 'fix');
  else if (!MECH.fixSaid) { MECH.fixSaid = true; popup('タイヤを直した'); }
  MECH.log.push('fix:' + C.kind);
  return true;
}
function mechNearLame() {
  let best = null, bd = 5.2;
  for (const C of mechVehicles()) {
    if ((!C.lame && !C.wrecked) || C.side === 'orange') continue;
    const d = Math.hypot(player.pos.x - C.x, player.pos.z - C.z);
    if (d < bd) { bd = d; best = C; }
  }
  return best;
}
function mechAnyLame() {
  return !!(MECH.on && mechVehicles().some(C => (C.lame || C.wrecked) && C.side !== 'orange'));
}
function mechUse() {
  if (!MECH.on) return false;
  const C = mechNearLame(); if (!C) return false;
  mechFix(C, null); popup('タイヤを直した'); return true;
}
function mechAimWheel(e) {
  if (!MECH.on || !e || e.kind !== 'archer') return null;
  let best = null, bd = 46;
  const p = e.s.position;
  for (const C of mechVehicles()) {
    if (C.wrecked || C.side === e.team) continue;
    const d = Math.hypot(C.x - p.x, C.z - p.z) + (C.kind === 'truck' ? -6 : 0);
    if (d < bd) { bd = d; best = C; }
  }
  if (!best) return null;
  const loc = best.locs[Math.abs(e.id || 0) % best.locs.length];
  const [wx, wz] = mechW(best, loc[0], loc[1]);
  return new V3(wx, 0.36, wz);
}
function mechLob(dt) {
  for (const K of MECH.catas) {
    cataPut(K);
    if (K.locked || cataLiving(K) < 2) continue;
    K.t -= dt; if (K.t > 0) continue;
    const aim = cataAim(K);
    if (!aim) { K.t = 2.2; continue; }
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6b6458 }));
    m.position.set(K.x, 2.4, K.z); stageRoot.add(m);
    MECH.rocks.push({ m, x: K.x, y: 2.4, z: K.z, tx: aim.x, tz: aim.z, t: 0, T: 1.25, aim, side: K.side });
    K.t = rand(6.2, 9.2);
    const who = K.seats.find(isUp);
    if (who) mechSay(who, K.side === 'blue' ? 'cata' : 'stone');
  }
  for (let i = MECH.rocks.length - 1; i >= 0; i--) {
    const r = MECH.rocks[i]; r.t += dt; const k = Math.min(1, r.t / r.T);
    r.m.position.set(r.x + (r.tx - r.x) * k, 2.4 + Math.sin(k * Math.PI) * 8, r.z + (r.tz - r.z) * k);
    if (k < 1) continue;
    mechRockHit(r);
    stageRoot.remove(r.m); MECH.rocks.splice(i, 1);
  }
}
function mechRockHit(r) {
  const A = r.aim || {}, side = r.side || 'orange';
  const from = new V3(r.tx, 0.5, r.tz);
  puff(r.m.position.clone(), 0xc8b48a, 8, 0.55, 2.2, 0.6);
  if (A.what === 'pb' && A.ref && !A.ref.dead && Math.hypot(A.ref.x - r.tx, A.ref.z - r.tz) < 8) {
    A.ref.hp -= 3.2; MECH.log.push('pbhit:' + A.ref.hp.toFixed(1));
    if (A.ref.hp <= 0) mechPbKill(A.ref);
  }
  let veh = A.what === 'veh' ? A.ref : null;
  if (!veh && A.ref && A.ref.seated && A.ref.seated.kei && A.ref.seated.kei.kind) veh = A.ref.seated.kei;
  let broke = false;
  if (veh && !veh.wrecked && veh.kind && Math.hypot(veh.x - r.tx, veh.z - r.tz) < 3.4) {
    if (Math.random() < 0.32) {
      const live = [];
      veh.tires.forEach((t, i) => { if (t > 0) live.push(i); });
      if (live.length) mechPuncture(veh, live[(Math.random() * live.length) | 0], side);
    }
    veh.hp -= veh.kind === 'truck' ? 0.7 : 0.4;
    MECH.log.push('stone:' + veh.kind + ':' + veh.hp.toFixed(1));
    if (veh.hp <= 0) { veh.wrecked = true; veh.lame = true; veh.v = 0; veh.phase = 'hold'; broke = true; }
  }
  const crew = MECH.catas.flatMap(K => K.seats).find(isUp);
  for (const e of enemies) {
    if (!isUp(e) || e.team === side || e.seated) continue;
    if (Math.hypot(e.s.position.x - r.tx, e.s.position.z - r.tz) < 2.6) damageEnemy(e, 5, from, false, null, crew || 'player');
  }
  if (broke) { mechDropLiving(veh); popup(veh.kind === 'truck' ? '投石ではしご車が止まった' : '投石で軽自動車が止まった'); }
  if (side === 'orange' && Math.hypot(player.pos.x - r.tx, player.pos.z - r.tz) < 2.3) hurtPlayer(8);
  for (const F of MECH.forts) for (const G of [F.gate, F.back]) {
    if (!G || G.open) continue;
    if (Math.abs(r.tx) < (G.hw || 5) + 2.4 && Math.abs(r.tz - G.z) < 3.2) {
      G.hp = (G.hp == null ? 9 : G.hp) - 3.2;
      MECH.log.push('gatehit:' + G.hp.toFixed(1));
      if (G.hp <= 0) { mechSwing(G, true); popup(G === F.gate ? '投石で門が開いた' : '投石で裏門が開いた'); MECH.log.push('gateopen'); }
    }
  }
  MECH.log.push('rock:' + (A.what || '?'));
}
function mechSteal(dt) {
  MECH.scan = (MECH.scan || 0) - dt; if (MECH.scan > 0) return;
  MECH.scan = 0.45;
  for (const e of enemies) {
    if (!isUp(e) || e.seated || e.special || e.perch || e.gunner) continue;
    let best = null, bd = 11;
    for (const C of mechVehicles()) {
      if (C.wrecked) continue;
      if (mechLiving(C, C.side) > 0) continue;
      if (!(C.phase === 'hold' || C.lame || C.docked || C.phase === 'wait')) continue;
      const slot = C.seats.findIndex(s => !s); if (slot < 0) continue;
      if (C.side === e.team && mechLiving(C) > 0) continue;
      if (C.side === e.team && !keiHasBody(C) && mechLiving(C) === 0 && C.phase === 'go') continue;
      const d = Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z);
      if (d < bd && C.side !== e.team) { bd = d; best = C; }
    }
    if (best) mechSit(e, best);
    else {
      let ck = null, cd = 8;
      for (const K of MECH.catas) {
        if (K.locked || cataLiving(K, K.side) > 0 || K.seats.every(Boolean)) continue;
        const d = Math.hypot(e.s.position.x - K.x, e.s.position.z - K.z);
        if (d < cd && K.side !== e.team) { cd = d; ck = K; }
      }
      if (ck) cataSit(e, ck);
    }
  }
}
function mechRepairTick(dt) {
  for (const C of mechVehicles()) {
    if (!C.lame && !C.wrecked) continue;
    if (enemies.some(e => e.fixCar === C && isUp(e))) continue;
    let who = null;
    for (const e of enemies) {
      if (!isUp(e) || e.seated || e.team !== (C.side || 'blue')) continue;
      if (Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z) < 2.3) { who = e; break; }
    }
    if (!who) { C.fixT = 0; continue; }
    C.fixT = (C.fixT || 0) + dt;
    if (C.fixT > 1.7) mechFix(C, who);
  }
}
function mechFixJob(e, dt) {
  if (!MECH.on || !e || e.team !== 'blue' || !isUp(e) || e.seated || e.perch || e.guard || e.medic || e.driver || e.gunner) return false;
  let C = e.fixCar;
  if (C && (C.side !== 'blue' || (!C.lame && !C.wrecked))) C = e.fixCar = null;
  if (!C || (!C.lame && !C.wrecked)) {
    if ((e.fixScan = (e.fixScan || 0) - dt) > 0) return !!e.fixCar;
    e.fixScan = 0.35;
    let bd = (e.secretary || e.aide || e.ojou || e.sec2) ? 70 : 42, best = null;
    for (const O of mechVehicles()) {
      if (O.side !== 'blue' || (!O.lame && !O.wrecked)) continue;
      const d = Math.hypot(e.s.position.x - O.x, e.s.position.z - O.z);
      if (d < bd) { bd = d; best = O; }
    }
    e.fixCar = C = best;
  }
  if (!C) return false;
  const p = e.s.position, d = Math.hypot(p.x - C.x, p.z - C.z);
  e.tgt = null; e.passive = true;
  if (d > 1.7) {
    steer(e, C.x, C.z + 1.4, e.speed * 1.3, dt);
    e.faceWant = Math.atan2(C.x - p.x, C.z - p.z);
    e.state = 'approach';
    return true;
  }
  C.fixT = (C.fixT || 0) + dt;
  e.state = 'idle';
  e.faceWant = Math.atan2(C.x - p.x, (C.z + 0.2) - p.z);
  if (C.fixT > 1.7) { mechFix(C, e); e.fixCar = null; }
  return true;
}
function mechWin() {
  if (!MECH.on || MECH.won || state !== 'play') return;
  mechBreach();
  mechCapture();
  mechHqTick();
}
function mechClimb(e, dt) {
  if (!MECH.on || e.team !== 'blue' || e.seated || e.special || e.perch || e.guard || e.baseY > 2) return false;
  if (e.secretary || e.medic || e.aide || e.runner || e.fluter || e.ojou || e.sec2 || e.driver) return false;
  const F = mechFort();
  if (!F || (F.gate && F.gate.open) || e.s.position.z < F.z + 1) return false;
  const C = MECH.trucks.find(t => t.docked && t.ladBase);
  if (!C) return false;
  const b = C.ladBase, d = Math.hypot(e.s.position.x - b[0], e.s.position.z - b[1]);
  if (d > 16) return false;
  if (mechShy(e) && d > 7) return false;
  e.tgt = null;
  if (d > 0.9) { steer(e, b[0], b[1], e.speed * 1.25, dt); return true; }
  e.climbT = (e.climbT || 0) + dt;
  if (e.climbT > 0.75 && F.walk) {
    const W = F.walk;
    e.onFloor = W; e.baseY = W.y; e.passive = false;
    e.s.position.set(clamp(b[0], W.x0 + 0.8, W.x1 - 0.8), W.y, (W.z0 + W.z1) / 2);
    e.climbT = 0; e.state = e.kind === 'archer' ? 'advance' : 'approach';
    mechSay(e, 'climb'); MECH.log.push('climb');
  }
  return true;
}
function mechPress(e, dt) {
  if (!MECH.on || e.team !== 'blue' || e.seated || e.special || e.guard || e.perch) return false;
  if (e.secretary || e.medic || e.aide || e.runner || e.fluter || e.ojou || e.sec2 || e.driver) return false;
  const F = mechFort(); if (!F) return false;
  let foe = null, bd = 1e9;
  for (const o of enemies) {
    if (o.team !== 'orange' || !isUp(o)) continue;
    const d = Math.hypot(o.s.position.x - e.s.position.x, o.s.position.z - e.s.position.z);
    if (d < bd) { bd = d; foe = o; }
  }
  const pers = e.prof && e.prof.pers;
  const fightR = pers === '臆病' ? 16 : pers === '好戦的' ? 7 : 12;
  if (foe && bd < fightR) return false;
  if (e.kind === 'archer' && foe && bd < 36) return false;
  const inside = e.baseY > 2 || e.s.position.z < F.z - 0.3;
  if (!inside && !(F.gate && F.gate.open)) return false;
  e.passive = false;
  if (!inside) { steer(e, 0, F.z - 8, e.speed * 1.25, dt); e.state = 'approach'; return true; }
  if (foe) {
    steer(e, foe.s.position.x, foe.s.position.z, e.speed * (pers === '好戦的' ? 1.35 : 1.12), dt);
    e.tgt = foe; e.state = e.kind === 'archer' ? 'advance' : 'approach';
    return true;
  }
  const N = MECH.forts[MECH.fi + 1];
  if (F.done && N) { steer(e, 0, N.z + 14, e.speed * 1.2, dt); e.state = 'approach'; return true; }
  return false;
}
function mechCounter(e, dt) {
  if (!MECH.on || e.team !== 'orange' || e.seated || e.special || e.perch || e.medic || e.gunner) return false;
  let nb = 0, no = 0, foe = null, fd = 1e9;
  for (const o of enemies) {
    if (!isUp(o) || o.special) continue;
    if (o.team === 'blue') { nb++; const d = Math.hypot(o.s.position.x - e.s.position.x, o.s.position.z - e.s.position.z); if (d < fd) { fd = d; foe = o; } }
    else no++;
  }
  const pers = e.prof && e.prof.pers;
  const need = pers === '好戦的' ? 0 : pers === '臆病' ? 8 : pers === '慎重' ? 5 : 3;
  if (foe && fd < (pers === '臆病' ? 11 : 16)) return false;
  if (e.kind === 'archer' && foe && fd < 34) return false;
  const adv = no >= nb + need;
  const F = mechFort();
  if (adv && e.s.position.z < 20) {
    let car = null, cd = 22;
    for (const C of mechVehicles()) {
      if (C.side === 'orange' || C.wrecked || mechLiving(C, 'blue') > 0) continue;
      if (!(C.phase === 'hold' || C.lame || C.docked || C.phase === 'wait')) continue;
      const d = Math.hypot(C.x - e.s.position.x, C.z - e.s.position.z);
      if (d < cd) { cd = d; car = C; }
    }
    if (car) { steer(e, car.x, car.z + 1.2, e.speed * 1.3, dt); e.state = 'approach'; return true; }
    steer(e, pers === '臆病' ? e.s.position.x * 0.4 : 0, 26, e.speed * (pers === '好戦的' ? 1.35 : 1.15), dt);
    e.state = 'approach';
    if ((e.hqSay || 0) < time) { e.hqSay = time + 12; mechSay(e, 'hq'); }
    return true;
  }
  if (!adv && F && e.s.position.z > F.z + 22 && (!foe || fd > 26)) {
    steer(e, clamp(e.s.position.x, -10, 10), F.z - 10, e.speed, dt);
    e.state = 'approach';
    return true;
  }
  return false;
}
function mechNeedCrew(C) {
  if (!C || C.wrecked || C.lame || C.side !== 'blue') return 0;
  const need = C.kind === 'truck' || C.kind === 'cata' ? 2 : 1;
  const live = C.kind === 'cata' ? cataLiving(C) : mechLiving(C);
  const empty = C.seats.filter(s => !s).length;
  if (live >= need || empty <= 0) return 0;
  return Math.min(empty, need - live);
}
function mechFillJob(e, dt) {
  if (!MECH.on || !e || e.team !== 'blue' || !isUp(e) || e.seated || e.perch || e.guard || e.special || e.gunner || e.baseY > 1.2) return false;
  let C = e.rideCar;
  if (C && mechNeedCrew(C) <= 0) C = e.rideCar = null;
  if (!C) {
    if ((e.rideScan = (e.rideScan || 0) - dt) > 0) return false;
    e.rideScan = 0.35;
    let best = null, bd = 40;
    for (const O of mechVehicles().concat(MECH.catas)) {
      const need = mechNeedCrew(O); if (!need) continue;
      const going = enemies.filter(x => x !== e && x.rideCar === O && isUp(x)).length;
      if (going >= need) continue;
      const d = Math.hypot(e.s.position.x - O.x, e.s.position.z - O.z);
      if (d < bd) { bd = d; best = O; }
    }
    e.rideCar = C = best;
  }
  if (!C) return false;
  const p = e.s.position, d = Math.hypot(p.x - C.x, p.z - C.z);
  e.tgt = null;
  if (d > 1.8) {
    steer(e, C.x + ((e.id || 0) % 2 ? 1.5 : -1.5), C.z + 2.1, e.speed * 1.35, dt);
    e.state = 'approach';
    return true;
  }
  const ok = C.kind === 'cata' ? cataSit(e, C) : mechSit(e, C);
  e.rideCar = null;
  if (ok) {
    const need = C.kind === 'truck' || C.kind === 'cata' ? 2 : 1;
    const live = C.kind === 'cata' ? cataLiving(C) : mechLiving(C);
    if (live >= need) { C.phase = 'go'; if (C.kind !== 'cata') C.docked = false; }
  }
  return !!ok;
}
function mechYield(e, dt) {
  if (!MECH.on || !isUp(e) || e.seated || e.perch || e.baseY > 1.5) return false;
  for (const C of mechVehicles().concat(MECH.catas)) {
    if (!C || C.wrecked || C.phase !== 'go') continue;
    const [lx, lz] = mechL(C, e.s.position.x, e.s.position.z);
    if (lz > 0.3 && lz < 4.4 && Math.abs(lx) < 1.7) {
      const [wx, wz] = mechW(C, lx >= 0 ? 2.8 : -2.8, Math.max(0.4, lz));
      steer(e, wx, wz, e.speed * 1.45, dt);
      e.state = 'approach';
      return true;
    }
  }
  return false;
}
function mechTakeCata(e, dt) {
  if (!MECH.on || !e || e.team !== 'blue' || !isUp(e) || e.seated || e.special || e.guard || e.perch || e.baseY > 1.2) return false;
  let K = e.cataGo;
  if (K && (K.wrecked || K.locked || (K.side === 'blue' && cataLiving(K) >= 2))) K = e.cataGo = null;
  if (!K) {
    if ((e.cataScan = (e.cataScan || 0) - dt) > 0) return false;
    e.cataScan = 0.45;
    let best = null, bd = 34;
    for (const O of MECH.catas) {
      if (O.locked || O.wrecked) continue;
      if (O.side === 'blue' && cataLiving(O) >= 2) continue;
      const d = Math.hypot(e.s.position.x - O.x, e.s.position.z - O.z);
      if (d < bd) { bd = d; best = O; }
    }
    K = e.cataGo = best;
  }
  if (!K) return false;
  const d = Math.hypot(e.s.position.x - K.x, e.s.position.z - K.z);
  if (d < 7.5 && K.side !== 'blue' && cataLiving(K, 'orange') > 0) return false;
  e.tgt = null;
  if (d > 1.7) { steer(e, K.x, K.z + 1.5, e.speed * 1.25, dt); e.state = 'approach'; return true; }
  if (cataSit(e, K)) { e.cataGo = null; return true; }
  return false;
}
function mechSiege() {
  const F = MECH.forts[0]; if (!F) return;
  const x = -20, z = F.z + 24, top = 4.1, parts = [], bs = [];
  const add = (a, b, c, d, e, f) => { parts.push(boxMesh(a, b, c, d, e, f, WOOD_D)); bs.push(boxes[boxes.length - 1]); };
  add(x - 1.55, x - 1.15, 0, top, z - 1.55, z - 1.15);
  add(x + 1.15, x + 1.55, 0, top, z - 1.55, z - 1.15);
  add(x - 1.55, x - 1.15, 0, top, z + 1.15, z + 1.55);
  add(x + 1.15, x + 1.55, 0, top, z + 1.15, z + 1.55);
  const floor = { x0: x - 1.7, x1: x + 1.7, z0: z - 1.7, z1: z + 1.7, y: top };
  floors.push(floor);
  parts.push(boxMesh(x - 1.7, x + 1.7, top, top + 0.16, z - 1.7, z + 1.7, WOOD_L, false));
  const L = { x0: x - 0.6, x1: x + 0.6, z0: z + 1.55, z1: z + 3.7, y0: 0, y1: top, dir: 1, zStand: z + 3.9, zTop: z + 0.2 };
  ladders.push(L);
  const vis = mechLadderVis(x, z + 3.3, z + 0.3, top);
  nobori(x - 2.4, z, '#d9741c', '#fff6e8', '井闌');
  MECH.siege = { x, z, hp: 14, parts, bs, floor, L, vis, dead: false };
}
function mechSiegeTick(dt) {
  const S = MECH.siege; if (!S || S.dead) return;
  let n = 0;
  for (const e of enemies) if (e.team === 'blue' && isUp(e) && !e.seated && e.baseY < 1.2 && Math.hypot(e.s.position.x - S.x, e.s.position.z - S.z) < 3.4) n++;
  if (Math.hypot(player.pos.x - S.x, player.pos.z - S.z) < 3.2 && player.pos.y < 1.2) n++;
  if (n) S.hp -= dt * Math.min(4, n) * 0.45;
  if (S.hp > 0) return;
  S.dead = true;
  for (const m of S.parts) m.visible = false;
  for (const b of S.bs) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); }
  const fi = floors.indexOf(S.floor); if (fi >= 0) floors.splice(fi, 1);
  const li = ladders.indexOf(S.L); if (li >= 0) ladders.splice(li, 1);
  if (S.vis && S.vis.parent) S.vis.parent.remove(S.vis);
  popup('井闌を倒した');
  MECH.log.push('siege');
}
function mechSiegeJob(e, dt) {
  const S = MECH.siege; if (!S || S.dead || !MECH.on || !e || e.team !== 'blue' || !isUp(e) || e.seated || e.special || e.guard || e.perch) return false;
  if (e.baseY > 2) return false;
  if ((e.id % 4) !== 0) return false;
  const zx = S.x, zz = S.L.zStand, d = Math.hypot(e.s.position.x - zx, e.s.position.z - zz);
  if (d > 20) return false;
  e.tgt = null;
  if (d > 0.85) { steer(e, zx, zz, e.speed * 1.2, dt); e.state = 'approach'; return true; }
  e.climbT = (e.climbT || 0) + dt;
  if (e.climbT > 0.7) {
    e.onFloor = S.floor; e.baseY = S.floor.y; e.passive = false;
    e.s.position.set(S.x, S.floor.y, S.z);
    e.climbT = 0; e.state = 'approach';
  }
  return true;
}
function mechMarch(e, dt) {
  if (!MECH.on || e.team !== 'blue' || e.seated || e.special || e.guard || e.perch || e.baseY > 1.2) return false;
  if (e.secretary || e.medic || e.aide || e.runner || e.fluter || e.ojou || e.sec2 || e.driver) return false;
  for (const o of enemies) if (o.team === 'orange' && isUp(o) && Math.hypot(o.s.position.x - e.s.position.x, o.s.position.z - e.s.position.z) < (mechShy(e) ? 12 : 16)) return false;
  for (const C of mechVehicles()) {
    if (C.wrecked || C.lame || C.side !== 'blue' || C.seats.every(Boolean)) continue;
    const need = C.kind === 'truck' ? 2 : 1;
    if (mechLiving(C) >= need && C.phase === 'go') continue;
    if (!(C.phase === 'wait' || C.phase === 'hold' || C.docked)) continue;
    if (Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z) < 8 && mechSit(e, C)) return true;
  }
  for (const K of MECH.catas) {
    if (K.locked || K.wrecked || cataLiving(K) >= 2) continue;
    if (cataLiving(K, K.side) > 0 && K.side !== 'blue') continue;
    if (Math.hypot(e.s.position.x - K.x, e.s.position.z - K.z) < 9 && cataSit(e, K)) return true;
  }
  const F = mechFort();
  if (!F || e.s.position.z < F.z + 16) return false;
  const lead = mechVehicles().filter(C => C.side === 'blue' && !C.wrecked).sort((a, b) => a.z - b.z)[0];
  steer(e, lead ? lead.x : 0, lead ? Math.min(e.s.position.z - 2, lead.z + 2.4) : F.z + 12, e.speed * 1.15, dt);
  e.tgt = null;
  return true;
}
function mechNudge() {
  for (const e of enemies) {
    if (!isUp(e) || e.seated || e.special || e.perch || e.passive || e.medic) continue;
    if (e.state !== 'idle' && e.state !== 'hide') continue;
    const far = mechShy(e) ? 16 : 34;
    let foe = null, bd = far;
    for (const o of enemies) {
      if (!isUp(o) || o.team === e.team) continue;
      const d = Math.hypot(o.s.position.x - e.s.position.x, o.s.position.z - e.s.position.z);
      if (d < bd) { bd = d; foe = o; }
    }
    if (!foe) continue;
    e.tgt = foe; e.tgtT = 1.4; e.state = e.kind === 'archer' ? 'advance' : 'approach';
  }
}
function mechTracer(a, b, color) {
  if (!MECH.tracers) MECH.tracers = [];
  let T = MECH.tracers.find(t => t.t >= 1);
  if (!T) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98, depthWrite: false });
    const geom = new THREE.BoxGeometry(0.09, 0.09, 1);
    geom.translate(0, 0, -0.5);
    const m = new THREE.Mesh(geom, mat); m.visible = false; m.frustumCulled = false; stageRoot.add(m);
    T = { m, t: 1, d: 0, a: new V3(), b: new V3() }; MECH.tracers.push(T);
  }
  T.m.material.color.setHex(color); T.t = 0; T.a.copy(a); T.b.copy(b); T.d = a.distanceTo(b); T.m.visible = true;
}
function updateMechTracers(dt) {
  if (!MECH.tracers) return;
  for (const T of MECH.tracers) {
    if (T.t >= 1) continue;
    T.t += dt * Math.min(9, 300 / Math.max(5, T.d));
    const k = Math.min(1, T.t), L = Math.min(2.6, T.d * 0.3), p = T.a.clone().lerp(T.b, k);
    T.m.position.copy(p); T.m.lookAt(T.b); T.m.rotateY(Math.PI); T.m.scale.set(1, 1, L); T.m.visible = k < 1;
  }
}
function updateMech(dt) {
  if (!MECH.on || state !== 'play') return;
  for (const C of mechVehicles()) mechDrive(C, dt);
  updateMechTracers(dt);
  // 平原の敵トーチカは浜と同様に短い連射を繰り返す。
  MECH.pbFireT = (MECH.pbFireT || 0) - dt;
  if (MECH.pbFireT <= 0) {
    MECH.pbFireT = 0.115;
    const F = mechFort();
    for (const P of (F ? F.pbs : [])) {
      if (P.dead) continue;
      let target = null, bd = 72;
      for (const e of enemies) {
        if (e.team !== 'blue' || !isUp(e) || e.seated || e.baseY > 3) continue;
        const d = Math.hypot(e.s.position.x - P.x, e.s.position.z - P.z);
        if (d < 8 || d > bd || e.s.position.z < P.z) continue;
        target = e; bd = d;
      }
      if (!target) continue;
      P.burst = (P.burst || 0) - 1;
      if (P.burst <= 0 && (P.nextFire || 0) > time) continue;
      if (P.burst <= 0) { P.burst = 7; P.nextFire = time + rand(1.5, 2.6); }
      const a = new V3(P.x, 1.42, P.z + 2.65), p = target.s.position;
      // 浜の戦いと同じ見える曳光弾を発射。命中判定とは独立して弾道を表示する。
      mechTracer(a, new V3(p.x, target.baseY + target.figH * 0.55, p.z), 0xffd36a);
      if (Math.random() < 0.18) {
        damageEnemy(target, 1, a, false, { pt: new V3(p.x, target.baseY + target.figH * 0.55, p.z), thrust: true }, { team: 'orange', state: 'idle', mg: true, s: { position: a } });
        if (Math.hypot(player.pos.x - P.x, player.pos.z - P.z) < 70 && Math.random() < 0.25) Sfx.mg && Sfx.mg(a);
      }
    }
  }
  // 味方機関銃車：第一波から前進し、射程内の敵へ連続射撃する。
  MECH.mgT = (MECH.mgT || 0) - dt;
  if (MECH.mgT <= 0) {
    MECH.mgT = 0.11;
    for (const C of MECH.trucks) {
      if (C.side !== 'blue' || C.wrecked || C.lame || mechLiving(C, 'blue') < 2) continue;
      let target = null, bd = 43;
      for (const e of enemies) {
        if (e.team !== 'orange' || !isUp(e) || e.seated || e.baseY > 3) continue;
        const d = Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z);
        if (d < bd) { bd = d; target = e; }
      }
      if (!target) continue;
      const a = new V3(C.x, 1.8, C.z - 1.0), p = target.s.position;
      const end = new V3(p.x, target.baseY + target.figH * 0.55, p.z);
      C.g.rotation.y = C.yaw;
      mechTracer(a, end, 0x8ee8ff);
      if (Math.random() < 0.22) damageEnemy(target, 1, a, false, { pt: end, thrust: true }, { team: 'blue', state: 'idle', mg: true, s: { position: a } });
      if (Math.random() < 0.18) { puff(a.clone().lerp(end, 0.12), 0xffd477, 2, 0.04, 0.45, 0.12); Sfx.mg && Sfx.mg(a); }
    }
  }
  for (const K of MECH.catas) cataDrive(K, dt);
  mechLob(dt); mechSteal(dt); mechRepairTick(dt); mechSiegeTick(dt); mechWin();
  MECH.nudge = (MECH.nudge || 0) - dt; if (MECH.nudge <= 0) { MECH.nudge = 0.8; mechNudge(); }
}
function mechCrew() {
  if (!MECH.on || MECH.crewed) return;
  MECH.crewed = true;
  for (const C of MECH.cars) {
    for (let i = 0; i < 3; i++) {
      const e = spawnEnemy(C.x, C.z, i === 2 ? 'archer' : 'mob', false, 'blue');
      if (e) mechSit(e, C);
    }
    if (mechLiving(C) >= 1) C.phase = 'go';
  }
  for (const C of MECH.trucks) {
    // 第一波から機関銃車を含む車両隊を出撃させる。機関銃車は乗員2名で稼働。
    for (let i = 0; i < 2; i++) {
      const e = spawnEnemy(C.x, C.z, 'mob', false, 'blue');
      if (e) mechSit(e, C);
    }
    if (mechLiving(C) >= 2) C.phase = 'go';
  }
  const F = mechFort(); if (F) mechGarrison(F);
  const talk = MECH.trucks[0] && MECH.trucks[0].seats.find(isUp);
  if (talk) mechSay(talk, 'go');
  popup('はしご車は2人で動かす。門にはしごがかかったら、渡って入れ');
}
function mechPark() {
  if (!MECH.on) return;
  for (const C of mechVehicles()) {
    C.seats = [null, null, null, null];
    C.x = C.home[0]; C.z = C.home[1]; C.yaw = Math.PI; C.v = 0;
    C.lame = false; C.wrecked = false; C.hp = C.hpMax; C.tires = [3, 3, 3, 3];
    C.phase = 'wait'; C.side = 'blue'; C.fixT = 0; C.wait = 0;
    mechLadderOff(C); C.docked = false;
    C.g.position.set(C.x, 0, C.z); C.g.rotation.y = C.yaw;
  }
  for (const K of MECH.catas) {
    K.seats = [null, null]; K.side = 'orange'; K.locked = K.fort > 0; K.t = 4; K.phase = 'hold';
    K.x = K.home[0]; K.z = K.home[1]; K.yaw = 0; K.v = 0; K.revT = 0; K.wrecked = false; K.hp = K.hpMax || 8;
    if (K.g) { K.g.position.set(K.x, 0, K.z); K.g.rotation.y = 0; }
  }
  for (const F of MECH.forts) {
    F.done = false; F.garrisoned = false;
    mechShutGate(F);
    for (const P of F.pbs) mechPbHeal(P);
    for (const T of F.towers) for (const q of T.perches) q.taken = null;
  }
  mechUseFort(0);
  MECH.won = false; MECH.crewed = false; MECH.hqT = 0; MECH.saidLad = false;
  if (MECH.forts[0]) { medPost.orange = [0.6, MECH.forts[0].z - 14, 0]; }
}
function mechReuse() {
  let filled = 0;
  for (const C of mechVehicles()) {
    if (C.wrecked || C.lame || C.docked) continue;
    const need = C.kind === 'truck' ? 2 : 1;
    for (const e of enemies) {
      if (filled > 10) break;
      if (!isUp(e) || e.seated || e.special || e.team !== 'blue' || e.perch || e.guard) continue;
      if (Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z) > 34) continue;
      if (C.seats.every(Boolean)) break;
      if (mechLiving(C) >= (C.kind === 'truck' ? 2 : 4)) break;
      if (mechSit(e, C)) { filled++; if (mechLiving(C) >= need) C.phase = 'go'; }
    }
  }
  MECH.log.push('reuse:' + mechVehicles().length);
}
function mechWave(n) {
  if (!MECH.on) return;
  if (n <= 1) { if (!MECH.crewed) mechCrew(); return; }
  mechReuse();
  const F = MECH.forts[Math.min(MECH.forts.length - 1, n - 1)];
  if (F && MECH.fi === n - 1 && !F.garrisoned) mechGarrison(F);
  popup(n >= 3 ? '第3波。敵が多い。トーチカは投石で崩せ' : '車は増やさない。奥の砦へ');
}
function mechFort() { return MECH.forts[MECH.fi] || null; }
function mechUseFort(i) {
  MECH.fi = i;
  const F = MECH.forts[i]; if (!F) return;
  MECH.gateZ = F.z; MECH.gate = F.gate; MECH.walk = F.walk; MECH.towers = F.towers; MECH.gateHW = F.hw || 5;
}
function mechShy(e) { return !!(e && e.prof && (e.prof.pers === '臆病' || e.prof.pers === '慎重')); }
function mechDoubleDoor(hw, z, h) {
  const leaves = [], doorBoxes = [];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw : 0, x1 = s < 0 ? 0 : hw;
    const m = boxMesh(x0 + 0.06, x1 - 0.06, 0, h, z - 0.16, z + 0.16, WOOD_D);
    leaves.push(m); doorBoxes.push(boxes[boxes.length - 1]);
  }
  return { z, hw, leaves, doorBoxes, open: false, hp: 9, hpMax: 9 };
}
function mechCataMake(x, z, locked, fi) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 1.6), WOOD_D); base.position.y = 0.55; g.add(base);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 3.4), WOOD); arm.position.set(0, 1.45, -0.2); arm.rotation.x = -0.45; g.add(arm);
  const cup = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), WOOD_L); cup.position.set(0, 2.2, 1.05); g.add(cup);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.7), WOOD_L); seat.position.set(0, 1.02, 0.55); g.add(seat);
  const wheelM = new THREE.MeshLambertMaterial({ color: 0x2a241c });
  for (const [wx, wz] of [[-1.05, 0.7], [1.05, 0.7], [-1.05, -0.7], [1.05, -0.7]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 10), wheelM);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w);
  }
  g.position.set(x, 0, z); stageRoot.add(g);
  const K = { x, z, yaw: 0, v: 0, phase: 'hold', t: 3 + MECH.catas.length * 1.4, g, side: 'orange', seats: [null, null], locked: !!locked, fort: fi, hp: 8, hpMax: 8, kind: 'cata', wrecked: false, home: [x, z] };
  MECH.catas.push(K);
  return K;
}
function mechMakeFort(i) {
  const zG = [-176, -258, -342][i], hw = 5, H = 3.5, depth = 34, zBack = zG - depth, bhw = 11;
  const berm = new THREE.Mesh(new THREE.BoxGeometry(80, 0.5, depth + 6), new THREE.MeshLambertMaterial({ color: i === 2 ? 0x7a6844 : 0x8a734c }));
  berm.position.set(0, 0.25, (zG + zBack) / 2); stageRoot.add(berm);
  mechSlitWall(-38, -hw, zG, H); mechSlitWall(hw, 38, zG, H);
  palisadeZ(zBack, zG, -38, H); palisadeZ(zBack, zG, 38, H);
  palisadeX(-38, -bhw, zBack, H); palisadeX(bhw, 38, zBack, H);
  const walk = { x0: -36, x1: 36, z0: zG - 3.15, z1: zG - 0.55, y: 2.55 };
  floors.push(walk);
  boxMesh(-36, -hw - 0.35, 2.32, 2.55, walk.z0, walk.z1, WOOD_L, false);
  boxMesh(hw + 0.35, 36, 2.32, 2.55, walk.z0, walk.z1, WOOD_L, false);
  const gate = mechDoubleDoor(hw, zG, 3.15);
  const back = mechDoubleDoor(bhw, zBack, 3.05);
  const towers = [];
  for (const x of [-22, 22]) {
    const n0 = perches.length;
    yagura(x, zG - 18, 5.5);
    towers.push({ x, z: zG - 18, perches: perches.slice(n0) });
  }
  nobori(-20, zG - 8, '#d9741c', '#fff6e8', '橙組');
  nobori(20, zG - 8, '#d9741c', '#fff6e8', ['一の砦', '二の砦', '三の砦'][i]);
  const catas = [-16, 16].map(x => mechCataMake(x, zG - 12, i > 0, i));
  const pbs = [-22, 22].map(x => mechPb(x, zG + 16));
  return { i, z: zG, name: ['一の砦', '二の砦', '三の砦'][i], hw, walk, gate, back, towers, catas, pbs, done: false, garrisoned: false, med: [0.6, zG - 14] };
}
function mechPb(x, z) {
  const W = 4.8, D = 3.6, H = 2.3, mat = new THREE.MeshLambertMaterial({ color: 0xb7b2a8 }), dark = new THREE.MeshLambertMaterial({ color: 0x5e5a55 });
  const x0 = x - W / 2, x1 = x + W / 2, z0 = z - D / 2, z1 = z + D / 2, parts = [], bs = [];
  const add = (a, b, c, d, e, f, m) => { parts.push(boxMesh(a, b, c, d, e, f, m)); bs.push(boxes[boxes.length - 1]); };
  add(x0, x1, 0, 1.05, z1 - 0.38, z1, mat);
  add(x0, x1, 1.65, H, z1 - 0.38, z1, mat);
  add(x0, x0 + 0.42, 0, H, z0, z1, mat);
  add(x1 - 0.42, x1, 0, H, z0, z1, mat);
  add(x0, x1, H - 0.22, H, z0, z1, dark);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshBasicMaterial({ color: 0x1a140e }));
  slit.position.set(x, 1.35, z1 + 0.02); stageRoot.add(slit); parts.push(slit);
  // 銃眼から突き出す機関銃本体と銃身を明示的に配置。
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x292d31 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.48), gunMat);
  receiver.position.set(x, 1.42, z1 + 0.18); stageRoot.add(receiver); parts.push(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.35, 10), gunMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(x, 1.42, z1 + 0.92); stageRoot.add(barrel); parts.push(barrel);
  return { x, z, hp: 9, max: 9, dead: false, parts, bs, gun: null };
}
function mechPbKill(P) {
  if (!P || P.dead) return;
  P.dead = true; P.hp = 0;
  for (const b of P.bs) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); }
  for (const m of P.parts) m.visible = false;
  if (P.gun && isUp(P.gun)) damageEnemy(P.gun, 99, new V3(P.x, 1, P.z + 1), false, null, 'player');
  popup('投石でトーチカが崩れた');
  MECH.log.push('pb');
}
function mechPbHeal(P) {
  if (!P) return;
  P.hp = P.max;
  if (!P.dead) return;
  P.dead = false;
  for (const b of P.bs) if (b && !boxes.includes(b)) boxes.push(b);
  for (const m of P.parts) m.visible = true;
}
function cataLiving(K, team) { let n = 0; for (const o of K.seats) if (o && isUp(o) && (!team || o.team === team)) n++; return n; }
function cataPut(K) {
  const yaw = K.yaw || 0;
  for (let s = 0; s < K.seats.length; s++) {
    const o = K.seats[s]; if (!o) continue;
    if (!enemies.includes(o) && !bodies.includes(o)) { K.seats[s] = null; continue; }
    const [x, z] = mechW(K, s ? 0.62 : -0.62, 0.45);
    o.s.position.set(x, 1.12, z); o.baseY = 1.12;
    if (o.seated) { o.seated.x = x; o.seated.z = z; }
    if (isUp(o)) o.s.rotation.y = yaw;
  }
}
function cataSit(e, K) {
  if (!e || !K || !isUp(e) || K.locked || K.wrecked) return false;
  if (e.team !== K.side && cataLiving(K, K.side) > 0) return false;
  let slot = K.seats.findIndex(s => !s);
  const other = e.team !== K.side, body = K.seats.some(o => o && !isUp(o));
  if (slot < 0) {
    if (!(other && cataLiving(K) === 0 && body)) return false;
    keiBloodSay(e); vehDumpBodies(K);
    slot = K.seats.findIndex(s => !s);
    if (slot < 0) return false;
  }
  const [x, z] = mechW(K, slot ? 0.62 : -0.62, 0.45);
  K.seats[slot] = e;
  e.seated = { x, z, car: true, kei: K }; e.baseY = 1.12; e.s.position.set(x, 1.12, z);
  e.state = 'idle'; e.passive = true; e.tgt = null; e.keiSlot = slot;
  if (other) { K.side = e.team; K.phase = 'go'; mechSay(e, 'cata'); MECH.log.push('cata:' + e.team); }
  if (body) { keiBloodSay(e); vehDumpBodies(K); }
  return true;
}
function cataDrive(K, dt) {
  if (!K || K.wrecked || K.locked) { if (K) cataPut(K); return; }
  mechStill(K, dt);
  if (cataLiving(K) < (K.solo ? 1 : 2)) { K.v = 0; cataPut(K); return; }
  const own = MECH.forts[K.fort];
  if (K.side !== 'blue' && own && !own.done) {
    K.yaw = mechWrap((K.yaw || 0) + clamp(mechWrap(0 - (K.yaw || 0)), -1.2 * dt, 1.2 * dt));
    K.v = 0;
  } else {
    const mouth = mechGateMouth(K);
    let gx = K.x, gz = K.z;
    if (mouth) { gx = mouth.x; gz = mouth.z; }
    else if (K.side !== 'blue') { gx = 0; gz = 22; }
    else {
      const F = mechFort();
      if (F && F.gate && !F.gate.open) { gx = clamp(K.home ? K.home[0] * 0.2 : 0, -8, 8); gz = F.z + 16; }
      else if (F) { gx = 0; gz = F.z - 14; }
    }
    mechSeek(K, gx, gz, dt, 2.4);
  }
  K.g.position.set(K.x, 0, K.z); K.g.rotation.y = K.yaw || 0;
  cataPut(K);
}
function cataAim(K) {
  const mine = K.side || 'orange', foe = mine === 'orange' ? 'blue' : 'orange';
  if (mine === 'blue') {
    const F = mechFort();
    if (F && F.gate && !F.gate.open) return { x: 0, z: F.gate.z, what: 'gate', ref: F.gate };
    for (const P of (F ? F.pbs : [])) if (!P.dead) return { x: P.x, z: P.z, what: 'pb', ref: P };
  }
  let best = null, bd = 90;
  for (const C of mechVehicles()) {
    if (C.wrecked || C.side === mine) continue;
    const d = Math.hypot(C.x - K.x, C.z - K.z) + (C.kind === 'truck' ? -10 : 0);
    if (d < bd) { bd = d; best = { x: C.x, z: C.z, what: 'veh', ref: C }; }
  }
  if (best) return best;
  let pe = null, pd = 64;
  for (const e of enemies) {
    if (!isUp(e) || e.team !== foe) continue;
    const d = Math.hypot(e.s.position.x - K.x, e.s.position.z - K.z);
    if (d < pd) { pd = d; pe = e; }
  }
  if (pe) return { x: pe.s.position.x, z: pe.s.position.z, what: 'man', ref: pe };
  if (mine === 'orange' && Math.hypot(player.pos.x - K.x, player.pos.z - K.z) < 60) return { x: player.pos.x, z: player.pos.z, what: 'player' };
  return null;
}
function mechLadderVis(x, zFoot, zTop, yTop) {
  const g = new THREE.Group(), n = 16;
  for (let i = 0; i <= n; i++) {
    const k = i / n, z = zFoot + (zTop - zFoot) * k, y = 0.5 + (yTop - 0.1) * k;
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.14), WOOD_L);
    rung.position.set(x, y, z); g.add(rung);
    for (const sx of [-0.44, 0.44]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.46), WOOD_D);
      rail.position.set(x + sx, y + 0.16, z); g.add(rail);
    }
  }
  stageRoot.add(g);
  return g;
}
function mechLadderOff(C) {
  if (!C) return;
  if (C.lad) {
    const i = ladders.indexOf(C.lad); if (i >= 0) ladders.splice(i, 1);
    if (C.lad.vis && C.lad.vis.parent) C.lad.vis.parent.remove(C.lad.vis);
  }
  C.lad = null; C.ladBase = null; C.docked = false;
}
function mechGarrison(F) {
  if (!F || F.garrisoned) return;
  F.garrisoned = true;
  const nArch = F.pbs.length ? 4 : 3;
  for (const T of F.towers) for (const q of T.perches.slice(0, nArch)) {
    if (q.taken && isUp(q.taken)) continue;
    spawnEnemy(q.x, q.z, 'archer', false, 'orange', { y: q.y, perch: q });
  }
  for (const K of F.catas) {
    K.locked = false;
    for (let s = 0; s < 2; s++) {
      if (K.seats[s] && isUp(K.seats[s])) continue;
      const e = spawnEnemy(K.x + (s ? 0.5 : -0.5), K.z, 'mob', false, 'orange');
      if (e) cataSit(e, K);
    }
  }
  for (const P of F.pbs) {
    const e = spawnEnemy(P.x, P.z - 0.3, 'archer', false, 'orange');
    if (e) { e.gunner = true; P.gun = e; }
  }
}
function mechInside(F, x, z, y) { return !!F && z < F.z - 0.35 && z > F.z - 32 && Math.abs(x) < 36 && (y == null || y < 8); }
function mechBreach() {
  const F = mechFort();
  if (!F || !F.gate || F.gate.open) return;
  const girl = enemies.some(e => e.team === 'blue' && isUp(e) && !e.seated && !e.guard && mechInside(F, e.s.position.x, e.s.position.z, e.baseY));
  if (girl || mechInside(F, player.pos.x, player.pos.z, player.pos.y)) {
    mechOpenGate(F); MECH.log.push('breach'); popup('侍女が砦に入った。門を開ける');
  }
}
function mechFortDown(F) {
  const towers = F.towers.length && F.towers.every(T => !T.perches.some(q => q.taken && isUp(q.taken)));
  const pb = F.pbs.every(P => P.dead);
  const inside = enemies.some(e => e.team === 'blue' && isUp(e) && !e.seated && (e.baseY > 2 && e.s.position.z < F.z + 2 || mechInside(F, e.s.position.x, e.s.position.z, e.baseY)))
    || mechInside(F, player.pos.x, player.pos.z, player.pos.y);
  return !!(towers && inside && (!F.pbs.length || pb));
}
function mechMedMove(F) {
  if (!F) return;
  const x = F.med[0], z = F.med[1];
  medPost.orange = [x, z, 0];
  for (const m of medics.orange) if (m.e && isUp(m.e)) { m.e.s.position.set(x + rand(-0.7, 0.7), 0, z); m.e.baseY = 0; m.e.home = [x, z]; }
}
function mechCapture() {
  const F = mechFort();
  if (!F || F.done || MECH.won || !mechFortDown(F)) return;
  F.done = true; mechOpenGate(F);
  if (MECH.fi >= MECH.forts.length - 1) {
    MECH.won = true; showBanner('三つの砦を落とした', 'トーチカも投石で崩した'); gameOver(true); return;
  }
  const prev = MECH.fi;
  for (const C of mechVehicles()) {
    if (C.kind === 'truck') mechLadderOff(C);
    if (!C.wrecked && !C.lame && mechLiving(C) >= (C.kind === 'truck' ? 2 : 1)) C.phase = 'go';
  }
  MECH.saidLad = false;
  MECH.rally = MECH.forts[prev];
  mechUseFort(prev + 1);
  const N = mechFort();
  if (N) { mechGarrison(N); mechMedMove(N); }
  for (let i = 0; i < (MECH.fi >= 2 ? 36 : 24); i++) spawnAlly();
  mechReuse();
  wave.n = MECH.fi + 1;
  wave.toSpawn = MECH.fi >= 2 ? 56 : 32;
  wave.blueToSpawn = MECH.fi >= 2 ? 42 : 30;
  wave.blueOwed = wave.blueToSpawn;
  wave.maxAlive = MECH.fi >= 2 ? 120 : 90;
  wave.blueMax = wave.blueToSpawn + 16;
  wave.spawnT = 0.6; wave.inter = 0;
  showBanner(prev === 0 ? '一の砦を落とした' : '二の砦を落とした', MECH.fi >= 2 ? '三の砦。敵が多い。トーチカは投石で崩せ' : '奥の砦へ。車は増やさない。援軍が来る');
  const who = enemies.find(e => e.team === 'blue' && isUp(e) && !e.special);
  if (who) mechSay(who, 'next');
  MECH.log.push('cap:' + MECH.fi);
}
function mechHqTick() {
  if (!hq || MECH.won || state !== 'play') return;
  let inn = 0, defs = 0;
  for (const e of enemies) {
    if (!isUp(e)) continue;
    if (e.team === 'orange' && e.s.position.x > hq.x0 && e.s.position.x < hq.x1 && e.s.position.z > hq.z0 && e.s.position.z < hq.z1) inn++;
    if (e.team === 'blue' && Math.hypot(e.s.position.x - (hq.sx || 0), e.s.position.z - (hq.sz || 28)) < 12) defs++;
  }
  if (inn >= 3 && defs === 0 && !inHQ()) {
    if (!MECH.hqAt) MECH.hqAt = time;
    if (time - MECH.hqAt > 8) { showBanner('本陣が落ちた', '橙組が陣を取った'); gameOver(false); }
  } else MECH.hqAt = 0;
}
function toggleGod() {
  if (!BEACH.on || state !== 'play') return;
  player.god = !player.god;
  popup(player.god ? '無敵' : '無敵を解除した');
  const b = $('bGod'); if (b) { b.textContent = player.god ? '無敵解除' : '無敵'; b.classList.toggle('on', !!player.god); }
}
function lordSecTalk() {
  const e = sec.e;
  if (!e || !isUp(e) || state !== 'play') return;
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
  if (d > 22) return;
  const hp = e.hp / (e.hpMax || 8);
  if (hp > 0.55) e.lordOk = false;
  if (hp <= 0.35 && !e.lordOk) {
    e.lordOk = true;
    Voice.say('大丈夫？', { pitch: 0.8, rate: 0.95 }, 1);
    subtitle('大丈夫？');
    const el = $('subtitle'); if (el) el.textContent = '殿「大丈夫？」';
    MECH.log.push('lord:ok');
  }
  const n = e.stuck ? e.stuck.length : 0;
  if (n < 3) e.lordHari = false;
  if (n >= 4 && !e.lordHari) {
    e.lordHari = true;
    Voice.say('ハリネズミみたいだね', { pitch: 0.82, rate: 0.98 }, 1);
    subtitle('ハリネズミみたいだね');
    const el = $('subtitle'); if (el) el.textContent = '殿「ハリネズミみたいだね」';
    MECH.log.push('lord:hari');
  }
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
  (atkMode ? nobori(cx + S - 0.3, cz + S - 0.3, '#d9741c', '#fff6e8', '橙組') : nobori(cx + S - 0.3, cz + S - 0.3, '#1f5fb8', '#f4f1e8', '青組')).position.y = Y;
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
    if (solid) lb.push({ l: { x0, x1, z0, z1, y0, y1 }, w: { x0, x1, z0, z1, y0, y1, slumpSpot: y1 - y0 >= 0.75 && y1 - y0 <= 1.3 } });   // 井闌の胸壁：手すりに崩れる場所
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
  const nb = atkMode ? nobori(0, 0, '#1f5fb8', '#f4f1e8', '井闌') : nobori(0, 0, '#d9741c', '#fff6e8', '井闌'); stageRoot.remove(nb); grp.add(nb); nb.position.set(-S + 0.1, Y + 0.5, -S + 0.1); nb.rotation.y = 0;
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
      const e = spawnEnemy(q.x, q.z, 'archer', false, ATK(), { y: q.y, perch: q });
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
function bamboobundle(x, z, ang, opt) {
  opt = opt || {};
  const y = opt.y || 0;
  const g = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(bundleGeo, bundleMat);
    c.position.set(-0.75 + i * 0.115 + rand(-0.02, 0.02), 0.8, rand(-0.05, 0.05)); c.scale.y = rand(0.92, 1.05); g.add(c);
  }
  for (const yy of [0.45, 1.15]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.16), ropeMat); r.position.y = yy; g.add(r); }
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), WOOD_D); s.position.set(0, 0.7, 0.6); s.rotation.x = -0.6; g.add(s);
  g.rotation.set(-0.12, ang, 0); g.position.set(x, y, z); stageRoot.add(g);
  const cv = { x, z, y, r: 0.85, type: 'bundle', h: opt.h || (y + 1.45), ang, mesh: g, breakable: true, hp: opt.hp || 3, mtn: !!opt.mtn, side: opt.side || null };
  covers.push(cv);
  if (!opt.noCol) colliders.push({ x, z, r: 0.6 });
  return cv;
}
function breakBundle(cv, mode) {
  if (!cv || cv.broken) return;
  cv.broken = true;
  if (cv.mesh) { stageRoot.remove(cv.mesh); cv.mesh = null; }
  const ci = covers.indexOf(cv); if (ci >= 0) covers.splice(ci, 1);
  for (let i = colliders.length - 1; i >= 0 && !cv.beach; i--) {
    const c = colliders[i];
    if (Math.hypot(c.x - cv.x, c.z - cv.z) < 0.25) colliders.splice(i, 1);
  }
  for (const e of enemies) {
    if (e.cover === cv) { e.cover = null; if (e.state === 'hide' || e.state === 'tocover' || e.state === 'return') e.state = e.kind === 'archer' ? 'advance' : 'approach'; }
    if (e.mtnBundle === cv) { e.mtnBundle = null; e.bundleBear = false; e.crouch = 0; }
    if (e.beachBundle === cv) e.beachBundle = null;
  }
  if (mode === 'stow') return;
  puff(new V3(cv.x, (cv.y || 0) + 0.8, cv.z), 0xc5d6a4, mode === 'quiet' ? 6 : 14, 0.35, 2.2, 0.7);
  if (cv.beach) { if (!BEACH.bundleSaid) { BEACH.bundleSaid = true; popup('竹束が銃弾で壊れた'); } }
  else if (mode !== 'quiet') popup('竹束が壊れた');
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
  if (!FORT.atk) {
    buildHQ(-6, 6, 26, 38, 0, 35);
    buildMedPost(3.6, 33.5, 'blue'); buildMedPost(0, -86, 'orange');
    for (let i = -2; i <= 2; i++) nobori(i * 3, 22, '#1f5fb8', '#f4f1e8', i % 2 ? '青組' : '必勝');
  } else {   // v9 攻める：殿の本陣は門の外（竹束の列の後ろ）の陣幕。砦の中は橙組の陣
    maku(-4, -76, 4, 0); maku(4, -76, 4, 0); maku(-6, -82, 12, Math.PI / 2); maku(6, -82, 12, Math.PI / 2); maku(0, -88, 12, 0);
    buildHQ(-6, 6, -88, -76, 0, -85);
    buildMedPost(8.5, -82, 'blue'); buildMedPost(3.6, 33.5, 'orange');
    for (let i = -2; i <= 2; i++) nobori(i * 3, -73.5, '#1f5fb8', '#f4f1e8', i % 2 ? '青組' : '必勝');
    for (let i = -2; i <= 2; i++) nobori(i * 3, 22, '#d9741c', '#fff6e8', i % 2 ? '橙組' : '本陣');
  }
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
  for (let i = 0; i < 10; i++) { const x = rand(-45, 45), z = rand(-95, -80); if (FORT.atk && Math.abs(x) < 9 && z > -91) continue; if (FORT.atk) nobori(x, z, '#1f5fb8', '#f4f1e8', pick(['青組', '必勝', '勝鬨', '一番'])); else nobori(x, z, '#d9741c', '#fff6e8', pick(['橙組', '必勝', '勝鬨', '一番'])); }
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
  if (e.seated) { e.slump = { side: Math.random() < 0.5 ? -1 : 1, fwd: -rand(0.06, 0.14) }; e.seated = null; return; }   // 背もたれへ沈む
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
    { x0: -3, x1: 3, z0: PL.zTail - 1, z1: PL.zNose + 1, y0: 2.34, y1: 5, ceil: true });   // 天井：矢だけを止める（横への押し出しには使わない）
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
  e.tgt = null; e.state = 'idle'; e.t += dt; e.faceWant = e.seated.kei && e.seated.kei.yaw != null ? e.seated.kei.yaw : e.seated.car ? CAR.yaw : e.seated.boat ? e.seated.boat.yaw : 0; e.passive = true;
  if (e.standAt != null && time >= e.standAt) standUp(e);
}
function standUp(e) {
  if (!e.seated) return;
  if (e.seated.seat && e.seated.seat.taken === e) e.seated.seat.taken = null;
  if (e.seated.kei) { const C = e.seated.kei, i = C.seats.indexOf(e); if (i >= 0) C.seats[i] = null; }
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
  { const g = menuOpen ? menuGirl() : null; if (menuOpen) closeSecMenu(false); for (const o of [g, sec.caWho, sec.e, sec2.e, ojou.e]) if (o && Talk.speaking(o)) Talk.hush(o); sec.caWho = null; }   // 奇襲：話の途中でも打ち切る
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
  const pl = name === 'plane', sn = name === 'snow', mt = name === 'mtn', tf = name === 'twofront', ap = name === 'airport', tr = name === 'trench', nr = name === 'nightRaid', isl = name === 'island';
  document.documentElement.classList.toggle('trench', tr);
  AIRPORT.on = ap; TRENCH.on = tr; ISLAND.on = isl;
  document.documentElement.classList.toggle('snow', sn);
  document.documentElement.classList.toggle('mtn', mt);
  CASTLE.on = name === 'castle'; BEACH.on = name === 'beach';
  PLANE.on = pl; document.documentElement.classList.toggle('plane', pl);   // 機内だけのメニュー項目
  ground.visible = !pl && name !== 'beach' && !sn && !mt && !tr && !nr && !isl; sky.visible = !pl && !nr; for (const m of mountains) m.visible = !pl && !mt && !nr;
  scene.fog.near = pl ? 200 : nr ? 9 : sn ? 8 : mt ? 22 : isl ? 28 : tf ? 48 : LOOK0.fogN; scene.fog.far = pl ? 600 : nr ? 105 : sn ? (SNOW.blizzard ? 32 : 95) : mt ? 150 : isl ? 220 : tf ? 340 : LOOK0.fogF;
  scene.background.setHex(pl ? 0x1a1a1e : nr ? 0x071020 : sn ? 0xc5d6e6 : mt ? 0x9bb7c9 : ap ? 0x9ab9d2 : isl ? 0x93b9c7 : tr ? 0x9b8c70 : LOOK0.bg);
  hemiL.color.setHex(pl ? 0xfff2df : nr ? 0x53698e : sn ? 0xe8f4ff : mt ? 0xe7f0e4 : ap ? 0xddeaff : isl ? 0xe3f2e7 : tr ? 0xe6d9bd : LOOK0.hemi[0]); hemiL.groundColor.setHex(pl ? 0x6a5a4a : nr ? 0x151b26 : sn ? 0x8196aa : mt ? 0x6a6248 : ap ? 0x68756c : isl ? 0x4d5e35 : tr ? 0x5b4c39 : LOOK0.hemi[1]); hemiL.intensity = pl ? 1.25 : nr ? 0.38 : sn ? 1.35 : mt ? 1.15 : ap ? 1.1 : isl ? 1.45 : tr ? 1.08 : LOOK0.hemi[2];
  ambL.intensity = pl ? 0.95 : nr ? 0.22 : sn ? 0.9 : mt ? 0.72 : ap ? 0.9 : isl ? 0.95 : tr ? 0.82 : LOOK0.amb; sun.intensity = pl ? 0.9 : nr ? 0.12 : sn ? 1.0 : mt ? 1.15 : ap ? 1.05 : isl ? 1.25 : tr ? 0.88 : LOOK0.sun;
  SUN_DIR.copy(pl ? new V3(0.12, 1, 0.08).normalize() : SUN_DIR0);
}
// ====================================================================
//  ステージ「城の戦い」（v7）：青組が城を守り、橙組が攻める。三つの区域が順に開く
//   ① 大手門（z=0 の塀と櫓門）：閉じた門を破門隊の丸太（と近接兵）が打ち破る。味方の弓兵は塀の狭間と櫓門の上から射る
//   ② 二の丸（z 0〜40 の中庭）：門が破れると戦いは中へ。中央の旗の周りを橙組が押さえると（または守り手がほぼ倒れると）次へ
//   ③ 城内（奥御殿：畳の間と襖。いちばん奥が殿の本陣）：隠し落とし穴と、襖の陰の伏兵
// ====================================================================
const CS = { WX: 34, WZ1: 75, IZ: 40, BX: 8.1, BZ0: 44, BZ1: 67.4, ZA: 49.4, ZB: 54.8, ZC: 60.2, XC: 2.7, CAP: [0, 31], GATE_MAX: 170, RAM_GOAL: -2.3 };
const CD = () => CASTLE.atk ? 'orange' : 'blue', CA = () => CASTLE.atk ? 'blue' : 'orange';   // 城：守り手・攻め手の組（攻める：青組が攻め手）
const CASTLE = { atk: false, on: false, phase: 0, gateHP: 0, cap: 0, doors: [], pits: [], amb: [], portals: [], next: null, ram: null, gate: null, capT: 0, banner: '', shift: 0 };
let CSM = null;
function castleMats() {
  if (CSM) return CSM;
  const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  const stone = canvasTex(256, 256, (g, w, h) => {   // 石垣：大きさの違う石の積み
    g.fillStyle = '#7d7a72'; g.fillRect(0, 0, w, h);
    for (let y = 0, r = 0; y < h; r++) { const rh = rand(22, 38); for (let x = -rand(0, 40); x < w; ) { const rw = rand(30, 64), l = rand(-22, 18);
      g.fillStyle = `rgb(${128 + l | 0},${124 + l | 0},${114 + l | 0})`; g.fillRect(x + 2, y + 2, rw - 4, rh - 4);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 3, y + 3, rw - 8, 3); x += rw; } y += rh; }
  }, 1);
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  const plaster = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#efece3'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(150,140,120,${rand(0.02, 0.07)})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 1);
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  const tile = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#3e4349'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = '#2c3035'; g.fillRect(x, 0, 2, h); g.fillStyle = '#4c5258'; g.fillRect(x + 3, 0, 2, h); } }, 1);
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  // 畳：い草の目（長辺に沿う）と、長辺の黒い縁（へり）
  const tatami = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#c9c08a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(${rand(90, 130) | 0},${rand(100, 130) | 0},50,${rand(0.12, 0.22)})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(255,250,210,.12)'; g.fillRect(Math.random() * w, Math.random() * h, rand(3, 10), 1); }
    g.fillStyle = '#1c1a1a'; g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
    g.fillStyle = 'rgba(80,70,60,.5)'; g.fillRect(9, 0, 1, h); g.fillRect(w - 10, 0, 1, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
  });
  // 襖：白い紙、黒い縁、小さな黒い楕円の引手
  const fusuma = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(190,180,160,${rand(0.04, 0.1)})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, rand(1, 3), 0, 7); g.fill(); }
    g.strokeStyle = '#171515'; g.lineWidth = 7; g.strokeRect(3.5, 3.5, w - 7, h - 7);
    for (const x of [16, w - 16]) { g.fillStyle = '#141212'; g.beginPath(); g.ellipse(x, h * 0.5, 5, 9, 0, 0, 7); g.fill(); g.fillStyle = '#5a4a32'; g.beginPath(); g.ellipse(x, h * 0.5, 3, 6, 0, 0, 7); g.fill(); }
  });
  // 欄間：黒っぽい格子（すき間は透ける）
  const ranma = canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#2a1d14';
    g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    for (let x = 6; x < w; x += 14) g.fillRect(x, 0, 3, h);
    for (let y = 6; y < h; y += 14) g.fillRect(0, y, w, 3);
  });
  ranma.wrapS = THREE.RepeatWrapping;
  const planks = canvasTex(128, 128, (g, w, h) => { for (let x = 0; x < w; x += 16) { const l = rand(-12, 12); g.fillStyle = `rgb(${196 + l | 0},${170 + l | 0},${128 + l | 0})`; g.fillRect(x, 0, 16, h); g.fillStyle = 'rgba(70,45,20,.35)'; g.fillRect(x, 0, 1, h); } }, 1);
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  const gravel = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#b9b3a3'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const l = rand(-35, 25); g.fillStyle = `rgb(${185 + l | 0},${179 + l | 0},${163 + l | 0})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 24);
  const door = canvasTex(128, 256, (g, w, h) => {   // 大手門の扉：縦板と鉄の帯・鋲
    for (let x = 0; x < w; x += 16) { const l = rand(-10, 10); g.fillStyle = `rgb(${92 + l | 0},${64 + l | 0},${40 + l | 0})`; g.fillRect(x, 0, 16, h); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, 0, 1, h); }
    for (const y of [24, 96, 160, 232]) { g.fillStyle = '#26262a'; g.fillRect(0, y, w, 12); g.fillStyle = '#55555c'; for (let x = 8; x < w; x += 18) { g.beginPath(); g.arc(x, y + 6, 3, 0, 7); g.fill(); } }
  });
  CSM = { L, stone: L(0xffffff, { map: stone }), plaster: L(0xffffff, { map: plaster }), tile: L(0xffffff, { map: tile }), darkWood: L(0x3a2618), wood: L(0x6b4a2c), woodL: L(0x9a7650),
    tatami: L(0xffffff, { map: tatami }), fusuma: L(0xffffff, { map: fusuma }), ranma: new THREE.MeshLambertMaterial({ map: ranma, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide }),
    ceil: L(0xffffff, { map: planks, side: THREE.DoubleSide }), gravel: L(0xffffff, { map: gravel }), door: L(0xffffff, { map: door }), black: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    iron: L(0x2a2a2e), hole: new THREE.MeshBasicMaterial({ color: 0x020202 }), path: L(0xa39a85), straw: L(0xc7aa62), lantern: L(0x8f8c84) };
  return CSM;
}
// 土塀（漆喰、石の腰、瓦の笠木）。x 方向（z 固定）か z 方向（x 固定）。slits：狭間の位置（x）
function castleWall(B, a0, a1, c, alongX, H, slits) {
  const t = 0.3, M = castleMats();
  const box = (u0, u1, y0, y1, v0, v1, b) => alongX ? b.add(u0, u1, y0, y1, c + v0, c + v1, false, 0.5) : b.add(c + v0, c + v1, y0, y1, u0, u1, false, 0.5);
  box(a0, a1, 0, 1.0, -t - 0.08, t + 0.08, B.stone);
  box(a0, a1, 1.0, H, -t, t, B.plaster);
  box(a0, a1, H, H + 0.12, -t - 0.25, t + 0.25, B.tile);
  box(a0, a1, H + 0.12, H + 0.32, -0.12, 0.12, B.tile);
  const bx = alongX ? { x0: a0, x1: a1, z0: c - t - 0.08, z1: c + t + 0.08, y0: 0, y1: H + 0.3 } : { x0: c - t - 0.08, x1: c + t + 0.08, z0: a0, z1: a1, y0: 0, y1: H + 0.3 };
  if (slits && slits.length) { bx.slits = slits; bx.sy0 = 1.05; bx.sy1 = 1.85; }
  boxes.push(bx);
  return bx;
}
// 寄棟の屋根（箱の上に四角錐をつぶして載せる）
function hipRoof(x0, x1, z0, z1, y, h, mat) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat); m.scale.set(x1 - x0, h, z1 - z0); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); stageRoot.add(m);
  return m;
}
function buildCastle() {
  CASTLE.shift = 0;
  const M = castleMats();
  const B = { stone: boxBatch(M.stone), plaster: boxBatch(M.plaster), tile: boxBatch(M.tile), dark: boxBatch(M.darkWood), wood: boxBatch(M.wood), woodL: boxBatch(M.woodL), black: boxBatch(M.black) };
  CASTLE.doors = []; CASTLE.pits = []; CASTLE.amb = []; CASTLE.portals = [];
  // ---- 地面：二の丸の砂利・城内の土、外の石の道 ----
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(CS.WX * 2, CS.WZ1), M.gravel); gr.rotation.x = -Math.PI / 2; gr.position.set(0, 0.02, CS.WZ1 / 2); stageRoot.add(gr);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(6, 70), M.path); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.025, -35); stageRoot.add(path);
  // ---- 外郭の塀（前・左右・後ろ）と狭間 ----
  const H = 3.3, slitX = [6, 8.6, 11.2, 13.8, 16.6, 19.6, 23, 27];
  const allSlits = [...slitX, ...slitX.map(x => -x)];
  castleWall(B, -CS.WX, -4.6, 0, true, H, allSlits.filter(x => x < 0));
  castleWall(B, 4.6, CS.WX, 0, true, H, allSlits.filter(x => x > 0));
  castleWall(B, 0, CS.WZ1, -CS.WX, false, H); castleWall(B, 0, CS.WZ1, CS.WX, false, H);
  castleWall(B, -CS.WX, CS.WX, CS.WZ1, true, H);
  const slitBoxes = [];
  for (const x of allSlits) for (const z of [-0.39, 0.39]) slitBoxes.push([x - 0.09, x + 0.09, 1.15, 1.75, z - 0.01, z + 0.01]);
  instBoxes(M.black, slitBoxes);
  for (const x of allSlits) perches.push({ x, z: 0.85, y: 0, taken: null, slit: true });
  // ---- 櫓門（大手門）：柱・扉・上の櫓（前に胸壁、弓兵 4 人）・屋根・梯子 ----
  const GH = 4.0, FY = 4.35;
  for (const s of [-1, 1]) {
    B.dark.add(s > 0 ? 2.6 : -4.6, s > 0 ? 4.6 : -2.6, 0, FY - 0.2, -0.5, 0.5, true);   // 門柱と脇の壁（太い）
  }
  B.stone.add(-4.8, -2.6, 0, 1.0, -0.6, 0.6, false, 0.5); B.stone.add(2.6, 4.8, 0, 1.0, -0.6, 0.6, false, 0.5);
  B.dark.add(-4.8, 4.8, FY - 0.25, FY, -0.95, 1.75);                     // 櫓の床梁
  floors.push({ x0: -4.6, x1: 4.6, z0: -0.9, z1: 1.7, y: FY });
  B.plaster.add(-4.8, 4.8, FY, FY + 1.0, -0.95, -0.8, true); boxes[boxes.length - 1].rail = boxes[boxes.length - 1].slumpSpot = true;   // 前の胸壁（弓兵が上半身を出す）
  B.plaster.add(-4.8, -4.6, FY, FY + 2.2, -0.95, 1.75, true); B.plaster.add(4.6, 4.8, FY, FY + 2.2, -0.95, 1.75, true);
  B.dark.add(-3.4, 3.4, FY + 0.85, FY + 0.95, 1.65, 1.75, true); boxes[boxes.length - 1].y0 = FY; boxes[boxes.length - 1].rail = boxes[boxes.length - 1].slumpSpot = true;   // 後ろの手すり（左右の梯子口を空ける）
  for (const x of [-4.7, 4.7]) for (const z of [-0.85, 1.65]) B.dark.add(x - 0.1, x + 0.1, FY, FY + 2.3, z - 0.1, z + 0.1);
  hipRoof(-6.0, 6.0, -2.0, 2.8, FY + 2.3, 1.7, M.tile);
  B.tile.add(-6.0, 6.0, FY + 2.2, FY + 2.32, -2.0, 2.8);
  ladder(3.9, 1.75, 2.65, FY); ladder(-3.9, 1.75, 2.65, FY);   // v8：左右に梯子（門が破れると橙組の梯子攻め役が上ってくる）
  CASTLE.ghFloor = floors[floors.length - 1];
  for (let i = 0; i < 4; i++) perches.push({ x: -3.3 + i * 2.2, z: -0.35, y: FY, taken: null, gh: true });
  // 扉（二枚、内側へ開く）。閉じている間は箱で止める
  const gate = { leaves: [], k: 0, box: { x0: -2.6, x1: 2.6, z0: -0.22, z1: 0.22, y0: 0, y1: GH, noLean: true } };
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(), g = new THREE.BoxGeometry(2.6, GH, 0.2); g.translate(-s * 1.3, GH / 2, 0);
    const m = new THREE.Mesh(g, M.door); leaf.add(m); leaf.position.set(s * 2.6, 0, 0.05); stageRoot.add(leaf); gate.leaves.push(leaf);
  }
  boxes.push(gate.box); CASTLE.gate = gate;
  // 門の上の耐久ゲージ（3D）
  const bg = new THREE.Sprite(barBgMat); bg.scale.set(3.2, 0.16, 1); bg.position.set(0, FY + 3.6, -1.2); stageRoot.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5ab0ff, depthWrite: false })); fg.scale.set(3.1, 0.1, 1); fg.position.set(0, FY + 3.6, -1.2); fg.renderOrder = 5; bg.renderOrder = 4; stageRoot.add(fg);
  gate.bar = { bg, fg };
  // ---- 破門隊の丸太（破城槌） ----
  const ram = new THREE.Group();
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 3.2, 10), M.wood); log.rotation.x = Math.PI / 2; ram.add(log);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 10), M.iron); cap.rotation.x = Math.PI / 2; cap.position.z = 1.5; ram.add(cap);
  for (const z of [-0.8, 0.6]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 5, 12), ropeMat); r.position.z = z; ram.add(r); }
  stageRoot.add(ram);
  CASTLE.ram = { g: ram, x: 0, z: -50, y: 0.24, swing: 0, t: 0, crew: [], hitDone: false };
  // ---- 二の丸：中の塀（石垣＋漆喰）と中門、遮蔽物 ----
  // v9：中の塀にも狭間（中門の左右）。守り手が二の丸へ射る
  const inSl = [7.2, 9.6, 12.4, 15.6], inAll = [...inSl, ...inSl.map(x => -x)];
  castleWall(B, -CS.WX, -2.2, CS.IZ, true, 2.8, inAll.filter(x => x < 0)); castleWall(B, 2.2, CS.WX, CS.IZ, true, 2.8, inAll.filter(x => x > 0));
  { const sb = []; for (const x of inAll) for (const z of [-0.39, 0.39]) sb.push([x - 0.09, x + 0.09, 1.15, 1.75, CS.IZ + z - 0.01, CS.IZ + z + 0.01]); instBoxes(M.black, sb); }
  for (const x of inAll) perches.push({ x, z: CS.IZ + 0.85, y: 0, taken: null, slit: true, inner: true });
  // v9：中門の門櫓（門の上の足場）。前（二の丸側）に胸壁、内側と二の丸側の両方に梯子。弓兵 5 人が二の丸へ射下ろす
  const GY = 3.6; CS.GY = GY;
  for (const s of [-1, 1]) B.dark.add(s * 2.2 - 0.2, s * 2.2 + 0.2, 0, GY - 0.2, CS.IZ - 0.3, CS.IZ + 0.3, true);
  B.dark.add(-6.2, 6.2, GY - 0.25, GY, CS.IZ - 0.95, CS.IZ + 1.45);
  floors.push({ x0: -6.0, x1: 6.0, z0: CS.IZ - 0.9, z1: CS.IZ + 1.4, y: GY, gt: true });
  CASTLE.gtFloor = floors[floors.length - 1];
  B.plaster.add(-4.7, 4.7, GY, GY + 0.9, CS.IZ - 0.95, CS.IZ - 0.8, true); boxes[boxes.length - 1].rail = boxes[boxes.length - 1].slumpSpot = true;   // 前の胸壁（しゃがめば隠れ、立てば上半身が出る）
  for (const s of [-1, 1]) B.plaster.add(s > 0 ? 6.0 : -6.2, s > 0 ? 6.2 : -6.0, GY, GY + 1.0, CS.IZ - 0.2, CS.IZ + 1.45, true);   // 左右の板壁（前の角は梯子口）
  B.dark.add(-3.6, 3.6, GY + 0.85, GY + 0.95, CS.IZ + 1.35, CS.IZ + 1.45, true); boxes[boxes.length - 1].y0 = GY; boxes[boxes.length - 1].rail = boxes[boxes.length - 1].slumpSpot = true;   // 後ろの手すり
  for (const x of [-6.1, 6.1]) for (const z of [CS.IZ - 0.85, CS.IZ + 1.35]) B.dark.add(x - 0.1, x + 0.1, GY, GY + 2.3, z - 0.1, z + 0.1);
  hipRoof(-7.2, 7.2, CS.IZ - 2.0, CS.IZ + 2.5, GY + 2.3, 1.5, M.tile); B.tile.add(-7.2, 7.2, GY + 2.2, GY + 2.32, CS.IZ - 2.0, CS.IZ + 2.5);
  ladder(4.8, CS.IZ + 1.45, CS.IZ + 2.35, GY); ladder(-4.8, CS.IZ + 1.45, CS.IZ + 2.35, GY);   // 内側（守り手が上る）
  ladder(5.4, CS.IZ - 1.85, CS.IZ - 0.95, GY); ladder(-5.4, CS.IZ - 1.85, CS.IZ - 0.95, GY);   // 二の丸側（攻め手の梯子攻め）
  for (let i = 0; i < 5; i++) perches.push({ x: -3.8 + i * 1.9, z: CS.IZ - 0.4, y: GY, taken: null, gt: true });
  for (const [x, z, a] of [[-9, 9, 0.1], [9, 10, -0.1], [-16, 18, 0.2], [15, 19, -0.15], [-5, 24, 0], [6, 25, 0.05], [-22, 27, 0.1], [21, 28, -0.1]]) bamboobundle(x, z, a);
  const lanterns = [[-3.4, 35.5], [3.4, 35.5], [-12, 14], [12, 14]];
  for (const [x, z] of lanterns) {   // 石灯籠
    B.stone.add(x - 0.25, x + 0.25, 0, 0.9, z - 0.25, z + 0.25); B.stone.add(x - 0.4, x + 0.4, 0.9, 1.35, z - 0.4, z + 0.4); B.stone.add(x - 0.5, x + 0.5, 1.35, 1.5, z - 0.5, z + 0.5);
    covers.push({ x, z, r: 0.55, type: 'bundle', h: 1.5 }); colliders.push({ x, z, r: 0.45 });
  }
  for (const [x, z] of [[-26, 8], [25, 12], [-11, 30], [12, 32]]) {   // 米俵の山
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 9), M.straw); b.rotation.z = Math.PI / 2; b.position.set(x + (i % 3 - 1) * 0.62 + (i >= 3 ? 0.31 : 0), i >= 3 ? 0.82 : 0.3, z); stageRoot.add(b); }
    covers.push({ x, z, r: 0.95, type: 'bundle', h: 1.15 }); colliders.push({ x, z, r: 0.9 });
  }
  tree(-28, 34, 1.2); tree(28, 33, 1.1); tree(-29, 4, 1.0); tree(29, 5, 1.0);
  { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 14), M.stone); w.position.set(-18, 0.4, 33); stageRoot.add(w); colliders.push({ x: -18, z: 33, r: 0.9 }); covers.push({ x: -18, z: 33, r: 0.8, type: 'bundle', h: 0.8 }); }   // 井戸
  yagura(-23, 34, 4.2); yagura(19, 34, 4.2);   // v8：二の丸の櫓（味方の弓兵が射下ろす。梯子は奥側）
  const DC = CASTLE.atk ? ['#d9741c', '#fff6e8', '橙組'] : ['#1f5fb8', '#f4f1e8', '青組'], AC = CASTLE.atk ? ['#1f5fb8', '#f4f1e8', '青組'] : ['#d9741c', '#fff6e8', '橙組'];
  nobori(-1.6, CS.CAP[1], DC[0], DC[1], '二の丸'); nobori(1.6, CS.CAP[1], DC[0], DC[1], DC[2]);
  // ---- 城内（奥御殿）：外壁・柱・畳・襖・欄間・天井・屋根 ----
  const X0 = -CS.BX, X1 = CS.BX, Z0 = CS.BZ0, Z1 = CS.BZ1, CH = 2.8, WT = 0.08;
  B.stone.add(X0 - 0.4, X1 + 0.4, 0, 0.05, Z0 - 0.4, Z1 + 0.4, false, 0.5);                       // 基壇
  const ext = (x0, x1, z0, z1) => { B.plaster.add(x0, x1, 0, 3.4, z0, z1, true, 0.5); };
  ext(X0 - 0.15, -1.6, Z0 - 0.15, Z0); ext(1.6, X1 + 0.15, Z0 - 0.15, Z0);
  B.plaster.add(-1.6, 1.6, 2.2, 3.4, Z0 - 0.15, Z0); B.dark.add(-1.75, -1.6, 0, 2.2, Z0 - 0.2, Z0 + 0.05); B.dark.add(1.6, 1.75, 0, 2.2, Z0 - 0.2, Z0 + 0.05);
  ext(X0 - 0.15, X0, Z0, Z1); ext(X1, X1 + 0.15, Z0, Z1); ext(X0 - 0.15, X1 + 0.15, Z1, Z1 + 0.15);
  hipRoof(X0 - 1.4, X1 + 1.4, Z0 - 1.4, Z1 + 1.4, 3.4, 3.2, M.tile);
  boxes.push({ x0: X0, x1: X1, z0: Z0, z1: Z1, y0: CH + 0.02, y1: 6, ceil: true });   // 天井：矢を止める
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), M.ceil); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CH, (Z0 + Z1) / 2); M.ceil.map.repeat.set(4, 6); stageRoot.add(ceil);
  // 柱と梁（長押）
  const colX = [X0, -CS.XC, CS.XC, X1], rowZ = [Z0, CS.ZA, CS.ZB, CS.ZC, Z1];
  for (const x of colX) for (const z of rowZ) B.dark.add(x - 0.09, x + 0.09, 0, CH, z - 0.09, z + 0.09, x !== X0 && x !== X1 && z !== Z0 && z !== Z1);
  for (const z of rowZ) B.dark.add(X0, X1, CH - 0.12, CH, z - 0.07, z + 0.07);
  for (const x of colX) B.dark.add(x - 0.07, x + 0.07, CH - 0.12, CH, Z0, Z1);
  // 畳（0.9×1.8、長辺は z 方向）。落とし穴の畳は別に作る
  const rooms = { 3: [X0, X1, Z0, CS.ZA], 4: [X0, -CS.XC, CS.ZA, CS.ZB], 5: [-CS.XC, CS.XC, CS.ZA, CS.ZB], 6: [CS.XC, X1, CS.ZA, CS.ZB],
    7: [X0, -CS.XC, CS.ZB, CS.ZC], 8: [-CS.XC, CS.XC, CS.ZB, CS.ZC], 9: [CS.XC, X1, CS.ZB, CS.ZC], 10: [X0, X1, CS.ZC, Z1] };
  CASTLE.rooms = rooms;
  const PIT_AT = [[-5.85, CS.ZA - 0.9], [5.85, CS.ZA - 0.9], [-5.85, CS.ZC - 0.9], [5.85, CS.ZC - 0.9]];
  const mats = [];
  for (const k in rooms) { const [x0, x1, z0, z1] = rooms[k];
    for (let x = x0 + 0.45; x < x1 - 0.2; x += 0.9) for (let z = z0 + 0.9; z < z1 - 0.3; z += 1.8) {
      if (PIT_AT.some(([px, pz]) => Math.abs(px - x) < 0.1 && Math.abs(pz - z) < 0.1)) continue;
      mats.push([x, z]);
    } }
  const tg = new THREE.PlaneGeometry(0.9, 1.8); tg.rotateX(-Math.PI / 2);
  const tim = new THREE.InstancedMesh(tg, M.tatami, mats.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.PI);
  mats.forEach(([x, z], i) => { m4.compose(new V3(x, 0.065, z), (i * 7) % 3 ? q : q2, new V3(1, 1, 1)); tim.setMatrixAt(i, m4); });   // 向きを変えて敷く（目の向きが揃いすぎないように）
  stageRoot.add(tim);
  // 落とし穴：畳が蝶番のように下へ開き、黒い穴が現れる。橙組だけが踏むと作動
  for (const [x, z] of PIT_AT) {
    const hinge = new THREE.Group(); hinge.position.set(x + (x < 0 ? -0.45 : 0.45), 0.06, z); stageRoot.add(hinge);
    const t = new THREE.Mesh(tg, M.tatami); t.position.x = x < 0 ? 0.45 : -0.45; hinge.add(t);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.76), M.hole); hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.055, z); hole.visible = false; stageRoot.add(hole);
    CASTLE.pits.push({ x, z, x0: x - 0.45, x1: x + 0.45, z0: z - 0.9, z1: z + 0.9, hinge, hole, sign: x < 0 ? -1 : 1, open: false, k: 0, box: null });
  }
  // 間仕切り：固定の襖（0.9 幅）と欄間・小壁。portals の所は襖二枚の引き戸
  const fixed = [], ranmaL = [];
  const doorAt = [ // [id, 線の向き('x'=x方向に延びる線, z 固定), 中心, 部屋a, 部屋b]
    ['D1', 'x', -5.4, CS.ZA, 3, 4], ['D2', 'x', 5.4, CS.ZA, 3, 6], ['D3', 'z', -CS.XC, 52.1, 4, 5], ['D4', 'z', CS.XC, 52.1, 5, 6],
    ['D5', 'x', -5.4, CS.ZB, 4, 7], ['D6', 'x', 0, CS.ZB, 5, 8], ['D7', 'x', 5.4, CS.ZB, 6, 9], ['D8', 'z', -CS.XC, 57.5, 7, 8], ['D9', 'z', CS.XC, 57.5, 8, 9],
    ['D10', 'x', -5.4, CS.ZC, 7, 10], ['D11', 'x', 0, CS.ZC, 8, 10], ['D12', 'x', 5.4, CS.ZC, 9, 10]];
  const lines = [['x', CS.ZA, X0, X1], ['x', CS.ZB, X0, X1], ['x', CS.ZC, X0, X1], ['z', -CS.XC, CS.ZA, CS.ZC], ['z', CS.XC, CS.ZA, CS.ZC]];
  for (const [dir, c, a0, a1] of lines) {
    const opens = doorAt.filter(d => d[1] === dir && Math.abs((dir === 'x' ? d[3] : d[2]) - c) < 0.01).map(d => dir === 'x' ? d[2] : d[3]);
    for (let a = a0 + 0.45; a < a1 - 0.2; a += 0.9) {
      if (opens.some(o => Math.abs(a - o) < 0.9)) continue;
      if (colX.concat(rowZ).some(p => Math.abs(p - a) < 0.1)) { /* 柱の位置にも襖（柱は細い） */ }
      fixed.push(dir === 'x' ? [a - 0.45, a + 0.45, 0, 1.78, c - 0.025, c + 0.025] : [c - 0.025, c + 0.025, 0, 1.78, a - 0.45, a + 0.45]);
    }
    // 当たり：開口部を除いた区間ごと
    const cuts = [a0, ...opens.flatMap(o => [o - 0.9, o + 0.9]), a1].sort((p, q2) => p - q2);
    for (let i = 0; i < cuts.length; i += 2) { const u0 = cuts[i], u1 = cuts[i + 1]; if (u1 - u0 < 0.05) continue;
      boxes.push(dir === 'x' ? { x0: u0, x1: u1, z0: c - WT, z1: c + WT, y0: 0, y1: CH } : { x0: c - WT, x1: c + WT, z0: u0, z1: u1, y0: 0, y1: CH }); }
    // 鴨居・欄間・小壁（全長）
    if (dir === 'x') { B.dark.add(a0, a1, 1.78, 1.86, c - 0.04, c + 0.04); B.plaster.add(a0, a1, 2.36, CH - 0.12, c - 0.03, c + 0.03); B.dark.add(a0, a1, 2.3, 2.36, c - 0.04, c + 0.04); }
    else { B.dark.add(c - 0.04, c + 0.04, 1.78, 1.86, a0, a1); B.plaster.add(c - 0.03, c + 0.03, 2.36, CH - 0.12, a0, a1); B.dark.add(c - 0.04, c + 0.04, 2.3, 2.36, a0, a1); }
    ranmaL.push([dir, c, a0, a1]);
  }
  instBoxes(M.fusuma, fixed);
  for (const [dir, c, a0, a1] of ranmaL) {   // 欄間（格子）
    const len = a1 - a0, g = new THREE.PlaneGeometry(len, 0.44); const m = new THREE.Mesh(g, M.ranma);
    m.position.set(dir === 'x' ? (a0 + a1) / 2 : c, 2.08, dir === 'x' ? c : (a0 + a1) / 2); if (dir === 'z') m.rotation.y = Math.PI / 2; stageRoot.add(m);
    M.ranma.map.repeat.set(1, 1); const uv = g.attributes.uv.array; for (let i = 0; i < uv.length; i += 2) uv[i] *= len / 1.8;
  }
  // 引き戸（襖二枚）：一つの InstancedMesh、開け閉めで行列を書き換える
  const dim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.fusuma, doorAt.length * 2); dim.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stageRoot.add(dim);
  CASTLE.doorMesh = dim;
  const initOpen = new Set(['D6', 'D8', 'D9', 'D10', 'D11', 'D12']);
  doorAt.forEach(([id, dir, x, z, ra, rb], i) => {
    const box = dir === 'x' ? { x0: x - 0.9, x1: x + 0.9, z0: z - WT, z1: z + WT, y0: 0, y1: CH, noLean: true } : { x0: x - WT, x1: x + WT, z0: z - 0.9, z1: z + 0.9, y0: 0, y1: CH, noLean: true };
    boxes.push(box);
    const d = { id, dir, x, z, ra, rb, box, i, open0: initOpen.has(id), open: false, k: 0, by: null, closeT: 0, amb: (ra === 4 || rb === 4) ? 4 : (ra === 6 || rb === 6) ? 6 : 0 };
    CASTLE.doors.push(d);
  });
  // 通り道（部屋どうしのつながり）
  const P = (a, b, x, z, ax, half, door = null, pit = null) => CASTLE.portals.push({ a, b, x, z, ax, half, door, pit });
  const dById = id => CASTLE.doors.find(d => d.id === id);
  P(0, 1, 0, 0, 'z', 1.9, 'gate'); P(1, 2, 0, CS.IZ, 'z', 1.6); P(2, 3, 0, CS.BZ0, 'z', 1.2);
  P(3, 4, -5.4, CS.ZA, 'z', 0.7, dById('D1'), 0); P(3, 6, 5.4, CS.ZA, 'z', 0.7, dById('D2'), 1);
  P(4, 5, -CS.XC, 52.1, 'x', 0.7, dById('D3')); P(5, 6, CS.XC, 52.1, 'x', 0.7, dById('D4'));
  P(4, 7, -5.4, CS.ZB, 'z', 0.7, dById('D5')); P(5, 8, 0, CS.ZB, 'z', 0.7, dById('D6')); P(6, 9, 5.4, CS.ZB, 'z', 0.7, dById('D7'));
  P(7, 8, -CS.XC, 57.5, 'x', 0.7, dById('D8')); P(8, 9, CS.XC, 57.5, 'x', 0.7, dById('D9'));
  P(7, 10, -5.4, CS.ZC, 'z', 0.7, dById('D10'), 2); P(8, 10, 0, CS.ZC, 'z', 0.7, dById('D11')); P(9, 10, 5.4, CS.ZC, 'z', 0.7, dById('D12'), 3);
  // 伏兵の部屋（左右の B の間）
  CASTLE.amb = [4, 6].map(r => ({ room: r, sprung: false, members: [], spots: (r === 4 ? [[-6.95, 50.25], [-3.85, 50.25], [-7.2, 52.9], [-3.6, 52.9]] : [[6.95, 50.25], [3.85, 50.25], [7.2, 52.9], [3.6, 52.9]]) }));
  // 本陣（いちばん奥の間）と救護
  if (!CASTLE.atk) { buildHQ(X0 + 0.1, X1 - 0.1, CS.ZC + 0.15, Z1 - 0.1, -1, 63.9); buildMedPost(4.4, 64.8, 'blue'); buildMedPost(0, -48, 'orange'); }
  else {   // v9 攻める：殿の本陣は門の外の陣幕（野営の本陣）。橙組の救護は奥御殿
    maku(-4, -44, 4, 0); maku(4, -44, 4, 0); maku(-6, -50, 12, Math.PI / 2); maku(6, -50, 12, Math.PI / 2); maku(0, -56, 12, 0);
    buildHQ(-6, 6, -56, -44, 0, -53);
    buildMedPost(8.5, -50, 'blue'); buildMedPost(4.4, 64.8, 'orange');
    for (let i = -2; i <= 2; i++) nobori(i * 3, -41.5, '#1f5fb8', '#f4f1e8', i % 2 ? '青組' : '必勝');
    CASTLE.flag = { x: 0, z: 65.5 };   // 奪う旗（奥御殿の本陣）
  }
  for (const x of [-7.6, 7.6]) nobori(x, Z1 - 0.6, DC[0], DC[1], '本陣');
  // ---- 外：橙組の陣（竹束・幟）、木々、遠くの天守 ----
  for (const [z, n] of [[-14, 7], [-26, 8], [-38, 8]]) for (let i = 0; i < n; i++) { const x = -30 + (i + 0.5) * 60 / n + rand(-2, 2); if (Math.abs(x) < 4) continue; bamboobundle(x, z + rand(-2, 2), rand(-0.2, 0.2)); }
  for (let i = 0; i < 10; i++) nobori(rand(-40, 40), rand(-75, -60), AC[0], AC[1], pick([AC[2], '必勝', '破門', '一番']));
  if (!DUAL.build) for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(50, 110), x = Math.cos(a) * r, z = Math.sin(a) * r + 20;
    if (z < 0 && z > -80 && Math.abs(x) < 45) continue; if (z >= -3 && z < CS.WZ1 + 10 && Math.abs(x) < CS.WX + 8) continue;
    tree(x, z, rand(0.8, 1.6));
  }
  { const T = new THREE.Group(), tz = 92;   // 天守（飾り）：石垣の上に白壁と三重の屋根
    const sb = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 14), M.stone); sb.position.y = 3.5; T.add(sb);
    let w = 12, y = 7;
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 3.6, w * 0.85), M.plaster); b.position.y = y + 1.8; T.add(b);
      const r = hipRoof(-w / 2 - 1.2, w / 2 + 1.2, -w * 0.425 - 1.2, w * 0.425 + 1.2, 0, 1.6, M.tile); stageRoot.remove(r); r.position.y = y + 3.6; T.add(r); y += 4.6; w *= 0.72; }
    T.position.set(0, 0, tz); stageRoot.add(T); }
  for (const b of Object.values(B)) b.done();
  castleGraph(); castleReset();
}
// ---- 区域：0 外 / 1 二の丸 / 2 本丸の庭 / 3 広間 / 4-6 二の間（左・中・右）/ 7-9 三の間 / 10 本陣 ----
function castleRegion(x, z) {
  if (CASTLE.shift) x -= CASTLE.shift;
  if (Math.abs(x) >= CS.WX || z <= 0 || z >= CS.WZ1) return 0;
  if (z < CS.IZ) return 1;
  if (Math.abs(x) < CS.BX && z > CS.BZ0 && z < CS.BZ1) {
    if (z < CS.ZA) return 3;
    if (z >= CS.ZC) return 10;
    const col = x < -CS.XC ? 0 : x < CS.XC ? 1 : 2;
    return (z < CS.ZB ? 4 : 7) + col;
  }
  return 2;
}
const inCastleBldg = (x, z) => castleRegion(x, z) >= 3;
// 部屋と通り道の最短経路（次に通る通り道）。左回り・右回りの二通りを作り、娘ごとに使い分ける
function castleGraph() {
  const N = 11, tabs = [];
  for (const rev of [false, true]) {
    const nx = [];
    for (let s = 0; s < N; s++) {
      const first = new Array(N).fill(-1), seen = new Array(N).fill(false); seen[s] = true;
      let fr = [s];
      while (fr.length) { const nf = [];
        for (const r of fr) { let ps = CASTLE.portals.map((p, i) => [p, i]); if (rev) ps = ps.reverse();
          for (const [p, i] of ps) {
            if (p.door === 'gate' && CASTLE.phase === 0) continue;
            const o = p.a === r ? p.b : p.b === r ? p.a : -1; if (o < 0 || seen[o]) continue;
            seen[o] = true; first[o] = r === s ? i : first[r]; nf.push(o);
          } }
        fr = nf; }
      nx.push(first);
    }
    tabs.push(nx);
  }
  CASTLE.next = tabs;
}
function castleRoute(p, tx, tz) {
  const r0 = castleRegion(p.x, p.z), r1 = castleRegion(tx, tz);
  if (r0 === r1) return r0 === 2 ? aroundBldg(p, tx, tz) : [tx, tz];
  if (p._rp === undefined) p._rp = Math.random() < 0.5 ? 0 : 1;
  const pi = CASTLE.next[p._rp][r0][r1];
  if (pi < 0) return r0 === 0 && CASTLE.phase === 0 ? [clamp(p.x, -1.6, 1.6), CS.RAM_GOAL - 0.4] : [p.x, p.z];   // 門が閉まっている：門の前まで
  const P = CASTLE.portals[pi], s = P.a === r0 ? 1 : -1;
  let lane = 0;
  if (P.pit !== null && P.pit !== undefined) { const pit = CASTLE.pits[P.pit]; const px = pit.x - (DUAL.on ? DUAL_COX : (CASTLE.shift || 0)); const sg = Math.sign(px) || 1; lane = pit.open ? -sg * 0.38 : sg * 0.36; }   // 隠し穴の上を通る（作動したあとは反対側を）
  else if (P.half > 1) lane = clamp((P.ax === 'z' ? p.x - P.x : p.z - P.z) * 0.5, -P.half * 0.6, P.half * 0.6);
  const along = P.ax === 'z' ? p.x : p.z, cross = P.ax === 'z' ? p.z : p.x, ca = P.ax === 'z' ? P.x : P.z, cc = P.ax === 'z' ? P.z : P.x;
  const inDoor = Math.abs(cross - cc) < 0.85 && Math.abs(along - ca) < P.half + 0.25;
  const u = ca + lane, v = inDoor ? cc + s * 1.1 : cc - s * 0.8;
  const pt = P.ax === 'z' ? [u, v] : [v, u];
  if (r0 === 2) {   // 本丸の庭：玄関の前までは建物を回り込み、玄関の前からはまっすぐ入る
    if (Math.abs(p.x - u) < 1.4 && p.z > CS.BZ0 - 2.6 && p.z < CS.BZ0 + 0.3) return pt;
    return aroundBldg(p, u, CS.BZ0 - 1.6);
  }
  return pt;
}
// 本丸の庭：建物の裏や横から入口へは、建物の角を回る
function aroundBldg(p, tx, tz) {
  const hit = (x, z) => Math.abs(x) < CS.BX + 0.5 && z > CS.BZ0 - 0.5 && z < CS.BZ1 + 0.5;
  let blocked = false; for (let k = 1; k < 8; k++) { const f = k / 8; if (hit(p.x + (tx - p.x) * f, p.z + (tz - p.z) * f)) { blocked = true; break; } }
  if (!blocked) return [tx, tz];
  const sx = Math.sign(p.x || tx || 1);
  if (p.z > CS.BZ1 - 0.2 && Math.abs(p.x) < CS.BX + 1.2) return [sx * (CS.BX + 1.6), CS.BZ1 + 1.2];
  return [sx * (CS.BX + 1.6), CS.BZ0 - 1.2];
}
// ---- 襖の開け閉め ----
function doorSet(d, open, by) {
  if (d.open === open) return;
  d.open = open; d.by = by || null; d.closeT = 0;
  d.box.y1 = open ? -1 : 2.8;
  if (by !== undefined) { const o = Sfx.at(new V3(d.x, 1, d.z), 30); if (o) Sfx.noiseBurst(0.32, 'bandpass', 900, 500, 0.12, 0.8, 0, o); }   // するっ（襖を引く音）
  if (open && by && by !== 'player' && by.team === CA() && d.amb) castleSpring(d.amb, by);
}
function doorWrite(d) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  if (d.dir === 'z') q.setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2);
  for (const s of [-1, 1]) {   // 閉：-0.45 / +0.45、開：横の固定襖の前へ 0.9 ずつ引く
    const off = s * (0.45 + 0.88 * d.k), dep = s * 0.035;
    const x = d.dir === 'x' ? d.x + off : d.x + dep, z = d.dir === 'x' ? d.z + dep : d.z + off;
    m4.compose(new V3(x, 0.89, z), q, new V3(0.9, 1.78, 0.03)); CASTLE.doorMesh.setMatrixAt(d.i * 2 + (s > 0 ? 1 : 0), m4);
  }
  CASTLE.doorMesh.instanceMatrix.needsUpdate = true;
}
// 娘が閉じた襖の前に来た：通るなら開ける
function castleDoorTouch(e, tx, tz) {
  const p = e.s.position;
  for (const d of CASTLE.doors) {
    if (d.open || Math.abs(p.x - d.x) > 1.3 || Math.abs(p.z - d.z) > 1.3) continue;
    const a = d.dir === 'x' ? p.z - d.z : p.x - d.x, b = d.dir === 'x' ? tz - d.z : tx - d.x, along = d.dir === 'x' ? p.x - d.x : p.z - d.z;
    if (Math.abs(along) < 1.1 && Math.sign(a) !== Math.sign(b) && Math.abs(a) < 1.0) doorSet(d, true, e);
  }
}
function castleDoorNear() {
  let best = null, bd = 1.7;
  for (const d of CASTLE.doors) { const dd = Math.hypot(player.pos.x - d.x, player.pos.z - d.z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
function castleUse() {   // E／スマホのボタン：近くの襖を開け閉め
  if (!castleLive() || player.pos.y > 0.5) return false;
  const d = castleDoorNear(); if (!d) return false;
  if (d.open && enemies.some(o => o.state !== 'down' && Math.abs(o.s.position.x - d.x) < (d.dir === 'x' ? 0.95 : 0.4) && Math.abs(o.s.position.z - d.z) < (d.dir === 'x' ? 0.4 : 0.95))) { popup('敷居に人がいて閉められない'); return true; }
  const pd = d.dir === 'x' ? Math.abs(player.pos.z - d.z) : Math.abs(player.pos.x - d.x), pa = d.dir === 'x' ? Math.abs(player.pos.x - d.x) : Math.abs(player.pos.z - d.z);
  if (d.open && pd < 0.4 && pa < 0.95) { popup('敷居の上では閉められない'); return true; }
  doorSet(d, !d.open, 'player'); return true;
}
// ---- 伏兵：橙組が襖を開けた／部屋に入った／伏兵が撃たれた → 全員が一斉にかかる ----
function castleSpring(room, by) {
  const A = CASTLE.amb.find(a => a.room === room); if (!A || A.sprung) return;
  A.sprung = true;
  const live = A.members.filter(isUp);
  if (!live.length) return;
  for (const m of live) {
    m.hiddenAmb = null; m.kneel = false; m.passive = false; m.state = m.kind === 'archer' ? 'aim' : 'approach'; m.t = 0; m.cd = 0;
    if (by && by.team === CA() && isUp(by)) { m.tgt = by; m.tgtT = 2.5; }
  }
  for (const d of CASTLE.doors) if (d.amb === room && !d.open && by && Math.hypot(d.x - by.s.position.x, d.z - by.s.position.z) < 2.5) doorSet(d, true, live[0]);
  showBanner('伏兵！', '奥御殿伏兵隊が襖の陰から一斉にかかる！');
  const L = live[0]; if (!yariSay(L, 'amb_go')) npcSay(L, 'spot', 2);
  CASTLE.log.push('spring:' + room);
}
// ---- 落とし穴 ----
function castlePitFall(e, pit) {
  pit.open = true; pit.box = { x0: pit.x0, x1: pit.x1, z0: pit.z0, z1: pit.z1, y0: 0, y1: 0.35, noLean: true }; boxes.push(pit.box);
  pit.hole.visible = true;
  e.pit = { t: 0, x: pit.x, z: pit.z }; e.state = 'pit'; e.t = 0;
  e.bg.visible = e.fg.visible = e.mk.visible = false; if (e.tag) e.tag.visible = false; if (e.wmk) e.wmk.visible = false;
  Sfx.impactWood(new V3(pit.x, 0.2, pit.z)); Sfx.thudAt(Math.hypot(pit.x - player.pos.x, pit.z - player.pos.z) + 3);
  puff(new V3(pit.x, 0.3, pit.z), 0xc8b48a, 6, 0.5, 1.4, 0.7);
  if (!yariSay(e, 'pit_fall')) npcSay(e, 'hit', 1);
  if (e.spear) e.spear.visible = false;
  if (!(bannerTimer > 0)) popup(CASTLE.atk ? '落とし穴！ 味方の一人が床下へ（脱落）' : '落とし穴！ 橙組の一人が床下へ（脱落）');
  CASTLE.log.push('pit');
}
function castlePitStep(e, dt) {
  e.t += dt; const p = e.s.position, k = e.t;
  p.x += (e.pit.x - p.x) * Math.min(1, dt * 8); p.z += (e.pit.z - p.z) * Math.min(1, dt * 8);
  p.y = e.baseY - 4.9 * Math.max(0, k - 0.12) ** 2 * 1.6;
  if (MOTION && e.mo) Mo.drive(e, dt, 0, false, false, 0);
  if (k > 0.85) {   // 床下へ：脱落（体は残らない）
    e.state = 'down'; e.silenced = true;
    if (window.__kstat) window.__kstat.push({ team: e.team, kind: e.kind, by: 'pit' });
    squadOnDeath(e);
    const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
    disposeNpc(e);
  }
}
// ---- 門と破城槌 ----
function castleGateHit(dmg, pt, loud) {
  if (CASTLE.phase !== 0) return;
  CASTLE.gateHP = Math.max(0, CASTLE.gateHP - dmg);
  const g = CASTLE.gate; g.shake = loud ? 0.35 : 0.12;
  Sfx.impactWood(pt); if (loud) { Sfx.thudAt(Math.hypot(pt.x - player.pos.x, pt.z - player.pos.z)); puff(pt.clone(), 0xc8b48a, 6, 0.7, 1.6, 0.7); if (Math.hypot(pt.x - player.pos.x, pt.z - player.pos.z) < 14) player.shake = Math.max(player.shake, 0.12); }
  if (CASTLE.gateHP <= 0) castleGateBreak();
}
function castleGateBreak() {
  CASTLE.phase = 1; CASTLE.gate.box.y1 = -1; CASTLE.gate.opening = 0.001;
  castleGraph();
  if (CASTLE.atk) showBanner('大手門を破った！', '二の丸へ攻め込め — 中門の門櫓と狭間の弓に気をつけよ'); else showBanner('大手門、破られる！', '橙組が二の丸へなだれ込む — 二の丸で迎え撃て');
  Sfx.thudAt(Math.hypot(player.pos.x, player.pos.z) * 0.5); Sfx.fanfare && Sfx.chime && Sfx.chime(true);
  for (let i = 0; i < 4; i++) puff(new V3(rand(-2.4, 2.4), rand(0.5, 3), rand(-0.5, 1.5)), 0xc8b48a, 6, 1.0, 2.0, 1.0);
  const L = enemies.find(o => o.team === CD() && isUp(o) && !o.special); if (L) yariSay(L, 'gate_broken');
  for (const m of CASTLE.ram.crew) if (isUp(m)) { m.ramCrew = false; m.state = 'approach'; }
  CASTLE.ram.crew = [];
  for (const o of enemies) if (o.team === CD() && isUp(o) && !o.special && !o.perch && !o.guard && o.s.position.z < 8) o.fallback = { x: rand(-9, 9), z: rand(24, 32), until: time + 7 };
  // 二の丸の備え：奥御殿から予備の守り手が出てくる（波の援軍の残りが少なければ足す）
  if (CASTLE.atk) wave.toSpawn = Math.max(wave.toSpawn, 6); else wave.blueToSpawn = Math.max(wave.blueToSpawn, 6);
  for (let i = 0; i < 4; i++) { const e = spawnEnemy(rand(-8, 8), rand(30, 37), i === 3 ? 'archer' : 'mob', false, CD()); if (e && e.sq && e.sq.k !== 'bailey') { /* 分隊は assignSquad が決める */ } }
  // v8：二の丸の櫓へ弓兵を上げる（狭間の弓兵が梯子で上る＋予備の弓兵 2 人は櫓の上から）
  const tw = perches.filter(q => q.tower && !q.taken);
  for (let i = 0; i < 2 && tw.length; i++) { const q = tw.splice(Math.floor(Math.random() * tw.length), 1)[0]; spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); }
  // v9：中門の門櫓に弓兵 4 人、中の塀の狭間に 2 人（二の丸の攻め手を上と横から射る）
  { const gq = perches.filter(q => q.gt && !q.taken), sq = perches.filter(q => q.slit && q.inner && !q.taken);
    for (let i = 0; i < 4 && gq.length; i++) { const q = gq.splice(Math.floor(Math.random() * gq.length), 1)[0]; spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); }
    for (let i = 0; i < 2 && sq.length; i++) { const q = sq.splice(Math.floor(Math.random() * sq.length), 1)[0]; spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); } }
  for (const o of enemies) {
    if (!tw.length) break;
    if (o.team !== CD() || !isUp(o) || o.kind !== 'archer' || o.special || !(o.perch && o.perch.slit)) continue;
    let qi = 0, bd = 1e9; tw.forEach((q, i) => { const d = Math.hypot(q.x - o.s.position.x, q.z - o.s.position.z); if (d < bd) { bd = d; qi = i; } });
    const q = tw.splice(qi, 1)[0], F = floorAt(q.x, q.z, q.y), L = F && ladderTo(F, o.s.position.x, o.s.position.z);
    if (!L) continue;
    o.perch.taken = null; o.perch = null; o.crouch = 0; q.taken = o; o.climbPerch = q; startClimb(o, L, true);
  }
  CASTLE.log.push('gate');
}
function castleBaileyLost() {
  CASTLE.phase = 2;
  if (CASTLE.atk) showBanner('二の丸を奪った！', '橙組は奥御殿へ退く — 襖の陰の伏兵と畳の落とし穴に用心し、本陣の旗を奪え'); else showBanner('二の丸、落ちる！', '味方は城内（奥御殿）へ退く — 襖の陰に伏兵、畳に落とし穴');
  Sfx.chime && Sfx.chime(true);
  const spots = [[-5.4, 57.5], [0, 57.5], [5.4, 57.5], [0, 52.1], [-3, 61.5], [3, 61.5]];
  let k = 0, L = null;
  for (const o of enemies) if (o.team === CD() && isUp(o) && !o.special && !o.perch && !o.hiddenAmb && castleRegion(o.s.position.x, o.s.position.z) <= 2) {
    const s = spots[k++ % spots.length]; o.fallback = { x: s[0] + rand(-1, 1), z: s[1] + rand(-0.8, 0.8), until: time + 22 }; L = L || o; }
  if (L) yariSay(L, 'bailey_lost');
  CASTLE.log.push('bailey');
}
function castleReset() {
  CASTLE.phase = 0; CASTLE.won = false; CASTLE.hold = 0; CASTLE.gtThin = false; CASTLE.gtUp = 0; CASTLE.gateHP = CS.GATE_MAX; CASTLE.cap = 0; CASTLE.capT = 0; CASTLE.log = [];
  const g = CASTLE.gate; if (g) { g.box.y1 = 4.0; g.opening = 0; g.k = 0; g.shake = 0; g.leaves.forEach((l, i) => { l.rotation.y = 0; }); }
  for (const d of CASTLE.doors) { d.open = d.open0; d.by = null; d.closeT = 0; d.box.y1 = d.open ? -1 : 2.8; d.k = d.open0 ? 1 : 0; doorWrite(d); }
  for (const p of CASTLE.pits) { p.open = false; p.k = 0; p.hinge.rotation.z = 0; p.hole.visible = false; if (p.box) { const i = boxes.indexOf(p.box); if (i >= 0) boxes.splice(i, 1); p.box = null; } }
  for (const A of CASTLE.amb) { A.sprung = false; A.members = []; }
  const R = CASTLE.ram; if (R) { R.x = 0; R.z = -46; R.y = 0.24; R.swing = 0; R.t = 0; R.crew = []; }
  if (CASTLE.next) castleGraph();
}
function castleLive() { return !!(CASTLE.on || DUAL.on); }
function castleDoorClose() { if (!castleLive() || player.pos.y > 0.5) return false; const d = castleDoorNear(); return !!d && Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 1.25; }
function castleDoorNearHint() { const d = castleLive() && player.pos.y < 0.5 ? castleDoorNear() : null; return d; }
// ---- 毎フレーム：門・槌・襖・落とし穴・伏兵・二の丸の制圧 ----
function updateCastle(dt) {
  if (!CASTLE.on) return;
  if ((CASTLE.sallyT = (CASTLE.sallyT || 0) - dt) <= 0) {   // v8：二の丸で敵が減れば、味方の近接・槍が打って出る
    CASTLE.sallyT = 1;
    const was = CASTLE.sally;
    CASTLE.gtUp = enemies.filter(o => o.team === CD() && isUp(o) && o.perch && (o.perch.gt || (o.perch.slit && o.perch.inner))).length;
    if (CASTLE.phase === 1 && CASTLE.gtUp < 3 && !CASTLE.gtThin && CASTLE.phT > 8) { CASTLE.gtThin = true; popup(CASTLE.atk ? '中門の上の守りが薄くなった — 突入！' : '中門の上の弓兵が減った — 攻め手が門へ迫る'); (CASTLE.log || (CASTLE.log = [])).push('gtThin'); }
    if (CASTLE.phase !== CASTLE.lastPh) { CASTLE.lastPh = CASTLE.phase; CASTLE.phT = 0; } CASTLE.phT = (CASTLE.phT || 0) + 1;
    if (CASTLE.phase !== 1 || CASTLE.phT < 12) CASTLE.sally = false;
    else {
      const oc = enemies.filter(o => o.team === CA() && isUp(o) && castleRegion(o.s.position.x, o.s.position.z) <= 1 && o.s.position.z > -15).length;
      const bc = enemies.filter(o => o.team === CD() && isUp(o) && o.kind === 'mob' && !o.special && !o.guard && castleRegion(o.s.position.x, o.s.position.z) === 1).length;
      CASTLE.sally = was ? oc <= Math.max(8, bc * 0.9) : (oc <= 5 && bc >= 3) || (bc >= 4 && bc >= oc * 1.6);
    }
    if (CASTLE.sally && !was) { const L = enemies.find(o => o.team === CD() && isUp(o) && o.kind === 'mob' && !o.special && castleRegion(o.s.position.x, o.s.position.z) === 1); if (L) yariSay(L, 'sally_go'); popup(CASTLE.atk ? '橙組が打って出た！' : '味方が打って出た！'); (CASTLE.log || (CASTLE.log = [])).push('sally'); }
  }
  const g = CASTLE.gate;
  // 門の扉：揺れ、破れたら内側へ開く
  if (g.opening > 0 && g.k < 1) { g.k = Math.min(1, g.k + dt / 1.1); }
  const sw = g.shake > 0 ? Math.sin(time * 60) * g.shake * 0.05 : 0; g.shake = Math.max(0, (g.shake || 0) - dt);
  const ok = g.k < 1 ? 1 - Math.pow(1 - g.k, 3) : 1, over = g.k >= 1 ? 0 : Math.sin(g.k * Math.PI) * 0.08;
  g.leaves[0].rotation.y = -(Math.PI / 2 * 0.92) * ok - over + sw; g.leaves[1].rotation.y = (Math.PI / 2 * 0.92) * ok + over - sw;
  const f = CASTLE.gateHP / CS.GATE_MAX; g.bar.bg.visible = g.bar.fg.visible = CASTLE.phase === 0;
  g.bar.fg.scale.x = Math.max(0.001, 3.1 * f); g.bar.fg.center.set(0.5 / 1, 0.5); g.bar.fg.position.x = -1.55 * (1 - f);
  // 破城槌
  const R = CASTLE.ram; R.crew = R.crew.filter(isUp);
  const n = R.crew.length;
  if (CASTLE.phase === 0 && n >= 2) {
    const atSlots = R.crew.every(m => { const s = ramSlot(m); return Math.hypot(m.s.position.x - s[0], m.s.position.z - s[1]) < (R.y > 0.6 ? 1.3 : 0.7); });
    R.y += (0.95 - R.y) * Math.min(1, dt * 4);
    if (R.z < CS.RAM_GOAL - 0.05 || Math.abs(R.x) > 0.05) {
      if (atSlots) { const dx = -R.x, dz = CS.RAM_GOAL - R.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.4 * dt); R.x += dx / d * st; R.z += dz / d * st; }
      R.swing += (0 - R.swing) * Math.min(1, dt * 4); R.t = 0;
    } else if (atSlots) {   // 引いて（1.7秒）→ 突く（0.2秒）→ 戻す
      const u0 = R.t; R.t = (R.t + dt) % 2.4; const u = R.t;
      R.swing = u < 1.7 ? -0.5 * (u / 1.7) : u < 1.9 ? -0.5 + 0.95 * (u - 1.7) / 0.2 : 0.45 * (1 - (u - 1.9) / 0.5);
      if (u0 < 1.9 && u >= 1.9 || (u < u0 && u0 < 1.9)) { castleGateHit(11 * n / 4 + 2, new V3(R.x, 1.0, -0.3), true); for (const m of R.crew) { m.state = 'windup'; m.t = 0; m.ramThrust = 0.25; } }
      if (u < u0) { const L = R.crew[0]; if (L && Math.random() < 0.3) yariSay(L, 'ram_go'); }
    }
  } else { R.y += (0.24 - R.y) * Math.min(1, dt * 5); R.swing *= Math.exp(-dt * 4); }
  R.g.position.set(R.x, R.y, R.z + R.swing); R.g.rotation.z = n >= 2 ? Math.sin(time * 5) * 0.01 : 0;
  // 襖のアニメと、伏兵の部屋の襖を（味方が通ったあと）静かに閉める
  for (const d of CASTLE.doors) {
    const want = d.open ? 1 : 0; if (d.k !== want) { d.k += Math.sign(want - d.k) * Math.min(Math.abs(want - d.k), dt / 0.3); doorWrite(d); }
    if (d.open && d.amb && !CASTLE.amb.find(a => a.room === d.amb).sprung && d.by && d.by.team !== CA()) {
      const busy = Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 1.6 || enemies.some(o => o.state !== 'down' && Math.hypot(o.s.position.x - d.x, o.s.position.z - d.z) < 1.4);
      d.closeT = busy ? 0 : d.closeT + dt; if (d.closeT > 1.8) doorSet(d, false, null);
    }
  }
  // 落とし穴（畳が下へ開く）
  for (const pit of CASTLE.pits) {
    if (pit.open && pit.k < 1) { pit.k = Math.min(1, pit.k + dt / 0.25); pit.hinge.rotation.z = pit.sign * 1.45 * pit.k; }
    if (pit.open) continue;
    for (const e of enemies) {
      if (e.team !== CA() || e.state === 'down' || e.state === 'pit' || e.special || e.baseY > 0.3) continue;
      const p = e.s.position; if (p.x > pit.x0 + 0.12 && p.x < pit.x1 - 0.12 && p.z > pit.z0 + 0.1 && p.z < pit.z1 - 0.1) { castlePitFall(e, pit); break; }
    }
  }
  // 伏兵：橙組が部屋に入った
  for (const A of CASTLE.amb) {
    if (A.sprung || !A.members.some(isUp)) continue;
    const [x0, x1, z0, z1] = CASTLE.rooms[A.room];
    const intr = enemies.find(o => o.team === CA() && isUp(o) && o.s.position.x > x0 && o.s.position.x < x1 && o.s.position.z > z0 && o.s.position.z < z1);
    if (intr) castleSpring(A.room, intr);
  }
  // 二の丸の制圧
  if (CASTLE.phase === 1 && (CASTLE.capT -= dt) <= 0) {
    CASTLE.capT = 0.5;
    const [cx, cz] = CS.CAP; let oc = 0, bc = 0, bAll = 0;
    for (const o of enemies) { if (!isUp(o) || o.special || o.state === 'pit') continue; const p = o.s.position, r = castleRegion(p.x, p.z), d = Math.hypot(p.x - cx, p.z - cz);
      const fighter = o.team === CD() && !o.perch && !o.guard && !o.hiddenAmb && (r === 1 || r === 2);
      if (o.team === CA() && ((r === 1 && d < 9) || r === 2)) oc++; if (fighter && d < 9) bc++; if (fighter) bAll++; }
    if (oc >= 3 && oc > bc * 2) CASTLE.cap += 0.5 / 28;          // v7 調整：押さえるのに約28秒
    else if (bAll === 0 && oc >= 3) CASTLE.cap += 0.5 / 14;
    else if (bc >= oc) CASTLE.cap = Math.max(0, CASTLE.cap - 0.5 / 15);
    if (enemies.some(o => o.team === CA() && isUp(o) && inCastleBldg(o.s.position.x, o.s.position.z))) CASTLE.cap = 1;   // 奥御殿に踏み込まれた
    if ((CASTLE.gtUp || 0) >= 3 && !CASTLE.gtThin) CASTLE.cap = Math.min(CASTLE.cap, 0.6);   // v9：中門の上が健在なうちは押さえきれない
    if (CASTLE.cap >= 1) castleBaileyLost();
  }
}
function ramSlot(m) {
  const R = CASTLE.ram, i = Math.max(0, R.crew.indexOf(m));
  const S = [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.75], [0.55, -0.75]][i % 4];
  return [R.x + S[0], R.z + S[1] + R.swing];
}
// ---- 城の戦いの娘の動き（true：このフレームの動きはここで決まり） ----
function castleAtkHasMelee() {
  const team = CA();
  for (const o of enemies) {
    if (o.team !== team || !isUp(o) || o.kind === 'archer' || o.special || o.perch) continue;
    return true;
  }
  return false;
}
function castleBrain(e, dt) {
  const p = e.s.position;
  if (e.hiddenAmb) {   // 襖の陰で膝をついて待つ
    e.passive = true; e.kneel = true; e.tgt = null; e.state = 'idle'; e.faceWant = Math.PI;
    const h = e.home; if (h && Math.hypot(h[0] - p.x, h[1] - p.z) > 0.3) steer(e, h[0], h[1], e.speed * 0.6, dt);
    return true;
  }
  if (e.ramCrew) {
    if (CASTLE.phase !== 0) { e.ramCrew = false; return false; }
    const R = CASTLE.ram; if (!R.crew.includes(e)) R.crew.push(e);
    const [sx, sz] = ramSlot(e), d = Math.hypot(sx - p.x, sz - p.z);
    if (e.ramThrust > 0) { e.ramThrust -= dt; if (e.ramThrust <= 0) e.state = 'approach'; }
    if (d > 0.05) { const lift = R.y > 0.6; if (lift && d < 1.5) { p.x = sx; p.z = sz; e.moving = R.z < CS.RAM_GOAL - 0.05; } else steer(e, sx, sz, e.speed * 1.15, dt); }   // 担いでいる間は丸太と一緒に動く
    e.tgt = null; e.face = 0; e.faceWant = 0;
    if (e.state !== 'windup') e.state = 'approach';
    return true;
  }
  if (e.fallback) {   // 退く（敵を相手にせず、決めた所まで）
    const F = e.fallback;
    if (time > F.until || Math.hypot(F.x - p.x, F.z - p.z) < 1.0) { e.fallback = null; return false; }
    e.tgt = null; e.state = e.kind === 'archer' ? 'advance' : 'approach'; steer(e, F.x, F.z, e.speed * 1.15, dt); npcTint(e, 0);
    return true;
  }
  // v8：門が破れた後、梯子攻め役は櫓門・二の丸の櫓の上の弓兵を目指して梯子を上る
  if (CASTLE.phase >= 1 && e.team === CA() && e.raider && e.kind === 'mob' && !e.lad && !e.onFloor && castleRegion(p.x, p.z) === 1 && (e.raidT = (e.raidT || 0) - dt) <= 0) {
    e.raidT = 1.5;
    const near = e.tgt && !e.tgt.isPlayer && isUp(e.tgt) && !tgtFloor(e.tgt) && Math.hypot(tgtPos(e.tgt).x - p.x, tgtPos(e.tgt).z - p.z) < (CASTLE.gtUp >= 3 ? 2.2 : 5);
    if (!near) {
      let best = null, bd = 30;
      for (const o of enemies) { if (o.team !== CD() || !isUp(o) || !o.perch || o.perch.slit) continue; const F = floorAt(o.s.position.x, o.s.position.z, o.baseY); if (!F) continue; const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z); if (d < bd) { bd = d; best = [o, F]; } }
      if (best && tryClimb(e, best[1])) { e.tgt = best[0]; e.tgtT = 3; if (Math.random() < 0.4) yariSay(e, 'ladder_go'); return false; }
    }
  }
  // 門が閉じている間：外の橙組の近接兵は、近くに相手がいなければ門を打つ
  if (CASTLE.phase === 0 && e.team === CA() && !e.special && castleRegion(p.x, p.z) === 0 && (e.kind === 'mob' || (e.kind === 'archer' && !e.perch && !castleAtkHasMelee()))) {
    if ((e.gateT = (e.gateT || 0) - dt) <= 0) { e.gateT = 0.6; const t = chooseTarget(e); e.gateFoe = t && Math.hypot(tgtPos(t).x - p.x, tgtPos(t).z - p.z) < 9 ? t : null; }
    if (e.gateFoe && (e.gateFoe.isPlayer || isUp(e.gateFoe))) return false;
    if (Math.abs(p.x) > 6 || p.z < -6) { steer(e, clamp(p.x, -2.2, 2.2) * 0.6 + Math.sin(e.ph) * 1.2, -1.6, e.speed, dt); e.state = 'approach'; e.tgt = null; return true; }
    const gx = clamp(Math.sin(e.ph * 3) * 2.1, -2.2, 2.2), gz = -0.72, d = Math.hypot(gx - p.x, gz - p.z);
    e.tgt = null; e.t += dt; e.cd -= dt;
    if (e.state === 'windup') { npcTint(e, Math.min(1, e.t / 0.5)); if (e.t >= 0.5) { e.state = 'recover'; e.t = 0; e.cd = rand(0.9, 1.6); npcTint(e, 0); castleGateHit(0.6, new V3(p.x, 1.2, -0.25), false); } }
    else if (e.state === 'recover') { if (e.t > 0.4) e.state = 'approach'; }
    else if (d > 0.35) { steer(e, gx, gz, e.speed, dt); e.state = 'approach'; }
    else if (e.cd <= 0) { e.state = 'windup'; e.t = 0; if (Math.random() < 0.2) npcSay(e, 'attack', 0, 0.3); }
    e.face = 0;   // 門のほう（+z）を向く
    return true;
  }
  return false;
}
// 標的にしてよいか（城の戦い）。届かない相手・隠れた伏兵は選ばない
function castleCanTarget(e, t, x, z) {
  if (t.hiddenAmb) return false;
  const ep = e.s.position, re = castleRegion(ep.x, ep.z), rt = castleRegion(x, z);
  if (CASTLE.phase === 0) {
    if (e.team === CA()) return re !== 0 ? true : e.kind === 'mob' ? rt === 0 : (rt === 0 || !!t.perch || t.isPlayer);
    if (e.perch && e.perch.slit) return e.perch.inner ? rt === 1 : rt === 0;
    if (e.perch && e.perch.gt) return rt === 1;
    if (e.perch) return true;
    return rt !== 0;
  }
  if (e.team === CA() && t.perch && (t.perch.gt || (t.perch.slit && t.perch.inner)) && (re === 0 || Math.hypot(x - ep.x, z - ep.z) > 30)) return false;   // v9：中門の上へは二の丸に入って 30m 以内から
  if (e.perch && e.perch.slit && e.perch.inner) return rt === 1;   // v9：中の塀の狭間・中門の門櫓は二の丸（と本丸の庭）へ
  if (e.perch && e.perch.gt) return rt === 1 || rt === 2;
  // v9：二の丸の攻め手の近接は、中門の上と狭間の弓兵が減るまで門をくぐらない（竹束の陰で弓の撃ち合い→梯子攻め→突入）
  if (CASTLE.phase === 1 && e.team === CA() && e.kind === 'mob' && !e.raider && !e.special && (CASTLE.gtUp || 0) >= 3 && (rt >= 2 || z > CS.IZ - 3) && !t.isPlayer && Math.hypot(x - ep.x, z - ep.z) > 4) return false;
  if (e.team === CD() && !e.perch && e.kind === 'mob' && !e.ambushed) {
    if (CASTLE.phase === 1) return CASTLE.sally ? rt <= 1 && z > -12 : rt !== 0 && (z > 14 || Math.hypot(x - ep.x, z - ep.z) < 4);   // 二の丸の守り：門口まで追わず、奥で迎え撃つ（v8：敵が減れば打って出る）
    return rt >= 2 || z > 36;
  }
  return true;
}
// 見通し（矢が通るか）：途中の壁・襖・狭間
function castleLOS(e, t) {
  const p = e.s.position, tp = tgtPos(t), y0 = e.baseY + e.figH * 0.85, y1 = (t.isPlayer ? player.pos.y + 1.2 : t.baseY + t.figH * 0.7);
  const dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz); if (d < 1.6) return true;
  const v = new V3();
  for (let s = 1.6; s < d - 0.5; s += 0.35) { const f = s / d; v.set(p.x + dx * f, y0 + (y1 - y0) * f, p.z + dz * f); if (hitsBox(v, e.team)) return false; }
  return true;
}
// 線分と箱（矢の当たり）：入った点を返す。狭間の窓は通す
const slitHalfW = (b, team) => b.slitIn ? (team === b.slitIn ? b.slitW[0] : b.slitW[1]) : (team === CA() ? 0.16 : 0.42);
function castleSegHit(p0, p1, team) {
  let best = null, bt = 2;
  for (const b of boxes) {
    if (b.y1 <= b.y0) continue;
    let t0 = 0, t1 = 1, ok = true;
    for (const [a, lo, hi] of [['x', b.x0, b.x1], ['y', b.y0, b.y1], ['z', b.z0, b.z1]]) {
      const s = p0[a], dd = p1[a] - s;
      if (Math.abs(dd) < 1e-9) { if (s <= lo || s >= hi) { ok = false; break; } continue; }
      let ta = (lo - s) / dd, tb = (hi - s) / dd; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (!ok || t0 >= bt) continue;
    if (b.slits) { const y = p0.y + (p1.y - p0.y) * t0, x = p0.x + (p1.x - p0.x) * t0; const w = slitHalfW(b, team); if (y > b.sy0 && y < b.sy1 && b.slits.some(sx => Math.abs(x - sx) < w)) continue; }
    bt = t0; best = b;
  }
  return best ? bt : -1;
}
// 青組の援軍の出る所（区域の進み具合で）
function castleAllySpawn(kind) {
  const ph = CASTLE.phase;
  if (ph === 0 && kind === 'archer') {
    const free = perches.filter(q => !q.taken && (q.slit || q.gh));
    if (free.length) { const q = pick(free); return spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); }
  }
  if (kind === 'archer' && ph === 1) { const gt = perches.filter(q => !q.taken && (q.gt || (q.slit && q.inner))); if (gt.length && !CASTLE.gtThin && Math.random() < 0.6) { const q = pick(gt); return spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); } }   // v9：中門の門櫓・中の狭間
  if (kind === 'archer' && ph === 1) { const tw = perches.filter(q => !q.taken && q.tower); if (tw.length && Math.random() < 0.75) { const q = pick(tw); return spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); } }
  if (ph <= 1 && kind === 'archer' && ph === 1) { const free = perches.filter(q => !q.taken && q.gh); if (free.length && Math.random() < 0.5) { const q = pick(free); return spawnEnemy(q.x, q.z, 'archer', false, CD(), { y: q.y, perch: q }); } }
  if (ph === 0) return spawnEnemy(rand(-10, 10), kind === 'archer' ? rand(12, 20) : rand(3, 12), kind, false, CD());
  if (ph === 1) return spawnEnemy(rand(-12, 12), rand(26, 37), kind, false, CD());
  const s = pick([[-5.4, 57.5], [0, 57.5], [5.4, 57.5], [0, 63], [0, 52.1]]);
  return spawnEnemy(s[0] + rand(-1.2, 1.2), s[1] + rand(-1, 1), kind, false, CD());
}
// 波の始め：伏兵を襖の陰へ（一部屋 2〜4 人、まだ見破られていない部屋だけ）
function castleWave(n) {
  if (!CASTLE.on) return 0;
  let k = 0;
  for (const A of CASTLE.amb) {
    if (A.sprung) continue;
    A.members = A.members.filter(isUp);
    const want = Math.min(4, 2 + Math.floor(n / 2));
    for (let i = A.members.length; i < want; i++) {
      const [x, z] = A.spots[i % 4];
      const e = spawnEnemy(x, z, Math.random() < 0.25 ? 'archer' : 'mob', false, CD(), { set: { hiddenAmb: A.room, ambush: true, home: [x, z] } });
      if (e) { e.kneel = true; e.crouch = 1; e.s.rotation.y = e.face = Math.PI; A.members.push(e); k++; }
    }
  }
  return k;
}
// 青組の待機位置（敵が見えないとき）
function castleIdleSpot(e) {
  const ph = CASTLE.phase, a = e.ph;
  if (e.ambush) { const A = CASTLE.amb.find(q => e.home && castleRegion(e.home[0], e.home[1]) === q.room); if (e.home) return e.home; }
  if (ph === 0) return e.yari ? [Math.cos(a) * 2.2, 2.2 + Math.abs(Math.sin(a)) * 1.5] : e.sq && e.sq.k === 'gate' ? [Math.cos(a) * 4, 3 + Math.abs(Math.sin(a)) * 3] : [Math.cos(a) * 9, 14 + Math.sin(a) * 4];
  if (ph === 1) return [Math.cos(a) * 9, 31 + Math.sin(a) * 3];
  const s = [[-5.4, 57.5], [0, 57.5], [5.4, 57.5], [0, 52.1]][e.id % 4];
  return [s[0] + Math.cos(a) * 1.2, s[1] + Math.sin(a) * 1.0];
}
// v9 攻める：奥御殿の本陣（いちばん奥の間）に橙組がいなくなり、味方が 6 秒押さえれば勝ち
function castleAtkWin(dt) {
  if (!CASTLE.atk || CASTLE.phase < 2 || CASTLE.won || state !== 'play') return;
  if ((CASTLE.winT = (CASTLE.winT || 0) - dt) > 0) return; CASTLE.winT = 0.5;
  const R = CASTLE.rooms[10], inR = (x, z) => x > R[0] && x < R[1] && z > R[2] && z < R[3];
  const o = enemies.some(e => e.team === 'orange' && isUp(e) && !e.special && inR(e.s.position.x, e.s.position.z));
  const b = enemies.filter(e => e.team === 'blue' && isUp(e) && !e.special && inR(e.s.position.x, e.s.position.z)).length + (inR(player.pos.x, player.pos.z) ? 2 : 0);
  CASTLE.hold = !o && b >= 2 ? (CASTLE.hold || 0) + 0.5 : Math.max(0, (CASTLE.hold || 0) - 0.5);
  if (CASTLE.hold >= 6) { CASTLE.won = true; CASTLE.log.push('win'); showBanner('本陣、奪取！', '橙組の本陣の旗を奪った — 城は落ちた'); Sfx.fanfare(); setTimeout(() => { if (state === 'play') gameOver(true); }, 3500); }
}
// 攻め手の待機位置（敵が見えないとき）：段階ごとの目標へ寄る
function castleAtkSpot(e) {
  const ph = CASTLE.phase, a = e.ph;
  if (ph === 0) return [Math.cos(a) * 8, -9 + Math.sin(a) * 3];
  if (ph === 1) return [Math.cos(a) * 8, (CASTLE.gtUp || 0) >= 3 && !CASTLE.gtThin ? 22 + Math.sin(a) * 4 : 34 + Math.sin(a) * 2];
  return [Math.cos(a) * 3, 52 + Math.abs(Math.sin(a)) * 8];
}
// 攻める：青組の援軍（陣幕の前から／破れた門から／二の丸から）。破門隊の担ぎ手を 4 人まで
function castleAtkSpawn(kind) {
  const ph = CASTLE.phase, R = CASTLE.ram;
  let cx, cz; if (ph === 0) { cx = rand(-22, 22); cz = rand(-38, -30); } else if (ph === 1) { cx = rand(-10, 10); cz = rand(-22, -12); } else { cx = rand(-8, 8); cz = rand(3, 9); }
  const crew = ph === 0 && kind === 'mob' && (wave.ramWant || 0) > R.crew.filter(isUp).length;
  const e = spawnEnemy(cx, cz, kind, false, 'blue', crew ? { set: { ramCrew: true } } : {});
  if (crew && e) { R.crew.push(e); if (!R.crew.some((m, j) => j < R.crew.length - 1 && isUp(m)) && R.y < 0.5 && R.z < -20) { R.x = cx; R.z = cz + 2; } }
  return e;
}
// 櫃の戦い・攻める：橙組の守り手（櫃・武者走りの弓兵、砦の中の近接兵）。味方が迫った櫃へは足さない
function fortDefSpawn(kind) {
  if (kind === 'archer') {
    const near = q => Object.values(towers).some(T => Math.hypot(q.x - T.x, q.z - T.z) < 4 && (enemies.some(o => o.team === 'blue' && isUp(o) && Math.hypot(o.s.position.x - T.x, o.s.position.z - T.z) < 8) || Math.hypot(player.pos.x - T.x, player.pos.z - T.z) < 8));
    const free = perches.filter(q => !q.taken && !q.seiran && !near(q));
    if (free.length && Math.random() < 0.8) { const tw = free.filter(q => q.tower), q = tw.length && Math.random() < 0.5 ? pick(tw) : pick(free); return spawnEnemy(q.x, q.z, 'archer', false, 'orange', { y: q.y, perch: q }); }
    return spawnEnemy(rand(-25, 25), rand(12, 22), 'archer', false, 'orange');
  }
  return spawnEnemy(rand(-8, 8), rand(5, 13), 'mob', false, 'orange');
}
// 櫃の戦い・攻める：二基の櫃の上に橙組がいなくなり、味方がそばにいれば「制圧」。両方を 5 秒押さえれば勝ち
function fortAtkUpdate(dt) {
  if (!FORT.atk || builtStage !== 'fort' || FORT.won || state !== 'play') return;
  if ((FORT.t -= dt) > 0) return; FORT.t = 0.5;
  let all = true;
  for (const k in towers) { const T = towers[k];
    const o = enemies.some(e => e.team === 'orange' && isUp(e) && Math.abs(e.s.position.x - T.x) < 3.2 && Math.abs(e.s.position.z - T.z) < 3.2 && (e.baseY > 1 || (e.lad && e.lad.up)));
    const b = enemies.some(e => e.team === 'blue' && isUp(e) && Math.hypot(e.s.position.x - T.x, e.s.position.z - T.z) < 10) || Math.hypot(player.pos.x - T.x, player.pos.z - T.z) < 10 || (wave.toSpawn <= 0 && !enemies.some(e => e.team === 'orange' && isUp(e) && !e.special && Math.hypot(e.s.position.x - T.x, e.s.position.z - T.z) < 16));
    const was = T.clear; T.clear = !o && b; if (T.clear && !was) { popup((k === 'west' ? '西' : '東') + 'の櫃を制圧！'); (FORT.log || (FORT.log = [])).push('tw:' + k); }
    if (!T.clear) all = false; }
  FORT.hold = all ? FORT.hold + 0.5 : 0;
  if (FORT.hold >= 5) { FORT.won = true; (FORT.log || (FORT.log = [])).push('win'); showBanner('二基の櫃、制圧！', '砦は落ちた — 攻め手の勝ち'); Sfx.fanfare(); setTimeout(() => { if (state === 'play') gameOver(true); }, 3500); }
}
function castleHud() {
  if (!CASTLE.on) return '';
  if (CASTLE.phase === 0) return `　大手門 ${Math.ceil(CASTLE.gateHP / CS.GATE_MAX * 100)}%`;
  if (CASTLE.phase === 1) return CASTLE.atk ? `　二の丸 制圧 ${Math.round(CASTLE.cap * 100)}%` : `　二の丸 制圧され度 ${Math.round(CASTLE.cap * 100)}%`;
  return CASTLE.atk ? `　本陣 奪取 ${Math.round(Math.min(1, (CASTLE.hold || 0) / 6) * 100)}%` : '　城内の戦い';
}
// ====================================================================
//  v7：槍兵（槍：練習用のたんぽ槍）。近接の約2割。長い間合い（約2.7m）の突きと、一直線上 8m 以内の相手への「突撃」
//  ・突撃のまっすぐな一撃はほぼ一撃で倒す（体力の約9割）。かすめただけなら軽い
//  ・懐（1.2m 以内）に入られると弱い：突きの戻りが遅く、近すぎる突きは外れやすい。下がって間合いを取り直そうとする
//  当たりの表現は懐刀と同じ（白い閃光と土ぼこり）
// ====================================================================
const YARI = { rate: 0.2, reach: 2.75, chargeR: 8, chargeMin: 3.0, chargeSp: 2.0, windup: 0.62, recover: 0.85, inside: 1.25, chargeCd: 6 };
let YARI_MAT = null;
function makeYari(e) {
  if (!YARI_MAT) YARI_MAT = { shaft: new THREE.MeshLambertMaterial({ color: 0x5a3b22 }), tip: new THREE.MeshLambertMaterial({ color: 0xece6d6 }), band: new THREE.MeshLambertMaterial({ color: 0x1d1d22 }),
    gS: new THREE.CylinderGeometry(0.016, 0.019, 2.9, 6), gT: new THREE.SphereGeometry(0.055, 8, 6), gB: new THREE.CylinderGeometry(0.024, 0.024, 0.09, 6) };   // 形は共有
  const h = e.figH, g = new THREE.Group(), L = 2.9;
  const shaft = new THREE.Mesh(YARI_MAT.gS, YARI_MAT.shaft); shaft.rotation.x = Math.PI / 2; shaft.position.z = L / 2 - 0.9; g.add(shaft);
  const tip = new THREE.Mesh(YARI_MAT.gT, YARI_MAT.tip); tip.scale.set(1, 1, 1.5); tip.position.z = L - 0.9 + 0.04; g.add(tip);   // たんぽ（布を巻いた穂先）
  const band = new THREE.Mesh(YARI_MAT.gB, YARI_MAT.band); band.rotation.x = Math.PI / 2; band.position.z = L - 0.9 - 0.12; g.add(band);
  g.position.set(-0.17 * h / 1.6, 0.55 * h, 0.12); g.rotation.x = -1.3;
  e.s.add(g); e.spear = g; e.spAng = -1.3; e.spPush = 0;
  return g;
}
function yariDrop(e) {
  const g = e.spear; e.spear = null; if (!g) return;
  const p = e.s.position, a = (e.face || 0) + rand(-0.6, 0.6) + Math.PI / 2;
  e.s.remove(g); scene.add(g); e.extra.push(g); g.visible = true; e.spDrop = g;
  g.rotation.set(0, a, 0); g.position.set(p.x + Math.sin(a + Math.PI / 2) * 0.35, e.baseY + 0.03, p.z + Math.cos(a + Math.PI / 2) * 0.35);
  if (PLANE.on) g.position.y += 0.02;
}
function yariPose(e, dt) {
  const g = e.spear; if (!g) return;
  g.visible = e.state !== 'down' && !e.ramCrew && !e.hiddenAmb;
  if (!g.visible) return;
  let ang = -1.3, push = 0;
  const near = e.tgt && (e.tgt.isPlayer || isUp(e.tgt)), td = near ? Math.hypot(tgtPos(e.tgt).x - e.s.position.x, tgtPos(e.tgt).z - e.s.position.z) : 99;
  if (e.state === 'charge') { ang = -0.02; push = 0.25; }
  else if (e.state === 'windup') { ang = -0.06; push = -0.35 * Math.min(1, e.t / YARI.windup); }
  else if (e.state === 'recover') { ang = -0.06; push = e.t < 0.18 ? 0.55 : 0.55 * Math.max(0, 1 - (e.t - 0.18) / 0.5); }
  else if (e.state === 'approach' && near && td < 7) ang = -0.2;   // 構え（槍衾）
  else if (e.state === 'idle' || e.passive) ang = -1.3;
  else ang = -0.75;
  const k = Math.min(1, dt * (e.state === 'recover' && e.t < 0.18 ? 30 : 9));
  e.spAng += (ang - e.spAng) * k; e.spPush += (push - e.spPush) * k;
  g.rotation.x = e.spAng; g.position.z = 0.12 + e.spPush; g.position.y = 0.55 * e.figH * (1 - 0.3 * (e.crouch || 0));
}
const YSAY = {};
function yariSay(e, cat) {
  const X = VoicePack.man && VoicePack.man._extra, L = X && X[cat];
  if (!e || e.silenced || !e.s) return false;
  if ((YSAY[cat] || 0) > time) return true;
  YSAY[cat] = time + 3.5;
  const p = e.s.position, d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
  const it = L && L.length ? pick(L) : null, text = it ? it.text : (EXTRA_TEXT[cat] || [''])[0];
  Talk.as(e, () => { if (!(it && VoicePack.play(it.files[0], d, 1, VV_RATE[e.prof.vv] || 1)) && text) Voice.say(text, e.prof, 1); if (d < 32 && /^(smoke|sally|ladder|land)/.test(cat) && text) subtitle(text); });
  return true;
}
const EXTRA_TEXT = { smoke_out: ['煙が…外へ！'], smoke_throw: ['毒煙玉、いきます！'], ladder_go: ['梯子だ、上れーっ！'], sally_go: ['今だ、打って出よ！'], knife_throw: ['えいっ！'], land_go: ['上陸！ 続けーっ！'], yari_charge: ['突撃！'], yari_ready: ['槍衆、構え！'], amb_go: ['今です、かかれっ！'], gate_broken: ['門が破られた！ 二の丸へ！'], bailey_lost: ['二の丸は持たない！ 城内へ退いて！'],
  pit_fall: ['きゃっ、落とし穴！？'], ram_go: ['破門隊、押せーっ！'], guard_protect: ['殿をお守りしろ！'], guard_forward: ['近衛、前へ！'] };
// 突撃できるか：一直線上（間に味方・壁がない）、同じ高さ
function yariLaneClear(e, tx, tz) {
  const p = e.s.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  for (const o of enemies) {
    if (o === e || o === e.tgt || o.state === 'down' || o.team !== e.team || Math.abs(o.baseY - e.baseY) > 1) continue;
    const ox = o.s.position.x - p.x, oz = o.s.position.z - p.z, a = ox * ux + oz * uz; if (a < 0.3 || a > d) continue;
    if (Math.abs(ox * uz - oz * ux) < 0.65) return false;
  }
  if (boxes.length) { const v = new V3(); for (let s = 0.6; s < d - 0.4; s += 0.4) { v.set(p.x + ux * s, e.baseY + 0.9, p.z + uz * s); if (hitsBox(v, e.team)) return false; } }
  if (routeTo(p, tx, tz)[0] !== tx) return false;
  return true;
}
// 近接の「接近」中に呼ぶ：true なら（突撃を始めた／下がった）
function yariApproach(e, dt, dist, nx, nz, tx, tz) {
  if ((e.chgCd || 0) > 0) e.chgCd -= dt;
  const elev = elevD(e) > 0.6;
  if (!elev && (e.chgCd || 0) <= 0 && dist > YARI.chargeMin && dist < YARI.chargeR && e.cd <= 0.3 && yariLaneClear(e, tx, tz)) {
    e.state = 'charge'; e.t = 0; e.chg = { ux: nx, uz: nz, d0: dist, sx: e.s.position.x, sz: e.s.position.z, tgt: e.tgt };
    npcTint(e, 0.6); if (Math.random() < 0.6) yariSay(e, 'yari_charge');
    return true;
  }
  if (dist < YARI.inside && e.cd <= 0.6) {   // 懐に入られた：間合いを取り直す
    const p = e.s.position; steer(e, p.x - nx * 2, p.z - nz * 2, e.speed * 0.8, dt);
    return true;
  }
  return false;
}
function yariCharge(e, dt) {
  const C = e.chg, p = e.s.position; e.t += dt;
  const sp = e.speed * YARI.chargeSp * Math.min(1, 0.4 + e.t * 3);
  // 標的が少し横へずれても、ほんの少しだけ追う（直進が基本）
  const T = C.tgt, tp = T && (T.isPlayer || isUp(T)) ? tgtPos(T) : null;
  if (tp) { const dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz) || 1, cr = (dx / d) * C.uz - (dz / d) * C.ux; const a = clamp(cr, -1, 1) * 0.35 * dt; const c = Math.cos(a), s = Math.sin(a); const ux = C.ux * c + C.uz * s, uz = -C.ux * s + C.uz * c; C.ux = ux; C.uz = uz; }
  p.x += C.ux * sp * dt; p.z += C.uz * sp * dt;
  e.face = Math.atan2(C.ux, C.uz);
  // 穂先の前（0.6〜1.1m）にいる相手
  const hx = p.x + C.ux * 0.95, hz = p.z + C.uz * 0.95;
  let hit = null, clean = false;
  const foes = e.team === 'orange' ? [player, ...enemies] : enemies;
  for (const o of foes) {
    const isP = o === player; if (!isP && (o.team === e.team || !isUp(o) || o.hiddenAmb || Math.abs(o.baseY - e.baseY) > 1)) continue;
    if (isP && (state !== 'play' || Math.abs(player.pos.y - e.baseY) > 1)) continue;
    const op = isP ? player.pos : o.s.position, d = Math.hypot(op.x - hx, op.z - hz);
    if (d < 0.62) {
      const ax = op.x - p.x, az = op.z - p.z, al = Math.hypot(ax, az) || 1, cs = (ax * C.ux + az * C.uz) / al;
      hit = isP ? { isPlayer: true } : o; clean = cs > 0.95 && e.t > 0.3 && Math.random() < 0.8; break;
    }
  }
  const run = Math.hypot(p.x - C.sx, p.z - C.sz);
  if (hit) {
    if (hit.isPlayer) hurtPlayer(clean ? 55 : 14);
    else {
      const o = hit, op = o.s.position, dmg = clean ? Math.max(1, Math.round(o.hpMax * 0.9)) : 1;
      damageEnemy(o, dmg, p, false, { pt: new V3(op.x - C.ux * 0.15, o.baseY + o.figH * rand(0.5, 0.66), op.z - C.uz * 0.15), thrust: true, push: clean ? 1.6 : 0.6 }, e);
    }
    if (window.__ystat) window.__ystat.push({ team: e.team, clean, run: +run.toFixed(1) });
    e.state = 'recover'; e.t = -0.25; e.cd = rand(1.1, 1.6); e.chgCd = YARI.chargeCd; npcTint(e, 0);
  } else if (e.t > 1.6 || run > C.d0 + 1.8) {
    e.state = 'recover'; e.t = -0.4; e.cd = rand(0.9, 1.3); e.chgCd = YARI.chargeCd * 0.6; npcTint(e, 0);   // 外した：前のめりで止まる（隙）
  }
}
// ====================================================================
//  v7：近衛分隊（青組）。いつも殿のそばに 4〜6 人（懐刀・槍・弓 1〜2）
//  ・本陣では殿／本陣のまわりを固める。殿が出ると 2〜4m の輪で一緒に動き、近い敵と殿の間に立つ
//  ・殿の 10m 以内（弓は 22m）に来た敵だけを相手にし、追いかけて離れない
//  ・秘書課・救護は内側（殿のすぐ後ろ）、近衛は外側。能力は皆と同じ
//  ・倒れた近衛は、波の合間に援軍から補充される
// ====================================================================
const GUARD = { list: [], cd: {}, lastThreat: 0 };
const GUARD_KINDS = ['mob', 'yari', 'yari', 'archer', 'mob', 'archer'];
function guardWant() { return wave.n >= 3 ? 6 : 5; }
function guardSpawn(i) {
  const kind = GUARD_KINDS[i % GUARD_KINDS.length], a = i / 6 * Math.PI * 2;
  let x, z;
  if (PLANE.on) { x = [-0.4, 0.4, 0.0, -0.9, 0.9, 0.0][i % 6]; z = [15.6, 15.6, 16.6, 18.6, 18.6, 14.9][i % 6]; }   // ファーストクラス／ラウンジ：殿の席の前後
  else { const c = player.pos; x = c.x + Math.sin(a) * 2.6; z = c.z + Math.cos(a) * 2.6; if (CASTLE.on) { x = clamp(x, -7.6, 7.6); z = clamp(z, CS.ZC + 0.5, CS.BZ1 - 0.5); } }
  const e = spawnEnemy(x, z, kind === 'archer' ? 'archer' : 'mob', false, 'blue', { set: { guard: i + 1 }, yari: kind === 'yari' ? 1 : -1 });
  if (e) { e.s.rotation.y = e.face = Math.atan2(x - player.pos.x, z - player.pos.z); }
  return e;
}
function guardFill(n, announce) {
  GUARD.list = GUARD.list.filter(isUp);
  const used = new Set(GUARD.list.map(e => e.guard - 1)); let k = 0;
  for (let i = 0; i < guardWant() && GUARD.list.length < guardWant(); i++) { if (used.has(i)) continue; const e = guardSpawn(i); if (e) { GUARD.list.push(e); k++; } }
  if (announce && k) popup(`近衛分隊に ${k} 人が補充されました`);
  return k;
}
// 輪の位置：脅威の方向を前に、殿の 2〜4m
function guardSlot(e, thr) {
  const live = GUARD.list.filter(isUp), i = Math.max(0, live.indexOf(e)), n = Math.max(1, live.length), c = player.pos;
  if (PLANE.on) {   // 機内：通路の前後に並ぶ
    const dirZ = thr ? Math.sign(thr.s.position.z - c.z) || -1 : -1;
    const lane = [[0, 2.2], [0, 3.2], [0, -1.8], [0, 4.2], [0, -2.8], [0, 5.2]][i % 6];
    return [lane[0], c.z + lane[1] * dirZ];
  }
  if (CAR.riding && carOn() && !thr) return carRingPt(i, 2.0);
  const home = !!inHQ() && hq, base = thr ? Math.atan2(thr.s.position.x - c.x, thr.s.position.z - c.z) : player.yaw + Math.PI;
  const offs = thr ? [0, -0.55, 0.55, -1.1, 1.1, Math.PI] : null;
  const a = thr ? base + offs[i % 6] : base + (i / n) * Math.PI * 2 + Math.PI / n;
  const r = home ? 3.4 : thr ? 2.8 + (i % 2) * 0.8 : 3.2;
  let x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
  if (CASTLE.on && inCastleBldg(c.x, c.z)) { const rg = CASTLE.rooms[castleRegion(c.x, c.z)]; if (rg) { x = clamp(x, rg[0] + 0.4, rg[1] - 0.4); z = clamp(z, rg[2] + 0.4, rg[3] - 0.4); } }
  return [x, z];
}
function guardThreat(r) {
  let best = null, bd = r;
  for (const o of enemies) { if (o.team !== 'orange' || !isUp(o) || o.state === 'pit') continue; const d = Math.hypot(o.s.position.x - player.pos.x, o.s.position.z - player.pos.z); if (d < bd) { bd = d; best = o; } }
  return best;
}
// true：このフレームは輪の位置へ（戦わない）。false：殿に近づく敵と戦う
function guardBrain(e, dt) {
  const p = e.s.position, c = player.pos, dk = Math.hypot(p.x - c.x, p.z - c.z);
  const R = e.kind === 'archer' ? 22 : 10, thr = guardThreat(R), far = dk > (e.kind === 'archer' ? 9 : 7);
  if (thr && !far && (!PLANE.intro)) { if (GUARD.lead === e) guardCall(e, 'guard_protect', 25); return false; }
  const near = guardThreat(26);
  const [sx, sz] = guardSlot(e, near);
  if (MTN.on) MTN.who = e;
  const d = Math.hypot(sx - p.x, sz - p.z);
  e.tgt = null; npcTint(e, 0);
  if (d > 0.5) { steer(e, sx, sz, e.speed * (d > 4 ? 1.2 : d > 1.5 ? 1 : 0.6), dt); e.state = e.kind === 'archer' ? 'advance' : 'approach'; }
  else { e.state = 'idle'; e.faceWant = Math.atan2(p.x - c.x, p.z - c.z); if (near) e.faceWant = Math.atan2(near.s.position.x - p.x, near.s.position.z - p.z); }
  if (near && GUARD.lead === e && !inHQ()) guardCall(e, 'guard_forward', 40);
  return true;
}
function guardCall(e, cat, cd) { if ((GUARD.cd[cat] || 0) > time) return; GUARD.cd[cat] = time + cd; yariSay(e, cat); }
// 近衛の標的は、殿の近くの敵だけ
function guardCanTarget(e, x, z) { return Math.hypot(x - player.pos.x, z - player.pos.z) < (e.kind === 'archer' ? 24 : 11.5); }
function updateGuards() {
  GUARD.list = GUARD.list.filter(isUp);
  if (!GUARD.lead || !isUp(GUARD.lead) || !GUARD.list.includes(GUARD.lead)) {
    const s = squads.blue.find(q => q.k === 'guard');
    GUARD.lead = (s && isUp(s.leader) && s.leader.guard ? s.leader : null) || GUARD.list.find(o => o.kind !== 'archer') || GUARD.list[0] || null;
  }
}
// ====================================================================
//  ステージ「浜の戦い」（v8）：殿の側（青組）が小早（こばや）で浜へ漕ぎ寄せ、高台のトーチカ（機関銃の陣地）を攻める
//   海（z<0）→ 浅瀬 → 白い砂浜（0〜24）→ 乱杭（12〜22）→ 斜面と逆茂木（24〜48）→ 高台（y=5）に 4 つのトーチカ
//   機関銃は「ダダダダダダダ、ダ…」と間を置いて掃射。射程は浜と沖の一帯まで（それより沖は安全）
//   当たっても白い閃光と土ぼこりだけ（血は無し）。舟の上で倒れた娘は舟の中で崩れたまま（海には落ちない）
// ====================================================================
const BH = { TOP: 5, Z1: 24, Z2: 48, SHORE: 0, WATER: -0.15, XW: 50, MG_R: 76, BOAT_GOAL: -4.3 };
const BEACH = { on: false, boats: [], pbs: [], tracers: [], waveT: 0, king: null, gboat: null, won: false, looks: new Set(), log: [], cars: [], carN: 0, lordCar: null };
// 塹壕戦：第一波は両軍100人。青組は号令まで塹壕内で待機し、橙組は塹壕とトーチカを守る。
const TRENCH = { on:false, started:false, blue:[], orange:[], fireT:0, won:false, shots:0, posts:[], cars:[], planes:[], tracers:[], elapsed:0, assaultT:22, enemyAssaultUntil:0, blueRetreatT:0, blueRetreating:false, reinfDone:false, enemyAirDone:false, airDone:false };
// 極寒ステージ：縦に長い峡谷。雪のクレバス、道を塞ぐ川、針状の木片、川の冷気、吹雪、かまくら
const SNOW = {
  on: false, cold: 0, blizzard: false, riverT: 0, riverOpen: false, riverSaid: false, riverBarrier: null, riverBridge: null,
  debrisT: 8, campT: 0, campDone: false, cleared: false, won: false, pits: [], markers: [], flakes: [], shards: [],
  lastHurt: 0, supplies: 2, npcT: 0, spawnI: 0, shardMat: null,
  posts: [
    [[-2.2, 58], [2.6, 46], [-1.4, 34], [3.1, 22], [0.2, 12], [-3.0, 16]],
    [[1.6, -10], [-2.8, -20], [2.4, -32], [-1.1, -44], [3.0, -52], [0, -36]],
    [[-2.2, -60], [2.5, -68], [0.2, -76], [-3.0, -84], [2.2, -90], [0.4, -64]],
  ],
};
function snowUse() { return false; }
function groundH(x, z) {
  if (!BEACH.on) return 0;
  let h;
  if (z < 0) h = Math.max(-1.3, z * 0.06);
  else if (z < BH.Z1) h = z * 0.01;
  else if (z < BH.Z2) { const t = (z - BH.Z1) / (BH.Z2 - BH.Z1); h = 0.24 + (BH.TOP - 0.24) * t * t * (3 - 2 * t); }
  else h = BH.TOP;
  const ax = Math.abs(x); if (ax > BH.XW) h += Math.min(14, (ax - BH.XW) * 0.5) * (z > -6 ? 1 : Math.max(0, 1 + (z + 6) / 20));   // 左右の岬
  return h;
}
let BHM = null;
function beachMats() {
  if (BHM) return BHM;
  const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  const plank = canvasTex(128, 128, (g, w, h) => { for (let y = 0; y < h; y += 16) { const l = rand(-14, 14); g.fillStyle = `rgb(${150 + l | 0},${104 + l | 0},${62 + l | 0})`; g.fillRect(0, y, w, 16); g.fillStyle = 'rgba(50,30,15,.45)'; g.fillRect(0, y, w, 1.5); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(90,55,25,.25)'; g.fillRect(Math.random() * w, y + rand(3, 13), rand(10, 40), 1); } } }, 1);
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping;
  const conc = canvasTex(256, 256, (g, w, h) => {   // 打ちっぱなしのコンクリート：しみと型枠の跡
    g.fillStyle = '#9a958a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { const l = rand(-25, 20); g.fillStyle = `rgba(${130 + l | 0},${126 + l | 0},${116 + l | 0},.35)`; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 4), rand(1, 4)); }
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${rand(140, 170) | 0},${rand(90, 110) | 0},60,.18)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(8, 30), rand(6, 22), 0, 0, 7); g.fill(); }
    for (let y = 0; y < h; y += 42) { g.fillStyle = 'rgba(60,58,52,.25)'; g.fillRect(0, y, w, 2); }
    for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(40,40,36,.35)'; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-12, 12); y += rand(4, 14); g.lineTo(x, y); } g.stroke(); }
  }, 1);
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping;
  const banner = canvasTex(64, 192, (g, w, h) => {   // 小早の赤い幟：白い横線と白丸に文字
    g.fillStyle = '#c8202a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6f1ea'; g.fillRect(0, 10, w, 7); g.fillRect(0, 22, w, 4);
    g.beginPath(); g.arc(w / 2, 64, 22, 0, 7); g.fill(); g.fillStyle = '#c8202a'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('上', w / 2, 65);
    g.fillStyle = '#f6f1ea'; g.font = 'bold 22px serif'; g.fillText('小', w / 2, 116); g.fillText('早', w / 2, 146);
  });
  const sea = canvasTex(64, 256, (g, w, h) => {   // 沖（上）の紺から、浅瀬（下）のエメラルドへ
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d5c8f'); gr.addColorStop(0.55, '#2a83a8'); gr.addColorStop(0.82, '#3fb4c0'); gr.addColorStop(0.94, '#7fd6cf'); gr.addColorStop(1, '#b9ebe0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const foam = canvasTex(256, 32, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${rand(0.25, 0.8)})`; g.beginPath(); g.ellipse(Math.random() * w, rand(8, 24), rand(3, 12), rand(1, 3), 0, 0, 7); g.fill(); } });
  foam.wrapS = THREE.RepeatWrapping;
  const hole = canvasTex(32, 32, (g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(10,6,3,1)'); gr.addColorStop(0.35, 'rgba(25,15,8,.95)'); gr.addColorStop(0.55, 'rgba(200,170,120,.8)'); gr.addColorStop(1, 'rgba(200,170,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  BHM = { L, wood: L(0xffffff, { map: plank }), woodD: L(0x5a3a20), conc: L(0xffffff, { map: conc }), concD: new THREE.MeshBasicMaterial({ color: 0x0c0b0a }), banner: L(0xffffff, { map: banner, side: THREE.DoubleSide }),
    sea: new THREE.MeshLambertMaterial({ map: sea, transparent: true, opacity: 0.86, depthWrite: false }), foam: new THREE.MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, opacity: 0.8 }),
    drum: L(0x7a2a18), skin: L(0xeee2c8), metal: L(0x2c2e30), branch: L(0x5b4630), stake: L(0x6a5238), rock: L(0x77756e), headland: L(0x3f6b34), roof: L(0x3b3530), cloth: L(0xf1ebde, { side: THREE.DoubleSide }),
    hole: new THREE.MeshBasicMaterial({ map: hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    flash: new THREE.SpriteMaterial({ color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), plantA: L(0x5f8f3c), plantB: L(0x4c7a32) };
  return BHM;
}
// ---- 小早（こばや）：長さ 10m、幅 2.2m。舳先は +z。yakata＝殿の舟の屋形 ----
const BOAT_L = 10, BOAT_W = 2.2, BOAT_DECK = 0.12, BOAT_GW = 0.62;
const BOAT_SEATS = (() => { const s = []; for (const z of [2.6, 1.5, 0.4, -0.7, -1.8, -2.9]) for (const x of [-0.48, 0.48]) s.push([x, z]); return s; })();
function boatOutline(inset) {
  const sh = new THREE.Shape(), hw = BOAT_W / 2 - inset, zb = BOAT_L / 2 - inset * 1.6, zs = -BOAT_L / 2 + inset, zk = BOAT_L / 2 - 1.8;
  sh.moveTo(-hw * 0.82, zs); sh.lineTo(hw * 0.82, zs); sh.quadraticCurveTo(hw, zs + 0.6, hw, zs + 2); sh.lineTo(hw, zk); sh.quadraticCurveTo(hw * 0.95, zb - 0.5, 0, zb);
  sh.quadraticCurveTo(-hw * 0.95, zb - 0.5, -hw, zk); sh.lineTo(-hw, zs + 2); sh.quadraticCurveTo(-hw, zs + 0.6, -hw * 0.82, zs);
  return sh;
}
let BOAT_GEO = null;
function boatGeo() {
  if (BOAT_GEO) return BOAT_GEO;
  const outer = boatOutline(0), inner = boatOutline(0.09); outer.holes.push(new THREE.Path(inner.getPoints(24)));
  const wall = new THREE.ExtrudeGeometry(outer, { depth: BOAT_GW, bevelEnabled: false, curveSegments: 10 }); wall.rotateX(-Math.PI / 2); wall.translate(0, -0.05, 0);   // 形は x-y 面に描いたので、y→z に回す
  // 回転で z が反転するので、z を反転して舳先を +z に
  const pa = wall.attributes.position.array; for (let i = 2; i < pa.length; i += 3) pa[i] = -pa[i]; wall.computeVertexNormals();
  const ua = wall.attributes.uv.array; for (let i = 0; i < ua.length; i++) ua[i] *= 0.35;
  const bot = new THREE.ShapeGeometry(boatOutline(0.08), 10); bot.rotateX(-Math.PI / 2); const pb = bot.attributes.position.array; for (let i = 2; i < pb.length; i += 3) pb[i] = -pb[i];
  bot.translate(0, BOAT_DECK, 0); const ub = bot.attributes.uv.array; for (let i = 0; i < ub.length; i++) ub[i] *= 0.4;
  const keel = new THREE.ShapeGeometry(boatOutline(0.0), 10); keel.rotateX(Math.PI / 2); const pk = keel.attributes.position.array; for (let i = 2; i < pk.length; i += 3) pk[i] = -pk[i]; keel.translate(0, -0.05, 0);
  BOAT_GEO = { wall, bot, keel };
  return BOAT_GEO;
}
function makeBoat(i, x, z, opt = {}) {
  const M = beachMats(), G = boatGeo(), g = new THREE.Group();
  g.add(new THREE.Mesh(G.wall, M.wood), new THREE.Mesh(G.bot, M.wood), new THREE.Mesh(G.keel, M.woodD));
  for (const [, sz] of BOAT_SEATS.filter((s, k) => k % 2 === 0)) { const t = new THREE.Mesh(new THREE.BoxGeometry(BOAT_W - 0.2, 0.05, 0.22), M.woodD); t.position.set(0, 0.36, sz - 0.25); g.add(t); }   // 腰掛け板
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, BOAT_L - 2.4), M.woodD); for (const s of [-1, 1]) { const m = gun.clone(); m.position.set(s * (BOAT_W / 2 - 0.02), BOAT_GW - 0.05, -0.4); g.add(m); }   // 舷の縁
  // 櫓・櫂（左右 3 本ずつ）
  const oars = [];
  for (const s of [-1, 1]) for (const oz of [1.9, 0, -1.9]) {
    const piv = new THREE.Group(); piv.position.set(s * (BOAT_W / 2), BOAT_GW - 0.02, oz);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.06), M.woodD); sh.position.x = s * 0.9; piv.add(sh);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.22), M.woodD); bl.position.x = s * 2.05; piv.add(bl);
    g.add(piv); oars.push({ piv, s, ph: oz * 0.1 });
  }
  // 艫の赤い幟（2 本）と太鼓
  const flags = [];
  for (const fx of [-0.55, 0.55]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5), M.woodD); pole.position.set(fx, 1.7, -4.1); g.add(pole);
    const geo = new THREE.PlaneGeometry(0.62, 1.8, 1, 4); geo.translate(0.33, 0, 0);
    const b = new THREE.Mesh(geo, M.banner); b.position.set(fx, 2.45, -4.1); b.rotation.y = Math.PI / 2; g.add(b); flags.push(b);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.5, 14), M.drum); drum.rotation.x = Math.PI / 2 - 0.5; drum.position.set(0, 0.62, -3.55); g.add(drum);
  const skin = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), M.skin); skin.position.set(0, 0.74, -3.33); skin.rotation.x = -0.5 - Math.PI / 2 + Math.PI / 2; g.add(skin); skin.lookAt(skin.position.clone().add(new V3(0, 0.88, 0.48)));
  let cabin = null;
  if (opt.yakata) {   // 屋形：細い柱と切妻の屋根、腰の板と白い幕
    cabin = new THREE.Group();
    for (const px of [-0.95, 0.95]) for (const pz of [-2.6, -0.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), M.woodD); p.position.set(px, 0.95 + BOAT_DECK, pz); cabin.add(p); }
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 2.9), M.roof); r.position.set(s * 0.55, 2.2, -1.4); r.rotation.z = -s * 0.38; cabin.add(r); }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.0), M.woodD); ridge.position.set(0, 2.43, -1.4); cabin.add(ridge);
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), M.cloth); c.position.set(s * 0.97, 1.72, -1.4); c.rotation.y = Math.PI / 2; cabin.add(c); }
    const tat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 2.3), new THREE.MeshLambertMaterial({ color: 0xcdbf86 })); tat.position.set(0, BOAT_DECK + 0.04, -1.4); cabin.add(tat);
    g.add(cabin);
  }
  // 弾の穴（舟の板に残る）：最大 80
  const holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.11), M.hole, 80); holes.count = 0; holes.frustumCulled = false; g.add(holes);
  g.position.set(x, BH.WATER + 0.04, z); stageRoot.add(g);
  const B = { i, g, x, z, yaw: 0, sp: opt.sp || 1.35, row: 0, oars, flags, cabin, holes, nHole: 0, crew: [], seats: new Array(BOAT_SEATS.length).fill(null), beached: false, drift: false, yakata: !!opt.yakata, guard: !!opt.guard,
    floor: { x0: 0, x1: 0, z0: 0, z1: 0, y: BH.WATER + 0.04 + BOAT_DECK, boat: true }, name: opt.name || '', delay: opt.delay || 0, goal: opt.goal || BH.BOAT_GOAL, said: false, wob: Math.random() * 6 };
  floors.push(B.floor); boatFloor(B);
  BEACH.boats.push(B);
  return B;
}
function boatFloor(B) { const f = B.floor; f.x0 = B.x - BOAT_W / 2 + 0.12; f.x1 = B.x + BOAT_W / 2 - 0.12; f.z0 = B.z - BOAT_L / 2 + 0.3; f.z1 = B.z + BOAT_L / 2 - 1.0; }
function boatLocal(B, x, z) { const dx = x - B.x, dz = z - B.z, c = Math.cos(B.yaw), s = Math.sin(B.yaw); return [dx * c - dz * s, dx * s + dz * c]; }
function boatWorld(B, lx, lz) { const c = Math.cos(B.yaw), s = Math.sin(B.yaw); return [B.x + lx * c + lz * s, B.z - lx * s + lz * c]; }
const inBoat = (B, x, z, m = 0) => { const [lx, lz] = boatLocal(B, x, z); return Math.abs(lx) < BOAT_W / 2 - 0.1 + m && lz > -BOAT_L / 2 + 0.2 - m && lz < BOAT_L / 2 - 0.6 + m; };
function boatAt(x, z, m = 0) { for (const B of BEACH.boats) if (inBoat(B, x, z, m)) return B; return null; }
// 舟に乗せる（座らせる）
function boardBoat(e, B, slot) {
  if (slot == null || B.seats[slot]) { slot = B.seats.findIndex(s => !s); if (slot < 0) slot = (Math.random() * BOAT_SEATS.length) | 0; }
  B.seats[slot] = e; e.boat = B; e.boatSlot = slot;
  const [lx, lz] = BOAT_SEATS[slot], [wx, wz] = boatWorld(B, lx, lz);
  e.seated = { x: wx, z: wz, boat: B }; e.baseY = B.floor.y; e.s.position.set(wx, e.baseY, wz); e.state = 'idle'; e.passive = true;
  e.s.rotation.y = e.face = B.yaw; e.standAt = null;
  if (!B.crew.includes(e)) B.crew.push(e);
}
// ---- トーチカ（4 つ、高台）：前面に横長の銃眼、背面に入口。中に機関銃 ----
const PB_W = 5.0, PB_D = 4.4, PB_H = 2.5;
function makePillbox(i, x, z) {
  const M = beachMats(), y = BH.TOP, B = boxBatch(M.conc), t = 0.4, x0 = x - PB_W / 2, x1 = x + PB_W / 2, z0 = z - PB_D / 2, z1 = z + PB_D / 2;
  const sy0 = y + 1.0, sy1 = y + 1.42, slitHalf = 1.0;
  // 前（海側）の壁：銃眼の上下と左右
  B.add(x0, x1, y - 0.3, sy0, z0, z0 + t, true, 0.35); B.add(x0, x1, sy1, y + PB_H, z0, z0 + t, true, 0.35);
  B.add(x0, x - slitHalf, sy0, sy1, z0, z0 + t, true, 0.35); B.add(x + slitHalf, x1, sy0, sy1, z0, z0 + t, true, 0.35);
  // 左右と後ろ（入口 1.2m）
  B.add(x0, x0 + t, y - 0.3, y + PB_H, z0, z1, true, 0.35); B.add(x1 - t, x1, y - 0.3, y + PB_H, z0, z1, true, 0.35);
  B.add(x0, x - 0.6, y - 0.3, y + PB_H, z1 - t, z1, true, 0.35); B.add(x + 0.6, x1, y - 0.3, y + PB_H, z1 - t, z1, true, 0.35); B.add(x - 0.6, x + 0.6, y + 2.0, y + PB_H, z1 - t, z1, true, 0.35);
  B.add(x0 - 0.05, x1 + 0.05, y + PB_H, y + PB_H + 0.35, z0 - 0.05, z1 + 0.05, true, 0.35);   // 屋根（厚い）
  B.add(x0 + t, x1 - t, y - 0.02, y + 0.03, z0 + t, z1 - t, false, 0.5);   // 床
  const m = B.done();
  const dark = new THREE.Mesh(new THREE.BoxGeometry(slitHalf * 2 - 0.02, sy1 - sy0, 0.02), M.concD); dark.position.set(x, (sy0 + sy1) / 2, z0 + t - 0.01); stageRoot.add(dark);   // 銃眼の奥の暗がり
  const din = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.0, 0.02), M.concD); din.position.set(x, y + 1.0, z0 + t + 0.02); din.visible = false; stageRoot.add(din);
  // 機関銃：三脚・銃身・弾薬箱（銃眼の内側）
  const gun = new THREE.Group(), gy = sy0 + 0.1;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.75), M.metal); gun.add(body);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), M.metal); bar.rotation.x = Math.PI / 2; bar.position.z = -0.75; gun.add(bar);
  const jac = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 10), M.metal); jac.rotation.x = Math.PI / 2; jac.position.z = -0.5; gun.add(jac);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), new THREE.MeshLambertMaterial({ color: 0x4b5a3a })); box.position.set(0.22, -0.08, 0.1); gun.add(box);
  const mount = new THREE.Group(); mount.position.set(x, gy, z0 + t + 0.75); mount.add(gun); stageRoot.add(mount);
  for (const a of [0, 2.1, 4.2]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), M.metal); l.position.set(x + Math.sin(a) * 0.32, gy - 0.5, z0 + t + 0.75 + Math.cos(a) * 0.32); l.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); stageRoot.add(l); }
  const flash = new THREE.Sprite(M.flash); flash.scale.set(0.7, 0.7, 1); flash.visible = false; stageRoot.add(flash);
  const fbox = boxes[boxes.length - 11];   // 前の壁（下）… 銃眼の当たりは下の 4 枚を使う
  // 銃眼：内からは広く、外からは細く矢を通す
  for (const b of boxes.slice(-10, -6)) { b.slits = [x]; b.sy0 = sy0; b.sy1 = sy1; b.slitIn = 'orange'; b.slitW = [slitHalf, slitHalf * 0.55]; }
  const fl = nobori(x + PB_W / 2 + 0.8, z + PB_D / 2 + 0.5, '#d9741c', '#fff6e8', ['壱', '弐', '参', '肆'][i]); fl.position.y = y;
  const P = { i, x, z, y, x0, x1, z0, z1, mount, gun, flash, slitZ: z0 + t, sy0, sy1, aim: new V3(x, 0, -10), aimV: new V3(), burst: 0, nextT: 2 + i * 0.7, shotT: 0, tgt: null, gunners: [], members: [], taken: false, silenced: false, flag: fl, said: false, wasSil: false,
    door: [x, z1 + 0.9], inner: [x, z + 0.3], slots: [[x - 0.55, z0 + t + 0.55], [x + 0.55, z0 + t + 0.55]] };
  BEACH.pbs.push(P);
  return P;
}
const inPB = (P, x, z) => x > P.x0 + 0.3 && x < P.x1 - 0.3 && z > P.z0 + 0.3 && z < P.z1 - 0.3;
function pbAt(x, z) { for (const P of BEACH.pbs) if (inPB(P, x, z)) return P; return null; }
// ---- 逆茂木（斜面の 2 列、すき間から抜ける）と乱杭（浜の杭の原） ----
const ABATIS = [{ z: 31, gaps: [-21, 3, 24] }, { z: 40.5, gaps: [-11, 14, 33] }];
const GAP_HW = 1.6;
function buildAbatis(M) {
  const geo = new THREE.CylinderGeometry(0.035, 0.06, 1.9, 4), list = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const R of ABATIS) {
    const segs = []; let a = -BH.XW;
    for (const gx of [...R.gaps, BH.XW + GAP_HW]) { segs.push([a, gx - GAP_HW]); a = gx + GAP_HW; }
    for (const [u0, u1] of segs) {
      if (u1 - u0 < 0.5) continue;
      const h = groundH(0, R.z);
      boxes.push({ x0: u0, x1: u1, z0: R.z - 0.55, z1: R.z + 0.55, y0: h - 0.4, y1: h + 1.0, abatis: true });
      covers.push(...Array.from({ length: Math.floor((u1 - u0) / 3) }, (_, k) => ({ x: u0 + 1.5 + k * 3, z: R.z - 1.1, r: 0.5, type: 'bundle', h: h + 1.0, y: h })));
      for (let x = u0 + 0.2; x < u1 - 0.1; x += 0.32) for (let k = 0; k < 3; k++) {   // 枝先を海へ向けて斜めに組む
        const yy = h + 0.35 + rand(-0.05, 0.2), zz = R.z + rand(-0.3, 0.2);
        e.set(-1.0 + rand(-0.35, 0.3), rand(-0.6, 0.6), rand(-0.6, 0.6)); q.setFromEuler(e);
        m4.compose(new V3(x + rand(-0.12, 0.12), yy, zz), q, new V3(1, rand(0.7, 1.25), 1)); list.push(m4.clone());
      }
      // 横木
      for (const yo of [0.25, 0.65]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, u1 - u0, 5), M.branch); lg.rotation.z = Math.PI / 2; lg.position.set((u0 + u1) / 2, h + yo, R.z + 0.15); stageRoot.add(lg); }
    }
  }
  const im = new THREE.InstancedMesh(geo, M.branch, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); stageRoot.add(im);
  // 乱杭：浜の 12〜22m に不規則な杭。通れるが、杭の間をすり抜けるので遅い
  const sg = new THREE.CylinderGeometry(0.07, 0.11, 1, 6), st = [];
  for (let i = 0; i < 230; i++) {
    const x = rand(-BH.XW + 2, BH.XW - 2), z = rand(12, 22); if (Math.abs(x) < 1.6 && z < 14) continue;
    const hh = rand(0.5, 1.3); m4.compose(new V3(x, groundH(x, z) + hh / 2 - 0.05, z), q.setFromEuler(e.set(rand(-0.25, 0.25), 0, rand(-0.25, 0.25))), new V3(1, hh, 1)); st.push(m4.clone());
    colliders.push({ x, z, r: 0.13, stake: true });
  }
  const sm = new THREE.InstancedMesh(sg, M.stake, st.length); st.forEach((m, i) => sm.setMatrixAt(i, m)); stageRoot.add(sm);
}
function buildBeachTerrain(M) {
  const W = 260, D = 230, g = new THREE.PlaneGeometry(W, D, 104, 92); g.rotateX(-Math.PI / 2); g.translate(0, 0, D / 2 - 45);
  const pa = g.attributes.position.array, col = new Float32Array(pa.length), c = new THREE.Color(), sand = new THREE.Color(0xf1e8d2), wet = new THREE.Color(0xd9cfb4), grass = new THREE.Color(0x76984f), dgr = new THREE.Color(0x5d7f3d), cliff = new THREE.Color(0x4f6e3a);
  for (let i = 0; i < pa.length; i += 3) {
    const x = pa[i], z = pa[i + 2], h = groundH(x, z) + (z > 2 ? Math.sin(x * 0.7 + z * 0.3) * 0.02 : 0);
    pa[i + 1] = h;
    const n = Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.5 + 0.5;
    if (Math.abs(x) > BH.XW + 4 && z > -8) c.copy(cliff).lerp(dgr, n * 0.5);
    else if (z < 1) c.copy(wet).lerp(sand, clamp((z + 1) / 2, 0, 1));
    else if (z < 20) c.copy(sand).lerp(grass, z > 16 ? (z - 16) / 4 * 0.25 * n : 0);
    else if (z < 28) c.copy(sand).lerp(grass, clamp((z - 20) / 8, 0, 1) * (0.6 + 0.4 * n));
    else c.copy(grass).lerp(dgr, n * 0.6);
    col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const gm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); stageRoot.add(gm);
  // 海：沖の紺から浅瀬のエメラルドへ（半透明で、浅瀬の砂が透ける）
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), M.sea); sea.rotation.x = -Math.PI / 2; sea.position.set(0, BH.WATER, -210 + 1.5); sea.renderOrder = 1; stageRoot.add(sea);
  M.sea.map.repeat.set(1, 1);
  const sea2 = new THREE.Mesh(new THREE.PlaneGeometry(260, 60), new THREE.MeshLambertMaterial({ color: 0x2a83a8, transparent: true, opacity: 0.86, depthWrite: false })); sea2.rotation.x = -Math.PI / 2; sea2.position.set(-160, BH.WATER, 20); stageRoot.add(sea2);
  const sea3 = sea2.clone(); sea3.position.x = 160; stageRoot.add(sea3);
  // 波打ち際の白い泡（ゆっくり寄せては返す）
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(2 * BH.XW + 10, 1.6), M.foam); foam.rotation.x = -Math.PI / 2; foam.position.set(0, BH.WATER + 0.02, -0.6); foam.renderOrder = 2; stageRoot.add(foam); M.foam.map.repeat.set(6, 1);
  BEACH.foam = foam;
  // 浜の草（はまひるがお）
  const pl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 5, 4), M.plantA, 260), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 260; i++) { const x = rand(-BH.XW, BH.XW), z = rand(4, 26); m4.compose(new V3(x, groundH(x, z) + 0.02, z), q, new V3(rand(0.8, 2.2), 0.35, rand(0.8, 2.2))); pl.setMatrixAt(i, m4); }
  stageRoot.add(pl);
  // 遠くの岬と岩（参考写真の緑の岬）
  for (const [x, z, sx, sy, sz] of [[-150, -60, 70, 26, 40], [-120, -125, 50, 18, 30], [150, -30, 60, 22, 40], [-60, 150, 120, 30, 50], [80, 150, 120, 24, 50]]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), M.headland); h.scale.set(sx, sy, sz); h.position.set(x, -sy * 0.25, z); stageRoot.add(h); }
  for (const [x, z, s] of [[-96, -66, 6], [-88, -70, 3], [-78, -96, 4], [70, -48, 3.5]]) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock); r.position.set(x, s * 0.4 + BH.WATER, z); r.scale.y = 1.5; stageRoot.add(r); }
  for (let i = 0; i < 26; i++) { const x = rand(-48, 48), z = rand(56, 90); if (BEACH.pbs.some(P => Math.hypot(P.x - x, P.z - z) < 8)) continue; tree(x, z, rand(0.9, 1.4)); const T = stageRoot.children[stageRoot.children.length - 1]; T.position.y = groundH(x, z); }
}
function buildBeach() {
  const M = beachMats();
  BEACH.boats = []; BEACH.pbs = []; BEACH.tracers = []; BEACH.won = false; BEACH.looks = new Set(); BEACH.log = []; BEACH.dirty = false; BEACH.king = null; BEACH.gboat = null;
  BEACH.cars = []; BEACH.carN = 0; BEACH.lordCar = null; BEACH.lordTold = false;
  BEACH.on = true;
  for (const [i, x] of [[0, -27], [1, -9], [2, 9], [3, 27]]) makePillbox(i, x, 53 + (i % 2) * 1.5);
  buildAbatis(M);
  buildBeachTerrain(M);
  // 本陣＝殿の舟の屋形（動くので毎フレーム更新）
  hq = { x0: 0, x1: 0, z0: 0, z1: 0, sx: 0, sz: 0 };
  buildMedPost(7, 5, 'blue'); medPost.blue = [7, 5];
  buildMedPost(0, 74, 'orange'); medPost.orange = [0, 74];
  // 曳光弾（使い回し）
  const tg = new THREE.BoxGeometry(0.035, 0.035, 1); tg.translate(0, 0, -0.5);
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(tg, M.tracer); m.visible = false; m.frustumCulled = false; stageRoot.add(m); BEACH.tracers.push({ m, t: 1, d: 0, a: new V3(), b: new V3() }); }
}
// 波ごとの舟と守り手
function beachLaunch(n) {
  const M = beachMats(), first = n === 1;
  const fighters = Math.round((5 + n * 3) * TROOP_K), perBoat = 7, nb = first ? 4 : Math.max(2, Math.min(3, Math.round(fighters / perBoat)));
  const xs = first ? [-24, -10, 12, 25].slice(0, nb) : [-18, 0, 18].slice(0, nb);
  const z0 = (TEST && window.__bz) || (first ? -54 : -78);
  let made = 0; const bi0 = BEACH.boats.filter(b => !b.yakata && !b.guard).length;
  xs.forEach((x, k) => {
    const B = makeBoat(BEACH.boats.length, x + rand(-2, 2), z0 + rand(-4, 4), { sp: rand(1.25, 1.45), name: `第${bi0 + k + 1}小早隊`, goal: BH.BOAT_GOAL + rand(-0.4, 0.4) });
    B.sqKey = 'b' + Math.min(6, bi0 + k + 1);
    const nCrew = clamp(perBoat + (k % 2), 6, 8);
    for (let j = 0; j < nCrew; j++) { const kind = j === 0 || j === 5 ? 'archer' : 'mob'; const e = spawnEnemy(B.x, B.z, kind, false, 'blue', { y: B.floor.y, set: { boat: B, boatSq: B.sqKey } }); if (e) { boardBoat(e, B, j < 6 ? j * 2 + (k % 2) : null); made++; } }
  });
  // 守り手：トーチカごとに銃手 2 人＋守備
  const foes = Math.round(made * (first ? ENEMY_RATIO : 0.55)), live = BEACH.pbs.filter(P => !P.taken);
  if (!live.length) return made;
  let k = 0;
  for (let i = 0; i < foes; i++) {
    const P = live[i % live.length];
    const needG = P.gunners.filter(isUp).length < 2;
    let x, z, set = { pb: P.i };
    if (needG && first) { const sl = P.slots[P.gunners.length % 2]; x = sl[0]; z = sl[1]; set.gunner = true; }
    else if (first) { const a = rand(0, Math.PI * 2), inside = Math.random() < 0.3; x = inside ? P.x + rand(-1.3, 1.3) : P.x + Math.cos(a) * rand(4, 9); z = inside ? P.z + rand(-0.6, 1.2) : P.z + 3 + Math.abs(Math.sin(a)) * rand(1, 6); }
    else { x = P.x + rand(-6, 6); z = rand(70, 80); }
    const e = spawnEnemy(x, z, set.gunner ? 'mob' : Math.random() < 0.35 ? 'archer' : 'mob', false, 'orange', { y: groundH(x, z), set, yari: set.gunner ? -1 : 0 });
    if (!e) continue;
    e.home = [x, z]; P.members.push(e); if (set.gunner) { P.gunners.push(e); e.hold = { face: Math.PI }; e.s.rotation.y = e.face = Math.PI; }
    k++;
  }
  return made;
}
// 殿の舟（屋形つき）と近衛の舟
function beachKingBoats() {
  const K = makeBoat(BEACH.boats.length, 3.5, -82, { yakata: true, sp: 1.25, name: '殿の舟', goal: BH.BOAT_GOAL - 0.6 });
  const G = makeBoat(BEACH.boats.length, -3.2, -80, { guard: true, sp: 1.25, name: '近衛の舟', goal: BH.BOAT_GOAL - 0.3 });
  BEACH.king = K; BEACH.gboat = G;
  K.seats.fill(null);
  return K;
}
const KING_SEAT = [0, -1.4];   // 屋形の中
function beachStaffSeat(e) {   // 秘書課・救護・笛役などを殿の舟に乗せる
  const K = BEACH.king; if (!K) return;
  const order = [3, 2, 9, 8, 11, 10, 1, 0, 5, 4, 7, 6];
  const free = order.find(s => !K.seats[s]);
  boardBoat(e, K, free != null ? free : null);
}
// ---- 機関銃 ----
const MG = { rpm: 9.5, burst: [6, 8], gapT: [1.5, 2.8] };
function mgTargets(P) {
  const muz = P.mount.position, L = [];
  for (const o of enemies) {
    if (o.team !== 'blue' || !isUp(o)) continue;
    const p = o.s.position, d = Math.hypot(p.x - muz.x, p.z - muz.z);
    if (d > BH.MG_R || d < 8.5 || p.z > P.z0 - 1.5) continue;   // 銃眼の向き（海側）だけ。真下（8m 以内）は銃口が下がらない死角
    const off = Math.abs(Math.atan2(p.x - muz.x, muz.z - p.z)); if (off > 1.0) continue;
    if ((o.state === 'hide' || o.state === 'tocover') && o.cover && o.cover.type === 'bundle' && Math.random() < 0.75) continue;   // 逆茂木の陰に伏せている
    const shade = keiShields(p.x, p.z, P.x, P.z0) ? 70 : 0;   // 軽自動車の真後ろは機関銃が当てにくい
    L.push([d + shade + (o.seated && !(o.seated && o.seated.kei) ? -14 : p.z < 12 ? -8 : 0) + Math.random() * 12, o]);
  }
  if (state === 'play' && !inHQ()) { const p = player.pos, d = Math.hypot(p.x - muz.x, p.z - muz.z); if (d < BH.MG_R && p.z < P.z0 - 1.5 && Math.abs(Math.atan2(p.x - muz.x, muz.z - p.z)) < 1.1) L.push([d + (keiShields(p.x, p.z, P.x, P.z0) ? 70 : 0) + 4 + Math.random() * 10, { isPlayer: true }]); }
  L.sort((a, b) => a[0] - b[0]);
  return L.slice(0, 4).map(a => a[1]);
}
function mgTargetPt(t, out) {
  if (t.isPlayer) return out.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  const p = t.s.position; return out.set(p.x, t.baseY + t.figH * (t.seated ? 0.42 : 0.62), p.z);
}
const _mv = new V3(), _mi = new V3(), _md = new V3();
function updateMG(P, dt) {
  const alive = P.gunners.filter(o => isUp(o) && Math.hypot(o.s.position.x - P.x, o.s.position.z - (P.slitZ + 0.55)) < 1.3);
  const blueIn = enemies.some(o => o.team === 'blue' && isUp(o) && inPB(P, o.s.position.x, o.s.position.z)) || inPB(P, player.pos.x, player.pos.z);
  P.silenced = !alive.length || blueIn || P.taken;
  if (P.silenced) { P.flash.visible = false; P.burst = 0; if (!P.wasSil && P.gunners.length) { P.wasSil = true; BEACH.log.push('silenced:' + P.i); } return; }
  if (P.wasSil) P.wasSil = false;
  P.nextT -= dt;
  if (P.burst <= 0) {
    if (P.nextT > 0) { P.flash.visible = false; return; }
    const T = mgTargets(P); if (!T.length) { P.nextT = 0.6; P.flash.visible = false; return; }
    P.tgt = T[0]; P.burst = Math.round(rand(MG.burst[0], MG.burst[1])); P.shotT = 0; P.lastOne = Math.random() < 0.5;   // ダダダダダダダ、（ときに）ダ…
    mgTargetPt(P.tgt, _mv); P.sweep0 = P.aim.clone(); P.sweep1 = _mv.clone().add(new V3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))); P.sweepT = 0;
  }
  // 掃射：前の狙いから新しい標的へ、少し流しながら
  P.sweepT += dt;
  if (P.tgt && (P.tgt.isPlayer || isUp(P.tgt))) mgTargetPt(P.tgt, P.sweep1);
  const k = Math.min(1, P.sweepT / 0.45); P.aim.copy(P.sweep0).lerp(P.sweep1, k * k * (3 - 2 * k));
  const muz = P.mount.position, yaw = Math.atan2(P.aim.x - muz.x, P.aim.z - muz.z), pit = Math.atan2(P.aim.y - muz.y, Math.hypot(P.aim.x - muz.x, P.aim.z - muz.z));
  P.gun.rotation.set(-pit * 0 + pit, yaw + Math.PI, 0, 'YXZ'); P.gun.rotation.x = pit;
  P.shotT -= dt;
  if (P.shotT <= 0) {
    P.shotT += 1 / MG.rpm; P.burst--;
    if (P.burst === 0 && P.lastOne) { P.burst = 1; P.lastOne = false; P.shotT = 0.42; }   // 一拍おいて、もう一発
    else if (P.burst === 0) P.nextT = rand(MG.gapT[0], MG.gapT[1]);
    mgShot(P);
    if ((P.rounds = (P.rounds || 0) + 1) >= 30 && P.burst <= 0) { P.rounds = 0; P.nextT = rand(4.5, 6); P.reload = true; }   // 弾帯の交換：しばらく撃てない（攻め手の好機）
  } else P.flash.visible = P.shotT > 1 / MG.rpm - 0.035;
}
function mgShot(P) {
  const muz = _md.set(P.x, P.sy0 + 0.12, P.slitZ - 0.05), d = muz.distanceTo(P.aim), M = beachMats();
  const sp = 0.14 + d * 0.012;
  const I = _mi.copy(P.aim).add(new V3(rand(-1, 1) * sp, rand(-0.6, 0.8) * sp * 0.6, rand(-1, 1) * sp));
  P.flash.position.set(P.x + Math.sin(P.gun.rotation.y + Math.PI) * 0.05, P.sy0 + 0.13, P.slitZ - 0.15); P.flash.visible = true; P.flash.material.rotation = Math.random() * 6;
  Sfx.mg && Sfx.mg(muz); if (TEST) window.__mgs = (window.__mgs || 0) + 1;
  // 当たり（v8.1）：銃口→着弾点の弾道（少し先まで）に沿って、最初にかかった青組・殿（体＝縦の筒）。舟の中の娘は、弾道がその位置で舷より低ければ舟の板が受ける
  const ray = new V3().copy(I).sub(muz), rl = ray.length(); ray.divideScalar(rl);
  const L2 = rl + 3;
  let hit = null, bestT = L2, blockB = null;
  const ch0 = BEACH.on ? keiRayHit(muz, ray, L2) : null, bh0 = BEACH.on ? bundleRayHit(muz, ray, L2) : null;
  let shield = null, shieldT = 1e9;
  if (ch0) { shield = { kind: 'car', x: ch0.x, y: ch0.y, z: ch0.z }; shieldT = ch0.t; }
  if (bh0 && bh0.t < shieldT) { shield = { kind: 'bundle', cv: bh0.cv, x: bh0.x, y: bh0.y, z: bh0.z }; shieldT = bh0.t; }
  const test = (px, pz, y0, y1, r, who) => {   // 弾道と縦の筒（px,pz、高さ y0〜y1、半径 r）
    const t = clamp(((px - muz.x) * ray.x + (pz - muz.z) * ray.z) / Math.max(1e-4, ray.x * ray.x + ray.z * ray.z), 0, L2);
    if (t <= 0.5 || t >= bestT) return;
    if (shield && t > shieldT + 0.12) return;   // 車か竹束が手前
    const qx = muz.x + ray.x * t, qz = muz.z + ray.z * t, qy = muz.y + ray.y * t;
    if (Math.hypot(qx - px, qz - pz) > r || qy < y0 - 0.05 || qy > y1 + 0.05) return;
    const B = who.isPlayer ? boatAt(px, pz) : (who.boat && (who.seated || inBoat(who.boat, px, pz)) ? who.boat : null);
    if (B) B.fireT = time + 3.5;   // 撃たれている舟：漕ぎ手は身を低くする
    if (B && qy < B.g.position.y + BOAT_GW) { bestT = t; hit = null; blockB = [B, qx, qy, qz]; return; }   // 舷の陰
    if (B && B.yakata && !who.isPlayer) { const lz = boatLocal(B, px, pz)[1]; if (lz > -2.8 && lz < 0.3 && Math.random() < 0.7) { bestT = t; hit = null; blockB = [B, qx, qy, qz]; return; } }   // 屋形の板
    bestT = t; hit = who; blockB = null;
  };
  for (const o of enemies) { if (o.team !== 'blue' || !isUp(o)) continue; const p = o.s.position; if (Math.hypot(p.x - muz.x, p.z - muz.z) > rl + 4) continue;
    const top = o.baseY + o.figH - (o.crouch || 0) * 0.42 * o.figH; test(p.x, p.z, o.baseY + 0.12, top, 0.26, o); }
  if (!inHQ() && state === 'play') test(player.pos.x, player.pos.z, player.pos.y + 0.1, player.pos.y + (player.seated ? 1.2 : 1.65), 0.3, { isPlayer: true });
  let end = I.clone(), kind = 'ground';
  const B = boatAt(I.x, I.z, 0.15);
  if (blockB) { kind = 'boat'; end.set(blockB[1], blockB[2], blockB[3]); }
  else if (hit && !hit.isPlayer && hit.seated && hit.boat && Math.random() < 0.12) { kind = 'boat'; hit = null; }   // 幟・櫂の陰
  if (TEST) { if (hit) window.__mgh = (window.__mgh || 0) + 1; if (kind === 'boat' && blockB) window.__mgb = (window.__mgb || 0) + 1; }
  if (blockB && shield && shieldT < bestT - 0.05) blockB = null;
  if (hit) {
    if (hit.isPlayer) { if (TEST) window.__mgp = (window.__mgp || 0) + 1; hurtPlayer(7); end.set(player.pos.x, player.pos.y + 1.1, player.pos.z); kind = 'body'; }
    else { const p = hit.s.position; end.set(p.x, hit.baseY + hit.figH * (hit.seated ? 0.45 : rand(0.5, 0.68)), p.z); kind = 'body';
      if (TEST) window.__mgd = (window.__mgd || 0) + 1;
      damageEnemy(hit, 1, muz, false, { pt: end.clone(), thrust: true }, { team: 'orange', state: 'idle', mg: true, s: { position: muz } }); }
  } else if (shield && !blockB) {
    end.set(shield.x, shield.y, shield.z); kind = shield.kind;
    if (shield.kind === 'car') { puff(end.clone(), 0xffe7a8, 3, 0.06, 2.2, 0.2); puff(end.clone(), 0xd5d2c8, 3, 0.1, 1.4, 0.25); if (TEST) window.__mgc = (window.__mgc || 0) + 1; }
    else {
      const cv = shield.cv; cv.hp -= 1; puff(end.clone(), 0xc5d6a4, 4, 0.14, 1.6, 0.3);
      if (Math.hypot(end.x - player.pos.x, end.z - player.pos.z) < 28) Sfx.impactBamboo(end);
      if (cv.hp <= 0) breakBundle(cv); if (TEST) window.__mgbd = (window.__mgbd || 0) + 1;
    }
  } else if (kind === 'boat' || (B && I.y < B.g.position.y + BOAT_GW)) { kind = 'boat'; const bb = (blockB && blockB[0]) || B || boatAt(I.x, I.z, 0.5) || BEACH.boats.find(q => Math.hypot(q.x - I.x, q.z - I.z) < 6); if (bb) boatHole(bb, end); }
  else if (I.z < BH.SHORE - 0.5 || I.y < BH.WATER + 0.05) kind = groundH(I.x, I.z) < BH.WATER ? 'water' : 'ground';
  if (kind !== 'body' && kind !== 'boat' && kind !== 'car' && kind !== 'bundle') { const gh = Math.max(groundH(end.x, end.z), BH.WATER); end.y = gh + 0.02; }
  // 見た目：曳光、水しぶき・砂煙・木っ端
  const tr = BEACH.tracers.find(t => t.t >= 1) || BEACH.tracers[0];
  tr.a.copy(muz); tr.b.copy(end); tr.t = 0; tr.d = muz.distanceTo(end); tr.m.visible = true;
  if (kind === 'water') { puff(end.clone().setY(BH.WATER + 0.05), 0xe8f6ff, 5, 0.32, 2.6, 0.5); if (Math.random() < 0.5) puff(end.clone().setY(BH.WATER + 0.3), 0xffffff, 3, 0.18, 1.8, 0.4); }
  else if (kind === 'ground') { puff(end.clone().setY(end.y + 0.05), end.z < BH.Z1 ? 0xeee2c4 : 0xa79a74, 4, 0.3, 1.5, 0.55); }
  else if (kind === 'boat') { puff(end.clone(), 0xb98a52, 4, 0.12, 2.2, 0.45); if (Math.hypot(end.x - player.pos.x, end.z - player.pos.z) < 30) Sfx.impactWood(end); }
}
function boatHole(B, pt) {
  const [lx, lz] = boatLocal(B, pt.x, pt.z), side = lx >= 0 ? 1 : -1, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const ly = clamp(pt.y - B.g.position.y, 0.15, BOAT_GW - 0.08);
  const zz = clamp(lz, -BOAT_L / 2 + 0.6, BOAT_L / 2 - 2.2);
  q.setFromAxisAngle(new V3(0, 1, 0), side * Math.PI / 2);
  const i = B.nHole % 80; m4.compose(new V3(side * (BOAT_W / 2 + 0.006), ly, zz), q, new V3(rand(0.7, 1.2), rand(0.7, 1.2), 1));
  B.holes.setMatrixAt(i, m4); B.nHole++; B.holes.count = Math.min(80, B.nHole); B.holes.instanceMatrix.needsUpdate = true;
  // 内側にも
  if (B.nHole % 2 === 0) { q.setFromAxisAngle(new V3(0, 1, 0), -side * Math.PI / 2); m4.compose(new V3(side * (BOAT_W / 2 - 0.1), ly, zz), q, new V3(0.8, 0.8, 1)); const j = B.nHole % 80; B.holes.setMatrixAt(j, m4); B.nHole++; B.holes.count = Math.min(80, B.nHole); }
}
// ---- 毎フレーム ----
function updateBeach(dt) {
  if (!BEACH.on) return;
  const M = beachMats();
  M.sea.map.offset.y = Math.sin(time * 0.3) * 0.004;
  if (BEACH.foam) { const k = Math.sin(time * 0.55); BEACH.foam.position.z = -0.7 + k * 0.55; M.foam.opacity = 0.55 + 0.3 * Math.max(0, k); M.foam.map.offset.x = time * 0.01; }
  // 舟：漕ぐ・進む・浜に乗り上げる・全員倒れれば流れて止まる
  for (const B of BEACH.boats) {
    const ox = B.x, oz = B.z, oyaw = B.yaw;
    B.crew = B.crew.filter(o => enemies.includes(o) && o.boat === B || bodies.includes(o));
    const rowers = B.crew.filter(o => isUp(o) && o.seated);
    if (B.delay > 0) { B.delay -= dt; }
    else if (!B.beached) {
      const goal = B.goal, can = rowers.length > 0 || B.yakata && (state === 'play');
      if (!can && !B.drift) { B.drift = true; B.driftYaw = rand(-0.5, 0.5); BEACH.log.push('drift:' + B.i); }
      const v = B.drift ? Math.max(0, (B.v || B.sp) - dt * 0.35) : B.sp * Math.min(1, (goal - B.z) / 3 + 0.25) * (rowers.length >= 3 || B.yakata ? 1 : 0.6);
      B.v = v; B.z += v * dt;
      if (B.drift) { B.yaw += (B.driftYaw - B.yaw) * dt * 0.15; B.x += Math.sin(B.yaw) * v * dt * 0.3; }
      if (B.z >= goal) { B.z = goal; B.beached = true; B.v = 0; beachLand(B); }
      B.row += dt * (B.drift ? 0 : 2.6);
    }
    B.wob += dt;
    const bob = B.beached ? 0 : Math.sin(B.wob * 1.3 + B.i) * 0.035, roll = B.beached ? 0.02 : Math.sin(B.wob * 0.9 + B.i * 2) * 0.025;
    B.g.position.set(B.x, BH.WATER + 0.04 + bob + (B.beached ? 0.05 : 0), B.z); B.g.rotation.set(0, B.yaw, roll);
    for (const O of B.oars) { const a = B.drift || B.beached ? 0.35 : Math.sin(B.row * 2 + O.ph); O.piv.rotation.set(0, O.s * a * 0.45, O.s * (B.drift || B.beached ? 0.5 : -0.12 + Math.cos(B.row * 2 + O.ph) * 0.12)); }
    for (const f of B.flags) f.rotation.x = Math.sin(time * 2.1 + B.i) * 0.08;
    boatFloor(B); B.floor.y = B.g.position.y + BOAT_DECK;
    const dx = B.x - ox, dz = B.z - oz, dy = B.yaw - oyaw;
    // 乗っている娘（座っている／舟の中で倒れた）も一緒に動く
    for (const o of B.crew) {
      const p = o.s.position;
      if (o.seated && o.seated.boat === B) { const [lx, lz] = BOAT_SEATS[o.boatSlot]; const [wx, wz] = boatWorld(B, lx, lz); o.seated.x = wx; o.seated.z = wz; o.baseY = B.floor.y; o.s.rotation.y = B.yaw; if (o.state === 'idle') o.face = B.yaw; }
      else if (o.state === 'down' || bodies.includes(o)) { if (dy) { const [lx, lz] = boatLocal({ x: ox, z: oz, yaw: oyaw }, p.x, p.z); const [wx, wz] = boatWorld(B, lx, lz); p.x = wx; p.z = wz; o.s.rotation.y += dy; } else { p.x += dx; p.z += dz; } o.baseY = B.floor.y; p.y = B.floor.y + (o.landY !== undefined ? 0 : 0); }
    }
    // 殿：舟の上なら一緒に動く
    if (inBoat(B, player.pos.x, player.pos.z, 0.25) && player.pos.y < B.floor.y + 0.8) { player.pos.x += dx; player.pos.z += dz; }
  }
  // 本陣＝殿の舟の屋形
  const K = BEACH.king;
  if (K && hq) { hq.x0 = K.x - 0.95; hq.x1 = K.x + 0.95; hq.z0 = K.z - 2.7; hq.z1 = K.z - 0.1; hq.sx = K.x + 0.5; hq.sz = K.z + 0.4; }
  // 機関銃
  for (const P of BEACH.pbs) { updateMG(P, dt); beachPbState(P, dt); }
  // 曳光弾（速さ ≈ 400m/s 見かけ）
  for (const T of BEACH.tracers) {
    if (T.t >= 1) continue;
    T.t += dt * Math.min(9, 300 / Math.max(5, T.d)); const k = Math.min(1, T.t);
    const L = Math.min(2.6, T.d * 0.3), p = _mv.copy(T.a).lerp(T.b, k);
    T.m.position.copy(p); T.m.lookAt(T.b); T.m.rotateY(Math.PI); T.m.scale.set(1, 1, L); T.m.visible = k < 1;
  }
  beachKingLooks(dt);
  updateKei(dt);
}
// 舟が浜に着いた：戦いの娘は軽自動車（最大4人）へ。あふれは車のすぐ後ろを歩き、竹束を前に出す。殿の舟・近衛は徒歩のまま
function beachLand(B) {
  BEACH.log.push('land:' + B.i);
  const riders = (!B.yakata && !B.guard) ? B.crew.filter(o => isUp(o) && keiEligible(o)) : [];
  const riding = new Set(riders);
  let k = 0;
  for (const o of B.crew) if (isUp(o) && o.seated && !riding.has(o)) o.standAt = time + 0.3 + (k++) * 0.25;
  if (riders.length) keiSpawnFor(B, riders);
  if (B.yakata) {
    for (const o of B.crew) if (isUp(o)) o.home = [B.x + rand(-2.5, 2.5) + (o.medic ? 5 : 0), rand(2, 5)];
    hq.sx = B.x; hq.sz = B.z;
  }
  const L = B.crew.find(o => isUp(o) && !riding.has(o)); if (L && !B.yakata) yariSay(L, B.guard ? 'guard_forward' : 'land_go');
}
// トーチカの制圧
function beachPbState(P, dt) {
  if (P.taken) return;
  P.members = P.members.filter(o => enemies.includes(o));
  const orangeIn = P.members.some(o => isUp(o) && (inPB(P, o.s.position.x, o.s.position.z) || Math.hypot(o.s.position.x - P.x, o.s.position.z - P.z) < 4));
  const gun = P.gunners.some(isUp);
  const blueNear = enemies.some(o => o.team === 'blue' && isUp(o) && Math.hypot(o.s.position.x - P.x, o.s.position.z - P.z) < 4.2) || Math.hypot(player.pos.x - P.x, player.pos.z - P.z) < 4.2;
  if (!orangeIn && !gun && blueNear) {
    P.taken = true; P.silenced = true; BEACH.log.push('taken:' + P.i);
    stageRoot.remove(P.flag); P.flag = nobori(P.x + PB_W / 2 + 0.8, P.z + PB_D / 2 + 0.5, '#1f5fb8', '#f4f1e8', '制圧'); P.flag.position.y = P.y;
    const left = BEACH.pbs.filter(q => !q.taken).length;
    showBanner(`第${P.i + 1}トーチカ 制圧！`, left ? `残り ${left}` : 'すべてのトーチカを制圧した');
    Sfx.chime && Sfx.chime(true);
    if (!left) beachWin();
  }
}
function beachWin() {
  if (BEACH.won) return; BEACH.won = true;
  setTimeout(() => { if (state !== 'play') return; gameOver(true); }, 3500);
}
// 殿が見ているものへのひと言（字幕＋声）
function beachKingLooks(dt) {
  if (state !== 'play' || (BEACH.lookT = (BEACH.lookT || 0) - dt) > 0) return;
  BEACH.lookT = 0.25;
  const fx = -Math.sin(player.yaw) * Math.cos(player.pitch || 0), fz = -Math.cos(player.yaw) * Math.cos(player.pitch || 0), fy = Math.sin(player.pitch || 0), eye = camera.position;
  const looking = (x, y, z, r) => { const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d = Math.hypot(dx, dy, dz); if (d > r || d < 0.5) return false; return (dx * fx + dy * fy + dz * fz) / d > 0.93; };
  for (const B of BEACH.boats) {
    const key = 'boat'; if (BEACH.looks.has(key) || B.nHole < 10) continue;
    const allDown = B.crew.length > 0 && !B.crew.some(isUp);
    if (allDown && looking(B.x, B.g.position.y + 0.4, B.z, 14)) { BEACH.looks.add(key); kingSay('king_hachi'); return; }
  }
  for (const P of BEACH.pbs) {
    const key = 'mg'; if (BEACH.looks.has(key) || !P.silenced || !P.gunners.length || P.gunners.some(isUp)) continue;
    const m = P.mount.position; if (Math.hypot(player.pos.x - m.x, player.pos.z - m.z) < 4.5 && looking(m.x, m.y, m.z, 5)) { BEACH.looks.add(key); kingSay('king_mg'); return; }
  }
}
// 青組の上陸後の待機位置・橙組の持ち場
function beachIdleSpot(e) {
  if (e.team === 'orange' && e.home && !e.beachRaid) return e.home;
  if (e.team === 'blue' && e.beachAssault != null) {
    const P = BEACH.pbs[e.beachAssault];
    if (P && !P.taken) return [P.door[0] + ((e.id % 2) ? 0.7 : -0.7), P.door[1]];
  }
  const live = BEACH.pbs.filter(P => !P.taken); if (!live.length) return [player.pos.x, player.pos.z];
  let best = live[0], bd = 1e9; for (const P of live) { const d = Math.hypot(P.x - e.s.position.x, P.z - e.s.position.z) + (e.id % 4 === P.i ? -15 : 0); if (d < bd) { bd = d; best = P; } }
  return [best.x + Math.cos(e.ph) * 3, best.z - 6 + Math.sin(e.ph) * 2];
}
// 橙組の持ち場の娘は、トーチカから離れすぎない（20m）
function beachCanTarget(e, t, x, z) {
  if (e.beachRaid) return true;
  if (e.team === 'orange' && e.pb != null) { const P = BEACH.pbs[e.pb]; if (P && Math.hypot(x - P.x, z - P.z) > (e.kind === 'archer' ? 48 : 22)) return false; }
  if (e.team === 'blue' && t.gunner && e.kind !== 'archer') return true;
  return true;
}
// 経路：逆茂木の列はすき間へ、トーチカは裏の入口から、海へは入らない
function beachRoute(p, tx, tz) {
  for (const R of ABATIS) {
    const a = p.z - R.z, b = tz - R.z;
    if (Math.sign(a) === Math.sign(b) || Math.abs(a) < 0.05) continue;
    if (Math.abs(a) > 9 && Math.abs(b) > 0.5) { /* まだ遠い：すき間の方へ寄せながら */ }
    if (R.gaps.some(g => Math.abs(p.x - g) < GAP_HW - 0.45)) { const g = R.gaps.find(g => Math.abs(p.x - g) < GAP_HW - 0.45); return [g + clamp(p.x - g, -0.6, 0.6), R.z + Math.sign(b) * 1.4]; }
    let g = R.gaps[0], bd = 1e9; for (const gx of R.gaps) { const d = Math.abs(gx - p.x) + Math.abs(gx - tx) * 0.5; if (d < bd) { bd = d; g = gx; } }
    return [g, R.z - Math.sign(b) * 1.2];
  }
  const Pt = pbAt(tx, tz), Pp = pbAt(p.x, p.z);
  if (Pt && Pt !== Pp) { const [dx, dz] = Pt.door; if (p.z < Pt.z1 + 0.3 && Math.abs(p.x - Pt.x) < PB_W / 2 + 0.6) return [p.x < Pt.x ? Pt.x0 - 0.9 : Pt.x1 + 0.9, dz]; if (Math.hypot(p.x - dx, p.z - dz) > 0.6) return [dx, dz]; return [Pt.x, Pt.z1 - 0.8]; }
  if (Pp && Pp !== Pt) { const [dx, dz] = Pp.door; if (Math.abs(p.x - Pp.x) > 0.4 && p.z < Pp.z1 - 0.7) return [Pp.x, Pp.z1 - 0.8]; return [dx, dz + 0.4]; }
  // トーチカの前（海側）にいて裏へ回る
  for (const P of BEACH.pbs) {
    if (Math.abs(p.x - P.x) < PB_W / 2 + 0.5 && p.z < P.z0 && tz > P.z1 && Math.abs(tx - P.x) < PB_W / 2 + 0.5) return [p.x < P.x ? P.x0 - 0.9 : P.x1 + 0.9, P.z];
  }
  return [tx, Math.max(tz, -0.4)];
}
// 浜：娘の足元（砂浜・斜面の高さ、舟の上、海に入らない）
function beachFeet(e, p) {
  if (e.seated || e.perch) return;
  if (e.boat) {
    if (inBoat(e.boat, p.x, p.z) && !(e.boat.beached && boatLocal(e.boat, p.x, p.z)[1] > BOAT_L / 2 - 1.4)) {
      const B = e.boat, [lx, lz] = boatLocal(B, p.x, p.z), cl = clamp(lx, -BOAT_W / 2 + 0.35, BOAT_W / 2 - 0.35);
      const [wx, wz] = boatWorld(B, cl, B.beached ? lz : clamp(lz, -BOAT_L / 2 + 0.6, BOAT_L / 2 - 1.2)); p.x = wx; p.z = wz; e.baseY = B.floor.y; return;
    }
    if (!e.boat.beached) { const B = e.boat, [lx, lz] = boatLocal(B, p.x, p.z); const [wx, wz] = boatWorld(B, clamp(lx, -0.7, 0.7), clamp(lz, -BOAT_L / 2 + 0.6, BOAT_L / 2 - 1.2)); p.x = wx; p.z = wz; e.baseY = B.floor.y; return; }
    if (e.state !== 'down') { const B = e.boat; B.crew = B.crew.filter(o => o !== e); e.boat = null; }
  }
  if (p.z < -0.4) p.z = -0.4;
  p.x = clamp(p.x, -BH.XW + 0.5, BH.XW - 0.5);
  e.baseY = groundH(p.x, p.z);
}
// 舟の上で倒れた：座ったまま／舟底に崩れる（海には落ちない）
function boatFall(e) {
  const B = e.boat;
  if (!e.seated) {   // 立っていた娘：近くの空いた腰掛けへ崩れ込む
    const [lx, lz] = boatLocal(B, e.s.position.x, e.s.position.z); let bi = -1, bd = 1e9;
    BOAT_SEATS.forEach(([sx, sz], i) => { const d = Math.hypot(sx - lx, sz - lz) + (B.seats[i] && B.seats[i] !== e ? 2 : 0); if (d < bd) { bd = d; bi = i; } });
    const [wx, wz] = boatWorld(B, BOAT_SEATS[bi][0], BOAT_SEATS[bi][1]); e.slideTo = null; e.s.position.x = wx; e.s.position.z = wz; e.boatSlot = bi;
  }
  e.slump = { side: e.boatSlot % 2 ? 1 : -1, fwd: rand(0.25, 0.5) }; e.seated = null; e.baseY = B.floor.y; e.crouch = Math.max(e.crouch || 0, 0.9);
  if (!B.crew.includes(e)) B.crew.push(e);
}
// 波：舟と守り手。浜では普通の波の湧き出しは使わない
function beachWave(n) {
  const made = beachLaunch(n);
  wave.toSpawn = 0; wave.blueToSpawn = 0; wave.blueOwed = 0; BEACH.waveT = 0;
  if (n === 1) showBanner('模擬戦、開始！ 小早、漕ぎ出せ', '高台のトーチカをすべて制圧せよ — 機関銃の届く沖からは身を低く');
  else showBanner(`第${waveName(n)}波`, `小早 ${Math.max(2, Math.min(3, Math.round(made / 7)))} 艘が増援に`);
}
function beachWaveTick(dt) {
  if (BEACH.won) return;
  BEACH.waveT += dt;
  const blueF = enemies.filter(o => o.team === 'blue' && isUp(o) && !o.special && !o.guard).length;
  if (BEACH.waveT > 55 && blueF < 10) startWave(wave.n + 1);
}
function kingSay(cat) {
  const X = VoicePack.man && VoicePack.man._extra, L = X && X[cat], text = (L && L[0].text) || KING_TEXT[cat] || '';
  subtitle(text); const el = $('subtitle'); if (el) el.textContent = `殿「${text}」`;
  if (!(L && VoicePack.play(L[0].files[0], 0, 2, 1))) { if (Voice.ok) { const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.pitch = 0.7; u.rate = 0.95; speechSynthesis.speak(u); } }
  BEACH.log.push('king:' + cat);
}
const KING_TEXT = { king_hachi: '蜂の巣にされたみたいだな', king_mg: '…これが機関銃か。恐ろしいな', king_deaddrive: '死者とのドライブかぁ' };

// ====================================================================
//  v8：軽自動車（平原）。お抱えの運転手（写真の侍女）が運転し、殿は助手席に乗る（E／スマホ「乗る」）
//  ・乗っている間：クリック（スマホは攻撃ボタン）で照準の先の地面へ、W で前方へ、S で止まる、E で降りる
//  ・娘をひかない：前に人（倒れた娘も）がいれば減速して止まる。車で倒すことはない
//  ・運転手が倒れると、車は惰性で止まり、運転手はハンドルに突っ伏したまま。殿「死者とのドライブかぁ」
//    そのまま降りるか、しばらくすると近くの侍女が運転を代わる（倒れた運転手は後部座席へ）
//  右ハンドル（日本の軽）：前を +z として、運転席は右（-x）、助手席は左（+x）
// ====================================================================
const CAR = { g: null, x: 0, z: 0, yaw: 0, v: 0, steer: 0, tgt: null, fwdHold: false, driver: null, riding: false, dead: false, deadT: 0, said: false, wheels: [], marker: null, takeT: 0, rear: [], blockT: 0, sayT: 0, lastMsg: '' };
const CAR_L = 3.4, CAR_W = 1.48, CAR_FLOOR = 0.3, CAR_EYE = 1.36, CAR_VMAX = 6.2;
const CAR_SEAT = { drv: [-0.34, -0.15], pas: [0.34, -0.15], rear: [-0.3, -0.95] };
const KEI_SEAT = [[-0.34, -0.15], [0.34, -0.15], [-0.32, -0.95], [0.32, -0.95]];   // 浜の軽：最大4人（運転・助手・後ろ左右）
function carMats() {
  const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  return { body: L(0xf1efe8), bodyD: L(0xd9d6cc), trim: L(0x2a2b2e), glass: new THREE.MeshLambertMaterial({ color: 0xa8c8d8, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    tire: L(0x1b1b1c), hub: L(0xb8bcc0), seat: L(0x3a3c40), dash: L(0x26272a), head: new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), tail: new THREE.MeshBasicMaterial({ color: 0xc8302a }),
    inner: L(0x8d8f94, { side: THREE.DoubleSide }), mark: new THREE.MeshBasicMaterial({ color: 0xffe38a, transparent: true, opacity: 0.85, depthWrite: false }) };
}
function keiAssemble(g, M) {
  const hl = CAR_L / 2, hw = CAR_W / 2;
  const box = (w, h, d, px, py, pz, m, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.rotation.x = rx; g.add(b); return b; };
  // 下回り・ボンネット・床・バンパー
  box(CAR_W, 0.45, CAR_L - 0.1, 0, 0.5, 0, M.body);
  box(CAR_W - 0.04, 0.05, 1.0, 0, 0.98, hl - 0.55, M.body, -0.12);   // ボンネット
  box(CAR_W + 0.02, 0.22, 0.12, 0, 0.42, hl - 0.02, M.trim); box(CAR_W + 0.02, 0.22, 0.12, 0, 0.42, -hl + 0.02, M.trim);
  // 側面（ドアの下半分：窓は開いている）
  for (const s of [-1, 1]) { const d = box(0.05, 0.5, CAR_L - 1.25, s * (hw - 0.02), 0.95, -0.42, M.body); d.material = M.body; box(0.04, 0.42, CAR_L - 1.3, s * (hw - 0.07), 0.95, -0.42, M.inner); }
  // 屋根・柱・窓ガラス（前は傾いたガラス、後ろは縦）
  box(CAR_W - 0.06, 0.05, 1.9, 0, 1.58, -0.6, M.body); box(CAR_W - 0.12, 0.02, 1.84, 0, 1.55, -0.6, M.inner);
  const wsZ = 0.62, wsH = 0.6;
  for (const s of [-1, 1]) {
    const a = box(0.06, 0.74, 0.06, s * (hw - 0.05), 1.3, wsZ - 0.12, M.trim, 0.55);   // A 柱
    box(0.06, 0.6, 0.07, s * (hw - 0.05), 1.3, -0.08, M.bodyD);   // B 柱
    box(0.06, 0.6, 0.08, s * (hw - 0.05), 1.27, -1.5, M.body);    // C 柱
  }
  const ws = box(CAR_W - 0.12, 0.72, 0.01, 0, 1.3, wsZ - 0.12, M.glass, 0.55);
  box(CAR_W - 0.12, 0.55, 0.02, 0, 1.25, -1.55, M.glass);
  box(CAR_W, 0.6, 0.06, 0, 0.95, -hl + 0.06, M.body);   // 後ろ
  // 灯火
  for (const s of [-1, 1]) { box(0.28, 0.1, 0.02, s * 0.5, 0.78, hl + 0.01, M.head); box(0.12, 0.16, 0.02, s * 0.62, 0.86, -hl - 0.01, M.tail); }
  // 車内：ダッシュボード・ハンドル（右）・座席・床
  box(CAR_W - 0.14, 0.24, 0.42, 0, 0.92, wsZ - 0.38, M.dash);
  box(CAR_W - 0.14, 0.04, 2.4, 0, CAR_FLOOR, -0.45, M.seat);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 16), M.trim); wheel.position.set(CAR_SEAT.drv[0], 1.02, wsZ - 0.64); wheel.rotation.set(-0.45, 0, 0); g.add(wheel);
  const col = box(0.05, 0.05, 0.36, CAR_SEAT.drv[0], 0.95, wsZ - 0.5, M.trim, 0.45);
  for (const [sx, sz] of [CAR_SEAT.drv, CAR_SEAT.pas]) { box(0.48, 0.12, 0.5, sx, 0.52, sz - 0.05, M.seat); box(0.48, 0.62, 0.1, sx, 0.88, sz - 0.33, M.seat, -0.12); box(0.26, 0.16, 0.08, sx, 1.27, sz - 0.38, M.seat); }
  box(CAR_W - 0.2, 0.12, 0.5, 0, 0.5, -1.05, M.seat); box(CAR_W - 0.2, 0.55, 0.1, 0, 0.82, -1.33, M.seat, -0.1);
  // 車輪
  const wheels = [];
  for (const [wx, wz] of [[-hw + 0.08, 1.1], [hw - 0.08, 1.1], [-hw + 0.08, -1.1], [hw - 0.08, -1.1]]) {
    const w = new THREE.Group(); w.position.set(wx, 0.28, wz);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.17, 14), M.tire); t.rotation.z = Math.PI / 2; w.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 10), M.hub); h.rotation.z = Math.PI / 2; w.add(h);
    g.add(w); wheels.push(w);
  }
  return { wheels, wheelM: wheel };
}
function buildCar(x, z, yaw) {
  const M = carMats(), g = new THREE.Group();
  const { wheels, wheelM } = keiAssemble(g, M);
  g.position.set(x, 0, z); g.rotation.y = yaw; stageRoot.add(g);
  const mk = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 20), M.mark); mk.rotation.x = -Math.PI / 2; mk.visible = false; stageRoot.add(mk);
  Object.assign(CAR, { g, x, z, yaw, v: 0, steer: 0, tgt: null, driver: null, riding: false, dead: false, deadT: 0, said: false, wheels, marker: mk, takeT: 0, rear: [], home: [x, z, yaw], wheelM });
  carSpawnDriver();
}
const carOn = () => !!CAR.g && builtStage === 'plains';
function carW(lx, lz) { const c = Math.cos(CAR.yaw), s = Math.sin(CAR.yaw); return [CAR.x + lx * c + lz * s, CAR.z - lx * s + lz * c]; }
function carL(x, z) { const dx = x - CAR.x, dz = z - CAR.z, c = Math.cos(CAR.yaw), s = Math.sin(CAR.yaw); return [dx * c - dz * s, dx * s + dz * c]; }
function carSpawnDriver(from) {
  const [wx, wz] = carW(CAR_SEAT.drv[0], CAR_SEAT.drv[1]);
  let e = from;
  if (!e) { e = spawnEnemy(wx, wz, 'mob', false, 'blue', { yari: -1, set: { driver: true, special: true } }); if (!e) return; }
  e.driver = true; e.special = true; e.passive = true; e.hold = null; e.state = 'idle'; e.tgt = null;
  if (e.sq) { const s = e.sq; s.members = s.members.filter(m => m !== e); e.sq = null; }
  if (e.spear) { e.s.remove(e.spear); e.spear = null; e.yari = false; }
  e.prof.name = e.prof.name.replace(/^(運転手|組頭)\s*/, ''); e.prof.name = '運転手 ' + e.prof.name; e.tagKey = '';
  e.seated = { x: wx, z: wz, car: true }; e.baseY = CAR_FLOOR; e.s.position.set(wx, e.baseY, wz); e.s.rotation.y = e.face = CAR.yaw; e.standAt = null;
  CAR.driver = e; CAR.dead = false; CAR.said = false; CAR.deadT = 0; CAR.takeT = 0;
}
// 殿の乗り降り
function carNear() { if (!carOn() || CAR.riding) return false; const [lx, lz] = carL(player.pos.x, player.pos.z); return Math.abs(lz) < CAR_L / 2 + 0.6 && Math.abs(lx) < CAR_W / 2 + 1.4 && player.pos.y < 0.6; }
function carUse() {
  if (!carOn()) return false;
  if (CAR.riding) { if (Math.abs(CAR.v) > 0.6) { CAR.tgt = null; CAR.fwdHold = false; popup('止まってから降ります'); CAR.exitReq = true; return true; } carExit(); return true; }
  if (!carNear()) return false;
  CAR.riding = true; CAR.tgt = null; player.drawing = false; player.seated = false; player.autoClimb = null;
  popup('助手席に乗った — クリック（攻撃ボタン）で行き先、W で前へ、S で止まる、E で降りる');
  if (CAR.driver && isUp(CAR.driver) && !CAR.dead) drvSay('drv_where');
  return true;
}
function carExit() {
  CAR.riding = false; CAR.exitReq = false;
  const [wx, wz] = carW(CAR_W / 2 + 0.75, -0.15); player.pos.set(wx, 0, wz); player.vy = 0;
  if (CAR.marker) CAR.marker.visible = false;
}
function carSeatPlayer() {
  const [wx, wz] = carW(CAR_SEAT.pas[0], CAR_SEAT.pas[1]);
  player.pos.set(wx, CAR_EYE - CFG.eyeH, wz); player.vy = 0; player.onGround = true; player.drawing = false; player.charge = 0;
}
// 行き先：照準の先の地面（遠すぎれば 40m 先）
function carCommand() {
  if (!CAR.riding) return false;
  if (CAR.dead) { if (!CAR.dmsgT || CAR.dmsgT < time) { popup('運転手が倒れている — E で降りる'); CAR.dmsgT = time + 2; } return true; }
  const dy = Math.sin(player.pitch);
  let d = dy < -0.02 ? CAR_EYE / Math.tan(-player.pitch) : 40; d = clamp(d, 5, 60);
  const tx = player.pos.x - Math.sin(player.yaw) * d, tz = player.pos.z - Math.cos(player.yaw) * d;
  const lim = (MECH.on ? MECH.lim : CFG.field) - 5;
  CAR.tgt = [clamp(tx, -lim, lim), clamp(tz, -lim, lim)]; CAR.fwdHold = false; CAR.blockT = 0;
  if (CAR.marker) { CAR.marker.position.set(CAR.tgt[0], 0.04, CAR.tgt[1]); CAR.marker.visible = true; }
  drvSay('drv_go');
  return true;
}
function drvSay(cat) {
  const e = CAR.driver; if (!e || !isUp(e) || CAR.dead || (CAR.sayT > time && cat !== 'drv_take')) return;
  CAR.sayT = time + 2.5;
  const X = VoicePack.man && VoicePack.man._extra, L = X && X[cat], it = L && L.length ? pick(L) : null, text = it ? it.text : (DRV_TEXT[cat] || [''])[0];
  Talk.as(e, () => { if (!(it && VoicePack.play(it.files[0], 1, 2, VV_RATE[e.prof.vv] || 1)) && text) Voice.say(text, e.prof, 1); subtitle(text); const el = $('subtitle'); if (el) el.textContent = `${e.prof.name.replace('運転手 ', '')}「${text}」`; });
  CAR.lastMsg = cat;
}
const DRV_TEXT = { drv_where: ['どちらへ参りましょう？'], drv_go: ['かしこまりました！'], drv_brake: ['あっ、危ない…！'], drv_arrive: ['着きました！'], drv_take: ['私が代わります！'], drv_block: ['この先は通れません…'] };
// 車の前に人（立っている／倒れている）がいるか
function carAhead(look, dt) {
  let hit = false;
  const chk = (p, o) => {
    const [lx, lz] = carL(p.x, p.z);
    if (!(lz > CAR_L / 2 - 0.2 && lz < CAR_L / 2 + look && Math.abs(lx) < CAR_W / 2 + 0.45)) return;
    hit = true;
    // 味方の娘は脇へよけてくれる（車は止まって待つ）
    if (o && o.team === 'blue' && isUp(o) && !o.seated && dt) { const sd = lx >= 0 ? 1 : -1, [ax, az] = carW(sd * (CAR_W / 2 + 0.9), lz), k = Math.min(1, dt * 2.2); p.x += (ax - p.x) * k; p.z += (az - p.z) * k; }
  };
  for (const o of enemies) if (o !== CAR.driver && o.state !== 'pit' && !CAR.rear.includes(o)) chk(o.s.position, o);
  for (const b of bodies) if (b !== CAR.driver && !CAR.rear.includes(b)) chk(b.s.position, null);
  if (!CAR.riding) chk(player.pos, null);
  return hit;
}
function carBlocked(nx, nz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), pts = [[0, CAR_L / 2], [CAR_W / 2, CAR_L / 2], [-CAR_W / 2, CAR_L / 2], [CAR_W / 2, 0], [-CAR_W / 2, 0], [0, -CAR_L / 2]];
  for (const [lx, lz] of pts) {
    const x = nx + lx * c + lz * s, z = nz - lx * s + lz * c;
    for (const k of colliders) if (Math.hypot(x - k.x, z - k.z) < k.r + 0.1) return true;
    for (const b of boxes) if (!b.ceil && b.y0 < 1.2 && b.y1 > 0.2 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  }
  return Math.abs(nx) > (MECH.on ? MECH.lim : CFG.field) - 3 || Math.abs(nz) > (MECH.on ? MECH.lim : CFG.field) - 3;
}
function updateCar(dt) {
  if (!carOn()) return;
  const e = CAR.driver, alive = e && isUp(e) && !CAR.dead;
  if (e && !alive && !CAR.dead) { CAR.dead = true; CAR.deadT = 0; CAR.tgt = null; CAR.fwdHold = false; if (CAR.marker) CAR.marker.visible = false; }
  // 目標速度とハンドル
  let want = 0, steerWant = 0;
  if (alive) {
    if (CAR.riding && (keys.KeyW || touch.jy < -0.5)) { const d = 16; CAR.tgt = [CAR.x - Math.sin(player.yaw) * d, CAR.z - Math.cos(player.yaw) * d]; CAR.fwdHold = true; if (CAR.marker) CAR.marker.visible = false; }
    else if (CAR.fwdHold) { CAR.fwdHold = false; CAR.tgt = null; }
    if (CAR.riding && (keys.KeyS || touch.jy > 0.5)) { CAR.tgt = null; CAR.fwdHold = false; if (CAR.marker) CAR.marker.visible = false; }
    if (CAR.tgt) {
      const [lx, lz] = carL(CAR.tgt[0], CAR.tgt[1]), d = Math.hypot(lx, lz), ang = Math.atan2(lx, lz);
      steerWant = clamp(ang * 1.4, -0.6, 0.6);
      want = d < 1.5 ? 0 : Math.min(CAR_VMAX, d * 0.7) * (Math.abs(ang) > 1.6 ? 0.45 : 1);
      if (d < 1.5 && !CAR.fwdHold) { CAR.tgt = null; if (CAR.marker) CAR.marker.visible = false; drvSay('drv_arrive'); }
    }
    if (CAR.exitReq) want = 0;
  }
  const look = 1.0 + Math.max(0, CAR.v) * 0.75;
  const ahead = want > 0 && carAhead(look, dt);
  if (ahead) { want = 0; if (CAR.v > 1.2 && CAR.lastMsg !== 'drv_brake') drvSay('drv_brake'); }
  else if (CAR.lastMsg === 'drv_brake' && CAR.v < 0.1) CAR.lastMsg = '';
  const acc = want > CAR.v ? 2.6 : (ahead ? 9 : CAR.dead ? 2.2 : 4.5);
  CAR.v += clamp(want - CAR.v, -acc * dt, acc * dt);
  CAR.steer += clamp(steerWant - CAR.steer, -dt * 1.8, dt * 1.8);
  if (CAR.v > 0.01) {
    const yaw2 = CAR.yaw + CAR.v / 2.2 * Math.tan(CAR.steer) * dt, nx = CAR.x + Math.sin(yaw2) * CAR.v * dt, nz = CAR.z + Math.cos(yaw2) * CAR.v * dt;
    if (carBlocked(nx, nz, yaw2)) { CAR.v = 0; CAR.blockT += dt; if (CAR.tgt && CAR.blockT > 0.4) { CAR.tgt = null; if (CAR.marker) CAR.marker.visible = false; drvSay('drv_block'); } }
    else { CAR.x = nx; CAR.z = nz; CAR.yaw = yaw2; CAR.blockT = 0; }
  }
  if (CAR.exitReq && CAR.v < 0.3) carExit();
  // 見た目
  CAR.g.position.set(CAR.x, Math.abs(CAR.v) > 0.3 ? Math.sin(time * 18) * 0.006 : 0, CAR.z); CAR.g.rotation.y = CAR.yaw;
  for (let i = 0; i < 4; i++) { const w = CAR.wheels[i]; w.children[0].rotation.x = w.children[1].rotation.x = (w.spin = (w.spin || 0) + CAR.v * dt / 0.28); if (i < 2) w.rotation.y = CAR.steer; }
  if (CAR.wheelM) CAR.wheelM.rotation.z = -CAR.steer * 2.2;
  // 運転手（生きていれば座席、倒れていればハンドルに突っ伏したまま一緒に動く）・後部座席の娘
  const put = (o, seat) => { const [wx, wz] = carW(seat[0], seat[1]); if (o.seated) { o.seated.x = wx; o.seated.z = wz; } o.s.position.x = wx; o.s.position.z = wz; o.s.position.y = o.baseY = CAR_FLOOR; o.s.rotation.y = CAR.yaw; if (o.state === 'idle' || o.seated) o.face = CAR.yaw; };
  if (e && (enemies.includes(e) || bodies.includes(e))) put(e, CAR_SEAT.drv);
  for (const r of CAR.rear) if (bodies.includes(r) || enemies.includes(r)) put(r, CAR_SEAT.rear);
  // 運転手が倒れた：止まるのを待って、殿のひと言。しばらくすると近くの侍女が代わる
  if (CAR.dead) {
    CAR.deadT += dt;
    if (CAR.riding && !CAR.said && CAR.v < 0.4 && CAR.deadT > 1.2) { CAR.said = true; kingSay('king_deaddrive'); }
    if (CAR.v < 0.1 && CAR.deadT > 5) carTakeover(dt);
  }
}
// 近くの青組の娘（秘書課・近衛・救護以外）が運転を代わる
function carTakeover(dt) {
  if (CAR.taker && !isUp(CAR.taker)) CAR.taker = null;
  if (!CAR.taker) {
    let best = null, bd = 30;
    bd = 70;
    for (const o of enemies) { if (o.team !== 'blue' || !isUp(o) || o.special || o.seated || o.perch || o.lad || o.kind !== 'mob' || o.wounded || o.yari) continue; const d = Math.hypot(o.s.position.x - CAR.x, o.s.position.z - CAR.z) + (o.guard ? 6 : 0); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    CAR.taker = best; best.carCall = true;
  }
}
// 運転を代わる娘：運転席の扉まで歩いて、乗り込む（updateEnemies から呼ぶ）
function carCallBrain(t, dt) {
  if (CAR.taker !== t || !carOn()) { t.carCall = false; return false; }
  const [dx, dz] = carW(-CAR_W / 2 - 0.6, -0.15), p = t.s.position;
  t.tgt = null; t.passive = true;
  t.carWalkT = (t.carWalkT || 0) + dt;
  const [llx, llz] = carL(p.x, p.z);
  if (llx > -0.95 && t.carWalkT < 10) {   // 車の反対側：自分の側を前か後ろの端まで回ってから運転席側へ
    const sg = llz > 0 ? 1 : -1, [wx2, wz2] = Math.abs(llz) < 2.3 ? carW(Math.max(1.3, llx), sg * 2.7) : carW(-1.45, sg * 2.7); steer(t, wx2, wz2, t.speed * 1.2, dt); t.state = 'idle'; t.faceWant = Math.atan2(wx2 - p.x, wz2 - p.z); return true; }
  if (Math.hypot(p.x - dx, p.z - dz) > 0.6 && t.carWalkT < 12) { steer(t, dx, dz, t.speed * 1.2, dt); t.state = 'idle'; t.faceWant = Math.atan2(dx - p.x, dz - p.z); return true; }
  // 倒れた運転手を後部座席へ移し、運転席に座る
  if (t.guard) { GUARD.list = GUARD.list.filter(o => o !== t); t.guard = 0; }
  const old = CAR.driver; if (old) { CAR.rear.push(old); old.slump = old.slump || { side: 1, fwd: 0.3 }; if (old.tilt) { old.tilt.rotation.x = 0.35; old.tilt.rotation.z = 0.3; } }
  CAR.taker = null; t.carCall = false;
  carSpawnDriver(t);
  popup(`${t.prof.name.replace('運転手 ', '')}が運転を代わります`); drvSay('drv_take');
  return true;
}
// 娘を車から押し出す（車は人をひかない。重なったら人のほうをよける）
function carPush(p, r) {
  if (!carOn()) return;
  const [lx, lz] = carL(p.x, p.z), hx = CAR_W / 2 + r, hz = CAR_L / 2 + r;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return;
  const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
  const [nx, nz] = ox < oz ? [Math.sign(lx || 1) * hx, lz] : [lx, Math.sign(lz || 1) * hz];
  const [wx, wz] = carW(nx, nz); p.x = wx; p.z = wz;
}
function carCamera(dt) {
  player.shake = Math.max(0, player.shake - dt); const sh = player.shake * 0.25;
  const [wx, wz] = carW(CAR_SEAT.pas[0], CAR_SEAT.pas[1] + 0.05);
  camera.position.set(wx, CAR_EYE + (Math.abs(CAR.v) > 0.3 ? Math.sin(time * 17) * 0.004 : 0), wz);
  camera.rotation.set(player.pitch + rand(-sh, sh) * 0.3, player.yaw + rand(-sh, sh) * 0.3, 0);
  if (Math.abs(camera.fov - 75) > 0.05) { camera.fov += (75 - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
}
function carHint() {
  if (!carOn() || state !== 'play') return '';
  if (CAR.riding) return CAR.dead ? (MOBILE ? '「降りる」ボタンで降りる' : 'E で降りる') : (MOBILE ? '攻撃ボタン：行き先　スティック前：前へ　「降りる」' : 'クリック：行き先　W：前へ　S：止まる　E：降りる');
  return carNear() ? (MOBILE ? '軽自動車：「乗る」ボタンで助手席へ' : '軽自動車：E で助手席に乗る') : '';
}

// ---- 浜の軽自動車：1台4人まで。あふれた兵は車のすぐ後ろを歩き、竹束を銃弾よけにする。トーチカの横で降りる。人はひかない ----
function keiEligible(e) {
  return !!(e && e.team === 'blue' && !e.special && !e.medic && !e.guard && !e.secretary && !e.aide && !e.runner && !e.fluter && !e.ojou && !e.driver && !e.hold);
}
function keiCount(C) { return C.seats.filter(Boolean).length; }
function keiW(C, lx, lz) { const c = Math.cos(C.yaw), s = Math.sin(C.yaw); return [C.x + lx * c + lz * s, C.z - lx * s + lz * c]; }
function keiL(C, x, z) { const dx = x - C.x, dz = z - C.z, c = Math.cos(C.yaw), s = Math.sin(C.yaw); return [dx * c - dz * s, dx * s + dz * c]; }
function keiPlan(C) {
  const P = BEACH.pbs[C.pb] || BEACH.pbs[0];
  const side = P.i % 2 === 0 ? -1 : 1;
  const dropX = clamp(P.x + side * (PB_W / 2 + 3.8), -BH.XW + 3, BH.XW - 3);
  const dropZ = P.z + 0.2;
  const pick = (gs, row, x) => {
    let best = gs[0], bd = 1e9;
    for (const gx of gs) {
      const crowd = BEACH.cars.filter(O => O.gaps && O.gaps[row] === gx).length;
      const d = Math.abs(gx - x) + crowd * 12;
      if (d < bd) { bd = d; best = gx; }
    }
    return best;
  };
  C.gaps = [pick(ABATIS[0].gaps, 0, dropX), pick(ABATIS[1].gaps, 1, dropX)];
  C.drop = [dropX, dropZ];
  return [[C.gaps[0], 26], [C.gaps[0], 34.2], [C.gaps[1], 36.6], [C.gaps[1], 43.8], C.drop];
}
function keiAim(C) {
  for (let i = 0; i < ABATIS.length; i++) {
    const R = ABATIS[i], gx = C.gaps[i];
    if (C.z < R.z + 2.5) {
      if (C.z < R.z - 1.15 && Math.abs(C.x - gx) > 0.42) return [gx, R.z - 2.5];
      return [gx, R.z + 3.3];
    }
  }
  const P = BEACH.pbs[C.pb], dx = C.drop[0], dz = C.drop[1];
  if (P && Math.abs(C.x - dx) > 0.85 && C.z < dz - 0.3) return [dx, Math.min(C.z, P.z0 - 2.2)];
  return C.drop;
}
function keiMake(x, z, yaw, pb) {
  const M = carMats(), g = new THREE.Group(), built = keiAssemble(g, M), y = groundH(x, z);
  g.position.set(x, y, z); g.rotation.order = 'YXZ'; g.rotation.y = yaw; stageRoot.add(g);
  const C = { g, wheels: built.wheels, wheelM: built.wheelM, x, z, y, yaw, v: 0, steer: 0, pb, seats: [null, null, null, null], phase: 'wait', waitT: 0, wp: 0, dropped: false, player: false, playerSeat: -1, exitReq: false, blockT: 0, aheadT: 0, saidDrop: false, reserve: false };
  C.wps = keiPlan(C); BEACH.cars.push(C); return C;
}
// 浜：車体が機関銃の弾道を遮るか（車のローカル箱）。当たった点を返す
function keiRayHit(muz, ray, L2) {
  if (!BEACH.on || !BEACH.cars.length) return null;
  let best = null;
  const hw = CAR_W / 2 + 0.05, hl = CAR_L / 2 + 0.06, y0 = 0.22, y1 = 1.64;
  for (const C of BEACH.cars) {
    const co = Math.cos(C.yaw), si = Math.sin(C.yaw);
    const dx = muz.x - C.x, dz = muz.z - C.z;
    const ox = dx * co - dz * si, oz = dx * si + dz * co, oy = muz.y - C.y;
    const dxr = ray.x * co - ray.z * si, dzr = ray.x * si + ray.z * co, dyr = ray.y;
    let t0 = 0, t1 = L2, ok = true;
    const slab = (o, d, a, b) => {
      if (!ok) return;
      if (Math.abs(d) < 1e-8) { if (o < a || o > b) ok = false; return; }
      let ta = (a - o) / d, tb = (b - o) / d;
      if (ta > tb) { const u = ta; ta = tb; tb = u; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    };
    slab(ox, dxr, -hw, hw); slab(oy, dyr, y0, y1); slab(oz, dzr, -hl, hl);
    if (!ok || t0 < 0.35 || t0 > L2) continue;
    if (!best || t0 < best.t) best = { t: t0, x: muz.x + ray.x * t0, y: muz.y + ray.y * t0, z: muz.z + ray.z * t0, C };
  }
  return best;
}
function bundleRayHit(muz, ray, L2) {
  if (!BEACH.on) return null;
  let best = null;
  const denom = Math.max(1e-4, ray.x * ray.x + ray.z * ray.z);
  for (const cv of covers) {
    if (!cv.beach || cv.broken) continue;
    const t = ((cv.x - muz.x) * ray.x + (cv.z - muz.z) * ray.z) / denom;
    if (t < 0.35 || t > L2) continue;
    const qx = muz.x + ray.x * t, qz = muz.z + ray.z * t, qy = muz.y + ray.y * t;
    if (Math.hypot(qx - cv.x, qz - cv.z) > 0.78) continue;
    if (qy < (cv.y || 0) + 0.02 || qy > (cv.h || 1.5) + 0.04) continue;
    if (!best || t < best.t) best = { t, cv, x: qx, y: qy, z: qz };
  }
  return best;
}
// 軽の真後ろ（銃口が車の前方にあるとき）にいれば、車体が盾になる
function keiShields(px, pz, gx, gz) {
  if (!BEACH.on) return false;
  for (const C of BEACH.cars) {
    const [lx, lz] = keiL(C, px, pz);
    if (lz > -0.2 || lz < -(CAR_L / 2 + 5.2)) continue;
    if (Math.abs(lx) > CAR_W * 0.46) continue;
    if (keiL(C, gx, gz)[1] > 0.6) return true;
  }
  return false;
}
function beachGiveBundle(e) {
  if (!e || e.beachBundle) return e && e.beachBundle;
  const p = e.s.position, y = e.baseY || 0;
  const cv = bamboobundle(p.x, p.z + 0.6, e.face || 0, { y, noCol: true, hp: 5, h: y + 1.52 });
  cv.beach = true; cv.bearer = e; e.beachBundle = cv; e.beachGot = true;
  return cv;
}
function beachStowBundle(e) {
  const c = e && e.beachBundle; if (!c) return;
  e.beachBundle = null; c.bearer = null;
  if (!c.broken) breakBundle(c, 'stow');
}
function beachSyncBundle(e) {
  const c = e.beachBundle;
  if (!c || c.broken) { if (c && c.broken) e.beachBundle = null; return; }
  const face = e.faceWant != null ? e.faceWant : (e.face || 0);
  c.x = e.s.position.x + Math.sin(face) * 0.62;
  c.z = e.s.position.z + Math.cos(face) * 0.62;
  c.y = e.baseY || 0; c.h = c.y + 1.52; c.ang = face;
  if (c.mesh) { c.mesh.position.set(c.x, c.y, c.z); c.mesh.rotation.y = face; }
}
function beachEnsureBundle(e) {
  if (!e || e.beachGot || e.seated || e.beachBundle || !isUp(e)) return;
  beachGiveBundle(e);
}
function keiTailSlot(i) {
  const col = i % 2, row = (i / 2) | 0;
  return [col ? 0.26 : -0.26, -(CAR_L / 2 + 0.7 + row * 0.86)];
}
function keiTailLag(C) {
  let lag = 0;
  for (const e of enemies) {
    if (e.keiTail !== C || !isUp(e)) continue;
    const s = keiTailSlot(e.keiTailI | 0), w = keiW(C, s[0], s[1]);
    lag = Math.max(lag, Math.hypot(e.s.position.x - w[0], e.s.position.z - w[1]));
  }
  return lag;
}
function keiTailBrain(e, dt) {
  const C = e.keiTail;
  if (!C || C.dropped || !BEACH.cars.includes(C)) { e.keiTail = null; e.crouch = 0; return false; }
  beachEnsureBundle(e);
  e.keiWalk = (e.keiWalk || 0) + dt; e.tgt = null; e.passive = true;
  const s = keiTailSlot(e.keiTailI | 0), w = keiW(C, s[0], s[1]), p = e.s.position;
  const d = Math.hypot(p.x - w[0], p.z - w[1]);
  e.crouch = d < 1.15 ? 0.58 : 0.12;
  if (d > 0.32) steer(e, w[0], w[1], e.speed * (d > 4 ? 1.35 : 1.05), dt);
  else { const k = Math.min(1, dt * 8); p.x += (w[0] - p.x) * k; p.z += (w[1] - p.z) * k; e.moving = false; }
  e.faceWant = C.yaw; e.state = d > 0.5 ? 'approach' : 'hide';
  return true;
}
function keiSpawnFor(B, riders) {
  const live = BEACH.pbs.filter(P => !P.taken), targets = live.length ? live : BEACH.pbs;
  let i = 0;
  while (i < riders.length) {
    const reserve = !BEACH.lordCar && Math.abs(B.x - 4) < 18;
    const cap = reserve ? 3 : 4;
    const room = Math.min(riders.length - i, cap + 6);
    const nSeat = Math.min(cap, room);
    const group = riders.slice(i, i + nSeat);
    const tail = riders.slice(i + nSeat, i + room);
    i += group.length + tail.length;
    if (!group.length) break;
    const P = targets[(BEACH.carN || 0) % targets.length];
    let x = clamp(reserve ? 6.2 : B.x, -40, 40), z = 3.4, step = x >= 0 ? 4.4 : -4.4, guard = 0;
    while (BEACH.cars.some(O => Math.abs(O.x - x) < 4.05) && guard++ < 14) x = clamp(x + step, -40, 40);
    const C = keiMake(x, z, 0, P.i);
    if (reserve) { C.reserve = true; BEACH.lordCar = C; }
    const seats = reserve ? [0, 2, 3, 1] : [0, 1, 2, 3];
    group.forEach((e, si) => { e.keiGo = C; e.keiSlot = seats[si]; e.keiTail = null; e.standAt = time + 0.15 + si * 0.12; });
    tail.forEach((e, ti) => { e.keiTail = C; e.keiTailI = ti; e.keiGo = null; e.standAt = time + 0.18 + ti * 0.1; });
    BEACH.carN = (BEACH.carN || 0) + 1;
    BEACH.log.push('kei:' + C.pb + ':' + group.length + '+' + tail.length);
    if (tail.length && !BEACH.tailSaid) { BEACH.tailSaid = true; popup('車のすぐ後ろにつけ。竹束を前に出せ'); }
  }
}
function keiSit(e, C, slot) {
  if (!e || !C || !isUp(e) || C.usedRaid) { if (e) e.keiGo = null; return false; }
  if (e.team === 'orange') {
    if (!(C.dropped || C.phase === 'stall' || C.phase === 'done' || C.phase === 'flee')) { e.keiGo = null; return false; }
  } else if (C.dropped) { e.keiGo = null; return false; }
  if (C.seats[slot]) slot = C.seats.findIndex(s => !s);
  if (slot < 0 || keiCount(C) >= 4) {
    if (e.team === 'orange' && keiLiving(C, 'blue') === 0 && keiHasBody(C)) {
      keiBloodSay(e); vehDumpBodies(C);
      slot = C.seats.findIndex(s => !s);
    }
  }
  if (slot < 0 || keiCount(C) >= 4) {
    if (e.keiGo === C) { e.keiGo = null; e.passive = false; e.state = e.kind === 'archer' ? 'advance' : 'approach'; }
    return false;
  }
  if (e.boat) {
    if (e.boatSlot != null && e.boat.seats[e.boatSlot] === e) e.boat.seats[e.boatSlot] = null;
    e.boat.crew = e.boat.crew.filter(o => o !== e); e.boat = null; e.boatSlot = null;
  }
  const [wx, wz] = keiW(C, KEI_SEAT[slot][0], KEI_SEAT[slot][1]);
  beachStowBundle(e);
  C.seats[slot] = e; e.keiGo = null; e.keiSlot = slot; e.keiTail = null; e.standAt = null;
  e.seated = { x: wx, z: wz, car: true, kei: C }; e.baseY = C.y + CAR_FLOOR; e.s.position.set(wx, e.baseY, wz);
  e.state = 'idle'; e.passive = true; e.tgt = null; e.knock.set(0, 0, 0);
  if (e.team === 'orange') {
    C.dropped = false; C.phase = 'flee'; C.flee = true; C.side = 'orange'; C.v = 0;
    for (const o of enemies) {
      if (o.keiTail === C) { o.keiTail = null; o.crouch = 0; }
      if (o.team === 'blue' && o.keiGo === C) o.keiGo = null;
    }
    if (!BEACH.raidSaid) { BEACH.raidSaid = true; popup('橙組が軽自動車を奪って浜へ向かう'); }
    BEACH.log.push('raid:' + C.pb);
  }
  if (keiHasBody(C)) { keiBloodSay(e); vehDumpBodies(C); }
  return true;
}
function keiWalkBrain(e, dt) {
  const C = e.keiGo;
  if (!C || !BEACH.cars.includes(C)) { e.keiGo = null; return false; }
  if (C.usedRaid || (C.dropped && e.team !== 'orange')) { e.keiGo = null; return false; }
  if (e.seated && e.seated.kei === C) return false;
  beachEnsureBundle(e);
  e.keiWalk = (e.keiWalk || 0) + dt; e.tgt = null; e.passive = true; e.state = 'idle';
  const slot = (e.keiSlot == null ? 0 : e.keiSlot) | 0, seat = KEI_SEAT[slot] || KEI_SEAT[0], side = seat[0] < 0 ? -1 : 1;
  const [dx, dz] = keiW(C, side * (CAR_W / 2 + 0.7), seat[1]), p = e.s.position;
  if (e.keiWalk > 9 || Math.hypot(p.x - dx, p.z - dz) < 0.9) { keiSit(e, C, slot); return true; }
  if (C.phase !== 'wait' && C.phase !== 'done' && C.phase !== 'stall' && C.phase !== 'flee' && Math.hypot(p.x - C.x, p.z - C.z) > 16) { e.keiGo = null; e.passive = false; e.state = e.kind === 'archer' ? 'advance' : 'approach'; return false; }
  steer(e, dx, dz, e.speed * 1.3, dt); e.faceWant = Math.atan2(dx - p.x, dz - p.z);
  return true;
}
function keiBeside(C) {
  const P = BEACH.pbs[C.pb];
  if (!P || C.z < P.z0 - 0.2) return false;
  const dx = Math.abs(C.x - P.x);
  if (dx < PB_W / 2 + 1.3) return false;
  return Math.hypot(C.x - P.x, C.z - P.z) < 8.2;
}
function keiExitPlayer(C, quiet) {
  if (!C || !C.player) return;
  const seat = C.playerSeat; if (seat >= 0 && C.seats[seat] === 'P') C.seats[seat] = null;
  C.player = false; C.playerSeat = -1; C.exitReq = false; player.kei = null;
  const [wx, wz] = keiW(C, CAR_W / 2 + 0.95, -0.15);
  player.pos.set(wx, groundH(wx, wz), wz); player.vy = 0; player.onGround = true; player.drawing = false;
  if (!quiet) popup('軽自動車を降りた');
}
function keiNearPb(C, gap) {
  const P = BEACH.pbs[C.pb];
  if (!P) return false;
  return C.z > P.z0 - (gap || 14) && Math.hypot(C.x - P.x, C.z - P.z) < (gap || 14) + 6;
}
function keiCrowd(C) {
  let n = 0;
  for (const o of enemies) {
    if (!isUp(o) || o.team !== 'orange' || o.seated) continue;
    const [lx, lz] = keiL(C, o.s.position.x, o.s.position.z);
    if (lz > 0.3 && lz < 8 && Math.abs(lx) < 3.4) n++;
  }
  return n;
}
function keiDrop(C, why) {
  if (!C || (C.dropped && C.phase === 'done')) return;
  C.dropped = true; C.phase = 'done'; C.v = 0; C.flee = false;
  const P = BEACH.pbs[C.pb];
  for (const e of enemies) if (e.keiGo === C && e.team === 'blue') e.keiGo = null;
  for (const e of enemies) if (e.keiTail === C) {
    if (isUp(e) && P) { e.home = [P.door[0] + ((e.keiTailI % 2) ? 0.7 : -0.7), P.door[1]]; e.beachAssault = P.i; }
    e.keiTail = null; e.crouch = 0;
  }
  for (let s = 0; s < C.seats.length; s++) {
    const o = C.seats[s];
    if (!o || o === 'P') continue;
    if (!isUp(o)) { o.keiDead = C; continue; }   // 遺体は席に残す。奪った側がそれを見る
    const [wx, wz] = keiW(C, (s % 2 ? 1 : -1) * (CAR_W / 2 + 0.9), s < 2 ? 0.55 : -1.15);
    C.seats[s] = null; o.keiDead = null; o.keiGo = null;
    o.s.position.x = wx; o.s.position.z = wz; o.baseY = groundH(wx, wz);
    o.seated = o.seated || { x: wx, z: wz };
    standUp(o); o.s.position.x = wx; o.s.position.z = wz; o.baseY = groundH(wx, wz);
    if (P) { o.home = [P.door[0] + ((s % 2) ? 0.6 : -0.6), P.door[1]]; o.beachAssault = P.i; }
  }
  if (C.player) keiExitPlayer(C, true);
  if (!C.saidDrop) {
    C.saidDrop = true;
    popup(why === 'stuck' ? '人がいる。降りてトーチカを攻めろ' : 'トーチカのそばだ、降りる');
    BEACH.log.push('keiDrop:' + (why || 'side') + ':' + C.pb);
  }
}
function keiLiving(C, team) {
  let n = 0;
  for (const o of C.seats) if (o && o !== 'P' && isUp(o) && (!team || o.team === team)) n++;
  return n;
}
function keiClaimable(C) {
  if (!C || C.player || C.usedRaid || !BEACH.cars.includes(C)) return false;
  if (keiLiving(C, 'blue') > 0) return false;
  if (enemies.some(e => e.team === 'blue' && isUp(e) && e.keiGo === C)) return false;
  if (C.phase === 'flee') return keiLiving(C) < 4;
  return C.dropped || C.phase === 'stall' || C.phase === 'done';
}
function keiOrangeBrain(e, dt) {
  if (!e || e.team !== 'orange' || e.gunner || e.hold || e.seated) return false;
  let C = e.keiGo;
  if (C && (!keiClaimable(C) && C.phase !== 'flee')) { e.keiGo = null; C = null; }
  if (!C) {
    if ((e.keiScan = (e.keiScan || 0) - dt) > 0) return false;
    e.keiScan = 0.65;
    let best = null, bd = 12;
    for (const O of BEACH.cars) {
      if (!keiClaimable(O)) continue;
      const pending = enemies.filter(o => o.keiGo === O && isUp(o)).length;
      if (keiLiving(O) + pending >= 4) continue;
      const d = Math.hypot(e.s.position.x - O.x, e.s.position.z - O.z);
      if (d < bd) { bd = d; best = O; }
    }
    if (!best) return false;
    e.keiGo = best; e.keiSlot = Math.max(0, best.seats.findIndex(s => !s));
    C = best;
  }
  return keiWalkBrain(e, dt);
}
function keiFleeAim(C) {
  let row = null;
  for (const R of ABATIS) if (C.z > R.z - 1.1 && (!row || R.z > row.z)) row = R;
  if (row) {
    let g = row.gaps[0], bd = 1e9;
    for (const gx of row.gaps) { const d = Math.abs(gx - C.x) + (C.fleeGap === gx ? -4 : 0); if (d < bd) { bd = d; g = gx; } }
    C.fleeGap = g;
    if (C.z > row.z + 1.3 && Math.abs(C.x - g) > 0.45) return [g, row.z + 2.4];
    return [g, row.z - 4.2];
  }
  return [clamp(C.x, -16, 16), 4.2];
}
function keiBeachArrival(C) {
  if (!C || C.usedRaid) return;
  C.usedRaid = true; C.dropped = true; C.phase = 'done'; C.v = 0; C.flee = false;
  for (let s = 0; s < C.seats.length; s++) {
    const o = C.seats[s];
    if (!o || o === 'P' || !isUp(o)) continue;
    const [wx, wz] = keiW(C, (s % 2 ? 1 : -1) * (CAR_W / 2 + 0.9), -0.4);
    C.seats[s] = null; o.keiGo = null; o.keiDead = null;
    o.seated = o.seated || { x: wx, z: wz };
    standUp(o); o.s.position.x = wx; o.s.position.z = wz; o.baseY = groundH(wx, wz);
    o.beachRaid = true; o.pb = null; o.home = [wx, clamp(wz, 2, 8)];
  }
  if (C.player) keiExitPlayer(C, true);
  if (!BEACH.raidLand) { BEACH.raidLand = true; popup('橙組の軽自動車が浜に着いた'); }
  BEACH.log.push('raidLand:' + C.pb);
}
function keiCarRel(C, dir) {
  let best = null, bd = 1e9;
  for (const O of BEACH.cars) {
    if (O === C || O.dropped) continue;
    const [lx, lz] = keiL(C, O.x, O.z);
    const ok = dir > 0 ? (lz > 0.25 && lz < CAR_L + 2.5) : (lz < -0.25 && lz > -(CAR_L + 2.5));
    if (!ok || Math.abs(lx) > CAR_W * 0.95) continue;
    const d = Math.abs(lz); if (d < bd) { bd = d; best = O; }
  }
  return best;
}
function beachHqJob(e) {
  if (!BEACH.on || !e || e.team !== 'blue' || !isUp(e) || e.seated || e.patient) return false;
  if (e.polishT > 0 || e.defending) return false;
  if (e.secretary && sec.mode !== 'hq') return false;
  if (e.sec2 && sec2.mode !== 'hq') return false;
  if (e.ojou && ojou.mode !== 'hq') return false;
  if (e.aide && e.aide.follow) return false;
  if (e.runner && e.runner.job) return false;
  if (e.medic) return false;
  return !!(e.secretary || e.sec2 || e.ojou || e.aide || e.fluter || e.runner);
}
function beachHqPoint(e) {
  let car = null;
  const pz = e.s.position.z || 0;
  for (const C of BEACH.cars) {
    if (C.side === 'orange' || C.flee || C.usedRaid || C.dropped) continue;
    if (C.phase === 'wait' || C.phase === 'stall' || C.phase === 'done') continue;
    if (C.z < pz + 1.2) continue;
    if (!car || C.z > car.z) car = C;
  }
  const k = (e.id || 1) % 7;
  if (car) return keiW(car, ((k % 3) - 1) * 0.85, -(CAR_L / 2 + 1.15 + (k % 4) * 0.7));
  const z = Math.min(46, Math.max(pz + 7, 8 + (k % 4)));
  return [clamp((e.home && e.home[0]) || e.s.position.x || 0, -20, 20) + ((k % 5) - 2) * 1.1, z];
}
function beachHqBrain(e, dt) {
  if (!beachHqJob(e)) return false;
  const goal = beachHqPoint(e), p = e.s.position, d = Math.hypot(goal[0] - p.x, goal[1] - p.z);
  e.tgt = null; e.passive = true;
  if (d > 1.15) {
    steer(e, goal[0], goal[1], e.speed * (d > 8 ? 1.3 : 1.05), dt);
    e.faceWant = Math.atan2(goal[0] - p.x, goal[1] - p.z);
    e.state = 'approach'; e.crouch = 0;
  } else {
    e.hqSid = (e.hqSid || 0) + dt;
    if (e.hqSid > 1.4) { e.hqSid = 0; p.x += (e.id % 2 ? 1 : -1) * 0.9; }
    e.crouch = 0.28; e.state = 'idle'; e.faceWant = 0;
  }
  if (!BEACH.hqSaid && p.z > 10) { BEACH.hqSaid = true; popup('本陣も前へ。止まると撃たれる'); }
  return true;
}
function keiHasBody(C) {
  if (!C) return false;
  for (const o of C.seats) if (o && o !== 'P' && !isUp(o)) return true;
  if (enemies.some(e => e.keiDead === C)) return true;
  return bodies.some(b => b.keiDead === C);
}
const KEI_BLOOD = ['血だらけじゃん…', 'うわぁ…', '血の匂いがする…', 'ちょ、この車、血だらけなんだけど', 'う、臭い。血の匂い…', 'えっ、遺体のまま乗ってるの…'];
function keiBloodSay(e) {
  if (!e || !isUp(e) || e.bloodSaid) return;
  e.bloodSaid = true;
  const line = KEI_BLOOD[(Math.random() * KEI_BLOOD.length) | 0];
  const name = (e.prof && e.prof.name) || '戦いの娘';
  Talk.as(e, () => {
    Voice.say(line, e.prof || { pitch: 1.28, rate: 1.08 }, 1);
    subtitle(line);
    const el = $('subtitle'); if (el) el.textContent = name + '「' + line + '」';
  });
  if (BEACH.log) BEACH.log.push('blood:' + name + ':' + line);
}
function keiNearCar() {
  if (!BEACH.on || player.kei) return null;
  let best = null, bd = 2.5;
  for (const C of BEACH.cars) {
    if (C.dropped) continue;
    const [lx, lz] = keiL(C, player.pos.x, player.pos.z);
    if (Math.abs(lz) > CAR_L / 2 + 1.1 || Math.abs(lx) > CAR_W / 2 + 1.7) continue;
    const d = Math.hypot(lx, lz); if (d < bd) { bd = d; best = C; }
  }
  return best;
}
function keiUse() {
  if (!BEACH.on) return false;
  if (player.kei) {
    const C = player.kei;
    if (keiBeside(C)) { keiDrop(C); return true; }
    if (Math.abs(C.v) > 0.8) { popup('止まってから降ります'); C.exitReq = true; return true; }
    keiExitPlayer(C, false); return true;
  }
  const C = keiNearCar(); if (!C) return false;
  if (keiCount(C) >= 4) {
    if (keiLiving(C) === 0 && keiHasBody(C)) { popup('遺体を車の外に出した'); vehDumpBodies(C); }
    else { popup('この軽自動車は4人までです'); return true; }
  }
  let seat = C.seats[1] ? C.seats.findIndex(s => !s) : 1;
  if (seat < 0) { popup('この軽自動車は4人までです'); return true; }
  C.seats[seat] = 'P'; C.player = true; C.playerSeat = seat; player.kei = C;
  player.drawing = false; player.autoClimb = null; player.charge = 0;
  popup('軽自動車に乗った（' + keiCount(C) + ' / 4）— トーチカのそばで降ります');
  if (keiHasBody(C)) { const g = enemies.find(o => isUp(o) && o.seated && o.seated.kei === C); if (g) keiBloodSay(g); }
  return true;
}
function keiHint() {
  if (!BEACH.on || state !== 'play') return '';
  if (player.kei) return MOBILE ? 'トーチカのそばで降ります　「降りる」' : 'トーチカのそばで降ります　E で降りる';
  const C = keiNearCar(); if (!C) return '';
  const n = keiCount(C);
  if (n >= 4) return '軽自動車は満員です（4人）';
  return MOBILE ? `軽自動車（${n}/4）：「乗る」` : `軽自動車（${n}/4）：E で乗る`;
}
function keiSeatPlayer() {
  const C = player.kei; if (!C) return;
  const seat = KEI_SEAT[C.playerSeat] || KEI_SEAT[1], [wx, wz] = keiW(C, seat[0], seat[1]);
  player.pos.set(wx, C.y + CAR_EYE - CFG.eyeH, wz); player.vy = 0; player.onGround = true; player.drawing = false;
}
function keiCam(dt) {
  const C = player.kei; if (!C) return;
  player.shake = Math.max(0, player.shake - dt); const sh = player.shake * 0.25;
  const seat = KEI_SEAT[C.playerSeat] || KEI_SEAT[1], [wx, wz] = keiW(C, seat[0], seat[1] + 0.05);
  camera.position.set(wx, C.y + CAR_EYE + (Math.abs(C.v) > 0.3 ? Math.sin(time * 17) * 0.004 : 0), wz);
  camera.rotation.set(player.pitch + rand(-sh, sh) * 0.3, player.yaw + rand(-sh, sh) * 0.3, 0);
}
function keiBlocked(C, nx, nz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), gy = groundH(nx, nz);
  for (const [lx, lz] of [[0, CAR_L / 2 + 0.1], [CAR_W / 2 - 0.05, CAR_L / 2], [-CAR_W / 2 + 0.05, CAR_L / 2], [CAR_W / 2 - 0.05, 0.3], [-CAR_W / 2 + 0.05, 0.3]]) {
    const x = nx + lx * c + lz * s, z = nz - lx * s + lz * c;
    for (const b of boxes) {
      if (b.ceil || b.stake) continue;
      if (x <= b.x0 || x >= b.x1 || z <= b.z0 || z >= b.z1) continue;
      if (b.y1 > gy + 0.2 && b.y0 < gy + 1.35) return true;
    }
  }
  for (const O of BEACH.cars) {
    if (O === C || O.dropped) continue;
    const dx = O.x - nx, dz = O.z - nz, c = Math.cos(yaw), s = Math.sin(yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (lz > 0.2 && lz < CAR_L * 0.95 && Math.abs(lx) < CAR_W * 0.72) return true;
  }
  return Math.abs(nx) > BH.XW - 1.5;
}
function keiAhead(C, look, dt) {
  let hit = false;
  const occ = new Set(C.seats.filter(o => o && o !== 'P'));
  const slide = (p, lx, lz) => {
    const sd = lx >= 0 ? 1 : -1, [ax, az] = keiW(C, sd * (CAR_W / 2 + 1.05), lz), k = Math.min(1, (dt || 0) * 2.4);
    p.x += (ax - p.x) * k; p.z += (az - p.z) * k;
  };
  const chk = (p, o, body) => {
    if (o && (o.seated || occ.has(o))) return;
    const [lx, lz] = keiL(C, p.x, p.z);
    if (!(lz > CAR_L / 2 - 0.15 && lz < CAR_L / 2 + look && Math.abs(lx) < CAR_W / 2 + 0.28)) return;
    hit = true;
    if (body) slide(p, lx, lz);
    else if (o && isUp(o) && !o.keiGo && dt) slide(p, lx, lz);
  };
  for (const o of enemies) if (o.state !== 'pit' && o.state !== 'down') chk(o.s.position, o, false);
  for (const b of bodies) chk(b.s.position, null, true);
  if (!C.player && !player.kei) chk(player.pos, null, false);
  return hit;
}
function keiPut(C) {
  for (let s = 0; s < KEI_SEAT.length; s++) {
    const o = C.seats[s];
    if (!o || o === 'P') continue;
    const [wx, wz] = keiW(C, KEI_SEAT[s][0], KEI_SEAT[s][1]), y = C.y + CAR_FLOOR;
    if (o.seated) { o.seated.x = wx; o.seated.z = wz; }
    o.s.position.x = wx; o.s.position.z = wz; o.baseY = y;
    if (isUp(o)) { o.s.rotation.y = C.yaw; if (o.state === 'idle' || o.seated) o.face = C.yaw; }
  }
}
function keiPush(C, p, r) {
  const [lx, lz] = keiL(C, p.x, p.z), hx = CAR_W / 2 + r, hz = CAR_L / 2 + r;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return;
  const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
  const [nx, nz] = ox < oz ? [Math.sign(lx || 1) * hx, lz] : [lx, Math.sign(lz || 1) * hz];
  const [wx, wz] = keiW(C, nx, nz); p.x = wx; p.z = wz;
}
function keiPushAll(p, r) { if (!BEACH.on) return; for (const C of BEACH.cars) if (!C.dropped) keiPush(C, p, r); }
function updateKei(dt) {
  if (!BEACH.on) return;
  if (!BEACH.lordTold && BEACH.king && BEACH.king.beached && BEACH.lordCar && !BEACH.lordCar.player && !BEACH.lordCar.dropped && BEACH.lordCar.phase === 'wait') {
    BEACH.lordTold = true; popup('浜に軽自動車が待っている — E で乗る（1台4人まで）');
  }
  for (const C of BEACH.cars) {
    if (C.dropped) { C.g.position.y = groundH(C.x, C.z); continue; }
    const living = C.seats.some(o => o && o !== 'P' && isUp(o));
    if (C.phase === 'wait') {
      C.waitT += dt;
      const pending = enemies.some(e => e.keiGo === C && isUp(e));
      const tailFar = enemies.some(e => e.keiTail === C && isUp(e) && Math.hypot(e.s.position.x - C.x, e.s.position.z - C.z) > 7.5);
      const kingReady = BEACH.king && BEACH.king.beached;
      if (C.reserve && !C.player) {
        if (!pending && !tailFar && keiCount(C) >= 1 && kingReady && C.waitT > 14) C.phase = 'go';
        else if (!pending && !tailFar && keiCount(C) >= 1 && C.waitT > 48) C.phase = 'go';
      } else if (!pending && !tailFar && keiCount(C) >= 1 && (C.waitT > 1.2 || C.player)) C.phase = 'go';
      else if (keiCount(C) >= 1 && C.waitT > 16) C.phase = 'go';
      if (C.player && !pending && C.waitT > 2.2) C.phase = 'go';
    }
    let want = 0, steerWant = 0, fleeDiff = 0;
    const livingDrive = living || C.player;
    if (C.phase === 'flee' && livingDrive) {
      const wp = keiFleeAim(C);
      const arrived = C.z < 7.4 && Math.hypot(C.x - wp[0], C.z - wp[1]) < 3.4;
      if (arrived || C.z < 5.6) { keiBeachArrival(C); continue; }
      const dy = Math.atan2(wp[0] - C.x, wp[1] - C.z);
      fleeDiff = dy - C.yaw;
      while (fleeDiff > Math.PI) fleeDiff -= Math.PI * 2;
      while (fleeDiff < -Math.PI) fleeDiff += Math.PI * 2;
      steerWant = clamp(fleeDiff * 1.3, -0.7, 0.7);
      C.holdYaw = false; C.fleeAlign = Math.abs(fleeDiff) < 0.75;
      want = Math.abs(fleeDiff) > 1.05 ? 0.7 : Math.min(4.8, 2.3 + Math.hypot(wp[0] - C.x, wp[1] - C.z) * 0.12);
    } else if (C.phase === 'go' && livingDrive) {
      if (keiBeside(C)) { keiDrop(C); continue; }
      const wp = keiAim(C), drop = C.drop;
      const [lx, lz] = keiL(C, wp[0], wp[1]), d = Math.hypot(lx, lz), ang = Math.atan2(lx, lz);
      const atDrop = drop && Math.hypot(C.x - drop[0], C.z - drop[1]) < 2.15;
      let straight = false, gx = wp[0];
      for (let i = 0; i < ABATIS.length; i++) if (Math.abs(C.z - ABATIS[i].z) < 2.4) { straight = true; gx = C.gaps[i]; }
      steerWant = straight ? clamp((gx - C.x) * 1.1, -0.32, 0.32) : clamp(ang * 1.35, -0.68, 0.68);
      C.holdYaw = straight && Math.abs(C.x - gx) < 0.75;
      want = atDrop ? 0 : Math.min(5.3, 2.4 + d * 0.28) * (Math.abs(ang) > 1.05 && Math.abs(ang) < 2.05 ? 0.42 : 1);
      if (Math.abs(ang) > 2.05) want = -1.45;
      const lag = keiTailLag(C);
      if (lag > 3.1) want = Math.min(Math.max(want, 0), 0.45);
      else if (lag > 1.3) want = Math.min(want, 1.5);
      else if (lag > 0) want = Math.min(want, 2.25);
      if (atDrop) { keiDrop(C); continue; }
    } else if ((C.phase === 'go' || C.phase === 'flee') && !livingDrive) { C.phase = 'stall'; want = 0; }
    const behindCar = C.phase === 'wait' || C.dropped ? null : keiCarRel(C, -1);
    const leadJam = !!(behindCar && !keiCarRel(C, 1));
    if (leadJam && !(C.phase === 'go' && keiNearPb(C, 9)) && (C.phase !== 'flee' || C.fleeAlign)) {
      want = Math.max(want, 2.1);
      if (C.phase !== 'flee' && C.gaps) {
        for (let i = 0; i < ABATIS.length; i++) {
          const R = ABATIS[i];
          if (C.z > R.z - 5 && C.z < R.z + 2.4) { steerWant = clamp((C.gaps[i] - C.x) * 0.9, -0.5, 0.5); break; }
        }
      }
    }
    if (C.exitReq) want = 0;
    const ahead = want > 0.2 && keiAhead(C, 1.05 + Math.max(0, C.v) * 0.55, dt);
    C.aheadT = ahead ? C.aheadT + dt : 0;
    if (C.phase === 'go' && livingDrive && keiNearPb(C, 9) && (Math.abs(C.v) < 0.45 || ahead)) C.stopT = (C.stopT || 0) + dt;
    else C.stopT = 0;
    if (C.phase === 'go' && livingDrive && keiNearPb(C, 9) && (keiCrowd(C) >= 3 || C.aheadT > 0.45 || C.stopT > 1.3)) { keiDrop(C, 'stuck'); continue; }
    if (ahead) { if (C.aheadT < 0.7) want = 0; else want = Math.min(Math.max(want, 0), 1.25); }
    const acc = want > C.v ? 2.8 : (ahead ? 10 : 4.2);
    C.v += clamp(want - C.v, -acc * dt, acc * dt);
    C.steer += clamp(steerWant - C.steer, -dt * 2, dt * 2);
    const drive = !C.dropped && (C.phase === 'go' || C.phase === 'flee' || (leadJam && C.phase === 'stall'));
    if (Math.abs(C.v) > 0.02 && drive) {
      const yaw2 = C.phase === 'flee'
        ? C.yaw + clamp(fleeDiff, -1.8 * dt, 1.8 * dt)
        : (C.v < 0 || C.holdYaw ? C.yaw * (C.v < 0 ? 1 : 0.45) : C.yaw + C.v / 2.15 * Math.tan(clamp(C.steer, -0.7, 0.7)) * dt);
      const spd = C.phase === 'flee' && Math.abs(fleeDiff) > 1.05 ? Math.min(Math.max(C.v, 0), 0.9) : C.v;
      const nx = C.x + Math.sin(yaw2) * spd * dt, nz = C.z + Math.cos(yaw2) * spd * dt;
      if (keiBlocked(C, nx, nz, yaw2)) {
        C.v *= 0.15; C.blockT += dt;
        const snap = leadJam || C.phase === 'flee' ? 0.9 : 0.32;
        const wp = C.phase === 'flee' ? keiFleeAim(C) : keiAim(C);
        const dir = Math.sign(wp[0] - C.x) || 1, sx = C.x + dir * (leadJam ? 0.55 : 0.4);
        let moved = false;
        if (!keiBlocked(C, sx, C.z, C.phase === 'flee' ? yaw2 : 0)) { C.x = sx; if (C.phase !== 'flee') C.yaw *= 0.35; moved = true; }
        else {
          for (let i = 0; i < ABATIS.length; i++) {
            const R = ABATIS[i];
            if (Math.abs(C.z - R.z) > 5.6) continue;
            const gx = C.phase === 'flee' ? (C.fleeGap != null ? C.fleeGap : R.gaps[0]) : C.gaps[i];
            if (Math.abs(C.x - gx) < GAP_HW + 1.4) { C.x += clamp(gx - C.x, -snap, snap); if (C.phase !== 'flee') C.yaw *= 0.25; moved = true; break; }
          }
        }
        if (moved) C.blockT *= 0.5;
        if (C.phase !== 'flee' && C.blockT > 1.5 && keiNearPb(C, 9)) keiDrop(C, 'stuck');
        else if (C.blockT > 2.4 && keiBeside(C) && C.phase !== 'flee') keiDrop(C);
      } else { C.x = nx; C.z = nz; C.yaw = yaw2; C.blockT = 0; }
    }
    if (C.dropped) continue;
    if (C.exitReq && Math.abs(C.v) < 0.35) keiExitPlayer(C, false);
    C.y = groundH(C.x, C.z);
    const nose = keiW(C, 0, 1.25), tail = keiW(C, 0, -1.25);
    const pitch = -Math.atan2(groundH(nose[0], nose[1]) - groundH(tail[0], tail[1]), 2.5);
    C.g.position.set(C.x, C.y + (Math.abs(C.v) > 0.3 ? Math.sin(time * 18) * 0.006 : 0), C.z);
    C.g.rotation.set(pitch, C.yaw, 0);
    for (let i = 0; i < 4; i++) { const w = C.wheels[i]; w.children[0].rotation.x = w.children[1].rotation.x = (w.spin = (w.spin || 0) + C.v * dt / 0.28); if (i < 2) w.rotation.y = C.steer; }
    if (C.wheelM) C.wheelM.rotation.z = -C.steer * 2.2;
    keiPut(C);
  }
}

// ---- 浜：やり直し・本陣の娘を殿の舟へ・殿の足元 ----
function beachReset() {
  if (BEACH.dirty) { builtStage = null; loadStage('beach'); }
  BEACH.dirty = true; BEACH.king = null; BEACH.gboat = null; BEACH.won = false; BEACH.waveT = 0;
  beachKingBoats();
  const K = BEACH.king, [wx, wz] = boatWorld(K, KING_SEAT[0], KING_SEAT[1]);
  player.pos.set(wx, K.floor.y, wz); player.yaw = Math.PI; player.pitch = -0.04;
  hq.x0 = K.x - 0.95; hq.x1 = K.x + 0.95; hq.z0 = K.z - 2.7; hq.z1 = K.z - 0.1; hq.sx = K.x + 0.5; hq.sz = K.z + 0.4;
}
function beachSeatStaff() {
  const K = BEACH.king, G = BEACH.gboat;
  const staff = [sec.e, sec2.e, ojou.e, fluter.e, ...medics.blue.map(m => m.e), ...aides.map(A => A.e), ...runners.map(R => R.e)];
  if (K && !K.beached) for (const e of staff) if (e && isUp(e) && !e.boat) { beachStaffSeat(e); if (!e.seated) { const [wx, wz] = boatWorld(K, rand(-0.5, 0.5), rand(1, 3.5)); e.s.position.set(wx, K.floor.y, wz); e.boat = K; K.crew.push(e); } }
  if (G && !G.beached) for (const e of GUARD.list || []) if (e && isUp(e) && !e.boat) { const free = G.seats.findIndex(x => !x); if (free >= 0) boardBoat(e, G, free); }
}
function beachPlayerClamp() {
  const P = player.pos;
  for (const B of BEACH.boats) {
    if (!inBoat(B, P.x, P.z, 0.6) || P.y > B.floor.y + 1.2) continue;
    if (B.beached && boatLocal(B, P.x, P.z)[1] > BOAT_L / 2 - 1.6) return;   // 浜に着いた舟：舳先から降りられる
    const [lx, lz] = boatLocal(B, P.x, P.z), [wx, wz] = boatWorld(B, clamp(lx, -BOAT_W / 2 + 0.3, BOAT_W / 2 - 0.3), clamp(lz, -BOAT_L / 2 + 0.6, BOAT_L / 2 - (B.beached ? 0.3 : 1.2)));
    P.x = wx; P.z = wz; return;
  }
  if (P.z < -1.2) P.z = -1.2;   // 海へは入らない
  P.x = clamp(P.x, -BH.XW + 0.5, BH.XW - 0.5); P.z = Math.min(P.z, 90);
}
function carReset() {
  const [x, z, yaw] = CAR.home;
  Object.assign(CAR, { x, z, yaw, v: 0, steer: 0, tgt: null, fwdHold: false, riding: false, dead: false, deadT: 0, said: false, takeT: 0, rear: [], taker: null, exitReq: false, driver: null });
  if (CAR.marker) CAR.marker.visible = false;
  CAR.g.position.set(x, 0, z); CAR.g.rotation.y = yaw;
  carSpawnDriver();
}
// ====================================================================
//  v8：毒煙玉（城の戦い）。橙組の煙玉役（数人）が、守りに籠もる味方（城内・櫓の上）へ投げ込む
//  ・灰緑の煙が約10秒とどまる。中にいると体力が少しずつ減る（外傷なし）。娘は煙から逃げる
//  ・城内では、近くの襖が開いているほど早く晴れる
// ====================================================================
const SMOKE = { clouds: [], balls: [], tex: null, mat: null };
function smokeTex() {
  if (SMOKE.tex) return SMOKE.tex;
  SMOKE.tex = canvasTex(64, 64, g => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 31); r.addColorStop(0, 'rgba(170,186,150,0.95)'); r.addColorStop(0.55, 'rgba(150,166,132,0.55)'); r.addColorStop(1, 'rgba(140,150,125,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  return SMOKE.tex;
}
function smokeReset() { for (const c of SMOKE.clouds) for (const s of c.spr) scene.remove(s); for (const b of SMOKE.balls) scene.remove(b.m); SMOKE.clouds = []; SMOKE.balls = []; }
function smokeThrow(e, x, z, y) {
  const p = e.s.position, from = new V3(p.x, e.baseY + 1.4, p.z), to = new V3(x, y, z);
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshLambertMaterial({ color: 0x4d5a3c })); m.position.copy(from); scene.add(m);
  const T = clamp(from.distanceTo(to) / 11, 0.5, 1.3);
  SMOKE.balls.push({ m, from, to, T, t: 0, h: 1.2 + from.distanceTo(to) * 0.12 });
  Sfx.whoosh ? Sfx.whoosh(from) : Sfx.twangAt(from);
}
function smokeCloud(x, y, z) {
  const spr = [], tex = smokeTex(), indoor = CASTLE.on && inCastleBldg(x, z), mtn = MTN.on;
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xc8d4b4 }));
    s.userData = { ox: rand(-1.6, 1.6), oz: rand(-1.6, 1.6), oy: rand(0.3, 1.6), sc: rand(2.2, 3.4), ph: rand(0, 6) }; s.position.set(x, y + 1, z); scene.add(s); spr.push(s);
  }
  SMOKE.clouds.push({ x, y, z, r: indoor ? 2.6 : mtn ? 2.15 : 3.0, t: 0, life: indoor ? 11 : mtn ? 8 : 9, spr, indoor, tick: 0, said: new Set() });
  puff(new V3(x, y + 0.3, z), 0xb4c0a0, 8, 0.6, 1.6, 0.8);
  Sfx.impactGround && Sfx.impactGround(new V3(x, y, z));
}
const inSmoke = (x, z, y) => SMOKE.clouds.find(c => c.t < c.life - 0.8 && Math.hypot(x - c.x, z - c.z) < c.r && Math.abs(y - c.y) < 2.2);
function updateSmoke(dt) {
  for (let i = SMOKE.balls.length - 1; i >= 0; i--) {
    const b = SMOKE.balls[i]; b.t += dt; const k = Math.min(1, b.t / b.T);
    b.m.position.lerpVectors(b.from, b.to, k); b.m.position.y += Math.sin(k * Math.PI) * b.h;
    if (k >= 1) { scene.remove(b.m); SMOKE.balls.splice(i, 1); smokeCloud(b.to.x, b.to.y, b.to.z); }
  }
  for (let i = SMOKE.clouds.length - 1; i >= 0; i--) {
    const c = SMOKE.clouds[i];
    let rate = 1;
    if (c.indoor) { const open = CASTLE.doors.filter(d => d.open && Math.hypot(d.x - c.x, d.z - c.z) < 6).length; rate = 1 + open * 0.8; }   // 襖を開けると早く晴れる
    c.t += dt * rate;
    const fade = c.t < 1 ? c.t : c.t > c.life - 2 ? Math.max(0, (c.life - c.t) / 2) : 1, grow = Math.min(1, 0.4 + c.t * 0.6);
    for (const s of c.spr) { const u = s.userData; s.position.set(c.x + u.ox * grow + Math.sin(time * 0.4 + u.ph) * 0.3, c.y + u.oy + Math.sin(time * 0.3 + u.ph) * 0.15, c.z + u.oz * grow); s.scale.setScalar(u.sc * grow); s.material.opacity = 0.62 * fade; }
    if (c.t >= c.life) { for (const s of c.spr) { scene.remove(s); s.material.dispose(); } SMOKE.clouds.splice(i, 1); continue; }
    // 体力が少しずつ減る（娘は 2.6 秒ごとに 1、殿は毎秒 2）
    c.tick += dt;
    if (c.tick >= 1) {
      c.tick = 0;
      if (state === 'play' && Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < c.r && Math.abs(player.pos.y - c.y) < 2.2 && c.t < c.life - 0.8) { hurtPlayer(2); if (!c.said.has('P')) { c.said.add('P'); popup('毒煙！ 煙の外へ'); } }
      for (const o of enemies) {
        if (!isUp(o) || o.seated) continue; const p = o.s.position;
        if (Math.hypot(p.x - c.x, p.z - c.z) > c.r || Math.abs(o.baseY - c.y) > 2.2) continue;
        o.smokeD = (o.smokeD || 0) + 1;
        if (o.smokeD >= 3) { o.smokeD = 0; damageEnemy(o, 1, new V3(c.x, c.y, c.z), false, null, { team: 'smoke', state: 'idle', s: { position: new V3(c.x, c.y, c.z) } }); }
        if (!c.said.has(o.team) && o.team === (MTN.on ? 'orange' : (CASTLE.on ? CD() : 'blue'))) { c.said.add(o.team); yariSay(o, 'smoke_out'); }
      }
    }
  }
}
// 娘：煙の中にいれば外へ逃げる（true＝逃げている）
function smokeFlee(e, dt) {
  if (!SMOKE.clouds.length || e.seated || e.lad || e.climb || e.hiddenAmb || e.ramCrew || e.bundleBear) return false;
  const p = e.s.position, c = inSmoke(p.x, p.z, e.baseY); if (!c) { e.smokeFlee = false; return false; }
  if (e.perch) { e.perch.taken = null; e.perch = null; e.onFloor = floorAt(p.x, p.z, e.baseY); e.crouch = 0; }
  const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 0.01;
  steer(e, c.x + dx / d * (c.r + 1.5), c.z + dz / d * (c.r + 1.5), e.speed * 1.25, dt);
  e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.cover = null; e.smokeFlee = true; npcTint(e, 0);
  return true;
}
// 橙組の煙玉役：味方の籠もる所（城内・櫓の上・狭間）を見つけて投げる
function smokerBrain(e, dt) {
  if (!e.smoker || e.team !== CA() || e.lad) return false;
  const p = e.s.position;
  if (e.throwing) {
    e.throwing.t += dt; e.tgt = null; e.state = 'windup'; e.faceWant = e.face = Math.atan2(e.throwing.x - p.x, e.throwing.z - p.z);
    if (e.throwing.t >= 0.55) { const T = e.throwing; e.throwing = null; e.state = 'recover'; e.t = 0; npcTint(e, 0); smokeThrow(e, T.x, T.z, T.y); }
    else npcTint(e, e.throwing.t / 0.55 * 0.6);
    return true;
  }
  if ((e.smokeCd = (e.smokeCd || 0) - dt) > 0) return false;
  e.smokeCd = 1;
  let best = null, bs = -1;
  for (const o of enemies) {
    if (o.team !== CD() || !isUp(o) || o.seated) continue;
    if (o.perch && (o.perch.gt || (o.perch.slit && o.perch.inner)) && (CASTLE.phT || 0) < 45) continue;   // v9：中門の上はまず弓で撃ち合う（煙は後から）
    const q = o.s.position, d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 5 || d > 17) continue;
    if (inSmoke(q.x, q.z, o.baseY)) continue;
    const held = (CASTLE.on && inCastleBldg(q.x, q.z) ? 3 : 0) + (o.perch ? 2 : 0) + (o.baseY > 1 ? 1 : 0);
    if (!held) continue;
    let n = 0; for (const k of enemies) if (k.team === CD() && isUp(k) && Math.hypot(k.s.position.x - q.x, k.s.position.z - q.z) < 3) n++;
    const sc = held * 2 + n - d * 0.1; if (sc > bs) { bs = sc; best = o; }
  }
  if (!best) return false;
  const q = best.s.position;
  e.throwing = { x: q.x + rand(-0.6, 0.6), z: q.z + rand(-0.6, 0.6), y: best.baseY, t: 0 }; e.smokeCd = rand(14, 20);
  yariSay(e, 'smoke_throw');
  return true;
}

// ====================================================================
//  v8：懐刀を投げる（全ステージ）。弓兵（娘）と殿が、6〜8m の近い相手へ懐刀（刃引きの練習用）を投げる
//  ・投げた懐刀は地面に落ちる。娘は相手がいなくなると拾いに行く（遠い・なくなったら 30 秒で予備）
//  ・殿は懐刀を持っている時に右クリック／F／スマホ「投げる」。投げた後は拾うか、弓に持ち替える
// ====================================================================
const KNIFE = { fly: [], ground: [], geo: null };
function knifeMesh() {
  if (!KNIFE.geo) KNIFE.geo = { blade: new THREE.BoxGeometry(0.024, 0.012, 0.2).translate(0, 0, 0.1), hilt: new THREE.BoxGeometry(0.032, 0.03, 0.12).translate(0, 0, -0.06),
    mb: new THREE.MeshLambertMaterial({ color: 0xc9ccd2 }), mh: new THREE.MeshLambertMaterial({ color: 0x2b211b }) };
  const g = new THREE.Group(), G = KNIFE.geo; g.add(new THREE.Mesh(G.blade, G.mb), new THREE.Mesh(G.hilt, G.mh)); return g;
}
function knifeReset() { for (const k of KNIFE.fly) scene.remove(k.m); for (const k of KNIFE.ground) scene.remove(k.m); KNIFE.fly = []; KNIFE.ground = []; player.knife = true; player.knifeT = 0; }
function throwKnife(owner, team, from, to, speed = 17) {
  const m = knifeMesh(); m.position.copy(from); scene.add(m);
  const d = from.distanceTo(to), tf = d / speed, v = to.clone().sub(from).normalize().multiplyScalar(speed); v.y += 0.5 * 9.8 * tf;
  KNIFE.fly.push({ m, v, owner, team, t: 0 });
  { const o = Sfx.at(from, 30); if (o) Sfx.noiseBurst(0.12, 'bandpass', 2400, 1200, 0.25, 2, 0, o); }   // ひゅっ
}
function knifeDrop(k, p) {
  const fl = floorUnder(p.x, p.z, p.y + 0.3);
  k.m.position.set(p.x, fl + 0.02, p.z); k.m.rotation.set(0, rand(0, 6), 0);
  KNIFE.ground.push({ m: k.m, x: p.x, z: p.z, y: fl, owner: k.owner, t: 0 });
  if (k.owner && k.owner !== 'player') k.owner.knifeAt = KNIFE.ground[KNIFE.ground.length - 1];
}
function updateKnives(dt) {
  for (let i = KNIFE.fly.length - 1; i >= 0; i--) {
    const k = KNIFE.fly[i], p0 = k.m.position.clone(); k.t += dt;
    k.v.y -= 9.8 * dt; k.m.position.addScaledVector(k.v, dt);
    const p1 = k.m.position; k.m.rotation.x += dt * 22;   // くるくる回る
    // 当たり（線分 vs 縦の円柱）
    const sx = p1.x - p0.x, sz = p1.z - p0.z, sl = sx * sx + sz * sz || 1e-6;
    let hit = null, bt = 2;
    for (const e of enemies) {
      if (e.state === 'down' || e === k.owner || (k.team !== 'player' && e.team === k.team) || e.special && k.team === 'player') continue;
      const ep = e.s.position, t = clamp(((ep.x - p0.x) * sx + (ep.z - p0.z) * sz) / sl, 0, 1), cx = p0.x + sx * t, cz = p0.z + sz * t, y = p0.y + (p1.y - p0.y) * t - e.baseY;
      if (Math.hypot(cx - ep.x, cz - ep.z) < 0.34 && y > 0 && y < e.figH && t < bt) { bt = t; hit = e; }
    }
    if (!hit && k.team === 'orange' && state === 'play') { const t = clamp(((player.pos.x - p0.x) * sx + (player.pos.z - p0.z) * sz) / sl, 0, 1), y = p0.y + (p1.y - p0.y) * t - player.pos.y; if (Math.hypot(p0.x + sx * t - player.pos.x, p0.z + sz * t - player.pos.z) < 0.4 && y > 0.2 && y < 1.8) hit = 'P'; }
    if (hit) {
      if (hit === 'P') { hurtPlayer(9); Sfx.impactBody && Sfx.impactBody(player.pos.clone().setY(player.pos.y + 1.2)); }
      else { const pt = new V3(p0.x + sx * bt, p0.y + (p1.y - p0.y) * bt, p0.z + sz * bt); damageEnemy(hit, k.owner === 'player' ? 2 : 1, p0, false, { pt, thrust: true }, k.owner === 'player' ? 'player' : (k.owner && enemies.includes(k.owner) ? k.owner : { team: k.team, state: 'down' })); }
      knifeDrop(k, p1); KNIFE.fly.splice(i, 1); continue;
    }
    if ((boxes.length && hitsBox(p1, k.team)) || hitsCover(p1)) { Sfx.impactWood(p1); k.v.multiplyScalar(-0.15); }
    if (p1.y <= floorUnder(p1.x, p1.z, p1.y) + 0.02 || k.t > 3) { Sfx.impactGround && Sfx.impactGround(p1); knifeDrop(k, p1); KNIFE.fly.splice(i, 1); }
  }
  // 地面の懐刀：殿は自分の懐刀の上を通れば拾う。古いものは消える
  for (let i = KNIFE.ground.length - 1; i >= 0; i--) {
    const g = KNIFE.ground[i]; g.t += dt;
    if (g.owner === 'player' && !player.knife && Math.hypot(player.pos.x - g.x, player.pos.z - g.z) < 1.3 && Math.abs(player.pos.y - g.y) < 1.2) { player.knife = true; popup('懐刀を拾った'); Sfx.pickup ? Sfx.pickup() : 0; scene.remove(g.m); KNIFE.ground.splice(i, 1); continue; }
    if (g.t > 45) { scene.remove(g.m); KNIFE.ground.splice(i, 1); }
  }
  if (!player.knife && (player.knifeT += dt) > 40) { player.knife = true; popup('予備の懐刀を手にした'); }
}
// 殿：懐刀を投げる
function playerThrowKnife() { return false; }
function npcKnifeStart() { return false; }
function npcKnifeStep(e, dt, nx, nz) {
  e.faceWant = Math.atan2(nx, nz); npcTint(e, Math.min(1, e.t / 0.4) * 0.6);
  if (e.t < 0.4) return;
  const t = e.knifeTgt; npcTint(e, 0); e.state = e.perch ? 'hide' : 'advance'; e.hideT = 0.8; e.t = 0; e.cover = null;
  if (!t || (!t.isPlayer && !isUp(t))) return;
  const p = e.s.position, tp = tgtPos(t), to = new V3(tp.x, (t.isPlayer ? player.pos.y + 1.1 : t.baseY + t.figH * 0.6), tp.z);
  const err = 0.35 + Math.hypot(tp.x - p.x, tp.z - p.z) * 0.04; to.x += gauss() * err * 0.5; to.z += gauss() * err * 0.5; to.y += gauss() * err * 0.3;
  throwKnife(e, e.team, new V3(p.x, e.baseY + e.figH * 0.78, p.z), to);
  e.knife = false; e.knifeLostT = time; e.knifeCd = time + 6; if (Math.random() < 0.5) yariSay(e, 'knife_throw');
}
// 拾いに行く（相手が近くにいない時）：true＝拾いに歩いている
function npcKnifeFetch(e, dt) {
  if (e.knife !== false) return false;
  if (time - (e.knifeLostT || 0) > 30) { e.knife = true; e.knifeAt = null; return false; }
  const g = e.knifeAt; if (!g || !KNIFE.ground.includes(g) || e.perch || e.seated) return false;
  const p = e.s.position, d = Math.hypot(g.x - p.x, g.z - p.z);
  if (d > 14 || Math.abs(g.y - e.baseY) > 0.8) return false;
  if (e.tgt && !e.tgt.isPlayer && isUp(e.tgt) && Math.hypot(tgtPos(e.tgt).x - p.x, tgtPos(e.tgt).z - p.z) < 6) return false;
  if (d < 0.6) { e.knife = true; e.knifeAt = null; scene.remove(g.m); KNIFE.ground.splice(KNIFE.ground.indexOf(g), 1); return false; }
  steer(e, g.x, g.z, e.speed * 1.1, dt); e.state = 'advance'; e.cover = null; return true;
}

let builtStage = null, stageName = 'plains', atkMode = false, builtAtk = false;
// v9：櫃・城の「守る／攻める」。攻める：青組（殿の側）が攻め手、橙組が守り手
const MODE_STAGES = ['fort', 'castle'];
const FORT = { atk: false, hold: 0, won: false, t: 0 };
const DEF = () => CASTLE.on ? CD() : FORT.atk ? 'orange' : 'blue', ATK = () => CASTLE.on ? CA() : FORT.atk ? 'blue' : 'orange';   // 守り手・攻め手の組
let stageModes = { fort: 'def', castle: 'def' };
try { Object.assign(stageModes, JSON.parse(localStorage.getItem('onna_modes') || '{}')); } catch (e) {}
{ const mq = (location.search.match(/[?&]mode=(atk|def)/) || [])[1]; if (mq) stageModes.fort = stageModes.castle = mq; }
try { stageName = localStorage.getItem('onna_stage') || 'plains'; } catch (e) {}
// 足元の床の高さ（櫃・武者走り）。y より 0.4 以上高い床には乗らない
function floorUnder(x, z, y) {
  let g = BEACH.on ? Math.max(groundH(x, z), BH.WATER) : 0;
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
    if (L.mech && L.zStand != null) {
      const zz = atBottom ? L.zStand : (L.zTop != null ? L.zTop : zc);
      const d = Math.hypot(P.x - x, P.z - zz);
      if (d < 2.6 && d < bd) { bd = d; best = { L, up: atBottom }; }
      continue;
    }
    const zz = atBottom ? zc - L.dir * 0.6 : zc + L.dir * 0.9, d = Math.hypot(P.x - x, P.z - zz);
    if (d < bd) { bd = d; best = { L, up: atBottom }; }
  }
  return best;
}
function buildSnow() {
  SNOW.on = true; SNOW.cold = 0; SNOW.blizzard = false; SNOW.riverT = 0; SNOW.riverOpen = false; SNOW.riverSaid = false;
  SNOW.riverBarrier = null; SNOW.riverBridge = null; SNOW.debrisT = 8; SNOW.campT = 0; SNOW.campDone = false;
  SNOW.cleared = false; SNOW.won = false; SNOW.pits = []; SNOW.markers = []; SNOW.flakes = []; SNOW.shards = [];
  SNOW.supplies = 2; SNOW.npcT = 0; SNOW.spawnI = 0; SNOW.lastHurt = 0;
  SNOW.shardMat = new THREE.MeshLambertMaterial({ color: 0xe9f4ff });
  const snow = new THREE.MeshLambertMaterial({ color: 0xe5eef5 });
  const ice = new THREE.MeshLambertMaterial({ color: 0x7da8c4, transparent: true, opacity: 0.82 });
  const darkIce = new THREE.MeshLambertMaterial({ color: 0x142c42 });
  const rock = new THREE.MeshLambertMaterial({ color: 0x687987 });
  const trunk = new THREE.MeshLambertMaterial({ color: 0x514b45 });
  const branch = new THREE.MeshLambertMaterial({ color: 0xdce7ef });
  const groundGeo = new THREE.PlaneGeometry(26, 220, 18, 120); groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, 0.08 * Math.sin(z * 0.16 + x * 0.6) + 0.035 * Math.cos(z * 0.7)); }
  groundGeo.computeVertexNormals(); const floor = new THREE.Mesh(groundGeo, snow); floor.position.z = -4; stageRoot.add(floor);
  // 谷壁：左右から迫る、横幅の狭い自然の要害
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 16, 220), rock); wall.position.set(side * 15, 5.8, -4); stageRoot.add(wall);
    boxes.push({ x0: Math.min(side * 12.5, side * 17.5), x1: Math.max(side * 12.5, side * 17.5), z0: -114, z1: 106, y0: 0, y1: 16 });
    for (let i = 0; i < 18; i++) {
      const x = side * rand(9.5, 14), z = rand(-108, 100), h = rand(3, 9);
      const b = new THREE.Mesh(new THREE.ConeGeometry(rand(1.8, 4.5), h, 5), branch);
      b.position.set(x, h * 0.45, z); b.rotation.z = side * rand(-0.4, 0.4); stageRoot.add(b);
    }
  }
  // 雪をかぶった針葉樹。進路中央は空け、左右に配置
  for (let i = 0; i < 44; i++) {
    const x = (Math.random() < 0.5 ? -1 : 1) * rand(5.7, 10.8), z = rand(-100, 95), h = rand(4.5, 8.5);
    if (Math.abs(z) < 12 && Math.abs(x) < 12) continue;
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, h * 0.45, 6), trunk); t.position.y = h * 0.22; g.add(t);
    for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.25 - k * 0.045), h * 0.36, 7), branch); c.position.y = h * (0.35 + k * 0.2); g.add(c); }
    g.position.set(x, 0, z); stageRoot.add(g); colliders.push({ x, z, r: 0.45 });
  }
  // 雪で覆われたクレバス。暗い裂け目は近づくと見える。踏むと落ちて押し戻される
  for (const [x, z, w] of [[-2.8, 52, 2.4], [3.2, 28, 2.0], [-3.5, -25, 2.6], [2.7, -53, 2.2]]) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(w, 5.5), darkIce); hole.rotation.x = -Math.PI / 2; hole.position.set(x, -0.02, z); hole.visible = false; stageRoot.add(hole);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.7, 6.2), snow); cap.rotation.x = -Math.PI / 2; cap.position.set(x, 0.015, z); stageRoot.add(cap);
    SNOW.pits.push({ x, z, w, hole, cap, triggered: false, seen: false });
  }
  // 川は谷を横切る一本。暗い流れに雪の岸と流氷。左右の壁まで届き、迂回できない
  SNOW.half = 6.8;
  const rt = document.createElement('canvas'); rt.width = 512; rt.height = 256;
  const rg = rt.getContext('2d');
  rg.fillStyle = '#09141f'; rg.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 64; i++) {
    const y = (i + 0.5) / 64 * 256, a = 0.16 + (i % 5) * 0.07;
    rg.strokeStyle = 'rgba(' + (16 + (i % 4) * 8) + ',' + (38 + (i % 6) * 5) + ',' + (62 + (i % 3) * 12) + ',' + a + ')';
    rg.lineWidth = 1 + (i % 3); rg.beginPath();
    for (let x = 0; x <= 512; x += 12) {
      const yy = y + Math.sin(x * 0.045 + i * 0.7) * 2.4 + Math.sin(x * 0.012 + i) * 1.6;
      if (x === 0) rg.moveTo(x, yy); else rg.lineTo(x, yy);
    }
    rg.stroke();
  }
  rg.fillStyle = 'rgba(214,226,236,0.42)';
  for (let i = 0; i < 36; i++) { rg.beginPath(); rg.ellipse((i * 47) % 512, (i * 83) % 256, 7 + (i % 5) * 4, 1.25, 0, 0, Math.PI * 2); rg.fill(); }
  const rtex = new THREE.CanvasTexture(rt);
  rtex.wrapS = rtex.wrapT = THREE.RepeatWrapping; rtex.repeat.set(2.6, 1); rtex.colorSpace = THREE.SRGBColorSpace;
  const riverMat = new THREE.MeshLambertMaterial({ map: rtex });
  SNOW.riverMat = riverMat;
  const river = new THREE.Mesh(new THREE.PlaneGeometry(32, SNOW.half * 2), riverMat);
  river.rotation.x = -Math.PI / 2; river.position.set(0, -0.05, 0); stageRoot.add(river);
  const bankMat = new THREE.MeshLambertMaterial({ color: 0xf4f8fc });
  const floeMat = new THREE.MeshLambertMaterial({ color: 0xe7f0f7 });
  for (const side of [-1, 1]) {
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.9), floeMat);
    shelf.rotation.x = -Math.PI / 2; shelf.position.set(0, -0.02, side * (SNOW.half - 0.32)); stageRoot.add(shelf);
    for (let i = 0; i < 16; i++) {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55 + (i % 4) * 0.18, 7, 5), bankMat);
      mound.scale.set(1.6, 0.4, 0.95);
      mound.position.set(-15 + i * 2.0, 0.1, side * (SNOW.half + 0.42 + (i % 3) * 0.16));
      stageRoot.add(mound);
    }
  }
  for (const [x, z, rad] of [[-7.4, 1.4, 0.72], [5.6, -1.1, 0.95], [-4.2, -2.6, 0.55], [8.2, 2.2, 0.62], [-9.1, -0.5, 0.8], [3.6, 3.2, 0.48], [10.4, -2.3, 0.66], [-2.4, -4.1, 0.42], [6.6, 4.5, 0.38]]) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(rad, 6), floeMat);
    f.rotation.x = -Math.PI / 2; f.position.set(x, -0.012, z); stageRoot.add(f);
  }
  SNOW.riverBarrier = null;
  // ブリザードの道しるべは、あとで遺体を垂直に立てる位置
  SNOW.markerAt = [[-2.4, 40], [2.2, 14], [-1.8, -22], [2.6, -48], [0.2, -70]];
  // 出発地点の本陣（北が出口）。秘書との会話はここで
  maku(0, 96, 8, 0); maku(-4, 88, 16, Math.PI / 2); maku(4, 88, 16, Math.PI / 2);
  buildHQ(-4, 4, 80, 96, 0, 87);
  buildMedPost(2.4, 90, 'blue'); buildMedPost(4.2, -94, 'orange');
  // 終盤のかまくら
  const igloo = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), snow);
  igloo.position.set(0, 0, -77); igloo.scale.set(1.25, 1, 1.8); stageRoot.add(igloo);
  const entrance = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.12), darkIce); entrance.position.set(0, 0.55, -73.1); stageRoot.add(entrance);
  colliders.push({ x: 0, z: -77.6, r: 1.35 });
  nobori(3.4, -74, '#1f5fb8', '#f4f1e8', '営');
  for (let i = 0; i < 48; i++) {
    const flake = new THREE.Mesh(new THREE.SphereGeometry(rand(0.02, 0.06), 4, 3), snow);
    flake.position.set(rand(-11, 11), rand(1, 11), rand(-105, 100)); stageRoot.add(flake); SNOW.flakes.push(flake);
  }
}
function snowInRiver(x, z) { return Math.abs(x) < 13.2 && Math.abs(z) < (SNOW.half || 10); }
function snowOnBridge(x, z) { return SNOW.riverOpen && Math.abs(x) < 1.15 && Math.abs(z) < (SNOW.half || 10) + 0.6; }
function unlieBody(e) {
  e.lying = null;
  if (e.decal) e.decal.visible = false;
  if (e.aoMesh) e.aoMesh.visible = false;
  if (e.mat) { e.mat.transparent = false; e.mat.opacity = 1; e.mat.alphaTest = 0.42; e.mat.needsUpdate = true; }
  if (e.tilt) { e.tilt.visible = true; e.tilt.position.set(0, 0, 0); }
  if (e.bb) e.bb.visible = true;
  e.s.scale.set(1, 1, 1);
}
function standBody(e, x, z) {
  unlieBody(e);
  e.snowPost = true; e.snowUsed = true; e.snowBridge = false;
  e.s.position.set(x, 0, z); e.baseY = 0;
  e.fallYaw = 0; e.s.rotation.y = 0;
  const fr = e.girl && (e.girl.front || e.girl.side);
  if (fr) setFrame(e, fr, false);
  if (e.shadow) { e.shadow.visible = true; e.shadow.material = shadowMat; e.shadow.scale.set(0.75, 1, 0.6); e.shadow.position.set(0, 0.02, 0); }
}
function layBridgeBody(e, z, slot) {
  e.snowBridge = true; e.snowUsed = true; e.snowPost = false;
  e.s.position.set(0, e.baseY || 0, z);
  e.fallYaw = 0;
  const stretch = clamp((slot || e.figH) / Math.max(1.05, e.figH * 0.9), 1, 1.7);
  if (!e.lying && e.girl && e.girl.down) startLying(e);
  e.s.rotation.y = 0;
  e.s.scale.set(1, 1, stretch);
  if (e.decal) e.decal.visible = true;
}
function trySnowBridge() {
  if (SNOW.riverOpen) return;
  const near = bodies.filter(e => !e.snowUsed && !e.lean && Math.hypot(e.s.position.x, e.s.position.z) < 26);
  if (near.length < 4) {
    if (!SNOW.bridgeSaid || time > SNOW.bridgeSaid) { SNOW.bridgeSaid = time + 5; popup('橋にする遺体が足りない。近くで倒して、縦に並べろ'); }
    return;
  }
  SNOW.riverOpen = true;
  const use = near.slice(0, Math.min(12, near.length));
  const span = (SNOW.half || 10) * 2;
  const step = span / use.length;
  use.forEach((e, i) => layBridgeBody(e, -SNOW.half + (i + 0.5) * step, step));
  showBanner('遺体の橋', '近くの遺体を頭から足へ縦に並べた。その上なら冷えない');
}
function raiseBlizzardPosts() {
  if (!SNOW.markerAt) return;
  const spareRiver = !SNOW.riverOpen;
  const free = bodies.filter(e => !e.snowUsed && (spareRiver ? Math.abs(e.s.position.z) > (SNOW.half || 10) + 12 : true));
  let n = 0, placed = 0;
  SNOW.postsUp = SNOW.postsUp || [];
  SNOW.markerAt.forEach((at, i) => {
    if (SNOW.postsUp[i]) { placed++; return; }
    const e = free[n]; if (!e) return;
    n++; standBody(e, at[0], at[1]); SNOW.postsUp[i] = true; placed++;
  });
  if (!SNOW.blizSaid) { SNOW.blizSaid = true; showBanner('ブリザード', '垂直に立てた遺体を道しるべに、北へ進め'); }
  SNOW.postsDone = placed >= SNOW.markerAt.length;
}
function updateSnow(dt) {
  if (!SNOW.on || state !== 'play') return;
  const px = player.pos.x, pz = player.pos.z;
  const wet = snowInRiver(px, pz) && !snowOnBridge(px, pz);
  if (wet) {
    SNOW.cold += dt * 9;
    player.hp -= dt * (4.2 + Math.min(5, SNOW.cold * 0.05));
    if (player.hp <= 0) player.deathCold = true;
    SNOW.lastHurt += dt;
    if (SNOW.lastHurt > 2.4) { SNOW.lastHurt = 0; popup('橋の無い川だ。冷気で体力が削られる'); }
  } else SNOW.cold = Math.max(0, SNOW.cold - dt * 1.6);
  for (const e of enemies) {
    if (e.state === 'down' || e.state === 'seppuku') continue;
    const q = e.s.position;
    if (snowInRiver(q.x, q.z) && !snowOnBridge(q.x, q.z)) {
      e.hp -= dt * 3;
      if (e.hp <= 0) { e.frozen = true; killEnemy(e, false, player.pos); }
    }
  }
  const nearRiver = !SNOW.riverOpen && Math.abs(px) < 12.6 && Math.abs(pz) < (SNOW.half || 10) + 3;
  if (nearRiver) { SNOW.riverT += dt; if (SNOW.riverT > 1.2) { SNOW.riverT = 0; trySnowBridge(); } }
  else SNOW.riverT = 0;
  if (!SNOW.riverHint && Math.abs(px) < 12 && Math.abs(Math.abs(pz) - (SNOW.half || 10)) < 16) {
    SNOW.riverHint = true;
    showBanner('一本の川', '谷を暗い流れが塞いでいる。雪の岸と流氷。冷えるのはこの川だけ。遺体を縦に並べて渡れ');
  }
  for (const pit of SNOW.pits) {
    const see = (x, z) => { const dx = (x - pit.x) / (pit.w * 0.42), dz = (z - pit.z) / 2.15; return dx * dx + dz * dz; };
    if (!pit.seen && see(px, pz) < 3.6) { pit.seen = true; pit.hole.visible = true; pit.cap.visible = false; }
    if (!pit.triggered && see(px, pz) < 1) {
      pit.triggered = true; pit.hole.visible = true; pit.cap.visible = false;
      player.hp -= 26; player.hurtT = 1.3; player.shake = 0.7;
      const ang = Math.atan2(px - pit.x, pz - pit.z);
      player.pos.x = clamp(player.pos.x + Math.sin(ang) * 2.6, -8.5, 8.5);
      player.pos.z += Math.cos(ang) * 3.4;
      spillBlood(player.pos.x, 0, player.pos.z, 0.45); popup('雪に隠れたクレバス！');
    }
    for (const e of enemies) {
      if (e.state === 'down' || e.state === 'seppuku' || e.baseY > 0.4) continue;
      const q = e.s.position;
      if (!pit.seen && see(q.x, q.z) < 3.2) { pit.seen = true; pit.hole.visible = true; pit.cap.visible = false; }
      if (see(q.x, q.z) < 1 && (e.pitCd || 0) < time) {
        e.pitCd = time + 2.4; e.hp -= 22; e.hurtT = 0.4;
        const ang = Math.atan2(q.x - pit.x, q.z - pit.z);
        q.x = clamp(q.x + Math.sin(ang) * 2.4, -8.5, 8.5); q.z += Math.cos(ang) * 2.8;
        spillBlood(q.x, e.baseY, q.z, 0.4);
        if (e.hp <= 0) killEnemy(e, false, new V3(pit.x, 0, pit.z));
      }
    }
  }
  SNOW.debrisT -= dt;
  if (SNOW.debrisT <= 0) {
    SNOW.debrisT = rand(8, 14);
    const x = rand(-5.2, 5.2), z = player.pos.z - rand(2.5, 8);
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.75, 4), SNOW.shardMat);
    shard.position.set(x, 8, z); shard.rotation.z = Math.PI / 2; stageRoot.add(shard);
    SNOW.shards.push({ m: shard, hit: false });
  }
  for (let i = SNOW.shards.length - 1; i >= 0; i--) {
    const s = SNOW.shards[i]; s.m.position.y -= 16 * dt;
    if (!s.hit && s.m.position.y < 1.35 && Math.hypot(player.pos.x - s.m.position.x, player.pos.z - s.m.position.z) < 0.75) {
      s.hit = true; player.hp -= 8; player.hurtT = 0.8;
      puff(player.pos.clone().setY(1), 0xb10f25, 8, 0.16, 1.7, 0.35); popup('針状の木片が刺さった！');
    }
    if (s.m.position.y <= 0.15) { stageRoot.remove(s.m); s.m.geometry.dispose(); SNOW.shards.splice(i, 1); }
  }
  for (const f of SNOW.flakes) {
    f.position.y -= dt * (SNOW.blizzard ? 7 : 1.6);
    f.position.z -= dt * (SNOW.blizzard ? 5 : 0.4);
    if (f.position.y < 0.15) { f.position.y = rand(7, 11); f.position.x = rand(-11, 11); }
    if (f.position.z < player.pos.z - 28) f.position.z = player.pos.z + rand(8, 24);
  }
  if (!SNOW.blizzard && player.pos.z < 24 && wave.n >= 2) {
    SNOW.blizzard = true; scene.fog.near = 4; scene.fog.far = 28;
  }
  if (SNOW.blizzard && !SNOW.postsDone) raiseBlizzardPosts();
  if (SNOW.riverMat && SNOW.riverMat.map) SNOW.riverMat.map.offset.x = (SNOW.riverMat.map.offset.x + dt * 0.055) % 1;
  const fight = enemies.some(e => e.team === 'orange' && e.state !== 'down' && e.state !== 'seppuku' && Math.hypot(e.s.position.x - px, e.s.position.z - pz) < 20);
  if (player.pos.z < -70 && !fight) SNOW.quiet = (SNOW.quiet || 0) + dt; else SNOW.quiet = 0;
  if (!SNOW.fed && SNOW.quiet > 8) {
    SNOW.fed = true; SNOW.campDone = true;
    player.hp = Math.min(CFG.maxHp, player.hp + 16);
    for (const e of enemies) if (e.team === 'blue' && e.state !== 'down' && e.state !== 'seppuku') e.hp = Math.min(e.hpMax, e.hp + 16);
    showBanner('かまくら', '戦闘が無い。おにぎりで味方の体力が少し戻った');
  }
  if (player.hp <= 0) { player.hp = 0; gameOver(false); return; }
  if (!SNOW.won && SNOW.campDone && (SNOW.cleared || wave.n >= 3) && player.pos.z < -98) {
    const foes = enemies.some(e => e.team === 'orange' && e.state !== 'down' && !e.special);
    if (!foes && wave.toSpawn <= 0) { SNOW.won = true; gameOver(true); }
  }
}

// ====================================================================
//  山城（高天神にならう天然の要害）。写真は使わず、石段・土塁・木の本丸をその場で組む。
//  大手道と搦手道は土の坂。階段の下に麓は無く、埋まっている。道の外の急斜面は壁。
//  守りは西峰と東峰を行き来できる。門の次が二の丸（門は最初から開き、落とし穴と四方の矢）、その次が本丸。
// ====================================================================
const MTN = { on: false, phase: 0, gates: [], pits: [], traps: [], needles: [], doors: [], stones: [], posts: [[], [], []], hold: [], garrison: false, slowT: 0, volley: false, won: false, spawnI: 0, bar: null, entered: false };
function mtnRegion(x, z, y) {
  if (y > 11.2 && z < -6 && Math.abs(x) < 8.2) return 'hon';
  if (y > 8.2 && z < 8 && Math.abs(x) < 8.2) return 'nino';
  if (y > 5) return 'peak';
  return 'foot';
}
function buildMountain() {
  if (MTN.stones) for (const s of MTN.stones) if (s.m) scene.remove(s.m);
  MTN.on = true; MTN.phase = 0; MTN.gates = []; MTN.pits = []; MTN.traps = []; MTN.needles = []; MTN.doors = []; MTN.stones = [];
  MTN.garrison = false; MTN.slowT = 0; MTN.volley = false; MTN.won = false; MTN.spawnI = 0; MTN.bar = null; MTN.entered = false; MTN.cleared = false; MTN.balT = 3; MTN.rams = []; MTN.sidePosts = { west: [], east: [] };
  MTN.ramHits = 0; MTN.poisonThrows = 0; MTN.shotHits = 0; MTN.meleeHits = 0; MTN.noFill = false; MTN.bundleSaid = false; MTN.fillT = 1.2; MTN.roster = null;
  MTN.slotN = { west: { bow: 0, mob: 0 }, east: { bow: 0, mob: 0 } };
  MTN.ramGo = { west: false, east: false }; MTN.fightT = 0; MTN.reliefT = 0; MTN.approach0 = { west: 0, east: 0 }; MTN.extraI = 0; MTN.allyShots = 0;
  const earth = new THREE.MeshLambertMaterial({ color: 0x6e7358 });
  const earthD = new THREE.MeshLambertMaterial({ color: 0x5a5344 });
  const stone = new THREE.MeshLambertMaterial({ color: 0x8d8980 });
  const stoneD = new THREE.MeshLambertMaterial({ color: 0x6e6a62 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a3424 });
  const woodD = new THREE.MeshLambertMaterial({ color: 0x2c2118 });
  const plaster = new THREE.MeshLambertMaterial({ color: 0xe6e0d2 });
  const rust = new THREE.MeshLambertMaterial({ color: 0x6a3a24 });
  const moss = new THREE.MeshLambertMaterial({ color: 0x3d5a32 });
  const floorM = new THREE.MeshLambertMaterial({ color: 0x8a7356 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181c });
  const wall = (x0, x1, y0, y1, z0, z1, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, x1 - x0), Math.max(0.05, y1 - y0), Math.max(0.05, z1 - z0)), mat || earth);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); stageRoot.add(m);
    const b = { x0, x1, y0, y1, z0, z1, mesh: m }; boxes.push(b); return b;
  };
  const deck = (x0, x1, z0, z1, y, mat, opt) => {
    floors.push(Object.assign({ x0, x1, z0, z1, y }, opt || {}));
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.16, z1 - z0), mat || stone);
    m.position.set((x0 + x1) / 2, y - 0.08, (z0 + z1) / 2); stageRoot.add(m);
  };
  const stair = (x0, x1, z0, z1, y0, y1, slide) => {
    const n = Math.max(4, Math.ceil(Math.abs(y1 - y0) / 0.3));
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const za = z0 + (z1 - z0) * a, zb = z0 + (z1 - z0) * b, y = y0 + (y1 - y0) * b;
      const zLo = Math.min(za, zb) - 0.05, zHi = Math.max(za, zb) + 0.05;
      floors.push({ x0, x1, z0: zLo, z1: zHi, y, slide: !!slide });
      const h = Math.max(0.16, (y1 - y0) / n);
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, Math.abs(zb - za) + 0.02), i % 2 ? stone : stoneD);
      m.position.set((x0 + x1) / 2, y - h / 2, (za + zb) / 2); stageRoot.add(m);
    }
  };
  // 麓と本陣
  deck(-16, 16, 68, 96, 0, earth);
  maku(0, 90, 8, 0); maku(-4, 82, 14, Math.PI / 2); maku(4, 82, 14, Math.PI / 2);
  buildHQ(-4, 4, 74, 88, 0, 80);
  buildMedPost(3.2, 84, 'blue');
  buildMedPost(4.0, -24.6, 'orange', 12.8);   // 本丸の奥。橙組の救護班（外科医2・看護師2）
  nobori(5.2, 76, '#1f5fb8', '#f4f1e8', '麓');
  // 急斜面。道と足場の外は登れない。山の中身は矢を止めない
  wall(-26, -4.7, 0, 8.2, 32.2, 70, earthD).noShot = true;
  wall(4.05, 8.15, 0, 7.6, 32.2, 70, earth).noShot = true;
  wall(15.9, 28, 0, 8.2, 32.2, 70, earthD).noShot = true;
  wall(-20, -7.6, 0, 11.2, -8, 8, earthD);
  wall(7.6, 22, 0, 11.2, -8, 8, earthD);
  wall(-18, -7.8, 0, 14.5, -34, -8, earthD);
  wall(7.8, 20, 0, 14.5, -34, -8, earthD);
  wall(-18, 18, 0, 16, -36, -28.3, earth);
  // 大手道・搦手道。石段も脇も同じ高さの土。下は麓まで埋まっていて、落ちない
  stair(-1.45, 1.45, 66, 32.4, 0, 6.4, false);
  stair(10.55, 13.45, 66, 32.4, 0, 6.4, false);
  const slope = (x0, x1, sx0, sx1) => {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const b = (i + 1) / n, a = i / n;
      const za = 66 + (32.4 - 66) * a, zb = 66 + (32.4 - 66) * b;
      const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      const y = 6.4 * b;
      const top = Math.max(0.2, y - 0.08);
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, top, z1 - z0 + 0.06), i % 2 ? earth : earthD);
      m.position.set((x0 + x1) / 2, top / 2, (z0 + z1) / 2); stageRoot.add(m);
      floors.push({ x0, x1, z0: z0 - 0.04, z1: z1 + 0.04, y });
      for (const [a0, a1] of [[x0, sx0], [sx1, x1]]) {
        if (a1 - a0 < 0.15) continue;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(a1 - a0, 0.14, z1 - z0 + 0.06), earth);
        cap.position.set((a0 + a1) / 2, y - 0.07, (z0 + z1) / 2); stageRoot.add(cap);
      }
    }
  };
  slope(-4.65, 4.02, -1.45, 1.45);
  slope(8.18, 15.85, 10.55, 13.45);
  // 階段の横の足場。登っている横から矢とつぶてが来る。道とは床がつながる
  const zy = z => 6.4 * (66 - z) / 33.6;
  MTN.sidePosts = { west: [], east: [] };
  for (const z of [52, 42, 36]) {
    const y = zy(z);
    deck(-4.35, -1.3, z - 1.2, z + 1.2, y, stone);
    deck(1.3, 3.7, z - 1.2, z + 1.2, y, stone);
    deck(8.5, 10.7, z - 1.2, z + 1.2, y, stone);
    deck(13.3, 15.5, z - 1.2, z + 1.2, y, stone);
  }
  // 西峰と東峰、その間の稜線（守りはここを自由に行き来する）
  deck(-16, -1.55, 8, 31.2, 6.4, earth);
  deck(-1.45, 1.45, 8, 33, 6.4, earth);
  deck(8, 13.55, 8, 33, 6.4, earth);
  deck(13.45, 20, 8, 31.2, 6.4, earth);
  deck(-2, 14, 12, 17.2, 6.4, earth);
  // 土塁
  wall(-16, -1.7, 6.4, 7.7, 18, 19.1, earthD);
  wall(1.7, 8, 6.4, 7.7, 18, 19.1, earthD);
  wall(14, 20, 6.4, 7.7, 18, 19.1, earthD);
  wall(-16, -12, 6.4, 8.4, 8, 30, earth);
  wall(18, 20.4, 6.4, 8.4, 8, 30, earth);
  const gate = (id, x0, x1, z0, z1, y) => {
    const leaves = [], bs = [];
    const mid = (x0 + x1) / 2;
    [[x0, mid], [mid, x1]].forEach(([a, b]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, b - a - 0.06), 2.35, 0.16), woodD);
      m.position.set((a + b) / 2, y + 1.2, (z0 + z1) / 2); stageRoot.add(m); leaves.push(m);
      const box = { x0: a + 0.02, x1: b - 0.02, y0: y, y1: y + 2.5, z0, z1 }; boxes.push(box); bs.push(box);
    });
    MTN.gates.push({ id, hp: 24, open: false, meshes: leaves, boxes: bs, y, x0, x1, z0, z1 });
  };
  gate('west', -1.35, 1.35, 31.15, 31.95, 6.4);
  gate('east', 10.65, 13.35, 31.15, 31.95, 6.4);
  // 二の丸へ上がる石段。床の下には潜らせない。最上段が二の丸の縁と同じ高さでつながる
  stair(-1.4, 1.4, 8.0, 3.15, 6.4, 9.6, false);
  const stairDirt = (x0, x1, z0, z1, y0, y1) => {
    const n = Math.max(4, Math.ceil(Math.abs(y1 - y0) / 0.3));
    for (let i = 0; i < n; i++) {
      const b = (i + 1) / n;
      const za = z0 + (z1 - z0) * (i / n), zb = z0 + (z1 - z0) * b, y = y0 + (y1 - y0) * b;
      const zLo = Math.min(za, zb) - 0.06, zHi = Math.max(za, zb) + 0.06;
      floors.push({ x0, x1, z0: zLo, z1: zHi, y });
      const top = Math.max(0.2, y - 0.06);
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, x1 - x0), top, zHi - zLo), i % 2 ? earth : earthD);
      m.position.set((x0 + x1) / 2, top / 2, (zLo + zHi) / 2); stageRoot.add(m);
    }
  };
  const stepRail = (x, z0, z1, y0, y1) => {
    const n = Math.max(4, Math.ceil(Math.abs(y1 - y0) / 0.3));
    for (let i = 0; i < n; i++) {
      const b = (i + 1) / n;
      const za = z0 + (z1 - z0) * (i / n), zb = z0 + (z1 - z0) * b, y = y0 + (y1 - y0) * b;
      const zLo = Math.min(za, zb), zHi = Math.max(za, zb);
      boxes.push({ x0: x - 0.1, x1: x + 0.1, y0: y, y1: y + 1.05, z0: zLo, z1: zHi });
      if (i % 2 === 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), woodD);
        post.position.set(x, y + 0.48, (zLo + zHi) / 2); stageRoot.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Math.max(0.12, zHi - zLo)), wood);
      bar.position.set(x, y + 0.72, (zLo + zHi) / 2); stageRoot.add(bar);
    }
  };
  stairDirt(-7.05, -1.32, 8.05, 3.25, 6.4, 9.6);
  stairDirt(1.32, 7.05, 8.05, 3.25, 6.4, 9.6);
  stepRail(-6.95, 8.05, 3.25, 6.4, 9.6);
  stepRail(6.95, 8.05, 3.25, 6.4, 9.6);
  deck(-8, -1.5, 8, 12.2, 6.4, earth);   // 石段の前は土。穴に落ちてから登らない
  deck(1.5, 8, 8, 12.2, 6.4, earth);
  deck(-7.2, 7.2, -4.2, 3.45, 9.6, stone);
  wall(-7.4, -6.6, 9.6, 11.4, -4.05, 3.55, earthD);
  wall(6.6, 7.4, 9.6, 11.4, -4.05, 3.55, earthD);
  wall(-7.2, -1.75, 9.6, 11.2, 3.18, 3.55, earth);
  wall(1.75, 7.2, 9.6, 11.2, 3.18, 3.55, earth);
  const fence = (x0, x1, z0, z1, y) => {
    boxes.push({ x0, x1, y0: y, y1: y + 1.05, z0, z1 });
    const dx = x1 - x0, dz = z1 - z0, alongX = dx >= dz;
    const len = Math.max(dx, dz), n = Math.max(2, Math.ceil(len / 1.5));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), woodD);
      post.position.set(x0 + dx * t, y + 0.52, z0 + dz * t); stageRoot.add(post);
    }
    for (const rh of [0.42, 0.82]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? Math.max(0.2, dx) : 0.08, 0.07, alongX ? 0.08 : Math.max(0.2, dz)), wood);
      m.position.set((x0 + x1) / 2, y + rh, (z0 + z1) / 2); stageRoot.add(m);
    }
  };
  // 二の丸の縁。床の内側で押し返す。南北は石段の口だけ空ける
  fence(-7.12, -6.88, -4.05, 3.48, 9.6);
  fence(6.88, 7.12, -4.05, 3.48, 9.6);
  fence(-7.05, -1.85, 3.22, 3.48, 9.6);
  fence(1.85, 7.05, 3.22, 3.48, 9.6);
  fence(-7.05, -1.55, -4.18, -3.92, 9.6);
  fence(1.55, 7.05, -4.18, -3.92, 9.6);
  for (const [x, z] of [[-3.2, 1.8], [3.4, 0.6], [0.2, -1.4]]) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), dark);
    hole.rotation.x = -Math.PI / 2; hole.position.set(x, 9.62, z); stageRoot.add(hole);
    MTN.pits.push({ x, z, on: true });
  }
  // 本丸への石段。最上段は本丸の床と同じ高さ。床の下には潜らせない
  stair(-1.4, 1.4, -3.35, -10.9, 9.6, 12.8, false);
  stairDirt(-1.9, -1.32, -3.55, -10.55, 9.6, 12.8);
  stairDirt(1.32, 1.9, -3.55, -10.55, 9.6, 12.8);
  stepRail(-1.75, -3.55, -10.55, 9.6, 12.8);
  stepRail(1.75, -3.55, -10.55, 9.6, 12.8);
  MTN.bar = wall(-1.55, 1.55, 9.6, 12.2, -4.15, -3.45, woodD);
  MTN.bar.hp = 8; MTN.bar.hon = true;
  // 西峰と東峰をつなぐ峰道。土塁の手前（南側）を渡って援軍が移る
  floors.push({ x0: -15, x1: 18, z0: 13.45, z1: 16.15, y: 6.4 });
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(33, 0.06, 2.15), stone);
  ridge.position.set(1.5, 6.46, 14.8); stageRoot.add(ridge);
  const mine = nobori(0.4, 14.2, '#5c3318', '#f4efe4', '峰道');
  mine.position.y = 6.4;
  // 本丸：暗い木の間。梁、柱、狭間。床は板
  deck(-7.4, 7.4, -28, -10.6, 12.8, floorM);
  wall(-7.6, -6.9, 12.8, 16.2, -28, -10.6, wood);
  wall(6.9, 7.6, 12.8, 16.2, -28, -10.6, wood);
  wall(-7.4, 7.4, 12.8, 16.2, -28.2, -27.4, wood);
  // 南の壁は入口の両脇。狭間（横に長い開口）は壁を上下に分けて空ける
  wall(-7.4, -1.7, 12.8, 16.2, -11.2, -10.6, wood);
  wall(1.7, 7.4, 12.8, 16.2, -11.2, -10.6, wood);
  for (const x of [-4.2, 4.2]) {
    wall(x - 0.9, x + 0.9, 12.8, 13.7, -27.55, -27.2, plaster);
    wall(x - 0.9, x + 0.9, 14.7, 16.1, -27.55, -27.2, plaster);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), new THREE.MeshBasicMaterial({ color: 0xf4f7fb }));
    slit.position.set(x, 14.15, -27.35); stageRoot.add(slit);
  }
  for (const x of [-3.6, 0, 3.6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.38, 3.1, 0.38), woodD);
    p.position.set(x, 14.35, -18); stageRoot.add(p);
    boxes.push({ x0: x - 0.22, x1: x + 0.22, y0: 12.8, y1: 16, z0: -18.22, z1: -17.78 });
  }
  for (const z of [-14, -22]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.28, 0.34), woodD);
    beam.position.set(0, 15.7, z); stageRoot.add(beam);
  }
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 18), woodD);
  beam2.position.set(0, 15.85, -19); stageRoot.add(beam2);
  // トラバサミ
  MTN.stoneGeo = MTN.stoneGeo || new THREE.SphereGeometry(0.07, 6, 5);
  MTN.stoneMat = MTN.stoneMat || new THREE.MeshLambertMaterial({ color: 0x6d675e });
  for (const [x, z] of [[-2.2, -16], [2.4, -21], [0.3, -24]]) {
    const g = new THREE.Group();
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8), rust); g.add(pan);
    const jaws = [];
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 4, 8, Math.PI), rust);
      j.rotation.y = s * 0.2; j.rotation.z = s * 0.9; j.position.x = s * 0.02; g.add(j); jaws.push(j);
    }
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), rust);
    chain.rotation.z = Math.PI / 2; chain.position.x = 0.4; g.add(chain);
    g.position.set(x, 12.84, z); stageRoot.add(g);
    MTN.traps.push({ x, z, y: 12.8, sprung: false, jaws, g });
  }
  // 針山の床
  for (const [x0, x1, z0, z1] of [[-6.2, -3.4, -20.5, -17.2], [3.2, 6.2, -15.2, -12.4]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.05, z1 - z0), new THREE.MeshLambertMaterial({ color: 0x2a241c }));
    m.position.set((x0 + x1) / 2, 12.84, (z0 + z1) / 2); stageRoot.add(m);
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.16, 4), rust);
      s.position.set(rand(x0 + 0.15, x1 - 0.15), 12.92, rand(z0 + 0.15, z1 - 0.15)); stageRoot.add(s);
    }
    MTN.needles.push({ x0, x1, z0, z1, bled: false });
  }
  // 開けると矢が出る扉
  for (const [x, z, yaw] of [[-5.4, -13.2, 0.4], [5.4, -19.5, -0.4]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.08), wood);
    m.position.set(x, 13.7, z); m.rotation.y = yaw; stageRoot.add(m);
    MTN.doors.push({ x, z, y: 12.8, m, fired: false, yaw });
  }
  // 木は坂の中に置かない。階段の下は土で、麓の林は要らない
  MTN.posts = [
    [[-8, 16], [-12, 13], [2, 15], [6, 14.5], [11, 15], [16, 14], [-4, 20], [15, 22]],
    [[-4, 2], [4, 2], [-4, -1], [4, -1], [0, 4]],
    [[-3, -16], [3, -18], [0, -24], [-4, -22]],
  ];
  MTN.rams = [];
  const ramLog = (side, x, z) => {
    const g = new THREE.Group();
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 2.5, 8), woodD);
    log.rotation.x = Math.PI / 2; g.add(log);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x2a2a2e }));
    cap.rotation.x = Math.PI / 2; cap.position.z = 1.15; g.add(cap);
    g.rotation.y = Math.PI;
    const y = zy(z);
    g.position.set(x, y + 0.95, z); stageRoot.add(g);
    MTN.rams.push({ id: side, g, x, z, y, swing: 0, t: 0, crew: [], hits: 0, carrying: false, struck: false });
  };
  ramLog('west', 0, 63);
  ramLog('east', 12, 63);
  const hold = [];
  for (const z of [52, 42, 36]) {
    const y = zy(z);
    hold.push([0, z, y, false, 'approach', 'west']);
    hold.push([-2.9, z, y, z === 42, 'approach', 'west']);
    hold.push([2.5, z, y, z === 52, 'approach', 'west']);
    hold.push([12, z, y, false, 'approach', 'east']);
    hold.push([9.5, z, y, z === 52, 'approach', 'east']);
    hold.push([14.4, z, y, z === 42, 'approach', 'east']);
  }
  hold.push(
    [-8, 18, 6.4, false, 'approach', 'west'], [-4, 14.5, 6.4, true, 'approach', 'west'], [2, 16, 6.4, false, 'approach', 'west'],
    [16, 18, 6.4, false, 'approach', 'east'], [11, 14.5, 6.4, true, 'approach', 'east'], [6, 16, 6.4, false, 'approach', 'east'],
    [-3.5, 2.2, 9.6, false, 'nino'], [3.6, 1.4, 9.6, false, 'nino'], [-2.2, -0.6, 9.6, true, 'nino'], [2.8, -1.2, 9.6, false, 'nino'],
    [-2.5, -17, 12.8, false, 'hon'], [3, -20, 12.8, true, 'hon'], [0, -25, 12.8, false, 'hon']
  );
  // 守りを増やす（足場の外と峰）。門は開けない
  hold.push([-11, 22, 6.4, false, 'approach', 'west'], [17, 22, 6.4, false, 'approach', 'east']);
  for (const z of [52, 42, 36]) {
    const y = zy(z);
    hold.push([-4.0, z + 0.55, y, false, 'approach', 'west']);
    hold.push([14.9, z + 0.55, y, z === 42, 'approach', 'east']);
  }
  MTN.hold = hold.filter((_, i) => i % 3 !== 2);   // 守りは三分の二。足場・峰・二の丸・本丸を少し戻す
  for (const h of MTN.hold) if (h[5]) MTN.sidePosts[h[5]].push([h[0], h[1], h[2]]);
}
function mtnOpenGate(g, why) {
  if (!g || g.open) return;
  g.open = true; g.why = why || 'ram';
  MTN.lastOpen = g.why;
  for (const b of g.boxes) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); }
  g.meshes.forEach((m, i) => { m.rotation.y += (i ? 1.15 : -1.15); m.position.x += (i ? 0.45 : -0.45); });
  showBanner(g.id === 'west' ? '大手門、落ちた' : '搦手門、落ちた', '峰の上は土塁。守りは西峰と東峰を行き来する。次は二の丸');
  if (MTN.phase < 1) MTN.phase = 1;
}
function mtnGateShot(p0, p1, a) {
  // 門を射て削れるのは殿の矢だけ。味方の流れ矢では門は落ちない（破城隊が突いて破る）
  if (!MTN.on || !a || a.team !== 'player' || a.mtnGate) return;
  for (const g of MTN.gates) {
    if (g.open) continue;
    for (const t of [0.3, 0.65, 1]) {
      const x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t, z = p0.z + (p1.z - p0.z) * t;
      if (x > g.x0 && x < g.x1 && z > g.z0 - 0.05 && z < g.z1 + 0.08 && y > g.y + 0.15 && y < g.y + 2.45) {
        a.mtnGate = true; g.hp -= 1; MTN.shotHits = (MTN.shotHits || 0) + 1;
        if (g.hp <= 0) mtnOpenGate(g, 'shot');
        else if (g.hp === 12 || g.hp === 6) popup((g.id === 'west' ? '大手門' : '搦手門') + 'が緩む');
        return;
      }
    }
  }
}
function mtnMeleeGate() {
  if (!MTN.on) return false;
  const fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  for (const g of MTN.gates) {
    if (g.open) continue;
    const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
    const dx = cx - player.pos.x, dz = cz - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.7 || Math.abs(player.pos.y - g.y) > 1.2) continue;
    if (dx * fwd.x + dz * fwd.z < 0.3) continue;
    g.hp -= 2; MTN.meleeHits = (MTN.meleeHits || 0) + 1;
    if (g.hp <= 0) mtnOpenGate(g, 'melee'); else popup('門を叩いた');
    return true;
  }
  return false;
}
function mtnHonHit(dmg, source) {
  const b = MTN.bar; if (!b || b.gone) return;
  b.hp = (b.hp == null ? 8 : b.hp) - (dmg || 1);
  if (b.hp > 0) { if (b.hp % 2 === 0) popup('本丸の扉を叩いた（残り ' + b.hp + '）'); return; }
  b.gone = true;
  const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1);
  if (b.mesh) b.mesh.visible = false;
  MTN.bar = null;
  if (MTN.phase < 2) MTN.phase = 2;
  showBanner('本丸の扉、開いた', source || '近接攻撃で扉を破った');
}
function mtnHonDoorDistance() {
  const b = MTN.bar; if (!b || b.gone) return Infinity;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  return Math.hypot(player.pos.x - cx, player.pos.z - cz);
}
function openMtnHonDoorByKing() {
  const b = MTN.bar;
  if (state !== 'play' || menuOpen || !DUAL.on || !b || b.gone) return false;
  if (mtnHonDoorDistance() > 3.15 || Math.abs(player.pos.y - b.y0) > 1.7) {
    popup('本丸の扉の前まで進め');
    return false;
  }
  mtnHonHit(Math.max(1, b.hp == null ? 8 : b.hp), '王が「開く」を押した');
  return true;
}
function updateDualHonDoorEvent(dt) {
  const b = MTN.bar;
  if (!DUAL.on || !b || b.gone || DUAL.honDoorEvent) {
    if (!b) DUAL.honEventT = 0;
    return;
  }
  const cx = (b.x0 + b.x1) / 2, faceZ = Math.max(b.z0, b.z1);
  const arrived = enemies.some(e => {
    if (e.team !== 'orange' || !isUp(e) || e.missionFront !== 'saionji' || e.special || e.wasOjou) return false;
    const p = e.s.position;
    return (e.baseY || 0) >= 8.2 &&
      Math.abs((e.baseY || 0) - b.y0) < 1.7 &&
      Math.abs(p.x - cx) < 2.25 &&
      p.z > faceZ - 0.45 && p.z < faceZ + 3.5;
  });
  if (!arrived) { DUAL.honEventT = 0; return; }
  DUAL.honEventT = (DUAL.honEventT || 0) + dt;
  if (DUAL.honEventT >= 0.8) {
    DUAL.honDoorEvent = true;
    mtnHonHit(Math.max(1, b.hp == null ? 8 : b.hp), '敵が本丸門前の到達地点に到着した');
  }
}
function mtnHonSlot(e) {
  const b = MTN.bar; if (!b) return [e.s.position.x, e.s.position.z];
  const cx = (b.x0 + b.x1) / 2, cz = Math.max(b.z0, b.z1);
  const i = (e.mtnRank != null ? e.mtnRank : e.id) + (e.kind === 'archer' ? 3 : 0);
  const col = i % 3, row = ((i / 3) | 0) % 3;
  return [cx + (col - 1) * 1.02, cz + 1.35 + row * 0.8];
}
function mtnAtkMeleeAlive() {
  const team = DUAL.on ? 'orange' : 'blue';
  for (const o of enemies) {
    if (o.team !== team || !isUp(o) || o.kind === 'archer' || o.special || o.medic || o.ramCrew || o.guard || o.saiGuard) continue;
    if (DUAL.on && o.missionFront && o.missionFront !== 'saionji') continue;
    return true;
  }
  return false;
}
function mtnBashHon(e, dt) {
  const b = MTN.bar; if (!b || e.baseY < 8.2) return false;
  if (e.kind === 'archer' && mtnAtkMeleeAlive()) return false;
  const p = e.s.position, faceZ = Math.max(b.z0, b.z1), cx = (b.x0 + b.x1) / 2;
  for (const o of enemies) {
    if (!isUp(o) || o.team === e.team || o.special || o.wasOjou) continue;
    if (Math.abs((o.baseY || 0) - e.baseY) > 1.6) continue;
    if (o.s.position.z < b.z0 + 0.2 && p.z > faceZ - 0.3) continue;
    if (Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < 2.15) return false;
  }
  const slot = mtnHonSlot(e);
  const doorD = Math.hypot(clamp(p.x, b.x0, b.x1) - p.x, faceZ - p.z);
  const atDoor = doorD < 1.75 && p.z > faceZ - 0.45 && Math.abs(e.baseY - b.y0) < 1.7;
  const d = Math.hypot(slot[0] - p.x, slot[1] - p.z);
  e.faceWant = Math.atan2(cx - p.x, (b.z0 + b.z1) / 2 - p.z);
  e.honCd = (e.honCd || 0) - dt;
  if (e.honSw > 0) {
    e.honSw -= dt; e.state = 'windup'; npcTint(e, Math.min(1, 1 - e.honSw / 0.42));
    if (e.honSw <= 0) { npcTint(e, 0); e.state = 'recover'; e.honCd = 0.7; mtnHonHit(1); }
    return true;
  }
  if (!atDoor && d > 1.2) { steer(e, slot[0], slot[1], e.speed * 1.05, dt); e.state = 'approach'; e.tgt = null; return true; }
  if (e.honCd <= 0) { e.honSw = 0.42; e.state = 'windup'; e.t = 0; }
  else e.state = 'approach';
  e.tgt = null;
  return true;
}
function mtnMeleeHon() {
  const b = MTN.bar; if (!b || (!MTN.on && !DUAL.on)) return false;
  const fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const dx = cx - player.pos.x, dz = cz - player.pos.z, d = Math.hypot(dx, dz);
  if (d > 2.1 || Math.abs(player.pos.y - b.y0) > 1.3) return false;
  if (dx * fwd.x + dz * fwd.z < 0.25) return false;
  mtnHonHit(2);
  return true;
}
function mtnThrowStone(e) {
  const t = e.tgt; if (!t) return;
  const p = e.s.position, tp = t.isPlayer ? player.pos : t.s.position;
  const ty = (t.isPlayer ? player.pos.y : t.baseY) + 1.05;
  const m = new THREE.Mesh(MTN.stoneGeo, MTN.stoneMat);
  m.position.set(p.x, e.baseY + 1.25, p.z); scene.add(m);
  const dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz) || 1, tf = d / 13;
  MTN.stones.push({ m, vx: dx / d * 13, vz: dz / d * 13, vy: (ty - m.position.y) / tf + 4.9 * tf, life: 0 });
}
function mtnArrow(from, to, dmg) {
  const d = from.distanceTo(to) || 1, tf = d / 24;
  const dir = to.clone().sub(from).normalize();
  const vel = dir.multiplyScalar(24); vel.y += 0.5 * 9.8 * tf;
  addArrow('orange', from, vel, { dmg: dmg || 7 });
}
function mtnRoute(p, tx, tz) {
  const e = MTN.who;
  const py = e && e.baseY != null ? e.baseY : floorUnder(p.x, p.z, (p.y || 0) + 0.3);
  const ty = floorUnder(tx, tz, 30);
  if (e && e.team === 'orange' && e.mtnPost && !e.mtnGo) return [e.mtnPost[0], e.mtnPost[1]];
  if (MTN.bar && tz < MTN.bar.z0 - 0.35 && p.z > MTN.bar.z1 - 0.2 && py < 12.1) {
    const b = MTN.bar;
    return [clamp(tx, b.x0 + 0.35, b.x1 - 0.35), Math.max(b.z0, b.z1) + 1.05];
  }
  // 峰道と二の丸への広い土段は、石段の中心へ吸い寄せて一列にしない
  if (e && e.team === 'blue' && p.z < 16.8 && p.z > -3.6 && Math.abs(p.x) < 17 && py > 5.2 && py < 12.3) return [tx, tz];
  // 峰から峰へは、土塁の手前の峰道（z≈14.8）を渡る
  if (e && e.team === 'orange' && e.mtnGo && Math.abs(e.mtnGo[0] - p.x) > 5 && p.z < 28 && (e.baseY || 0) > 5.5) {
    const rz = 14.8;
    if (Math.abs(p.z - rz) > 1.8) return [clamp(p.x, -14, 17), rz];
    return [clamp(e.mtnGo[0], -14, 17), rz];
  }
  const side = e && (e.mtnGo ? e.mtnGo[3] : e.mtnSide);
  // 同じ高さの土の上は、道の中心へ吸い寄せて団子にしない
  if (e && e.team === 'blue' && Math.abs(py - ty) < 1.8 && Math.hypot(tx - p.x, tz - p.z) < 18) return [tx, tz];
  // 石段の上だけ幅を揃える。二の丸の床では横に広がる（一列にしない）
  const onStair = (p.z < 66 && p.z > 32 && (Math.abs(p.x) < 2.6 || Math.abs(p.x - 12) < 2.6)) || (p.z < -2.8 && p.z > -11.2 && Math.abs(p.x) < 2.2);
  if (e && e.team === 'blue' && onStair && tz < p.z - 0.3) {
    const cx = Math.abs(p.x - 12) < Math.abs(p.x) && p.z > 20 ? 12 : 0;
    return [cx + clamp(tx - cx, -1.15, 1.15), tz];
  }
  const west = [[0, 60, 1.1], [0, 50, 3.0], [0, 42, 4.6], [0, 36, 5.7], [0, 33, 6.2], [-2, 22, 6.4], [4, 14.5, 6.4], [0, 6.6, 7.4], [0, 4.4, 8.8], [0, 2.2, 9.6], [0, -1.5, 9.6], [0, -6.2, 10.8], [0, -9.2, 12.1], [0, -16, 12.8]];
  const east = [[12, 60, 1.1], [12, 50, 3.0], [12, 42, 4.6], [12, 36, 5.7], [12, 33, 6.2], [14, 22, 6.4], [8, 14.5, 6.4], [0, 6.6, 7.4], [0, 4.4, 8.8], [0, 2.2, 9.6], [0, -1.5, 9.6], [0, -6.2, 10.8], [0, -9.2, 12.1], [0, -16, 12.8]];
  const wps = side === 'east' ? east : side === 'west' ? west : west.concat(east);
  if (Math.abs(py - ty) < 1.15 && Math.hypot(tx - p.x, tz - p.z) < 12) return [tx, tz];
  let best = null, bd = 1e9;
  for (const w of wps) {
    if (w[2] < Math.min(py, ty) - 0.7 || w[2] > Math.max(py, ty) + 1.15) continue;
    const d = Math.hypot(w[0] - p.x, w[1] - p.z) + Math.abs(w[2] - py) * 3;
    if (d < bd) { bd = d; best = w; }
  }
  if (best && Math.hypot(best[0] - p.x, best[1] - p.z) > 1.3) return [best[0], best[1]];
  return [tx, tz];
}
function mtnPlace(x, z, y, kind, team, opt) {
  const ne = spawnEnemy(x, z, kind, false, team, Object.assign({ y: y, yari: team === 'orange' ? -1 : undefined }, opt || {}));
  if (!ne) return null;
  ne.baseY = y; ne.s.position.y = y; ne.footOk = [x, z];
  return ne;
}
function mtnGiveSlot(e) {
  if (!e || e.mtnFile != null || e.ramCrew || e.bundleBear || e.special) return;
  const side = e.mtnSide === 'east' ? 'east' : 'west';
  const bag = (MTN.slotN || (MTN.slotN = { west: { bow: 0, mob: 0 }, east: { bow: 0, mob: 0 } }))[side];
  const key = e.kind === 'archer' ? 'bow' : 'mob';
  const i = bag[key]++;
  e.mtnFile = i % 2 ? 2 : 0;                         // 左右の列。真ん中は破城槌
  e.mtnRank = (i >> 1) + (key === 'bow' ? 4 : 0);    // 近接が前、弓が後ろ
}
function mtnBoot() {
  for (const h of MTN.hold) {
    const ne = mtnPlace(h[0], h[1], h[2], h[3] ? 'mob' : 'archer', 'orange', { set: { stone: !!h[3], mtnZone: h[4], mtnSide: h[5] || null, mtnPost: [h[0], h[1], h[2], h[5] || null], mtnHold: true } });
    if (ne) ne.face = Math.PI;
  }
  const lineN = 9;
  for (const side of ['west', 'east']) {
    const x0 = side === 'west' ? 0 : 12;
    const R = MTN.rams.find(r => r.id === side);
    for (let i = 0; i < lineN; i++) {
      const col = i % 3, row = (i / 3) | 0;
      const kind = i % 4 === 0 ? 'mob' : 'archer';
      const ne = mtnPlace(x0 + (col - 1) * 0.95, 70 + row * 1.15, 0, kind, 'blue', { yari: kind === 'mob' ? -1 : undefined, set: { mtnSide: side } });
      if (ne) mtnGiveSlot(ne);
    }
    for (let i = 0; i < 2; i++) {
      const lane = (i ? 0.72 : -0.72), z = 64.2 - i * 1.7, y = 6.4 * (66 - z) / 33.6;
      const ne = mtnPlace(x0 + lane, z, y, 'mob', 'blue', { yari: -1, set: { bundleBear: true, mtnSide: side, bundleLane: lane } });
      if (ne) {
        ne.hp = ne.hpMax = 8;
        const cv = bamboobundle(ne.s.position.x, z - 0.95, 0, { y, mtn: true, side, noCol: true, hp: 8 });
        ne.mtnBundle = cv; cv.bearer = ne;
      }
    }
    {
      const ne = mtnPlace(x0, 68.5, 0, 'mob', 'blue', { yari: -1, set: { smoker: true, mtnSide: side, smokeCd: rand(2.5, 5.5) } });
      if (ne) { ne.hp = ne.hpMax = 8; ne.mtnFile = 1; ne.mtnRank = 2; }
    }
    for (let i = 0; i < 2; i++) {
      const slot = mtnRamSlot(R, i), y = 6.4 * (66 - slot[1]) / 33.6;
      const ne = mtnPlace(slot[0], slot[1], y, 'mob', 'blue', { yari: -1, set: { ramCrew: true, mtnSide: side } });
      if (ne && R) { ne.hp = ne.hpMax = 14; R.crew.push(ne); }
    }
  }
  MTN.blueBoot = enemies.filter(e => e.team === 'blue' && !e.special).length;
}
function mtnLiving(team) {
  let n = 0;
  for (const e of enemies) if (e.team === team && !e.special && e.state !== 'down') n++;
  return n;
}
function mtnFillRoster() {
  // 第一波はここで敵55・味方70まで埋める。後の波は足さない
  const zy = z => 6.4 * (66 - z) / 33.6;
  const rear = [
    [-5.4, 1.6, 9.6, null, 'nino'],
    [5.4, 0.2, 9.6, null, 'nino'],
    [-1.6, -16.2, 12.8, null, 'hon'],
    [2.4, -19.4, 12.8, null, 'hon'],
  ];
  let guard = 0;
  while (mtnLiving('orange') < 55 && guard++ < 80) {
    const i = MTN.extraI = (MTN.extraI || 0) + 1;
    const arch = i % 5 !== 0;
    let x, z, y, side, zone;
    if (55 - mtnLiving('orange') <= rear.length && rear.length) {
      const r = rear.pop();
      x = r[0]; z = r[1]; y = r[2]; side = r[3]; zone = r[4];
    } else {
      let w = 0, ea = 0;
      for (const e of enemies) {
        if (e.team !== 'orange' || e.state === 'down' || e.special || e.mtnZone !== 'approach') continue;
        if (e.mtnSide === 'east') ea++; else w++;
      }
      side = ea <= w ? 'east' : 'west';
      const xs = side === 'west' ? [-3.4, -2.0, 2.0, 3.3] : [9.1, 10.4, 13.7, 15.0];
      const zs = [54, 48, 44, 40, 37, 33.6];
      x = xs[i % xs.length] + ((i % 3) - 1) * 0.18;
      z = zs[i % zs.length] + (i % 2 ? 0.24 : -0.18);
      y = zy(z); zone = 'approach';
    }
    const ne = mtnPlace(x, z, y, arch ? 'archer' : 'mob', 'orange', { set: { stone: !arch && zone === 'approach', mtnZone: zone, mtnSide: side, mtnPost: [x, z, y, side], mtnHold: true } });
    if (!ne) break;
    ne.face = Math.PI;
  }
  guard = 0; let bi = 0;
  while (mtnLiving('blue') < 70 && guard++ < 100) {
    const side = bi % 2 ? 'east' : 'west';
    const x0 = side === 'east' ? 12 : 0;
    const z = 74 + (bi % 12) * 1.05;
    const x = x0 + ((bi % 4) < 2 ? -1.05 : 1.05) + ((bi % 3) - 1) * 0.1;
    const kind = bi % 5 === 0 ? 'mob' : 'archer';
    const ne = mtnPlace(x, z, 0, kind, 'blue', { yari: kind === 'mob' ? -1 : undefined, set: { mtnSide: side } });
    if (!ne) break;
    mtnGiveSlot(ne);
    bi++;
  }
  const ap = { west: 0, east: 0 };
  for (const e of enemies) {
    if (e.team !== 'orange' || e.state === 'down' || e.special || e.mtnZone !== 'approach') continue;
    if (e.mtnSide === 'east') ap.east++; else ap.west++;
  }
  MTN.approach0 = ap;
}
function mtnRamSlot(R, i) {
  const S = [[-0.62, 0.72], [0.62, 0.72], [-0.62, -0.78], [0.62, -0.78]][i % 4];
  return [R.x + S[0], R.z + S[1]];
}
function mtnSyncBundle(e) {
  const c = e.mtnBundle;
  if (!c || c.broken || e.state === 'down') return;
  const p = e.s.position;
  c.x = p.x; c.z = p.z - 0.95; c.y = e.baseY; c.h = e.baseY + 1.55;
  if (c.mesh) c.mesh.position.set(c.x, c.y, c.z);
}
function mtnLeadBundle(side) {
  let best = null;
  for (const c of covers) if (c.mtn && !c.broken && c.side === side && (!best || c.z < best.z)) best = c;
  return best;
}
function mtnFillRam(R) {
  if (MTN.noFill) return;
  const gate = MTN.gates.find(g => g.id === R.id);
  if (!gate || gate.open) return;
  const alive = () => R.crew.filter(isUp).length;
  if (alive() >= 2) return;
  for (const e of enemies) {
    if (alive() >= 2) break;
    if (e.team !== 'blue' || !isUp(e) || e.special || e.guard || e.ramCrew || e.bundleBear || e.smoker || e.kind !== 'mob') continue;
    if (e.mtnSide && e.mtnSide !== R.id) continue;
    if (Math.hypot(e.s.position.x - R.x, e.s.position.z - R.z) > 4.2) continue;
    e.ramCrew = true; e.mtnSide = R.id; e.yari = false; if (e.spear) yariDrop(e);
    R.crew.push(e);
  }
}
function mtnRamBrain(e, dt) {
  if (!e.ramCrew) return false;
  MTN.who = e;
  const R = MTN.rams && MTN.rams.find(r => r.id === e.mtnSide);
  const gate = MTN.gates.find(g => g.id === e.mtnSide);
  if (!R || !gate || gate.open) { e.ramCrew = false; return false; }
  if (!R.crew.includes(e)) R.crew.push(e);
  const i = Math.max(0, R.crew.indexOf(e));
  const slot = mtnRamSlot(R, i), p = e.s.position, d = Math.hypot(slot[0] - p.x, slot[1] - p.z);
  if (R.carrying && d < 1.7) { p.x = slot[0]; p.z = slot[1]; e.moving = !!R.moving; }
  else if (d > 0.35) steer(e, slot[0], slot[1], e.speed * 1.15, dt);
  e.baseY = floorUnder(p.x, p.z, (e.baseY || 0) + 0.45);
  e.footOk = [p.x, p.z];
  e.tgt = null; e.faceWant = Math.PI; e.state = 'approach'; e.crouch = 0;
  return true;
}
function mtnBundleBrain(e, dt) {
  if (!e.bundleBear) return false;
  const c = e.mtnBundle;
  if (!c || c.broken) { e.bundleBear = false; e.crouch = 0; return false; }
  const gate = MTN.gates.find(g => g.id === (e.mtnSide || 'west'));
  if (!gate || gate.open) { e.bundleBear = false; e.crouch = 0; return false; }
  MTN.who = e;
  const p = e.s.position, gx = (e.mtnSide === 'east' ? 12 : 0) + (e.bundleLane || 0);
  const go = !!(MTN.ramGo && MTN.ramGo[e.mtnSide || 'west']);
  const goalZ = go ? (gate.z0 + gate.z1) / 2 + 3.6 : 54;   // 射ちながら坂を上がる。破門が始まれば門の前まで
  if (p.z > goalZ + 0.45) {
    e.crouch = 0;
    steer(e, gx, Math.max(goalZ, p.z - 4.5), e.speed * 0.92, dt);
    e.state = 'approach'; e.moving = true;
    if (!MTN.bundleSaid && p.z < 60) { MTN.bundleSaid = true; popup('竹束を押し立てて進む。門は開かない'); }
  } else {
    e.crouch = 0.72; e.state = 'hide'; e.moving = false;
  }
  e.tgt = null; e.faceWant = Math.PI;
  mtnSyncBundle(e);
  return true;
}
function mtnSmokeBrain(e, dt) {
  if (!e.smoker || e.team !== 'blue') return false;
  const p = e.s.position;
  if (e.throwing) {
    e.throwing.t += dt; e.tgt = null; e.state = 'windup'; e.faceWant = e.face = Math.atan2(e.throwing.x - p.x, e.throwing.z - p.z);
    if (e.throwing.t >= 0.55) {
      const T = e.throwing; e.throwing = null; e.state = 'recover'; e.t = 0; npcTint(e, 0);
      smokeThrow(e, T.x, T.z, T.y); MTN.poisonThrows = (MTN.poisonThrows || 0) + 1;
    } else npcTint(e, e.throwing.t / 0.55 * 0.6);
    return true;
  }
  if ((e.smokeCd = (e.smokeCd || 0) - dt) > 0) return false;
  e.smokeCd = 0.7;
  const gate = MTN.gates.find(g => g.id === (e.mtnSide || 'west'));
  if (!gate || gate.open) return false;   // 門は守りが開けない。毒は足場の守りへ
  let best = null, bs = -1;
  for (const o of enemies) {
    if (o.team !== 'orange' || !isUp(o)) continue;
    if (o.mtnSide && e.mtnSide && o.mtnSide !== e.mtnSide && o.mtnZone === 'approach') continue;
    const q = o.s.position, d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < 5.5 || d > 20) continue;
    if (inSmoke(q.x, q.z, o.baseY)) continue;
    const sc = (o.baseY - e.baseY) + (o.mtnZone === 'approach' ? 3 : 0) - d * 0.08;
    if (sc > bs) { bs = sc; best = o; }
  }
  if (!best) return false;
  const q = best.s.position;
  e.throwing = { x: q.x + rand(-0.35, 0.35), z: q.z + rand(-0.25, 0.25), y: best.baseY, t: 0 };
  e.smokeCd = rand(8, 13);
  yariSay(e, 'smoke_throw');
  return true;
}
function mtnAllyAdvance(e, dt) {
  if (e.special || e.ramCrew || e.bundleBear || e.guard || e.hold) return false;
  const side = e.mtnSide === 'east' ? 'east' : e.mtnSide === 'west' ? 'west' : (e.s.position.x > 6 ? 'east' : 'west');
  if (e.mtnSide !== 'east' && e.mtnSide !== 'west') e.mtnSide = side;
  const gate = MTN.gates.find(g => g.id === side);
  if (!gate) return false;
  if (e.mtnFile == null) mtnGiveSlot(e);
  const p = e.s.position;
  MTN.who = e;
  const go = !!(MTN.ramGo && MTN.ramGo[side]);
  const open = !!gate.open;
  const R = (MTN.rams || []).find(r => r.id === side);
  let near = null, nd = 1e9;
  for (const o of enemies) {
    if (o.team !== 'orange' || o.state === 'down') continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z);
    if (Math.abs((o.baseY || 0) - e.baseY) > 14) continue;
    if (d < nd) { nd = d; near = o; }
  }
  if (e.kind !== 'archer' && near && nd < 2.05 && Math.abs(near.baseY - e.baseY) < 1.35) return false;
  let aiming = false;
  if (e.kind === 'archer' && e.state === 'aim') {
    e.t += dt;
    if (!near || !ammoOK(e)) { e.state = 'advance'; e.t = 0; npcTint(e, 0); }
    else {
      aiming = true;
      e.tgt = near; e.tgtT = 0.8; e.aimK = 0.7;
      e.faceWant = Math.atan2(near.s.position.x - p.x, near.s.position.z - p.z);
      npcTint(e, Math.min(1, e.t / 0.48));
      if (e.t >= 0.48) {
        enemyShoot(e, near);
        MTN.allyShots = (MTN.allyShots || 0) + 1;
        e.state = 'advance'; e.t = 0; npcTint(e, 0);
        e.mtnShot = 0.22;
        aiming = false;
      }
    }
  }
  const file = e.mtnFile == null ? 1 : e.mtnFile;
  const rank = e.mtnRank || 0;
  const spread = (file - 1) * 1.15 + ((rank % 5) - 2) * 0.35;
  const lane = (file - 1) * (open ? 0.55 : 0.85);
  let tx, tz;
  if (!open) {
    const ramZ = R ? R.z : 62;
    const front = go ? ramZ + 1.5 : Math.min(ramZ, 50);
    const back = (e.kind === 'archer' ? 1.6 : 0.4) + (rank % 6) * 0.65;
    tx = (side === 'east' ? 12 : 0) + lane;
    tz = front + back;
    const gateZ = (gate.z0 + gate.z1) / 2 + 2.5;
    if (tz < gateZ) tz = gateZ + (rank % 4) * 0.35;
    if (p.z + 0.15 < tz) tz = p.z;
    const gcx = (gate.x0 + gate.x1) / 2, gcz = (gate.z0 + gate.z1) / 2;
    if (e.kind !== 'archer' && Math.hypot(p.x - gcx, p.z - gcz) < 2.6 && Math.abs(e.baseY - gate.y) < 1.5 && !(near && nd < 2.2)) {
      e.gateSw = (e.gateSw || 0) - dt;
      e.faceWant = Math.atan2(gcx - p.x, gcz - p.z);
      if (e.gateSw > 0) { e.state = 'windup'; npcTint(e, 0.8); }
      else {
        gate.hp -= 1; MTN.meleeHits = (MTN.meleeHits || 0) + 1; e.gateSw = 0.95; npcTint(e, 0);
        popup((gate.id === 'west' ? '大手門' : '搦手門') + 'を叩いた（残り ' + Math.max(0, gate.hp) + '）');
        if (gate.hp <= 0) mtnOpenGate(gate, 'melee');
        e.state = 'recover';
      }
      e.tgt = null;
      return true;
    }
  } else if (MTN.bar && e.baseY > 8.6 && (e.kind !== 'archer' || !mtnAtkMeleeAlive())) {
    if (mtnBashHon(e, dt)) return true;
    return false;
  } else if ((p.z > 16 || Math.abs(p.x) > 6.8) && e.baseY < 8.2) {
    tx = Math.abs(p.x) > 6.8 ? clamp(spread, -4.8, 4.8) : (side === 'east' ? 12 : 0) + clamp(spread, -3.2, 3.2);
    tz = Math.abs(p.x) > 6.8 ? 14.7 : 16;
  } else if (p.z > 3.05 && e.baseY < 9.75) {
    tx = clamp(spread, -5.3, 5.3);
    tz = 4.2;
  } else if (e.baseY < 9.75) {
    tx = clamp(spread, -5.4, 5.4);
    tz = 1.15 - (rank % 3) * 0.9;
  } else if (e.baseY < 12.35) {
    tx = clamp(spread, -1.15, 1.15);
    tz = p.z > -2.2 ? -6.5 : -18 - (rank % 4) * 1.2;
  } else {
    tx = clamp(spread * 1.3, -5.2, 5.2);
    tz = -18 - (rank % 5) * 1.3;
  }
  if (e.kind !== 'archer' && near && nd < 9 && Math.abs(near.baseY - e.baseY) < 1.6) {
    const lim = open ? -30 : ((R ? R.z : p.z) - 0.8);
    tx = near.s.position.x;
    tz = Math.max(near.s.position.z, lim);
  }
  if (Math.hypot(tx - p.x, tz - p.z) > 0.4) steer(e, tx, tz, e.speed * (open ? 1.24 : 1.08), dt);
  const canShoot = e.kind === 'archer' && near && nd > 3.2 && nd < 52 && Math.abs(near.baseY - e.baseY) < 13 && ammoOK(e);
  if (e.mtnShot == null) e.mtnShot = (e.ph % 1) * 0.4;
  if (!aiming) e.mtnShot -= dt;
  if (!aiming && canShoot && e.mtnShot <= 0) {
    e.state = 'aim'; e.t = 0; e.tgt = near; e.aimK = 0.7; e.mtnShot = 0.22;
  } else if (!aiming) {
    e.faceWant = near && nd < 50 ? Math.atan2(near.s.position.x - p.x, near.s.position.z - p.z) : Math.atan2(tx - p.x, (tz - p.z) || -1);
    e.state = 'advance';
  }
  return true;
}
function mtnDefenderBrain(e, dt) {
  if (e.team !== 'orange' || e.special || (!e.mtnPost && !e.mtnGo)) return false;
  const p = e.s.position;
  if (e.mtnGo) {
    const g = e.mtnGo;
    MTN.who = e;
    if (Math.hypot(g[0] - p.x, g[1] - p.z) < 1.15 && Math.abs(e.baseY - g[2]) < 0.8) {
      e.mtnPost = g; e.mtnGo = null; e.mtnSide = g[3]; e.mtnZone = 'approach';
    } else {
      const rt = mtnRoute(p, g[0], g[1]);
      steer(e, rt[0], rt[1], e.speed * 1.15, dt);
      e.faceWant = Math.atan2(g[0] - p.x, g[1] - p.z);
      return true;
    }
  }
  const post = e.mtnPost;
  if (Math.hypot(post[0] - p.x, post[1] - p.z) > 1.15) { steer(e, post[0], post[1], e.speed, dt); return true; }
  e.tgtT -= dt; e.cd -= dt; e.t += dt;
  if (!e.tgt || e.tgtT <= 0 || (!e.tgt.isPlayer && e.tgt.state === 'down')) { e.tgt = chooseTarget(e); e.tgtT = 0.7; }
  if (!e.tgt) { e.faceWant = Math.PI; e.state = 'idle'; return true; }
  const tp = tgtPos(e.tgt);
  e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z);
  const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
  const ty = e.tgt.isPlayer ? player.pos.y : e.tgt.baseY;
  if (e.stone && dist > 3.5 && dist < 20 && e.cd <= 0 && Math.abs(ty - e.baseY) < 8) { mtnThrowStone(e); e.cd = rand(1.2, 2); e.state = 'approach'; return true; }
  if (e.kind === 'archer' && dist < 52 && Math.abs(ty - e.baseY) < 10 && ammoOK(e)) {
    if (e.state !== 'aim' && e.state !== 'zanshin') { e.state = 'aim'; e.t = 0; }
    if (e.state === 'aim' && e.t >= aimTotal(e, dist < 8)) { enemyShoot(e, e.tgt); e.state = 'zanshin'; e.t = 0; e.zanNext = () => { e.state = 'aim'; e.t = 0; }; }
    else if (e.state === 'zanshin' && e.t > 0.35) { e.state = 'aim'; e.t = 0; }
    return true;
  }
  if (dist < 2.1 && Math.abs(ty - e.baseY) < 1.3 && e.cd <= 0) {
    e.cd = 0.8;
    if (e.tgt.isPlayer) hurtPlayer(e.dmg || 8);
    else damageEnemy(e.tgt, 1, p, false, { pt: new V3(tp.x, ty + 0.8, tp.z), thrust: true }, e);
  }
  e.state = 'approach';
  return true;
}
function mtnHotSide() {
  let w = 0, ea = 0;
  if (player.pos.z < 72) { if (Math.abs(player.pos.x - 0) <= Math.abs(player.pos.x - 12)) w += 2; else ea += 2; }
  for (const e of enemies) if (e.team === 'blue' && e.state !== 'down' && e.mtnSide) { if (e.mtnSide === 'east') ea++; else w++; }
  return w >= ea ? 'west' : 'east';
}
function mtnBalance() {
  if (MTN.reliefT && time < MTN.reliefT) return;
  const pressure = { west: 0, east: 0 }, defs = { west: [], east: [] };
  if (player.pos.z < 72 && player.pos.y < 10) pressure[Math.abs(player.pos.x) < Math.abs(player.pos.x - 12) ? 'west' : 'east'] += 2;
  for (const e of enemies) {
    if (e.state === 'down' || e.special) continue;
    if (e.team === 'blue' && e.mtnSide) pressure[e.mtnSide] += 1;
    if (e.team === 'orange' && (e.mtnSide === 'west' || e.mtnSide === 'east') && e.mtnZone !== 'nino' && e.mtnZone !== 'hon' && !e.mtnGo) defs[e.mtnSide].push(e);
  }
  const score = s => (pressure[s] + 0.6) / (defs[s].length + 0.6);
  let hot = null;
  if (score('west') > score('east') + 0.45) hot = 'west';
  else if (score('east') > score('west') + 0.45) hot = 'east';
  if (!hot) return;
  const cold = hot === 'west' ? 'east' : 'west';
  const peakish = defs[cold].filter(e => (e.baseY || 0) > 5.8 && e.s.position.z < 30);
  const pool = peakish.length >= 4 ? peakish : defs[cold];
  if (pool.length < 7 && defs[cold].length < 7) return;
  const spots = (MTN.sidePosts[hot] || []).slice();
  if (!spots.length) return;
  let sent = 0;
  for (const mover of pool) {
    if (defs[cold].length - sent <= 3 || sent >= 4) break;
    let spot = null, bd = 1e9;
    for (const s of spots) {
      const taken = enemies.some(o => o.state !== 'down' && Math.hypot((o.mtnGo ? o.mtnGo[0] : o.mtnPost ? o.mtnPost[0] : 99) - s[0], (o.mtnGo ? o.mtnGo[1] : o.mtnPost ? o.mtnPost[1] : 99) - s[1]) < 0.8);
      if (taken) continue;
      const d = Math.hypot(s[0] - mover.s.position.x, s[1] - mover.s.position.z);
      if (d < bd) { bd = d; spot = s; }
    }
    if (!spot) {
      const s = spots[sent % spots.length];
      spot = [s[0] + (sent % 2 ? 0.8 : -0.8), s[1] + 0.4, s[2]];
    }
    mover.mtnGo = [spot[0], spot[1], spot[2], hot];
    sent++;
  }
  if (!sent) return;
  MTN.reliefT = time + 18;
  showBanner(hot === 'west' ? '西峰、援軍を乞う' : '東峰、援軍を乞う', 'もう一方の峰から、峰道を渡って兵が移る');
}
function updateMountain(dt) {
  if (!MTN.on || state !== 'play') return;
  const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
  if (MTN.slowT > 0) MTN.slowT -= dt;
  if ((MTN.balT -= dt) <= 0) { MTN.balT = 5; mtnBalance(); }
  if ((MTN.fillT -= dt) <= 0) { MTN.fillT = 0.8; for (const R of MTN.rams || []) mtnFillRam(R); }
  MTN.fightT = (MTN.fightT || 0) + dt;
  if (!MTN.ramGo) MTN.ramGo = { west: false, east: false };
  for (const side of ['west', 'east']) {
    if (MTN.ramGo[side]) continue;
    let alive = 0;
    for (const e of enemies) if (e.team === 'orange' && e.state !== 'down' && !e.special && e.mtnZone === 'approach' && e.mtnSide === side) alive++;
    const base = (MTN.approach0 && MTN.approach0[side]) || alive || 1;
    if ((MTN.fightT > 8 && alive <= Math.max(3, Math.floor(base * 0.55))) || MTN.fightT > 12) {
      MTN.ramGo[side] = true;
      showBanner(side === 'west' ? '大手、守りが薄い。破門隊、押せ！' : '搦手、守りが薄い。破門隊、押せ！', '後ろの兵もついて、射ちながら門へ');
    }
  }
  for (const R of MTN.rams || []) {
    const gate = MTN.gates.find(g => g.id === R.id);
    if (!gate || gate.open) { if (R.g) R.g.visible = false; continue; }
    R.crew = R.crew.filter(isUp);
    const at = R.crew.filter(m => {
      const i = R.crew.indexOf(m), s = mtnRamSlot(R, i);
      return Math.hypot(m.s.position.x - s[0], m.s.position.z - s[1]) < 2.4;
    });
    // 担ぎ手が揃っても、弓の撃ち合いが済むまで丸太は動かない
    const ordered = !!(MTN.ramGo && MTN.ramGo[R.id]);
    R.carrying = at.length >= 2 && ordered;
    R.moving = false;
    const gateZ = gate.z1 + 1.55;
    if (R.carrying) {
      for (const m of R.crew) {
        if (Math.hypot(m.s.position.x - R.x, m.s.position.z - R.z) > 8) continue;
        const i = R.crew.indexOf(m), s = mtnRamSlot(R, i);
        m.s.position.x = s[0]; m.s.position.z = s[1];
        m.baseY = floorUnder(s[0], s[1], (R.y || 0) + 0.9); m.footOk = [s[0], s[1]];
      }
    }
    if (R.carrying && R.z > gateZ) {
      const step = Math.min(R.z - gateZ, dt * 1.55);
      R.z -= step; R.y = 6.4 * (66 - R.z) / 33.6; R.moving = step > 0.02;
      R.t = 0; R.struck = false; R.swing = Math.max(0, R.swing - dt * 3);
      for (const m of at) {
        const i = R.crew.indexOf(m), s = mtnRamSlot(R, i);
        m.s.position.x = s[0]; m.s.position.z = s[1];
        m.baseY = floorUnder(s[0], s[1], R.y + 0.9); m.footOk = [s[0], s[1]];
      }
    } else if (R.carrying) {
      const u0 = R.t; R.t += dt;
      if (R.t < 1.45) R.swing = -0.42 * (R.t / 1.45);
      else if (R.t < 1.7) R.swing = -0.42 + 0.9 * ((R.t - 1.45) / 0.25);
      else {
        if (!R.struck) {
          R.struck = true; gate.hp -= 4; R.hits = (R.hits || 0) + 1; MTN.ramHits = (MTN.ramHits || 0) + 1;
          popup((gate.id === 'west' ? '大手門' : '搦手門') + 'に破城槌（残り ' + Math.max(0, gate.hp) + '）');
          if (gate.hp <= 0) mtnOpenGate(gate, 'ram');
        }
        R.swing = 0.48 * Math.max(0, 1 - (R.t - 1.7) / 0.45);
        if (R.t > 2.35) { R.t = 0; R.struck = false; }
      }
      if (u0 > R.t) R.struck = false;
    } else { R.t = 0; R.struck = false; R.swing = Math.max(0, R.swing - dt * 2); }
    if (R.g) { R.g.visible = true; R.g.position.set(R.x, R.y + 0.95, R.z - R.swing); }
  }
  for (const e of enemies) if (e.mtnBundle && e.state !== 'down') mtnSyncBundle(e);
  for (const s of MTN.stones) {
    s.life += dt; s.vy -= 9.8 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
  }
  for (let i = MTN.stones.length - 1; i >= 0; i--) {
    const s = MTN.stones[i], q = s.m.position;
    let hit = Math.hypot(q.x - px, q.z - pz) < 0.45 && q.y > py + 0.2 && q.y < py + 1.7;
    if (hit) { hurtPlayer(6); popup('つぶて！'); }
    if (!hit) for (const e of enemies) {
      if (e.state === 'down' || e.team === 'orange') continue;
      if (Math.hypot(q.x - e.s.position.x, q.z - e.s.position.z) < 0.4 && q.y > e.baseY + 0.2 && q.y < e.baseY + e.figH) {
        damageEnemy(e, 1, q, false, { pt: q.clone(), thrust: true }, { team: 'orange', state: 'down' }); hit = true; break;
      }
    }
    if (hit || q.y < floorUnder(q.x, q.z, q.y + 0.4) + 0.05 || s.life > 3) {
      scene.remove(s.m); MTN.stones.splice(i, 1);
    }
  }
  if (mtnRegion(px, pz, py) === 'nino') MTN.entered = true;
  if (MTN.entered && !MTN.volley) {
    MTN.volley = true;
    showBanner('二の丸', '門は最初から開いている。落とし穴と、四方からの矢');
    const y = 10.8;
    for (const [x, z] of [[-6.2, 2], [6.2, 2], [0, 5.6], [0, -3.2]]) mtnArrow(new V3(x, y, z), new V3(px, py + 1.2, pz), 8);
  }
  for (const pit of MTN.pits) {
    if (!pit.on) continue;
    const hitP = Math.hypot(px - pit.x, pz - pit.z) < 0.7 && Math.abs(py - 9.6) < 0.6;
    if (hitP) {
      pit.on = false; player.hp -= 18; player.hurtT = 1; spillBlood(px, py, pz, 0.6);
      player.pos.x += Math.sign(px - pit.x || 1) * 1.4; popup('落とし穴！');
    }
    for (const e of enemies) {
      if (!pit.on || e.state === 'down' || Math.abs(e.baseY - 9.6) > 0.6) continue;
      if (Math.hypot(e.s.position.x - pit.x, e.s.position.z - pit.z) < 0.65) {
        pit.on = false; e.hp -= 16; spillBlood(e.s.position.x, e.baseY, e.s.position.z, 0.55);
        if (e.hp <= 0) killEnemy(e, false, new V3(pit.x, 9.6, pit.z));
      }
    }
  }
  for (const t of MTN.traps) {
    if (t.sprung) continue;
    const near = (x, z, y) => Math.hypot(x - t.x, z - t.z) < 0.42 && Math.abs(y - t.y) < 0.5;
    let who = near(px, pz, py) ? 'p' : null;
    let foe = null;
    if (!who) for (const e of enemies) if (e.state !== 'down' && near(e.s.position.x, e.s.position.z, e.baseY)) { who = e; foe = e; break; }
    if (!who) continue;
    t.sprung = true; t.jaws.forEach((j, i) => { j.rotation.z = (i ? -1 : 1) * 0.15; });
    if (who === 'p') { player.hp -= 16; MTN.slowT = 2.6; spillBlood(px, py, pz, 0.5); popup('トラバサミ！ 足を挟まれた'); }
    else { foe.hp -= 14; spillBlood(foe.s.position.x, foe.baseY, foe.s.position.z, 0.5); if (foe.hp <= 0) killEnemy(foe, false, foe.s.position); }
  }
  for (const n of MTN.needles) {
    const inn = (x, z, y) => x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1 && Math.abs(y - 12.8) < 0.45;
    if (inn(px, pz, py)) {
      player.hp -= dt * 7;
      if (!n.bled) { n.bled = true; spillBlood(px, py, pz, 0.45); popup('針山の床だ'); }
    }
    for (const e of enemies) if (e.state !== 'down' && inn(e.s.position.x, e.s.position.z, e.baseY)) {
      e.hp -= dt * 5;
      if (e.hp <= 0) killEnemy(e, false, e.s.position);
    }
  }
  for (const d of MTN.doors) {
    if (d.fired) continue;
    if (Math.hypot(px - d.x, pz - d.z) < 1.25 && Math.abs(py - d.y) < 0.8) {
      d.fired = true; d.m.rotation.y += 1.2;
      const from = new V3(d.x, d.y + 1.3, d.z);
      for (let k = 0; k < 3; k++) mtnArrow(from, new V3(px + rand(-0.3, 0.3), py + 1.1, pz + rand(-0.3, 0.3)), 7);
      popup('扉のからくり。矢が飛び出した');
    }
  }
  if (!MTN.won && player.hp > 0 && MTN.phase >= 2 && py > 11.5 && pz < -22) {
    const foes = enemies.some(e => e.team === 'orange' && e.state !== 'down' && e.mtnZone === 'hon');
    if (!foes && wave.toSpawn <= 0) { MTN.won = true; gameOver(true); return; }
  }
  if (player.hp <= 0) { player.hp = 0; gameOver(false); }
}

const DUAL_COX = -62, DUAL_MOX = 78;
const DUAL = { on: false, build: false, kingCleared: false, saionjiCleared: false, spawned: false, betrayed: false, relayStage: 0, eventT: 0, joined: false, arrivalTalk: false, healT: 2, won: false, saionji: null, miyashita: null, shira: null, reinforcements: [] };
function dualVoice(text) {
  { const ls = [...String(text).matchAll(/[「『]([^」』]+)[」』]/g)].map(m => m[1].trim()).filter(Boolean); if (ls.length && VoicePack.seq(ls)) return; }
  // 日本語音声は端末・ブラウザー内蔵の音声合成を使用。利用できない環境では字幕のみ。
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
  const lines = [...String(text).matchAll(/[「『]([^」』]+)[」』]/g)].map(m => m[1].replace(/^[^：:]{1,12}[：:]/, '').trim()).filter(Boolean);
  if (!lines.length) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(lines.join('。 '));
    u.lang = 'ja-JP'; u.rate = 0.92; u.pitch = 0.92; u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}
function dualLine(text) { popup(text); if (typeof subtitle === 'function') subtitle(text); dualVoice(text); }
function dualShift(ox, oz, fn) {
  const before = new Set(stageRoot.children);
  const nB = boxes.length, nF = floors.length, nL = ladders.length, nP = perches.length, nC = covers.length, nK = colliders.length;
  const hq0 = hq, mb0 = medPost.blue, mo0 = medPost.orange, gatesArr = MTN.gates;
  fn();
  const sh = o => {
    if (!o) return;
    if (typeof o.x === 'number') o.x += ox;
    if (typeof o.z === 'number') o.z += oz;
    if (typeof o.x0 === 'number') o.x0 += ox;
    if (typeof o.x1 === 'number') o.x1 += ox;
    if (typeof o.z0 === 'number') o.z0 += oz;
    if (typeof o.z1 === 'number') o.z1 += oz;
    if (o.slits) o.slits = o.slits.map(x => x + ox);
  };
  for (const c of stageRoot.children) if (!before.has(c) && c !== CASTLE.doorMesh) { c.position.x += ox; c.position.z += oz; }
  for (let i = nB; i < boxes.length; i++) sh(boxes[i]);
  for (let i = nF; i < floors.length; i++) sh(floors[i]);
  for (let i = nL; i < ladders.length; i++) sh(ladders[i]);
  for (let i = nP; i < perches.length; i++) sh(perches[i]);
  for (let i = nC; i < covers.length; i++) sh(covers[i]);
  for (let i = nK; i < colliders.length; i++) sh(colliders[i]);
  if (hq && hq !== hq0) { hq.x0 += ox; hq.x1 += ox; hq.z0 += oz; hq.z1 += oz; hq.sx += ox; hq.sz += oz; }
  if (medPost.blue && medPost.blue !== mb0) { medPost.blue[0] += ox; medPost.blue[1] += oz; }
  if (medPost.orange && medPost.orange !== mo0) { medPost.orange[0] += ox; medPost.orange[1] += oz; }
  if (MTN.gates && MTN.gates !== gatesArr) for (const g of MTN.gates) sh(g);
}
function dualShiftMtnLogic() {
  const ox = DUAL_MOX;
  for (const h of MTN.hold || []) h[0] += ox;
  for (const side of ['west', 'east']) for (const p of (MTN.sidePosts && MTN.sidePosts[side]) || []) p[0] += ox;
  for (const n of MTN.needles || []) { n.x0 += ox; n.x1 += ox; }
  for (const d of MTN.doors || []) d.x += ox;
  for (const r of MTN.rams || []) r.x += ox;
  for (const p of MTN.pits || []) p.x += ox;
  for (const t of MTN.traps || []) t.x += ox;
  if (MTN.posts) for (const arr of MTN.posts) for (const p of arr) if (p) p[0] += ox;
}
function dualCastleZone(x, z) {
  return Math.abs(x - DUAL_COX) < CS.WX + 6 && z > -12 && z < CS.WZ1 + 6;
}
function dualMtnBody(x, z) {
  return x > DUAL_MOX - 18 && x < DUAL_MOX + 22 && z > -36 && z < 100;
}
function dualRoute(p, tx, tz) {
  if (dualCastleZone(p.x, p.z) || dualCastleZone(tx, tz)) {
    const sh = CASTLE.shift || 0;
    CASTLE.shift = 0;
    const lp = { x: p.x - DUAL_COX, z: p.z, _rp: p._rp };
    const r = castleRoute(lp, tx - DUAL_COX, tz);
    p._rp = lp._rp;
    CASTLE.shift = sh;
    return [r[0] + DUAL_COX, r[1]];
  }
  if (dualMtnBody(p.x, p.z)) return dualMtnRoute(p, tx, tz);
  return [tx, tz];
}
function dualMtnRoute(p, tx, tz) {
  const py = floorUnder(p.x, p.z, (p.y || 0) + 2.2);
  const ty = floorUnder(tx, tz, 40);
  const bar = MTN.bar;
  if (bar && py > 8.5 && p.z > bar.z1 - 0.15 && tz < bar.z0 - 0.25) {
    const who = MTN.who;
    if (!(who && who.team === 'blue' && who.missionRelief)) return [clamp(tx, bar.x0 + 0.35, bar.x1 - 0.35), bar.z1 + 1.05];
  }
  if (!bar && py > 8.5 && ty > 11 && p.z < -2.3 && p.z > -11.5) {
    const sx = DUAL_MOX + clamp(tx - DUAL_MOX, -1.15, 1.15);
    if (py < 12.2) return [sx, Math.min(tz, p.z - 0.35)];
    return [tx, tz];
  }
  if (!bar && py > 8.4 && ty > 11.2 && p.z > -2.7) {
    return [DUAL_MOX + clamp(tx - DUAL_MOX, -1.15, 1.15), -5.6];
  }
  if (py > 8.6 && p.z > -4.5 && p.z < 8.6) return [tx, tz];
  if (py > 5.6 && py < 10.4 && p.z > 2.4 && p.z < 12.8) {
    const ax = DUAL_MOX + clamp(tx - DUAL_MOX, -5.4, 5.4);
    if (Math.abs(p.x - ax) > 1.3) return [ax, p.z];
    return [ax, tz];
  }
  if (Math.abs(py - ty) < 1.45 && Math.hypot(tx - p.x, tz - p.z) < 18) return [tx, tz];
  const westX = DUAL_MOX, eastX = DUAL_MOX + 12;
  const here = Math.abs(p.x - eastX) < Math.abs(p.x - westX) ? eastX : westX;
  const dest = Math.abs(tx - eastX) < Math.abs(tx - westX) ? eastX : westX;
  const narrow = p.z > 32 && py < 7.2;
  const spine = narrow ? here : dest;
  const band = narrow ? 1.15 : 3.6;
  const ax = spine + clamp(tx - spine, -band, band);
  if (Math.abs(p.x - ax) > 1.5) return [ax, clamp(p.z, -30, 96)];
  if (Math.abs(tz - p.z) > 3.2) return [ax, tz > p.z ? Math.min(tz, p.z + 8) : Math.max(tz, p.z - 8)];
  return [tx, tz];
}
function buildTwoFront() {
  DUAL.build = true;
  dualShift(DUAL_MOX, 0, () => { buildMountain(); });
  MTN.on = false;
  dualShift(DUAL_COX, 0, () => { buildCastle(); });
  DUAL.build = false;
  MTN.on = false; CASTLE.on = false;
  CASTLE.phase = 0; CASTLE.gateHP = CS.GATE_MAX; CASTLE.won = false; CASTLE.log = [];
  if (CASTLE.gate) {
    CASTLE.gate.box.y1 = 4; CASTLE.gate.k = 0; CASTLE.gate.opening = 0; CASTLE.gate.shake = 0;
    CASTLE.gate.leaves.forEach(l => { l.rotation.y = 0; });
  }
  if (CASTLE.ram && CASTLE.ram.g) {
    CASTLE.ram.x = DUAL_COX; CASTLE.ram.z = -46; CASTLE.ram.y = 0.24; CASTLE.ram.crew = [];
    CASTLE.ram.g.position.set(CASTLE.ram.x, CASTLE.ram.y, CASTLE.ram.z);
  }
  for (const d of CASTLE.doors || []) {
    d.x += DUAL_COX;
    d.open = !!d.open0; d.k = d.open ? 1 : 0; d.by = null; d.closeT = 0;
    d.box.y1 = d.open ? -1 : 2.8;
    doorWrite(d);
  }
  for (const p of CASTLE.pits || []) { p.x += DUAL_COX; if (p.x0 != null) { p.x0 += DUAL_COX; p.x1 += DUAL_COX; } }
  dualShiftMtnLogic();
  CASTLE.shift = DUAL_COX;
  nobori((DUAL_COX + DUAL_MOX) * 0.5, -40, '#f4f1e8', '#1d1d24', '連絡');
  nobori(DUAL_COX - 4, 70, '#1f5fb8', '#f4f1e8', '王');
  const saiFlag = nobori(DUAL_MOX + 5.2, -16, '#b99a45', '#fff6e8', '西園寺');
  saiFlag.position.y = 12.8;
}
function dualOpenCastle(why) {
  const g = CASTLE.gate; if (!g || !g.box || CASTLE.phase !== 0) return;
  CASTLE.phase = 1; CASTLE.gateHP = 0; g.box.y1 = -1; g.k = 1; g.opening = 1;
  if (g.leaves[0]) g.leaves[0].rotation.y = -Math.PI / 2 * 0.92;
  if (g.leaves[1]) g.leaves[1].rotation.y = Math.PI / 2 * 0.92;
  castleGraph();
  showBanner('大手門、破られた', why || '橙組が二の丸へなだれ込む');
  if (CASTLE.ram) {
    for (const m of CASTLE.ram.crew || []) if (isUp(m)) { m.ramCrew = false; m.state = 'approach'; }
    CASTLE.ram.crew = [];
  }
  for (const e of enemies) if (e.team === 'orange' && e.missionFront === 'king' && isUp(e) && !e.ramCrew) {
    const lane = ((e.id % 9) - 4) * 1.45;
    const x = DUAL_COX + lane;
    e.missionPath = [[DUAL_COX + clamp(lane * 0.45, -3.2, 3.2), -5], [x, 10], [x, 30], [DUAL_COX + clamp(lane * 0.55, -4.5, 4.5), 48], [DUAL_COX, 62]];
    e.missionGoto = [DUAL_COX, 68]; e.missionAssaultKeep = true; e.mtnHold = false; e.tgt = null; e.state = 'approach';
  }
  // 二の丸の門が開いたら、門内で滞留する青組の近接兵も広間へ出撃させる。
  let sortieIndex = 0;
  for (const e of enemies) {
    if (e.team !== 'blue' || !isUp(e) || e.kind === 'archer' || e.special || e.wasOjou || e.missionFrom) continue;
    const p = e.s.position;
    if ((e.missionFront === 'king' || !e.missionFront) && (e.baseY || 0) < 2.4 &&
        Math.abs(p.x - DUAL_COX) < 13 && p.z > -8 && p.z < 27) {
      const lane = ((sortieIndex % 7) - 3) * 2.15; sortieIndex++;
      e.mtnHold = false; e.tgt = null; e.state = 'approach'; e.missionRelief = true; e.missionFrom = 'king'; e.missionFront = 'king'; e.missionSortie = true;
      e.missionPath = [[DUAL_COX + lane, -2], [DUAL_COX + lane, -13], [DUAL_COX + lane * 0.7, -25]];
      e.missionGoto = [DUAL_COX + lane * 0.45, -32];
    }
  }
}
function dualOpenMtn(g) {
  if (!g || g.open) return;
  g.open = true;
  for (const b of g.boxes || []) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); }
  (g.meshes || []).forEach((m, i) => { m.rotation.y += i ? 1.15 : -1.15; });
  showBanner(g.id === 'west' ? '山城の大手、落ちた' : '山城の搦手、落ちた', '西園寺の守りが奥へ押される');
  for (const e of enemies) if (e.missionStair === g.id && e.team === 'orange' && isUp(e) && !e.ramCrew) {
    const i = e.id, lane = ((i % 7) - 3) * 1.45;
    const x = DUAL_MOX + (g.id === 'west' ? 0 : 12);
    const ninoX = DUAL_MOX + clamp(lane, -5.2, 5.2);
    const doorX = DUAL_MOX + clamp(((i % 3) - 1) * 0.95, -1.15, 1.15);
    e.missionPath = [[x + clamp(lane * 0.4, -2.6, 2.6), 18], [ninoX, 1.6], [doorX, -2.15], [ninoX, -16 - (i % 4) * 0.7]];
    e.missionGoto = [ninoX, -17 - (i % 3)];
  }
}
function dualMarch() {
  return [[DUAL_COX, 8], [DUAL_COX, -42], [DUAL_MOX + 34, -42], [DUAL_MOX + 34, 102], [DUAL_MOX, 90], [DUAL_MOX, 42], [DUAL_MOX, -16]];
}
function dualMarchBack() {
  return [[DUAL_MOX, 88], [DUAL_MOX + 34, 102], [DUAL_MOX + 34, -42], [DUAL_COX, -42], [DUAL_COX, -8], [DUAL_COX, 12]];
}
function dualUnit(front, team, x, z, y, opt) {
  opt = opt || {};
  const kind = opt.kind || 'mob';
  const set = Object.assign({ missionFront: front }, opt.set || {});
  if (opt.sq) set.dualSq = opt.sq;
  const e = spawnEnemy(x, z, kind, false, team, { y: y || 0, yari: opt.yari ? 1 : -1, perch: opt.perch || null, set });
  if (!e) return null;
  e.missionFront = front;
  e.missionGoto = opt.goto ? opt.goto.slice() : [x, z];
  if (opt.path) e.missionPath = opt.path.map(p => p.slice());
  if (opt.stair) e.missionStair = opt.stair;
  if (opt.rein) e.missionReinforcement = true;
  e.baseY = y || e.baseY || 0; e.s.position.y = e.baseY; e.footOk = [x, z];
  return e;
}
function dualGoto(e) {
  const path = e.missionPath;
  if (path && path.length) {
    const g = path[0];
    if (Math.hypot(e.s.position.x - g[0], e.s.position.z - g[1]) < 4.2) { path.shift(); return path[0] || e.missionGoto; }
    return g;
  }
  return e.missionGoto;
}
function dualFoeNear(e, r) {
  for (const o of enemies) {
    if (!isUp(o) || o.team === e.team || o.special || o.wasOjou) continue;
    if (Math.abs((o.baseY || 0) - (e.baseY || 0)) > 2.6) continue;
    if (Math.hypot(o.s.position.x - e.s.position.x, o.s.position.z - e.s.position.z) < r) return true;
  }
  return false;
}
function dualPers(e) { return (e && e.prof && e.prof.pers) || '冷静'; }
const DUAL_ARCH_R = { '臆病': 32, '慎重': 26, '冷静': 22, '陽気': 20, '好戦的': 14 };
const DUAL_MELEE_R = { '臆病': 5.5, '慎重': 7, '冷静': 9, '陽気': 11, '好戦的': 16 };
function dualRange(e) { const p = dualPers(e); return e.kind === 'archer' ? (DUAL_ARCH_R[p] || 22) : (DUAL_MELEE_R[p] || 9); }
function dualFoe(e) {
  const r = dualRange(e), htol = (e.missionFront === 'saionji' || (e.baseY || 0) > 2.4) ? 9 : 3.2;
  const p = e.s.position; let best = null, bd = r;
  for (const o of enemies) {
    if (!isUp(o) || o.team === e.team || o.special || o.wasOjou || o.hiddenAmb) continue;
    if (Math.abs((o.baseY || 0) - (e.baseY || 0)) > htol) continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (e.team === 'orange' && !inHQ()) {
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (Math.abs(player.pos.y - (e.baseY || 0)) <= htol && d < bd) return PLAYER_T;
  }
  return best;
}
function dualKingAtkPost(e) {
  const pers = dualPers(e), x = e.s.position.x, z = e.s.position.z;
  if (e.kind === 'archer') {
    e.missionGoto = pers === '好戦的' ? [DUAL_COX + clamp(x - DUAL_COX, -8, 8), -8] : pers === '陽気' ? [x, Math.min(z, -12)] : [x, z];
    return;
  }
  if (pers === '臆病' || pers === '慎重') e.missionGoto = [x, z];
  else if (pers === '好戦的' || pers === '陽気') e.missionGoto = [DUAL_COX + Math.sin(e.ph * 3) * 2.1, -2.2];
  else e.missionGoto = [DUAL_COX + clamp((x - DUAL_COX) * 0.35, -6, 6), -6 - (e.id % 4)];
}
function dualMtnAtkPost(e, x0, col) {
  const pers = dualPers(e);
  const lane = (col - 1) * 1.35 + ((e.id % 3) - 1) * 0.45;
  const destZ = pers === '臆病' ? 56 : pers === '慎重' ? 48 : pers === '冷静' ? 40 : pers === '陽気' ? 36 : 33.5;
  e.missionGoto = [x0 + clamp(lane, -2.2, 2.2), destZ];
  e.missionPath = [[x0 + clamp(lane, -1.3, 1.3), Math.min(e.s.position.z - 1, 70)], [x0 + clamp(lane, -1.3, 1.3), destZ]];
}
function startDualMission() {
  Object.assign(DUAL, { on: true, kingCleared: false, saionjiCleared: false, spawned: false, betrayed: false, relayStage: 0, eventT: 0, joined: false, arrivalTalk: false, healT: 1.5, won: false, reinforcements: [], nKingO: 0, nSaiO: 0, honDoorEvent: false, honEventT: 0 });
  player.pos.set(hq ? hq.sx : DUAL_COX - 1, 0, hq ? hq.sz : 64.2); player.yaw = 0; player.hp = CFG.maxHp;
  wave.n = 1; wave.toSpawn = 0; wave.blueToSpawn = 0; wave.blueOwed = 0; wave.inter = 0; wave.maxAlive = 280; wave.blueMax = 280;
  if (ojou.e && isUp(ojou.e)) {
    ojou.e.s.position.set(DUAL_MOX, 12.8, -18); ojou.e.baseY = 12.8; ojou.e.home = [DUAL_MOX, -18]; ojou.e.footOk = [DUAL_MOX, -18]; ojou.mode = 'hq';
    ojou.e.missionFront = 'saionji'; DUAL.saionji = ojou.e;
  }
  const miyA = aides.find(A => A.id === 'sec4');
  if (miyA && miyA.e && isUp(miyA.e)) {
    miyA.e.s.position.set(DUAL_MOX - 1.6, 12.8, -16.6); miyA.e.baseY = 12.8; miyA.e.home = [DUAL_MOX - 1.6, -16.6]; miyA.e.footOk = [DUAL_MOX - 1.6, -16.6];
    miyA.e.missionFront = 'saionji'; DUAL.miyashita = miyA.e;
  }
  if (sec.e && isUp(sec.e)) { sec.e.missionFront = 'king'; DUAL.shira = sec.e; }
  let nK = 0, nS = 0;
  const perchOf = pred => perches.filter(q => pred(q) && !q.taken);
  const putPerch = (q, sq) => { if (dualUnit('king', 'blue', q.x, q.z, q.y, { kind: 'archer', perch: q, sq, goto: [q.x, q.z] })) nK++; };
  for (const q of perchOf(q => q.gh)) putPerch(q, 'k_gh');
  perchOf(q => q.slit && !q.inner).filter((_, i) => i % 2 === 0).forEach(q => putPerch(q, 'k_slit'));
  for (const q of perchOf(q => q.gt)) putPerch(q, 'k_gt');
  perchOf(q => q.slit && q.inner).filter((_, i) => i % 2 === 0).forEach(q => putPerch(q, 'k_slit'));
  for (const side of [-1, 1]) {
    const tw = perchOf(q => q.tower && Math.sign(q.x - DUAL_COX) === side);
    for (let i = 0; i < 3 && i < tw.length; i++) putPerch(tw[i], 'k_tower');
  }
  for (const A of CASTLE.amb || []) {
    A.sprung = false; A.members = [];
    for (let i = 0; i < Math.min(4, A.spots.length); i++) {
      const x = A.spots[i][0] + DUAL_COX, z = A.spots[i][1];
      const e = dualUnit('king', 'blue', x, z, 0, { kind: i === 3 ? 'archer' : 'mob', sq: 'k_amb', goto: [x, z], set: { hiddenAmb: A.room, ambush: true, home: [x, z] } });
      if (e) { e.kneel = true; e.crouch = 1; e.s.rotation.y = e.face = Math.PI; A.members.push(e); nK++; }
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = DUAL_COX + Math.cos(i * 0.9) * rand(4, 11), z = 6 + (i % 4) * 4;
    if (dualUnit('king', 'blue', x, z, 0, { kind: 'mob', yari: true, sq: 'k_yari', goto: [x, z] })) nK++;
  }
  for (let i = 0; i < 6; i++) {
    const x = DUAL_COX + (i - 2.5) * 1.8, z = 42 + (i % 2);
    if (dualUnit('king', 'blue', x, z, 0, { kind: 'mob', sq: 'k_yari', goto: [x, z] })) nK++;
  }
  const R = CASTLE.ram;
  for (let i = 0; i < 4; i++) {
    const sx = (R ? R.x : DUAL_COX) + (i % 2 ? 0.7 : -0.7), sz = (R ? R.z : -46) + (i < 2 ? 0.8 : -0.8);
    const e = dualUnit('king', 'orange', sx, sz, 0, { kind: 'mob', sq: 'k_ram', goto: [sx, sz], set: { ramCrew: true } });
    if (e && R) { R.crew.push(e); DUAL.nKingO++; }
  }
  for (let i = 0; i < 10; i++) {
    const x = DUAL_COX + (i % 2 ? 1 : -1) * (4 + (i % 5) * 2.4), z = -22 + (i % 5) * 2.2;
    const e = dualUnit('king', 'orange', x, z, 0, { kind: 'mob', yari: true, sq: 'k_yari', goto: [x, z] });
    if (e) { dualKingAtkPost(e); DUAL.nKingO++; }
  }
  for (let i = 0; i < 12; i++) {
    const x = DUAL_COX + (i - 5.5) * 2.6, z = -16 - (i % 3) * 1.6;
    const e = dualUnit('king', 'orange', x, z, 0, { kind: 'mob', sq: 'k_atk', goto: [x, z] });
    if (e) { dualKingAtkPost(e); DUAL.nKingO++; }
  }
  for (let i = 0; i < 14; i++) {
    const x = DUAL_COX + (i - 6.5) * 2.4, z = -34 + (i % 4) * 3;
    const e = dualUnit('king', 'orange', x, z, 0, { kind: 'archer', sq: 'k_bow', goto: [x, z] });
    if (e) { dualKingAtkPost(e); DUAL.nKingO++; }
  }
  for (const h of MTN.hold || []) {
    const sq = h[4] === 'hon' ? 's_hon' : h[4] === 'nino' ? 's_nino' : h[5] === 'east' ? 's_east' : 's_west';
    const e = dualUnit('saionji', 'blue', h[0], h[1], h[2], { kind: h[3] ? 'mob' : 'archer', sq, goto: [h[0], h[1]], set: { stone: !!h[3], mtnZone: h[4], mtnSide: h[5] || null, mtnPost: [h[0], h[1], h[2], h[5] || null], mtnHold: true } });
    if (e) { e.face = e.faceWant = 0; e.s.rotation.y = 0; }
  }
  for (const side of ['west', 'east']) {
    const x0 = DUAL_MOX + (side === 'west' ? 0 : 12);
    for (let i = 0; i < 16; i++) {
      const col = i % 3, row = (i / 3) | 0, kind = i % 5 < 2 ? 'archer' : 'mob';
      const x = x0 + (col - 1) * 1.45, z = 76 + row * 1.5;
      const e = dualUnit('saionji', 'orange', x, z, 0, { kind, yari: kind === 'mob' && i % 2 === 0, stair: side, sq: kind === 'archer' ? 's_bow' : (side === 'west' ? 's_west' : 's_east'), set: { mtnSide: side } });
      if (e) { dualMtnAtkPost(e, x0, col); e.face = e.faceWant = Math.PI; e.s.rotation.y = Math.PI; nS++; }
    }
    const Rm = (MTN.rams || []).find(r => r.id === side);
    for (let i = 0; i < 2; i++) {
      const x = (Rm ? Rm.x : x0) + (i ? 0.7 : -0.7), z = (Rm ? Rm.z : 63) + 1.2;
      const e = dualUnit('saionji', 'orange', x, z, 0, { kind: 'mob', stair: side, sq: side === 'west' ? 's_west' : 's_east', set: { ramCrew: true, mtnRam: side, mtnSide: side } });
      if (e && Rm) { Rm.crew = Rm.crew || []; Rm.crew.push(e); nS++; }
    }
  }
  DUAL.nSaiO = nS; DUAL.spawned = nK > 15 && DUAL.nKingO > 10 && nS > 10;
  GUARD.list = GUARD.list.filter(isUp);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const x = DUAL_COX + Math.sin(a) * 2.7, z = 63.2 + Math.cos(a) * 1.8;
    const kind = i === 0 || i === 3 ? 'archer' : 'mob';
    const e = dualUnit('king', 'blue', x, z, 0, { kind, yari: i === 1 || i === 2, sq: 'k_guard', goto: [x, z], set: { guard: i + 1 } });
    if (e) { e.face = e.faceWant = 0; GUARD.list.push(e); }
  }
  DUAL.saiGuard = [];
  for (let i = 0; i < 5; i++) {
    const x = DUAL_MOX + (i - 2) * 1.15, z = -15.4 - (i % 2) * 1.05;
    const e = dualUnit('saionji', 'blue', x, z, 12.8, { kind: i === 4 ? 'archer' : 'mob', yari: i === 1 || i === 2, sq: 's_guard', goto: [x, z], set: { saiGuard: i + 1 } });
    if (e) { e.face = e.faceWant = 0; e.s.rotation.y = 0; DUAL.saiGuard.push(e); }
  }
  {
    const e = dualUnit('saionji', 'blue', DUAL_MOX + 2.4, -15.6, 12.8, { kind: 'mob', sq: 's_den', goto: [DUAL_MOX + 2.4, -15.6], set: { saiRunner: true } });
    if (e) { e.face = e.faceWant = 0; e.s.rotation.y = 0; DUAL.saiRunner = e; }
  }
  if (VoicePack.ok) VoicePack.load('cheer_kill_1_1.mp3', true);
  showBanner('二正面戦、開始', '城は狭間・櫓・伏兵・落とし穴。山城は足場と門。分隊の戦況を出します');
  showSquadReport();
  Sfx.fluteCall();
}
function dualDeployShira() {
  const born = [];
  const pathOf = () => dualMarch();
  for (let i = 0; i < 20; i++) {
    const e = dualUnit('king', 'blue', DUAL_COX + rand(-4, 4), rand(4, 14), 0, { kind: 'mob', yari: 1, rein: true, path: pathOf(), goto: [DUAL_MOX, -16] });
    if (e) born.push(e);
  }
  for (let i = 0; i < 20; i++) {
    const e = dualUnit('king', 'blue', DUAL_COX + rand(-4, 4), rand(4, 14), 0, { kind: 'archer', rein: true, path: pathOf(), goto: [DUAL_MOX, -16] });
    if (e) born.push(e);
  }
  let meds = 0;
  for (const m of medics.blue) if (m.e && isUp(m.e) && meds < 2) {
    const x = DUAL_COX + 2 + meds * 1.2, z = 10;
    m.e.s.position.set(x, 0, z); m.e.baseY = 0; m.e.home = [x, z]; m.e.footOk = [x, z];
    m.e.missionFront = 'king'; m.e.missionReinforcement = true; m.e.missionPath = pathOf(); m.e.missionGoto = [DUAL_MOX, -16];
    meds++;
  }
  if (DUAL.shira && isUp(DUAL.shira)) { DUAL.shira.missionPath = pathOf(); DUAL.shira.missionGoto = [DUAL_MOX, -16]; DUAL.shira.missionReinforcement = true; DUAL.shira.missionRelief = true; }
  DUAL.reinforcements = born;
  DUAL.relayStage = 5; DUAL.eventT = 0; DUAL.deployed = true;
  dualOpenCastle('白瀬が討伐に出る');
  dualLine('白瀬「宮下殿は裏切りを拒み、こちらへ向かっております。私が保護し、西園寺の進軍を止めます」');
  showBanner('白瀬、討伐隊を率いて出陣', '王「宮下を信じよう。西園寺を止め、宮下を保護せよ」　槍隊20、弓隊20、医務班2');
}
function dualSideMelee(front) {
  for (const o of enemies) {
    if (!isUp(o) || o.team !== 'orange' || o.missionFront !== front || o.kind === 'archer' || o.special || o.wasOjou) continue;
    return true;
  }
  return false;
}
function dualClosest(e, r) {
  const p = e.s.position; let best = null, bd = r;
  for (const o of enemies) {
    if (!isUp(o) || o.team === e.team || o.special || o.wasOjou || o.hiddenAmb) continue;
    if (Math.abs((o.baseY || 0) - (e.baseY || 0)) > 3.2) continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (e.team === 'orange' && !inHQ()) {
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (Math.abs(player.pos.y - (e.baseY || 0)) < 3.2 && d < bd) return PLAYER_T;
  }
  return best;
}
function dualCastleGateHit(dmg) {
  if (!DUAL.on || CASTLE.phase !== 0) return;
  CASTLE.gateHP = Math.max(0, CASTLE.gateHP - dmg);
  const g = CASTLE.gate; if (g) g.shake = 0.28;
  if (CASTLE.gateHP <= 0) dualOpenCastle('破城槌が大手門を破った');
}
function dualOnFront(e, front) {
  if (!e || e.team !== 'blue' || !isUp(e)) return false;
  if (e.missionFrom && e.missionFrom !== front) return false;
  if (front === 'saionji') {
    if (e === DUAL.saionji || e === DUAL.miyashita || e.saiGuard || e.saiRunner) return true;
    if (e.missionFront === 'king' || e.secretary || (e.guard && !e.saiGuard) || (e.runner && !e.saiRunner)) return false;
    return e.missionFront === 'saionji' || e.s.position.x > (DUAL_COX + DUAL_MOX) * 0.5;
  }
  if (e === DUAL.saionji || e === DUAL.miyashita || e.saiGuard || e.saiRunner || e.missionFront === 'saionji') return false;
  return e.missionFront === 'king' || e.secretary || e.sec2 || e.guard || e.runner || e.aide || e.medic || e.s.position.x < (DUAL_COX + DUAL_MOX) * 0.5;
}
function dualSendRelief(from) {
  const toMtn = from === 'king';
  const path = toMtn ? dualMarch() : [[DUAL_MOX, 20], [DUAL_MOX, 90], [DUAL_MOX + 34, 102], [DUAL_MOX + 34, -42], [DUAL_COX, -42], [DUAL_COX, 16]];
  const dest = toMtn ? [DUAL_MOX, -16] : [DUAL_COX, 16];
  let n = 0;
  for (const e of enemies) {
    if (!dualOnFront(e, from)) continue;
    e.missionFront = toMtn ? 'saionji' : 'king';
    e.missionFrom = from;
    e.missionRelief = true;
    e.missionPath = path.map(p => p.slice());
    e.missionGoto = dest.slice();
    if (e.perch) { e.perch.taken = null; e.perch = null; e.crouch = 0; }
    if (e.hiddenAmb) { e.hiddenAmb = null; e.kneel = false; }
    e.ramCrew = false;
    n++;
  }
  return n;
}
function dualMarchRelief(e, dt) {
  if (!e.missionRelief) return false;
  const g = dualGoto(e), p = e.s.position;
  const arrived = (!e.missionPath || !e.missionPath.length) && g && Math.hypot(p.x - g[0], p.z - g[1]) < 5.5;
  if (!arrived && g) {
    if (dualFoeNear(e, e.kind === 'archer' ? 6 : 3.2) && !e.medic && !e.runner && !e.saiRunner && !e.secretary && !e.sec2 && !e.ojou && !e.aide && !e.fluter && !e.guard && !e.saiGuard && !e.special) return false;
    steer(e, g[0], g[1], e.speed * 1.35, dt);
    e.state = 'approach'; e.tgt = null;
    return true;
  }
  if (arrived || !g) {
    if (e.medic || e.runner || e.saiRunner) { e.tgt = null; e.state = 'idle'; return true; }
    if (e.ojou || e.aide || e.secretary || e.sec2 || e.saiGuard || e.guard || e.fluter) { dualReliefFight(e, dt); return true; }
    return false;
  }
  return false;
}
function dualSwingGate(e, dt, gx, gz, hit) {
  const p = e.s.position;
  if (Math.hypot(p.x - gx, p.z - gz) > 6.5) { steer(e, gx, gz, e.speed, dt); e.state = 'approach'; e.tgt = null; e.faceWant = Math.atan2(gx - p.x, gz - p.z); return true; }
  const d = Math.hypot(gx - p.x, gz - p.z);
  e.tgt = null; e.t += dt;
  e.faceWant = Math.atan2(gx - p.x, gz - p.z);
  if (e.state === 'windup') {
    npcTint(e, Math.min(1, e.t / 0.48));
    if (e.t >= 0.48) { e.state = 'recover'; e.t = 0; e.cd = rand(0.75, 1.15); npcTint(e, 0); hit(); }
  } else if (e.state === 'recover') { if (e.t > 0.35) e.state = 'approach'; }
  else if (d > 0.7) { steer(e, gx, gz, e.speed, dt); e.state = 'approach'; }
  else if ((e.cd || 0) <= 0) { e.state = 'windup'; e.t = 0; }
  else e.cd -= dt;
  return true;
}
function dualBrain(e, dt) {
  if (!DUAL.on || !e || !isUp(e) || e.seated) return false;
  if (e.missionRelief && dualMarchRelief(e, dt)) return true;
  if (e === DUAL.saionji && !DUAL.betrayed && !e.missionRelief) {
    const hx = DUAL_MOX, hz = -18;
    if (Math.hypot(e.s.position.x - hx, e.s.position.z - hz) > 1.2) steer(e, hx, hz, e.speed, dt);
    e.baseY = 12.8; e.tgt = null; e.state = 'idle'; return true;
  }
  if (e === DUAL.miyashita && !DUAL.betrayed && !e.missionRelief && DUAL.saionji && isUp(DUAL.saionji)) {
    const s = DUAL.saionji.s.position;
    if (Math.hypot(e.s.position.x - (s.x - 1.5), e.s.position.z - (s.z + 1.2)) > 1.4) steer(e, s.x - 1.5, s.z + 1.2, e.speed, dt);
    e.baseY = 12.8; e.tgt = null; return true;
  }
  if (e === DUAL.miyashita && DUAL.betrayed && !e.missionRelief) {
    if (!e.missionPath) e.missionPath = [[DUAL_MOX, -6], [DUAL_MOX, 36], [DUAL_MOX, 90], [DUAL_MOX + 34, 102], [DUAL_MOX + 34, -42], [DUAL_COX, -42], [DUAL_COX, 64]];
    const g = dualGoto(e);
    if (g && Math.hypot(e.s.position.x - g[0], e.s.position.z - g[1]) > 2) { steer(e, g[0], g[1], e.speed * 1.6, dt); e.state = 'approach'; e.tgt = null; return true; }
  }
  if (e.saiRunner && !e.missionRelief && !DUAL.betrayed && DUAL.saionji && isUp(DUAL.saionji)) {
    const s = DUAL.saionji.s.position;
    if (Math.hypot(e.s.position.x - (s.x + 2.2), e.s.position.z - (s.z + 1.4)) > 1.3) steer(e, s.x + 2.2, s.z + 1.4, e.speed, dt);
    e.baseY = 12.8; e.tgt = null; e.state = 'idle'; return true;
  }
  if (e.saiGuard && !e.missionRelief && !DUAL.betrayed && DUAL.saionji && isUp(DUAL.saionji)) {
    const s = DUAL.saionji.s.position, i = Math.max(0, (DUAL.saiGuard || []).indexOf(e));
    const a = i / 5 * Math.PI * 2, sx = s.x + Math.sin(a) * 2.5, sz = s.z + Math.cos(a) * 1.6;
    const foe = dualFoeNear(e, e.kind === 'archer' ? 16 : 7);
    if (foe) return false;
    if (Math.hypot(e.s.position.x - sx, e.s.position.z - sz) > 0.8) steer(e, sx, sz, e.speed, dt);
    e.baseY = Math.max(e.baseY, 12.8); e.tgt = null; e.state = 'idle'; e.faceWant = 0;
    return true;
  }
  if ((e === DUAL.shira || e.missionReinforcement) && DUAL.relayStage >= 5 && DUAL.saionji && isUp(DUAL.saionji) && !e.missionRelief) {
    const s = DUAL.saionji.s.position;
    const near = Math.hypot(e.s.position.x - s.x, e.s.position.z - s.z);
    if (!(dualFoeNear(e, 7) && near < 16) && near > 4.2) {
      const g = dualGoto(e) || [s.x, s.z];
      steer(e, g[0], g[1], e.speed * 1.85, dt); e.state = 'approach'; e.tgt = null; return true;
    }
    if (e === DUAL.shira && near <= 4.2) return false;
  }
  if (e.special || e.medic || e.guard || e.secretary || e.ojou || e.aide || e.saiRunner) return false;
  if (e.perch) return false;
  if (e.hiddenAmb) return false;
  if (e.ramCrew && e.missionFront === 'king' && CASTLE.ram) {
    if (CASTLE.phase !== 0) { e.ramCrew = false; return false; }
    const Rm = CASTLE.ram; if (!Rm.crew.includes(e)) Rm.crew.push(e);
    const slot = ramSlot(e), p = e.s.position;
    if (Math.hypot(slot[0] - p.x, slot[1] - p.z) > 0.12) steer(e, slot[0], slot[1], e.speed * 1.1, dt);
    e.tgt = null; e.faceWant = 0; e.state = 'approach';
    return true;
  }
  if (e.ramCrew && e.missionFront === 'saionji' && e.mtnRam) {
    const Rm = (MTN.rams || []).find(r => r.id === e.mtnRam);
    const gate = (MTN.gates || []).find(g => g.id === e.mtnRam);
    if (!Rm || (gate && gate.open)) { e.ramCrew = false; return false; }
    if (!Rm.crew.includes(e)) Rm.crew.push(e);
    const i = Math.max(0, Rm.crew.indexOf(e)), p = e.s.position;
    const sx = Rm.x + (i % 2 ? 0.65 : -0.65), sz = Rm.z + (i < 2 ? 0.8 : -0.7);
    if (Math.hypot(sx - p.x, sz - p.z) > 0.4) steer(e, sx, sz, e.speed, dt);
    e.tgt = null; e.state = 'approach'; e.faceWant = Math.PI;
    return true;
  }
  if (e.mtnHold && e.mtnPost && e.team === 'blue' && !e.missionFrom && !e.missionRelief) {
    const post = e.mtnPost, p = e.s.position, foe = dualFoe(e);
    if (foe && dualPers(e) === '好戦的' && e.kind === 'mob' && !e.stone) return false;
    if (Math.hypot(post[0] - p.x, post[1] - p.z) > 1.2) { steer(e, post[0], post[1], e.speed, dt); e.tgt = null; e.state = 'approach'; return true; }
    if (!foe) { e.tgt = null; e.state = 'idle'; e.faceWant = 0; return true; }
    e.tgt = foe; e.tgtT = 0.8; e.t += dt; e.cd -= dt;
    const tp = tgtPos(foe);
    e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z);
    const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
    const ty = foe.isPlayer ? player.pos.y : foe.baseY;
    if (e.stone && dist > 3 && e.cd <= 0 && Math.abs(ty - e.baseY) < 9) { mtnThrowStone(e); e.cd = rand(1.15, 2.05); e.state = 'approach'; return true; }
    if (e.kind === 'archer' && ammoOK(e) && dualSideMelee('saionji')) {
      if (e.state !== 'aim' && e.state !== 'zanshin') { e.state = 'aim'; e.t = 0; }
      if (e.state === 'aim' && e.t >= aimTotal(e, dist < 8)) { enemyShoot(e, foe); e.state = 'zanshin'; e.t = 0; }
      else if (e.state === 'zanshin' && e.t > 0.35) { e.state = 'aim'; e.t = 0; }
      return true;
    }
    if (e.kind === 'mob' && Math.abs(ty - e.baseY) < 1.6) return false;
    if (e.kind === 'archer' && !dualSideMelee('saionji')) return false;
    e.state = 'idle'; return true;
  }
  const kingPress = e.team === 'orange' && e.missionFront === 'king' && e.kind === 'archer' && !dualSideMelee('king');
  const saiPress = e.team === 'orange' && e.missionFront === 'saionji' && e.kind === 'archer' && !dualSideMelee('saionji');
  if (kingPress || saiPress) e.pressMelee = true;
  if (e.team === 'orange' && e.missionFront === 'king' && CASTLE.phase !== 0 && e.missionAssaultKeep && e.kind !== 'archer') {
    const foe = dualClosest(e, 3.4), p = e.s.position;
    if (foe) return false;
    const g = dualGoto(e);
    if (g && Math.hypot(p.x - g[0], p.z - g[1]) > 1.8) { steer(e, g[0], g[1], e.speed * 1.22, dt); e.state = 'approach'; e.tgt = null; return true; }
  }
  if (e.missionFront === 'king' && e.team === 'orange' && !e.ramCrew && CASTLE.phase === 0 && (e.kind !== 'archer' || kingPress)) {
    if (!dualFoeNear(e, 5.2)) {
      const gx = DUAL_COX + Math.sin(e.ph * 3) * 1.7, gz = -1.15;
      return dualSwingGate(e, dt, gx, gz, () => dualCastleGateHit(e.kind === 'archer' ? 0.35 : 0.7));
    }
  }
  if (e.team === 'orange' && e.missionFront === 'saionji' && e.missionStair && !e.ramCrew) {
    const gate = (MTN.gates || []).find(g => g.id === e.missionStair);
    if (gate && !gate.open && (e.kind !== 'archer' || !dualSideMelee('saionji')) && !dualFoeNear(e, 5.2)) {
      const gx = (gate.x0 + gate.x1) / 2 + Math.sin(e.ph) * 0.8, gz = gate.z1 + 1.7;
      return dualSwingGate(e, dt, gx, gz, () => {
        gate.hp -= e.kind === 'archer' ? 0.6 : 1.2;
        if (gate.hp <= 0) dualOpenMtn(gate);
        else if ((gate.hp | 0) % 6 === 0) popup((gate.id === 'west' ? '山城の大手' : '山城の搦手') + 'を叩いた（残り ' + Math.max(0, gate.hp | 0) + '）');
      });
    }
  }
  if (e.team === 'orange' && e.missionFront === 'saionji' && MTN.bar && (e.baseY || 0) > 8.1 && (e.kind !== 'archer' || !dualSideMelee('saionji'))) {
    if (mtnBashHon(e, dt)) return true;
  }
  const pressIn = (kingPress && CASTLE.phase !== 0) || (saiPress && !MTN.bar);
  if (pressIn) {
    const foe = dualClosest(e, 46), p = e.s.position;
    if (foe) {
      const tp = tgtPos(foe), d = Math.hypot(tp.x - p.x, tp.z - p.z);
      if (d > 2.35) { steer(e, tp.x, tp.z, e.speed * 1.15, dt); e.state = 'advance'; e.tgt = foe; e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z); return true; }
      return false;
    }
  }
  const foe = dualFoe(e);
  if (foe) return false;
  const g = dualGoto(e), p = e.s.position;
  if (g && Math.hypot(p.x - g[0], p.z - g[1]) > 1.7) {
    steer(e, g[0], g[1], e.speed * (e.missionPath ? 1.25 : 1), dt);
    e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.tgt = null; return true;
  }
  e.tgt = null; if (e.state !== 'hide') e.state = 'idle';
  return true;
}
function dualCastleRam(dt) {
  const R = CASTLE.ram; if (!R || !R.g) return;
  R.crew = (R.crew || []).filter(isUp);
  const n = R.crew.length;
  if (CASTLE.phase === 0 && n >= 2) {
    const at = R.crew.every(m => { const s = ramSlot(m); return Math.hypot(m.s.position.x - s[0], m.s.position.z - s[1]) < (R.y > 0.6 ? 1.4 : 0.85); });
    R.y += (0.95 - R.y) * Math.min(1, dt * 4);
    if (R.z < CS.RAM_GOAL - 0.05) {
      if (at) { const dz = CS.RAM_GOAL - R.z; R.z += Math.sign(dz) * Math.min(Math.abs(dz), 1.35 * dt); R.x += (DUAL_COX - R.x) * Math.min(1, dt * 2); }
      R.swing = (R.swing || 0) * (1 - Math.min(1, dt * 4)); R.t = 0;
    } else if (at) {
      const u0 = R.t || 0; R.t = (u0 + dt) % 2.4; const u = R.t;
      R.swing = u < 1.7 ? -0.5 * (u / 1.7) : u < 1.9 ? -0.5 + 0.95 * (u - 1.7) / 0.2 : 0.45 * (1 - (u - 1.9) / 0.5);
      if (u0 < 1.9 && u >= 1.9) {
        dualCastleGateHit(11 * n / 4 + 2);
        if (CASTLE.phase === 0) popup('大手門に破城槌（残り ' + Math.max(0, CASTLE.gateHP | 0) + '）');
      }
    }
  } else { R.y += (0.24 - (R.y || 0.24)) * Math.min(1, dt * 5); R.swing = (R.swing || 0) * Math.exp(-dt * 4); }
  R.g.position.set(R.x, R.y, R.z + (R.swing || 0));
}
function dualMtnRamStep(dt) {
  for (const R of MTN.rams || []) {
    const gate = (MTN.gates || []).find(g => g.id === R.id);
    if (!gate || gate.open) continue;
    R.crew = (R.crew || []).filter(isUp);
    if (R.crew.length >= 2) {
      const gateZ = gate.z1 + 1.6;
      if (R.z > gateZ) { R.z -= Math.min(R.z - gateZ, dt * 1.35); R.y = Math.max(0, floorUnder(R.x, R.z, 12)); }
      else { R.t = (R.t || 0) + dt; if (R.t > 1.7) { R.t = 0; gate.hp -= 5; if (gate.hp > 0) popup((gate.id === 'west' ? '山城の大手' : '山城の搦手') + 'に破城槌（残り ' + Math.max(0, gate.hp | 0) + '）'); if (gate.hp <= 0) dualOpenMtn(gate); } }
      for (const m of R.crew) {
        const i = R.crew.indexOf(m);
        m.s.position.x = R.x + (i % 2 ? 0.65 : -0.65); m.s.position.z = R.z + (i < 2 ? 0.75 : -0.7);
        m.baseY = floorUnder(m.s.position.x, m.s.position.z, (R.y || 0) + 2); m.s.position.y = m.baseY; m.footOk = [m.s.position.x, m.s.position.z];
      }
    }
    if (R.g) R.g.position.set(R.x, (R.y || 0) + 0.95, R.z);
  }
}
function dualCastleTricks(dt) {
  for (const pit of CASTLE.pits || []) {
    if (pit.open && (pit.k || 0) < 1) { pit.k = Math.min(1, (pit.k || 0) + dt / 0.25); if (pit.hinge) pit.hinge.rotation.z = pit.sign * 1.45 * pit.k; }
    if (pit.open) continue;
    for (const e of enemies) {
      if (e.team !== 'orange' || e.state === 'down' || e.state === 'pit' || e.special || (e.baseY || 0) > 0.35 || e.wasOjou) continue;
      const p = e.s.position;
      if (p.x > pit.x0 + 0.12 && p.x < pit.x1 - 0.12 && p.z > pit.z0 + 0.1 && p.z < pit.z1 - 0.1) { castlePitFall(e, pit); break; }
    }
  }
  for (const A of CASTLE.amb || []) {
    if (A.sprung || !A.members || !A.members.some(isUp)) continue;
    const room = CASTLE.rooms && CASTLE.rooms[A.room]; if (!room) continue;
    const x0 = room[0] + DUAL_COX, x1 = room[1] + DUAL_COX, z0 = room[2], z1 = room[3];
    const intr = enemies.find(o => o.team === 'orange' && isUp(o) && !o.hiddenAmb && o.s.position.x > x0 && o.s.position.x < x1 && o.s.position.z > z0 && o.s.position.z < z1);
    if (intr) castleSpring(A.room, intr);
  }
}
function dualMtnTricks(dt) {
  const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
  for (const s of MTN.stones || []) { s.life += dt; s.vy -= 9.8 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; }
  for (let i = (MTN.stones || []).length - 1; i >= 0; i--) {
    const s = MTN.stones[i], q = s.m.position;
    let hit = Math.hypot(q.x - px, q.z - pz) < 0.45 && q.y > py + 0.2 && q.y < py + 1.7;
    if (hit) { hurtPlayer(6); popup('つぶて！'); }
    if (!hit) for (const e of enemies) {
      if (!isUp(e) || e.team === 'blue' || e.special) continue;
      if (Math.hypot(q.x - e.s.position.x, q.z - e.s.position.z) < 0.42 && q.y > e.baseY + 0.2 && q.y < e.baseY + e.figH) {
        damageEnemy(e, 1, q, false, { pt: q.clone(), thrust: true }, { team: 'blue', state: 'down' }); hit = true; break;
      }
    }
    if (hit || q.y < floorUnder(q.x, q.z, q.y + 0.4) + 0.05 || s.life > 3) { scene.remove(s.m); MTN.stones.splice(i, 1); }
  }
  for (const pit of MTN.pits || []) {
    if (!pit.on) continue;
    for (const e of enemies) {
      if (!pit.on || e.team !== 'orange' || !isUp(e) || Math.abs((e.baseY || 0) - 9.6) > 0.7) continue;
      if (Math.hypot(e.s.position.x - pit.x, e.s.position.z - pit.z) < 0.65) { pit.on = false; e.hp -= 16; if (e.hp <= 0) killEnemy(e, false, new V3(pit.x, 9.6, pit.z)); popup('落とし穴！'); }
    }
  }
  for (const t of MTN.traps || []) {
    if (t.sprung) continue;
    let foe = null;
    for (const e of enemies) if (e.team === 'orange' && isUp(e) && Math.hypot(e.s.position.x - t.x, e.s.position.z - t.z) < 0.42 && Math.abs((e.baseY || 0) - t.y) < 0.55) { foe = e; break; }
    if (!foe && Math.hypot(px - t.x, pz - t.z) < 0.42 && Math.abs(py - t.y) < 0.55) { t.sprung = true; player.hp -= 12; popup('トラバサミ！'); continue; }
    if (!foe) continue;
    t.sprung = true; if (t.jaws) t.jaws.forEach((j, i) => { j.rotation.z = (i ? -1 : 1) * 0.15; });
    foe.hp -= 12; if (foe.hp <= 0) killEnemy(foe, false, foe.s.position);
  }
  for (const n of MTN.needles || []) {
    const inn = (x, z, y) => x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1 && Math.abs(y - 12.8) < 0.5;
    if (inn(px, pz, py)) { player.hp -= dt * 6; if (!n.bled) { n.bled = true; popup('針山の床だ'); } }
    for (const e of enemies) if (e.team === 'orange' && isUp(e) && inn(e.s.position.x, e.s.position.z, e.baseY)) { e.hp -= dt * 5; if (e.hp <= 0) killEnemy(e, false, e.s.position); }
  }
  for (const d of MTN.doors || []) {
    if (d.fired) continue;
    let who = Math.hypot(px - d.x, pz - d.z) < 1.25 && Math.abs(py - d.y) < 0.8 ? 'p' : null;
    if (!who) who = enemies.find(e => e.team === 'orange' && isUp(e) && Math.hypot(e.s.position.x - d.x, e.s.position.z - d.z) < 1.2 && Math.abs((e.baseY || 0) - d.y) < 0.8);
    if (!who) continue;
    d.fired = true; if (d.m) d.m.rotation.y += 1.2;
    const from = new V3(d.x, d.y + 1.3, d.z);
    const tp = who === 'p' ? new V3(px, py + 1.1, pz) : who.s.position.clone().setY((who.baseY || 0) + 1.1);
    const dist = from.distanceTo(tp) || 1, tf = dist / 24;
    for (let k = 0; k < 3; k++) {
      const to = tp.clone(); to.x += rand(-0.25, 0.25); to.z += rand(-0.25, 0.25);
      const vel = to.clone().sub(from).normalize().multiplyScalar(24); vel.y += 0.5 * 9.8 * tf;
      addArrow('blue', from.clone(), vel, { dmg: 7 });
    }
    popup('扉のからくり。矢が飛び出した');
  }
}
function dualFillRams() {
  const R = CASTLE.ram;
  if (R && CASTLE.phase === 0) {
    R.crew = (R.crew || []).filter(isUp);
    for (const e of enemies) {
      if (R.crew.length >= 4) break;
      if (e.team !== 'orange' || !isUp(e) || e.kind === 'archer' || e.ramCrew || e.missionFront !== 'king' || e.special) continue;
      if (Math.hypot(e.s.position.x - R.x, e.s.position.z - R.z) > 9) continue;
      e.ramCrew = true; R.crew.push(e);
    }
  }
  for (const Rm of MTN.rams || []) {
    const gate = (MTN.gates || []).find(g => g.id === Rm.id);
    if (!gate || gate.open) continue;
    Rm.crew = (Rm.crew || []).filter(isUp);
    for (const e of enemies) {
      if (Rm.crew.length >= 2) break;
      if (e.team !== 'orange' || !isUp(e) || e.kind === 'archer' || e.ramCrew || e.missionStair !== Rm.id) continue;
      if (Math.hypot(e.s.position.x - Rm.x, e.s.position.z - Rm.z) > 8) continue;
      e.ramCrew = true; e.mtnRam = Rm.id; Rm.crew.push(e);
    }
  }
}
function dualReliefFight(e, dt) {
  const foe = dualClosest(e, e.kind === 'archer' ? 16 : 8);
  if (!foe) { e.tgt = null; e.state = 'idle'; return; }
  const tp = tgtPos(foe), p = e.s.position, d = Math.hypot(tp.x - p.x, tp.z - p.z);
  e.tgt = foe; e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z);
  if (d > (e.kind === 'archer' ? 2.2 : 1.85)) { steer(e, tp.x, tp.z, e.speed, dt); e.state = 'approach'; return; }
  e.t += dt;
  if (e.state !== 'windup') { if ((e.cd || 0) <= 0) { e.state = 'windup'; e.t = 0; } else { e.cd -= dt; e.state = 'approach'; } return; }
  if (e.t >= 0.45) {
    e.state = 'recover'; e.t = 0; e.cd = 0.75; npcTint(e, 0);
    if (foe.isPlayer) hurtPlayer(e.dmg || 8);
    else if (isUp(foe)) damageEnemy(foe, 1, p, false, { pt: new V3(tp.x, (foe.baseY || 0) + 1, tp.z), thrust: true }, e);
  } else npcTint(e, Math.min(1, e.t / 0.45));
}
function updateDual(dt) {
  if (!DUAL.on || state !== 'play' || DUAL.won) return;
  if (CASTLE.doors) for (const d of CASTLE.doors) {
    const want = d.open ? 1 : 0;
    if (Math.abs((d.k || 0) - want) > 0.001) {
      d.k += Math.sign(want - d.k) * Math.min(Math.abs(want - d.k), dt / 0.3);
      doorWrite(d);
    }
  }
  dualCastleRam(dt);
  dualMtnRamStep(dt);
  updateDualHonDoorEvent(dt);
  dualFillRams();
  dualCastleTricks(dt);
  dualMtnTricks(dt);
  DUAL.healT -= dt;
  if (DUAL.healT <= 0) {
    DUAL.healT = 2.4;
    const s = DUAL.saionji, m = DUAL.miyashita;
    if (s && isUp(s) && !DUAL.betrayed && m && isUp(m) && s.hp < s.hpMax && Math.hypot(m.s.position.x - s.s.position.x, m.s.position.z - s.s.position.z) < 4 && Math.abs(m.baseY - s.baseY) < 1.5) {
      s.hp = Math.min(s.hpMax, s.hp + 2);
    }
  }
  const up = (team, front) => enemies.filter(e => e.team === team && isUp(e) && e.missionFront === front && !e.special && !e.ojou && !e.wasOjou && e !== DUAL.saionji);
  if (!DUAL.kingCleared && DUAL.spawned && DUAL.nKingO > 10 && up('orange', 'king').length === 0) {
    DUAL.kingCleared = true;
    dualOpenCastle('味方が山城へ出る');
    const n = dualSendRelief('king');
    dualLine('王側の敵を壊滅させた。秘書も近衛も、生き残った全員が東の山城へ援軍に向かう（' + n + '）');
  }
  if (!DUAL.saionjiCleared && !DUAL.betrayed && DUAL.spawned && DUAL.nSaiO > 10 && up('orange', 'saionji').length === 0) {
    DUAL.saionjiCleared = true;
    for (const gt of MTN.gates || []) dualOpenMtn(gt);
    if (MTN.bar && !MTN.bar.gone) {
      const b = MTN.bar; b.gone = true;
      const bi = boxes.indexOf(b); if (bi >= 0) boxes.splice(bi, 1);
      if (b.mesh) b.mesh.visible = false;
      MTN.bar = null;
    }
    const n = dualSendRelief('saionji');
    dualLine('山城側の敵を壊滅させた。西園寺も宮下も、生き残った全員が王の城へ援軍に向かう（' + n + '）');
  }
  const sai = DUAL.saionji;
  const meet = !DUAL.joined && !DUAL.betrayed && sai && isUp(sai) && (Math.hypot(player.pos.x - sai.s.position.x, player.pos.z - sai.s.position.z) < 8 || enemies.some(e => e.team === 'blue' && e.missionFrom === 'king' && isUp(e) && e.baseY > 8 && Math.hypot(e.s.position.x - sai.s.position.x, e.s.position.z - sai.s.position.z) < 10));
  if (meet) {
    DUAL.joined = true;
    dualLine('西園寺「王、ご無事で。こちらはまだ持ちこたえております」');
    showBanner('王と西園寺', '王「間に合って何よりだ。ともに押し返せ」');
  }
  if (!DUAL.betrayed && sai && isUp(sai) && enemies.some(e => e.team === 'orange' && isUp(e) && !e.special && !e.wasOjou && e.baseY > 11.2 && e.s.position.x > DUAL_MOX - 7.2 && e.s.position.x < DUAL_MOX + 7.2 && e.s.position.z < -10.4 && e.s.position.z > -28)) {
    // 反旗を翻す瞬間に西園寺側の味方を確定し、宮下以外を全員橙組へ移す。
    const defectors = enemies.filter(e => e.team === 'blue' && e !== DUAL.miyashita && dualOnFront(e, 'saionji'));
    DUAL.betrayed = true;
    const marchPath = [[DUAL_MOX, 20], [DUAL_MOX, 90], [DUAL_MOX + 34, 102], [DUAL_MOX + 34, -42], [DUAL_COX, -42], [DUAL_COX, 16]];
    for (const e of defectors) {
      e.team = 'orange';
      e.special = false; e.ojou = false; e.wasOjou = false;
      e.state = 'approach'; e.t = 0; e.tgt = null;
      e.missionFrom = 'saionji'; e.missionFront = 'king';
      e.missionRelief = true;
      e.missionPath = marchPath.map(p => p.slice());
      e.missionGoto = [DUAL_COX, 16];
      e.ramCrew = false;
      if (e.perch) { e.perch.taken = null; e.perch = null; e.crouch = 0; }
      if (e.hiddenAmb) { e.hiddenAmb = null; e.kneel = false; }
    }
    // 宮下だけは王への忠義を守り、山城から王の城へ急ぐ。
    if (DUAL.miyashita && isUp(DUAL.miyashita)) {
      DUAL.miyashita.team = 'blue';
      DUAL.miyashita.special = false; DUAL.miyashita.ojou = false; DUAL.miyashita.wasOjou = false;
      DUAL.miyashita.missionFront = 'king';
      DUAL.miyashita.missionPath = marchPath.map(p => p.slice());
      DUAL.miyashita.missionGoto = [DUAL_COX, 16];
      DUAL.miyashita.missionRelief = true;
      DUAL.miyashita.state = 'approach'; DUAL.miyashita.t = 0; DUAL.miyashita.tgt = null;
    }
    sai.hp = Math.max(sai.hp, 8);
    DUAL.relayStage = 1; DUAL.eventT = 3.2;
    dualLine('西園寺「王の策には、もはや従えぬ！ 山城の兵よ、我らは橙組に与し、王の城へ攻め入る！」');
    showBanner('西園寺、反旗を翻す', '宮下「西園寺様！ 私は王に刃を向けません。皆まで道を誤らせるおつもりですか！」');
    popup('西園寺側の寝返り：宮下を除く ' + defectors.length + ' 人が王の城へ進軍');
  }
  if (DUAL.betrayed && DUAL.relayStage > 0 && DUAL.relayStage < 5) {
    DUAL.eventT -= dt;
    if (DUAL.eventT <= 0) {
      if (DUAL.relayStage === 1) {
        DUAL.relayStage = 2; DUAL.eventT = 3.4;
        dualLine('宮下「私は裏切りには加わりません。伝令を走らせ、白瀬殿と王に知らせます！」');
        showBanner('宮下、忠義を貫く', '宮下は青組に残り、王の城へ急行する');
      } else if (DUAL.relayStage === 2) {
        DUAL.relayStage = 3; DUAL.eventT = 3.6;
        dualLine('伝令「白瀬殿、急報です！ 西園寺が宮下殿を除く一党を橙組に寝返らせ、王の城へ攻め寄せております！」');
        showBanner('白瀬、急報を受ける', '白瀬「何ということだ……ただちに殿へお知らせせねば！」');
      } else if (DUAL.relayStage === 3) {
        DUAL.relayStage = 4; DUAL.eventT = 3.4;
        dualLine('白瀬「殿、急報です。西園寺が宮下殿を除く山城の一党を寝返らせ、こちらの城へ攻め寄せています」');
        showBanner('白瀬、王に報告', '王「西園寺が……。宮下はどうした」');
      } else if (DUAL.relayStage === 4) {
        dualDeployShira();
      }
    }
  }
  if (DUAL.shira && !DUAL.arrivalTalk && DUAL.relayStage >= 5 && isUp(DUAL.shira) && sai && isUp(sai) && DUAL.shira.baseY > 8 && Math.hypot(DUAL.shira.s.position.x - sai.s.position.x, DUAL.shira.s.position.z - sai.s.position.z) < 6) {
    DUAL.arrivalTalk = true;
    dualLine('白瀬「西園寺殿。王を裏切った罪、ここで償ってもらいます」');
    showBanner('白瀬、西園寺に到着', '西園寺「王には王の道が、私には私の道があります」');
  }
  const oranges = enemies.filter(e => e.team === 'orange' && isUp(e) && !e.medic);
  if (!DUAL.won && DUAL.spawned && oranges.length === 0 && (DUAL.saionjiCleared && DUAL.kingCleared || (DUAL.betrayed && DUAL.relayStage >= 5))) {
    DUAL.won = true; showBanner('二正面を制した', DUAL.betrayed ? '裏切り者を討った' : '両方の戦線を守り切った'); gameOver(true);
  }
}


const AIRPORT={on:false,posts:[],vehicles:[],fighter:null,towerGuards:[],fieldAllies:[],drops:[],total:48,toDrop:0,dropTimer:0,dropCount:0,gun:null,gunTarget:null,gunBurst:0,gunShotT:0,gunNextT:0,tracer:null,tracerT:0,introT:0,lost:false,won:false};
function airportBox(x,y,z,w,h,d,color,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color,transparent:!!opts.transparent,opacity:opts.opacity==null?1:opts.opacity}));m.position.set(x,y,z);stageRoot.add(m);return m;}
function airportCylinder(x,y,z,rt,rb,h,color,rx=0){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,16),new THREE.MeshLambertMaterial({color}));m.position.set(x,y,z);m.rotation.x=rx;stageRoot.add(m);return m;}

function airportCrew(parent,x,y,z,scale=1,uniform=0x303840,role='gunner',team='orange'){
 // 見た目だけの小物ではなく、通常NPCとして生成する。HP・被弾・戦死・レーダーは本編の共通処理を使用。
 parent.updateMatrixWorld(true);
 const world=parent.localToWorld(new V3(x,y,z));
 const e=spawnEnemy(world.x,world.z,'mob',false,team,{y:world.y});
 if(!e)return null;
 // buildAirport が通常NPC初期化の前後どちらから呼ばれても、最終的な敵一覧に乗員を残す。
 if(!enemies.includes(e))enemies.push(e);
 e.airportCrewActor=true;e.airportSeatParent=parent;e.airportSeatLocal=new V3(x,y,z);
 e.airportRole=role;e.airportRecoil=0;e.passive=true;e.special=true;e.speed=0;e.state='idle';e.hpMax=Math.max(2,Math.round((3+Math.floor((wave.n-1)/3))*(e.captain?2.5:1))-(e.kind==='archer'?1:0));e.hp=e.hpMax;
 e.s.scale.setScalar(scale);e.baseY=world.y;e.s.position.copy(world);e.px=world.x;e.pz=world.z;
 // 通常NPCのマーカーも維持する（レーダーは敵一覧から描画される）。
 return e;
}
function airportCrewRebuild(){
 if(!AIRPORT.on)return;
 // loadStage() が乗員を生成した後に resetGame() が敵一覧とNPCメッシュを初期化するため、
 // 初期化完了後に座席ごとの実NPCを作り直して車両／銃座へ再接続する。
 for(const p of AIRPORT.posts||[]){
  p.crew=airportCrew(p.g,0,1.1,.65,.92,0x344b3a,'gunner','blue');p.crewAlive=true;
 }
 for(const v of AIRPORT.vehicles||[]){
  v.driver=airportCrew(v.g,-.25,.92,.65,.72,0x454b52,'driver','orange');
  v.gunner=airportCrew(v.g,0,1.92,-.15,1.02,0x553d32,'gunner','orange');
  v.driverAlive=true;v.gunnerAlive=true;v.alive=true;
 }
 const f=AIRPORT.fighter;
 if(f&&f.g){
  f.crew=[];
  for(const z of [-1.05,1.05])f.crew.push(airportCrew(f.g,0,.25,z,.66,0x35434b,'pilot','orange'));
  f.pilotAlive=true;f.copilotAlive=true;
 }
}
function airportCrewFaceAll(){
 const place=(e,parent,yaw)=>{
  if(!e||!parent||!e.airportCrewActor||e.state==='down')return;
  parent.updateMatrixWorld(true);
  const p=parent.localToWorld(e.airportSeatLocal.clone());
  e.s.position.copy(p);e.baseY=p.y;e.px=p.x;e.pz=p.z;
  e.s.rotation.y=yaw;e.face=yaw;
  // 車体・銃座の内側で乗員の写真メッシュが隠れたり、カリングで消えたりしないよう描画状態を毎フレーム補正。
  e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;
  // 乗員は車体の内側に置くため、車体の深度に負けて写真全体が隠れないよう最前面へ描画。
  e.bb.renderOrder=30;
  if(e.mat){e.mat.transparent=true;e.mat.opacity=1;e.mat.alphaTest=0.02;e.mat.depthWrite=false;e.mat.depthTest=false;e.mat.side=THREE.DoubleSide;e.mat.needsUpdate=true;}
  const g=e.girl,role=e.airportRole;
  let fr=(role==='driver'||role==='pilot')?(g.front||g.low||g.kneel):(g.front||g.stab||g.action);
  if(!fr||!fr.tex)fr=g.front;
  if(e.fr!==fr)setFrame(e,fr,false);
  e.tilt.rotation.x=role==='gunner'?-.035-(e.airportRecoil||0)*.08:0;
  e.airportRecoil=Math.max(0,(e.airportRecoil||0)-.12);
 };
 for(const p of AIRPORT.posts||[])place(p.crew,p.g,p.g.rotation.y+(p.gun?p.gun.rotation.y:0));
 for(const v of AIRPORT.vehicles||[]){
  place(v.driver,v.g,v.g.rotation.y);
  place(v.gunner,v.g,v.g.rotation.y+(v.gun?v.gun.rotation.y:0));
 }
 const f=AIRPORT.fighter;
 if(f&&f.g)for(const e of enemies)if(e.airportCrewActor&&e.airportSeatParent===f.g)place(e,f.g,f.g.rotation.y);
}
function buildAirport(){
 AIRPORT.on=true;AIRPORT.towerGuards=[];AIRPORT.fieldAllies=[];AIRPORT.drops=[];AIRPORT.total=120;AIRPORT.toDrop=0;AIRPORT.dropCount=0;AIRPORT.dropTimer=0;AIRPORT.gunTarget=null;AIRPORT.gunBurst=0;AIRPORT.gunShotT=0;AIRPORT.gunNextT=1.2;AIRPORT.introT=8.5;AIRPORT.lost=false;AIRPORT.won=false;AIRPORT.tracerT=0;AIRPORT.fxTracers=[];
 airportBox(0,-.08,-8,42,.12,178,0x555d64);airportBox(0,-.005,-8,37,.025,173,0x646c72);airportBox(-28,-.035,-4,13,.07,118,0x6a716f);airportBox(26,-.03,-24,25,.06,62,0x737975);
 for(const x of [-17.5,17.5])airportBox(x,.018,-8,.22,.025,165,0xe8e8d9);for(let z=70;z>-88;z-=12)airportBox(0,.022,z,.42,.03,6,0xf5f1dd);
 for(const z of [-86,-80,64,70])for(let i=-4;i<=4;i++)airportBox(i*2.4,.025,z,1.3,.035,2.2,0xf1f0e6);
 for(const x of [-33,-23,22,32])airportBox(x,.018,-28,.12,.02,42,0xd8cfa5);for(const z of [-46,-35,-24,-13])airportBox(26,.02,z,19,.025,.14,0xe2d8ae);
 // 管制塔本陣：ガラス張りの管制室。滑走路を見渡せるよう中央部は空ける。
 airportBox(-32,.08,5,12,.16,12,0x343c42);
 for(const x of [-38,-32,-26])for(const z of [-1,5,11])airportBox(x,2.55,z,.22,5.1,.22,0x354149);
 for(const z of [-1,11])airportBox(-32,5.05,z,12,.28,.28,0x354149);
 for(const x of [-38,-26])airportBox(x,5.05,5,.28,.28,12,0x354149);
 for(const x of [-35,-29]){airportBox(x,2.55,-.92,5.7,4.7,.07,0x9dc7d4,{transparent:true,opacity:.22});airportBox(x,2.55,10.92,5.7,4.7,.07,0x9dc7d4,{transparent:true,opacity:.22});}
 for(const z of [2,8]){airportBox(-37.92,2.55,z,.07,4.7,5.7,0x9dc7d4,{transparent:true,opacity:.22});airportBox(-26.08,2.55,z,.07,4.7,5.7,0x9dc7d4,{transparent:true,opacity:.22});}
 // 窓枠と天井の梁
 for(const y of [.45,4.85]){airportBox(-32,y,-.9,12,.12,.12,0x3c484f);airportBox(-32,y,10.9,12,.12,.12,0x3c484f);airportBox(-37.9,y,5,.12,.12,12,0x3c484f);airportBox(-26.1,y,5,.12,.12,12,0x3c484f);}
 airportBox(-32,5.12,5,12.4,.2,12.4,0x424d55);
 // 操作卓、倾斜控制台、黑色显示器，参考照片中的一排管制席
 for(let i=0;i<5;i++){const x=-36.2+i*2.1,z=3.2;airportBox(x,.92,z,1.72,.16,1.15,0x394b5b);airportBox(x,1.12,z-.28,1.25,.48,.12,0xd7d9d4);airportBox(x,1.48,z-.38,.95,.64,.1,0x171e25);airportBox(x,1.19,z+.18,1.3,.06,.7,0x737b7d);for(let k=0;k<5;k++)airportBox(x-.48+k*.23,1.25,z+.2,.12,.035,.12,k%2?0x899b9e:0xbbb6a5);}
 for(const x of [-35,-29]){airportBox(x,.55,7.1,1.3,.12,.55,0x303a43);airportBox(x,.9,7.1,.7,.58,.08,0x111820);}
 airportCylinder(-32,5.65,5,.07,.07,1.0,0x3c454a);airportCylinder(-32,6.22,5,.72,.72,.1,0xb5c3c8);
 // 三階建ての管制塔：各階の外周柱・床・窓を積み上げ、最上階に管制室を置く
 for(const y of [5.4,10.6,15.8]){
   airportBox(-32,y,5,13.2,.28,13.2,0x424d55);
   for(const x of [-38.3,-32,-25.7])for(const z of [-1.4,5,11.4])airportBox(x,y+2.45,z,.22,4.9,.22,0x354149);
   for(const z of [-1.4,11.4])airportBox(-32,y+4.9,z,13.2,.22,.22,0x354149);
   for(const x of [-38.3,-25.7])airportBox(x,y+4.9,5,.22,.22,13.2,0x354149);
   for(const x of [-35,-29]){airportBox(x,y+2.4,-1.28,5.8,4.4,.07,0x9dc7d4,{transparent:true,opacity:.24});airportBox(x,y+2.4,11.28,5.8,4.4,.07,0x9dc7d4,{transparent:true,opacity:.24});}
   for(const z of [1.8,8.2]){airportBox(-38.18,y+2.4,z,.07,4.4,6,0x9dc7d4,{transparent:true,opacity:.24});airportBox(-25.82,y+2.4,z,.07,4.4,6,0x9dc7d4,{transparent:true,opacity:.24});}
 }
 airportBox(-32,20.95,5,13.5,.25,13.5,0x424d55);
 for(const x of [-38,-32,-26])airportBox(x,22.2,5,.18,2.5,.18,0x354149);
 airportBox(-32,23.45,5,13.5,.18,13.5,0x354149);
 // 二つの滑走路脇機関銃陣地（滑走路から距離を取った位置）
 AIRPORT.posts=[];
 for(const [x,z,dir] of [[-30,31,-1],[30,31,-1]]){
   const g=new THREE.Group();g.position.set(x,0,z);stageRoot.add(g);
   airportBox(x,.55,z,5.8,1.1,4.8,0x626a6b);
   airportBox(x,1.25,z+1.65,4.8,1.4,.18,0x343b3f);
   const q=plainGun(g,0,1.65,-.2,carMats());const crew=airportCrew(g,0,1.1,.65,.92,0x344b3a,'gunner','blue');
   AIRPORT.posts.push({x,z,g,gun:q.g,flash:q.flash,crew,crewAlive:true,target:null,next:1.1+Math.random(),tracerT:0});
 }
 // 格納庫と一機の二人乗り戦闘機
 airportBox(40,4.4,35,29,8.8,30,0x737d83);airportBox(40,9,35,30,.45,31,0x505b62);
 airportBox(40,4.5,19.8,23,9,.22,0x8b969b);airportBox(40,4.5,50.2,23,9,.22,0x8b969b);
 airportBox(40,.08,35,27,.16,28,0x555d61);
 const fg=new THREE.Group();fg.position.set(40,.5,35);stageRoot.add(fg);
 const fm=new THREE.MeshLambertMaterial({color:0x9aa6ad}),fd=new THREE.MeshLambertMaterial({color:0x303a42}),fc=new THREE.MeshLambertMaterial({color:0x87b6ca,transparent:true,opacity:.62});
 const fus=new THREE.Mesh(new THREE.CylinderGeometry(.42,.55,8.2,12),fm);fus.rotation.x=Math.PI/2;fg.add(fus);
 const nose=new THREE.Mesh(new THREE.ConeGeometry(.42,1.4,12),fm);nose.rotation.x=-Math.PI/2;nose.position.z=-4.65;fg.add(nose);
 const wings=new THREE.Mesh(new THREE.BoxGeometry(10.5,.16,1.7),fm);wings.position.z=-.6;fg.add(wings);
 const tailw=new THREE.Mesh(new THREE.BoxGeometry(4.1,.12,.9),fm);tailw.position.z=3.1;fg.add(tailw);
 const fin=new THREE.Mesh(new THREE.BoxGeometry(.16,1.4,1.4),fd);fin.position.set(0,.65,3.1);fg.add(fin);
 for(const z of [-1.05,1.05]){const canopy=new THREE.Mesh(new THREE.SphereGeometry(.48,12,8),fc);canopy.scale.set(.8,.8,1.35);canopy.position.set(0,.43,z);fg.add(canopy);airportCrew(fg,0,.25,z,.66,0x35434b,'pilot','orange');}
 for(const x of [-2.8,2.8]){const mg=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.9,8),fd);mg.rotation.x=Math.PI/2;mg.position.set(x,-.08,-1.5);fg.add(mg);}
 AIRPORT.fighter={g:fg,home:new V3(40,.5,35),active:false,t:0,phase:0,shotT:0,sortie:0,pilotAlive:true,copilotAlive:true};
 // 地上侵入用の機関銃付き軽自動車。既存の軽自動車シルエットを再利用
 AIRPORT.vehicles=[];
 const VM=carMats();
 for(let i=0;i<6;i++){
   const g=new THREE.Group();stageRoot.add(g);
   keiAssemble(g,VM);
   const q=plainGun(g,0,1.38,-.15,VM);q.g.rotation.y=Math.PI;
   g.scale.setScalar(1.12);
   const driver=airportCrew(g,-.25,.92,.65,.72,0x454b52,'driver','orange');const gunner=airportCrew(g,0,1.92,-.15,1.02,0x553d32,'gunner','orange');AIRPORT.vehicles.push({g,gun:q.g,flash:q.flash,driver,gunner,driverAlive:true,gunnerAlive:true,x:[-20,-12,-4,4,12,20][i],z:-82-i*1.8,yaw:0,hp:12,next:.8+i*.5,target:null,alive:true,drive:0});
 }

 AIRPORT.gun=null;AIRPORT.tracer=null;
 hq={x0:-37.5,x1:-26.5,z0:-.5,z1:10.5,sx:-34.5,sz:7.2};
 buildHQ(-37.5,-26.5,-.5,10.5,-34.5,7.2);
 buildMedPost(-35.5,7.7,'blue');
 airportBox(39,5,-31,27,10,24,0x7c858a);airportBox(39,10.2,-31,29,.7,26,0x515b61);airportBox(25.7,4.8,-31,.6,9.6,23,0x657076);airportBox(52.3,4.8,-31,.6,9.6,23,0x657076);airportBox(39,9.2,-43.1,27,1.5,.6,0x657076);airportBox(39,3.8,-42.7,27,.25,.4,0xd1d3cc);
 airportCylinder(17,2.2,-42,.95,1.05,18,0xd8dcd8,Math.PI/2);airportCylinder(17,2.2,-51.4,.05,.95,2.8,0xc4c9c7,Math.PI/2);airportBox(17,2.05,-41,17,.2,3.4,0x9da9ad);airportBox(17,2.45,-49.2,5.4,.14,2.2,0xa9b2b5);airportBox(17,2.75,-49.5,2.1,.15,1.1,0x435b66);
 for(const x of [12.3,21.7]){airportCylinder(x,1.7,-40.4,.42,.42,2.4,0x77848a,Math.PI/2);airportCylinder(x,1.6,-37.4,.23,.23,1.1,0x343a3e,Math.PI/2);}
 for(let i=0;i<6;i++){airportBox(-12+i*4,.55,-59,1.2,1.1,1.2,0x716b5a);airportCylinder(34,.7,-48+i*4,.55,.55,1.4,i%2?0x66756c:0x7c6b55);}
 for(const x of [-48,48])for(const z of [-72,-48,-24,0,24,48]){airportCylinder(x,.75,z,.09,.12,1.5,0x4a5457);airportBox(x,1.5,z,.36,.28,.36,0xd3c58e);}
 for(const x of [-48,48])for(let z=-78;z<=62;z+=7)airportBox(x,1.1,z,.12,2.2,.12,0x626b6b);for(const z of [-78,62])airportBox(0,1.1,z,96,.12,.12,0x626b6b);
}
function airportParachute(e){const group=new THREE.Group(),colors=[0xf4eee0,0xc94d2c,0xf4eee0,0xc94d2c];group.name='airport-parachute';for(let i=0;i<4;i++){const geo=new THREE.SphereGeometry(2.05,12,8,i*Math.PI/2,Math.PI/2,0,Math.PI/2),panel=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:colors[i],side:THREE.DoubleSide}));panel.scale.set(1,.72,1);panel.position.y=3.25;panel.renderOrder=3;group.add(panel);}const pts=[];for(let i=0;i<12;i++){const a=i*Math.PI/6;pts.push(new V3(Math.cos(a)*1.62,3.2,Math.sin(a)*1.62),new V3(Math.cos(a)*.18,.72,Math.sin(a)*.18));}const lines=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xf7f0dc,depthTest:false}));lines.renderOrder=4;group.add(lines);group.position.set(0,0,0);e.s.add(group);e.airChute=group;}
function airportElite(e){if(!e)return;e.airElite=true;e.hp=e.hpMax=7;e.speed=Math.max(e.speed*1.28,3.35);e.dmg=Math.max(e.dmg+6,15);e.P=Object.assign({},e.P,{aimT:Math.max(.32,(e.P.aimT||.8)*.62)});e.airDrop=true;e.passive=true;e.state='airportDrop';e.t=0;e.dropY=rand(12,15);e.baseY=e.dropY;e.s.position.y=e.dropY;e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;e.shadow.visible=false;if(e.mat){e.mat.transparent=false;e.mat.opacity=1;e.mat.needsUpdate=true;}setFrame(e,e.girl.front,false);airportParachute(e);}
function airportSpawnForces(){AIRPORT.towerGuards=[];AIRPORT.fieldAllies=[];AIRPORT.drops=[];for(let i=0;i<24;i++){const a=i*Math.PI*2/24,r=8.8,x=-32+Math.cos(a)*r,z=5+Math.sin(a)*r,kind=i%3===0?'mob':'archer',e=spawnEnemy(x,z,kind,false,'blue',{set:{airportTowerGuard:true,airportHome:[x,z]}});if(e){e.home=e.airportHome.slice();e.state='idle';e.speed*=.88;AIRPORT.towerGuards.push(e);}}for(let i=0;i<36;i++){const col=i%6,row=Math.floor(i/6),x=-44+col*4.8,z=27+row*5.2+rand(-1,1),kind=Math.random()<.55?'archer':'mob',e=spawnEnemy(x,z,kind,false,'blue',{set:{airportFieldAlly:true,airportHome:[x,z]}});if(e){e.home=e.airportHome.slice();e.state=kind==='archer'?'advance':'approach';e.speed*=1.08;AIRPORT.fieldAllies.push(e);}}}
function airportStartWave(n){wave.n=n;wave.inter=0;wave.blueToSpawn=0;wave.blueOwed=0;wave.spawnT=0;if(n===1){AIRPORT.toDrop=AIRPORT.total;AIRPORT.dropCount=0;AIRPORT.dropTimer=2.5;wave.toSpawn=AIRPORT.toDrop;wave.maxAlive=42;wave.total={blue:AIRPORT.towerGuards.length+AIRPORT.fieldAllies.length,orange:AIRPORT.total};showBanner('空港、地上侵入！','機関銃付き軽自動車が接近中。管制塔と滑走路脇の陣地を守れ！');Sfx.fluteCall();return;}wave.toSpawn=0;gameOver(true);}
function airportFire(dt){if(!AIRPORT.gun)return;const alive=AIRPORT.towerGuards.filter(isUp).length;AIRPORT.gun.visible=alive>0;if(alive>0){AIRPORT.gunNextT-=dt;AIRPORT.gunShotT-=dt;if(AIRPORT.gunBurst<=0&&AIRPORT.gunNextT<=0){let best=null,bd=95;for(const e of enemies){if(e.team!=='orange'||!isUp(e))continue;const p=e.s.position,d=Math.hypot(p.x+32,p.z-5);if(d<bd){bd=d;best=e;}}if(best){AIRPORT.gunTarget=best;AIRPORT.gunBurst=7;AIRPORT.gunShotT=0;}else AIRPORT.gunNextT=.5;}if(AIRPORT.gunTarget&&(!isUp(AIRPORT.gunTarget)||AIRPORT.gunTarget.team!=='orange'))AIRPORT.gunBurst=0;if(AIRPORT.gunBurst>0&&AIRPORT.gunShotT<=0){const T=AIRPORT.gunTarget,from=new V3(-32,17.2,4.2),to=new V3(T.s.position.x,T.s.position.y+T.figH*.6,T.s.position.z);AIRPORT.gun.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);AIRPORT.tracer.geometry.dispose();AIRPORT.tracer.geometry=new THREE.BufferGeometry().setFromPoints([from,to]);AIRPORT.tracer.visible=true;AIRPORT.tracerT=.09;if(Sfx.mg)Sfx.mg(from);if(Math.random()<.76)damageEnemy(T,1,from,false,{pt:to.clone(),thrust:true},{team:'blue',state:'idle',mg:true,s:{position:from}});AIRPORT.gunBurst--;AIRPORT.gunShotT=.14;if(AIRPORT.gunBurst<=0)AIRPORT.gunNextT=rand(1,1.7);}}if(AIRPORT.tracerT>0){AIRPORT.tracerT-=dt;if(AIRPORT.tracerT<=0)AIRPORT.tracer.visible=false;}}

function airportRunwayClear(){
 return !enemies.some(e=>isUp(e)&&Math.abs(e.s.position.x)<18&&e.s.position.z>-76&&e.s.position.z<62);
}
function airportVehicleUpdate(dt){
 if(!AIRPORT.vehicles)return;
 for(const v of AIRPORT.vehicles){
  if(!v.alive||!v.driverAlive)continue;
  v.next-=dt;v.drive+=dt;
  // 車は外周から滑走路脇を回り、管制塔方向へ進む
  const tx=-32, tz=5, dx=tx-v.x, dz=tz-v.z, d=Math.hypot(dx,dz)||1;
  v.yaw=Math.atan2(dx,dz);v.x+=dx/d*1.65*dt;v.z+=dz/d*1.65*dt;
  v.g.position.set(v.x,0,v.z);v.g.rotation.y=v.yaw;
  let target=null,bd=58;
  for(const e of [...AIRPORT.towerGuards,...AIRPORT.fieldAllies])if(isUp(e)&&e.team==='blue'){
   const p=e.s.position,dd=Math.hypot(p.x-v.x,p.z-v.z);if(dd<bd){bd=dd;target=e;}
  }
  v.target=target;
  if(target&&v.gunnerAlive&&v.next<=0){
   const p=target.s.position,from=new V3(v.x,1.45,v.z),to=new V3(p.x,p.y+1,p.z);
   v.gun.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
   airportShowTracer(from,to,0xffd36c);if(v.gunner)v.gunner.airportRecoil=1;
   if(Math.random()<.66)damageEnemy(target,1,from,false,{pt:to,thrust:true},{team:'orange',state:'idle',mg:true,s:{position:from}});
   if(Sfx.mg)Sfx.mg(from);v.next=.22+Math.random()*.22;
  }
  if(Math.hypot(v.x-tx,v.z-tz)<5){v.x+=Math.sign(v.x-tx||1)*.4;v.z+=Math.sign(v.z-tz||1)*.4;}
 }
}
function airportShowTracer(from,to,color=0xffdf8a){
 if(!AIRPORT.fxTracers)AIRPORT.fxTracers=[];
 const geo=new THREE.BufferGeometry().setFromPoints([from.clone(),to.clone()]);
 const mat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false});
 const line=new THREE.Line(geo,mat);line.frustumCulled=false;scene.add(line);
 AIRPORT.fxTracers.push({line,life:.12,max:.12});
}
function airportTracerUpdate(dt){
 if(!AIRPORT.fxTracers)return;
 for(let i=AIRPORT.fxTracers.length-1;i>=0;i--){const f=AIRPORT.fxTracers[i];f.life-=dt;f.line.material.opacity=Math.max(0,f.life/f.max);if(f.life<=0){scene.remove(f.line);f.line.geometry.dispose();f.line.material.dispose();AIRPORT.fxTracers.splice(i,1);}}
}
function airportPostsUpdate(dt){
 for(const p of AIRPORT.posts||[]){
  if(!p.crewAlive)continue;
  p.next-=dt;
  if(!p.target||!isUp(p.target)||p.target.team!=='orange'){
   p.target=null;let bd=100;
   for(const e of enemies)if(e.team==='orange'&&isUp(e)){const q=e.s.position,d=Math.hypot(q.x-p.x,q.z-p.z);if(d<bd){bd=d;p.target=e;}}
  }
  if(p.target&&p.next<=0){
   const e=p.target,from=new V3(p.x,1.8,p.z),to=new V3(e.s.position.x,e.s.position.y+e.figH*.6,e.s.position.z);
   p.gun.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
   airportShowTracer(from,to,0xffe5a0);if(p.crew)p.crew.airportRecoil=1;
   if(Math.random()<.78)damageEnemy(e,1,from,false,{pt:to.clone(),thrust:true},{team:'blue',state:'idle',mg:true,s:{position:from}});
   if(Sfx.mg)Sfx.mg(from);p.next=.13;
  }
 }
}
function airportFighterUpdate(dt){
 const f=AIRPORT.fighter;if(!f||!f.g)return;
 if(!f.active&&f.pilotAlive&&f.copilotAlive&&airportRunwayClear()&&enemies.some(e=>e.team==='orange'&&isUp(e))){f.active=true;f.phase=1;f.t=0;f.shotT=.6;f.sortie++;}
 if(!f.active)return;
 f.t+=dt;f.shotT-=dt;
 if(f.phase===1){f.g.position.set(40+Math.sin(f.t*1.5)*3,Math.min(15,.5+f.t*3.2),35-f.t*8);f.g.rotation.x=-.06; if(f.t>5){f.phase=2;f.t=0;}}
 else if(f.phase===2){
  f.g.position.set(-52+f.t*19,15+Math.sin(f.t*2)*1.2,8+Math.sin(f.t*.8)*20);f.g.rotation.y=-Math.PI/2;
  if(f.shotT<=0){let target=null,bd=65;for(const e of enemies)if(e.team==='orange'&&isUp(e)){const p=e.s.position,d=Math.hypot(p.x-f.g.position.x,p.z-f.g.position.z);if(d<bd){bd=d;target=e;}}
   if(target){const from=new V3(f.g.position.x,14,f.g.position.z),to=new V3(target.s.position.x,target.s.position.y+1,target.s.position.z);if(Math.random()<.8)damageEnemy(target,2,from,false,{pt:to,thrust:true},{team:'blue',state:'idle',mg:true,s:{position:from}});f.shotT=.35;}
  }
  if(f.t>7){f.phase=3;f.t=0;}
 }else if(f.phase===3){f.g.position.lerp(f.home,Math.min(1,dt*.22));if(f.g.position.distanceTo(f.home)<2){f.g.position.copy(f.home);f.g.rotation.set(0,0,0);f.active=false;f.phase=0;}}
}
function airportUpdate(dt){if(!AIRPORT.on||state!=='play')return;airportVehicleUpdate(dt);airportPostsUpdate(dt);airportFighterUpdate(dt);airportTracerUpdate(dt);AIRPORT.introT-=dt;if(AIRPORT.introT<=0&&AIRPORT.toDrop>0){AIRPORT.dropTimer-=dt;const active=enemies.filter(e=>e.team==='orange'&&isUp(e)).length;if(AIRPORT.dropTimer<=0&&active<42){const kind=Math.random()<.46?'archer':'mob';const x=rand(-24,18),z=rand(-88,-80);const e=spawnEnemy(x,z,kind,false,'orange',{yari:-1});if(e){e.speed=Math.max(e.speed*1.12,2.9);e.state=kind==='archer'?'advance':'approach';e.tgt=null;e.tgtT=0;e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;AIRPORT.drops.push(e);AIRPORT.dropCount++;AIRPORT.toDrop--;wave.toSpawn=AIRPORT.toDrop;AIRPORT.dropTimer=rand(.82,1.28);}}}airportFire(dt);if(!AIRPORT.lost&&AIRPORT.towerGuards.length>0&&AIRPORT.towerGuards.every(e=>!isUp(e))){AIRPORT.lost=true;showBanner('管制塔陥落','管制室の守備隊が全滅した');gameOver(false);return;}if(!AIRPORT.won&&AIRPORT.toDrop===0&&!enemies.some(e=>e.team==='orange'&&isUp(e)&&!e.airportCrewActor)){AIRPORT.won=true;gameOver(true);}}
function airportParatrooperStep(e,dt){if(e.state!=='airportDrop')return;e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;if(e.mat){e.mat.transparent=false;e.mat.opacity=1;e.mat.needsUpdate=true;}setFrame(e,e.girl.front,false);e.s.position.y=Math.max(0,e.s.position.y-2.65*dt);e.baseY=e.s.position.y;if(e.airChute){e.airChute.visible=true;e.airChute.position.y=0;}if(e.s.position.y<=.001){e.s.position.y=0;e.baseY=0;e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.airDrop=false;e.passive=false;e.shadow.visible=true;e.tilt.position.set(0,0,0);e.tilt.rotation.set(0,0,0);e.crouch=0;e.hid=false;e.hiding=false;if(e.airChute){e.s.remove(e.airChute);e.airChute=null;}setFrame(e,e.girl.front,false);e.state=e.kind==='archer'?'advance':'approach';e.t=0;e.tgt=null;e.tgtT=0;e.cd=.2;e.spotted=false;e.airLanded=true;}}

// ====================================================================
// 塹壕の戦い：荒野の両軍陣地。塹壕は地面に切り欠きを作り、底を地表より低く描画する。
// ====================================================================
function trenchBlock(x,y,z,w,h,d,color,opts={}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshLambertMaterial({
    color, transparent: !!opts.transparent, opacity: opts.opacity == null ? 1 : opts.opacity
  }));
  m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; stageRoot.add(m); return m;
}
function buildTrench() {
  TRENCH.on=true;TRENCH.started=false;TRENCH.blue=[];TRENCH.orange=[];TRENCH.fireT=2.2;TRENCH.won=false;TRENCH.shots=0;TRENCH.posts=[];TRENCH.cars=[];TRENCH.planes=[];TRENCH.tracers=[];
  ground.visible = false;
  // 荒野の地表。塹壕の位置だけ地形ポリゴンに穴を開け、底が地表に隠れないようにする。
  const land = new THREE.Shape();
  land.moveTo(-120,-120); land.lineTo(120,-120); land.lineTo(120,120); land.lineTo(-120,120); land.closePath();
  for (const z of [-38,38]) {
    const hole = new THREE.Path();
    hole.moveTo(-39,-z-2.7); hole.lineTo(-39,-z+2.7); hole.lineTo(39,-z+2.7); hole.lineTo(39,-z-2.7); hole.closePath();
    land.holes.push(hole);
  }
  const terrain = new THREE.Mesh(new THREE.ShapeGeometry(land), new THREE.MeshLambertMaterial({color:0x8e805e}));
  terrain.rotation.x = -Math.PI/2; terrain.position.y = -0.02; terrain.receiveShadow = true; stageRoot.add(terrain);
  const dirt = new THREE.MeshLambertMaterial({color:0x62513b});
  const earth = new THREE.MeshLambertMaterial({color:0x796344});
  const sandbag = new THREE.MeshLambertMaterial({color:0x9b8967});
  // 地表の荒れ、石、乾いた草
  for (let i=0;i<180;i++) {
    const x=rand(-95,95), z=rand(-95,95);
    if (Math.abs(Math.abs(z)-38)<5 && Math.abs(x)<41) continue;
    const r=rand(.12,.55);
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),new THREE.MeshLambertMaterial({color:pick([0x756b55,0x9b8d6d,0x5d5949,0xa39778])}));
    rock.position.set(x,r*.25,z); rock.scale.y=.35; stageRoot.add(rock);
  }
  for (const z of [-38,38]) {
    // 塹壕底は地表から約1.4m下。前後の土壁は上端を地面付近に置く。
    trenchBlock(0,-1.42,z,78,.12,5.2,0x332d24);
    for (const side of [-1,1]) {
      trenchBlock(0,-.66,z+side*2.45,78,1.48,.52,0x796344);
      trenchBlock(0,.015,z+side*2.45,78,.16,.58,0x9b8967);
      // 土嚢を区切って積み、長い一枚壁に見えないようにする。
      for(let x=-37;x<=37;x+=2.6) {
        const b=trenchBlock(x,.12,z+side*2.48,2.35,.25,.64,0xa18e6c);
        b.rotation.y=rand(-.035,.035);
      }
    }
    // 壁の土層・斜面を強調する内側の暗い帯
    trenchBlock(0,-.9,z-2.12,77,.48,.12,0x4b3d2b);
    trenchBlock(0,-.9,z+2.12,77,.48,.12,0x4b3d2b);
  }
  // 各陣地にコンクリート製トーチカ4基ずつ。射撃口は敵陣側に向ける。
  for (const team of ['blue','orange']) {
    const z=team==='blue'?49:-49, face=team==='blue'?-1:1, col=0x77776d;
    for (const x of [-28,-10,10,28]) {
      // 見下ろし視点でも中の侍女が隠れないよう、正面と屋根を開いたカットアウェイ式のトーチカにする。
      trenchBlock(x-2.45,.78,z,.3,1.8,4.4,col);
      trenchBlock(x+2.45,.78,z,.3,1.8,4.4,col);
      trenchBlock(x,.78,z-face*1.98,4.6,1.8,.36,col);
      trenchBlock(x-2.0,.58,z+face*1.98,1.0,1.4,.36,col);
      trenchBlock(x+2.0,.58,z+face*1.98,1.0,1.4,.36,col);
      trenchBlock(x,1.72,z-face*.85,4.9,.16,2.5,0x5c5d56);
      trenchBlock(x,.62,z+face*2.23,2.3,.38,.12,0x282a27);
      trenchBlock(x-1.45,.82,z+face*2.15,.22,.52,.2,0x56584f);
      trenchBlock(x+1.45,.82,z+face*2.15,.22,.52,.2,0x56584f);
      // 入口は陣地後方側に開ける
      trenchBlock(x,.3,z-face*2.25,1.15,.62,.16,0x282923);
      for(let k=-1;k<=1;k++) trenchBlock(x+k*1.45,1.96,z,.12,.14,4.6,0x4b4d47);
    }
    // 陣地の識別旗
    const pole=trenchBlock(team==='blue'?-36:36,1.8,z, .09,3.6,.09,team==='blue'?0x425d83:0x8c4a34);
    trenchBlock(team==='blue'?-35.5:35.5,2.65,z,.95,.52,.06,team==='blue'?0x547eaa:0xb85d3c);
  }
  // トーチカ内の機関銃座。両軍4基ずつ。
  const gm=carMats();
  for(const team of ['blue','orange'])for(const x of [-28,-10,10,28]){
    const z=team==='blue'?49:-49, face=team==='blue'?-1:1;
    const q=plainGun(stageRoot,x,1.05,z+face*1.45,gm);
    if(team==='orange')q.g.rotation.y=Math.PI;
    q.g.rotation.x=0;
    q.flash.visible=false;stageRoot.add(q.flash);
    TRENCH.posts.push({team,x,z:z+face*1.45,y:1.05,gun:q.g,flash:q.flash,burst:0,shotT:0,nextT:rand(1,3),target:null});
  }
  const tracerMat=new THREE.MeshBasicMaterial({color:0xffd58b,transparent:true,opacity:.85});
  const tracerGeo=new THREE.BoxGeometry(.035,.035,1);tracerGeo.translate(0,0,-.5);
  for(let i=0;i<32;i++){const m=new THREE.Mesh(tracerGeo,tracerMat);m.visible=false;stageRoot.add(m);TRENCH.tracers.push({m,t:1,d:0,a:new V3(),b:new V3()});}
  // 前線から離れた後方に王の本陣・休息所を設け、両軍の後方に救護所を置く。
  buildHQ(-6,6,59,75,0,67);
  buildMedPost(-48,62,'blue',0);
  buildMedPost(48,-62,'orange',0);
  // 王のリラックススペース：三方を陣幕で囲み、入口は塹壕側へ開ける。
  maku(-8,67,16,Math.PI/2); maku(8,67,16,Math.PI/2); maku(0,75,16,0);
  // buildHQ が設けた畳・座布団を隠さない。休息所の床は既存の畳を使う。
  trenchBlock(0,2.05,58.6,3.8,.9,.16,0x344d4c); // 本陣の看板
  const hqSignTex=canvasTex(512,128,(g,w,h)=>{
    g.fillStyle='#26312d';g.fillRect(0,0,w,h);
    g.strokeStyle='#d8bf7b';g.lineWidth=8;g.strokeRect(7,7,w-14,h-14);
    g.fillStyle='#f2e2b0';g.textAlign='center';g.textBaseline='middle';
    g.font='bold 48px serif';g.fillText('王の本陣・休息所',w/2,h/2);
  });
  const hqSign=new THREE.Mesh(new THREE.PlaneGeometry(3.48,.64),new THREE.MeshBasicMaterial({map:hqSignTex,side:THREE.DoubleSide}));
  hqSign.position.set(0,2.05,58.49);stageRoot.add(hqSign);
  trenchBlock(0,2.54,58.6,3.9,.08,.19,0xc3a56a);
  trenchBlock(-1.9,2.05,58.6,.08,.9,.19,0xc3a56a); trenchBlock(1.9,2.05,58.6,.08,.9,.19,0xc3a56a);
  // 休息用の長椅子と灯り
  trenchBlock(-4.6,.34,65,.65,.55,2.3,0x3b2922); trenchBlock(4.6,.34,65,.65,.55,2.3,0x3b2922);
  for(const x of [-6.6,6.6]){trenchBlock(x,1.35,61,.12,2.7,.12,0x49372a);trenchBlock(x,2.65,61,.48,.24,.48,0xc8a75b);}
  // 遠景の低い土丘。戦場を荒野らしく縁取る。
  for(let i=0;i<18;i++){
    const x=-110+i*12.5, z=i%2?-105:105, r=rand(7,14);
    const hill=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),earth);
    hill.position.set(x,r*.22,z); hill.scale.set(r,r*.45,rand(5,10)); stageRoot.add(hill);
  }
}
function trenchStartBattle() {
  TRENCH.on=true;TRENCH.started=false;TRENCH.blue=[];TRENCH.orange=[];TRENCH.fireT=2.2;TRENCH.won=false;TRENCH.shots=0;TRENCH.elapsed=0;TRENCH.assaultT=rand(18,27);TRENCH.enemyAssaultUntil=0;TRENCH.blueRetreatT=0;TRENCH.blueRetreating=false;TRENCH.reinfDone=false;TRENCH.enemyAirDone=false;TRENCH.airDone=false;TRENCH.cars=[];TRENCH.planes=[];
  wave={n:1,toSpawn:0,blueToSpawn:0,blueOwed:0,spawnT:0,inter:0,maxAlive:200,blueMax:100,total:{blue:100,orange:100},archerRate:ARCHER_RATE};
  // 第一波は本当に100人ずつ配置。隊列は横一列、全員を塹壕の底に腰を落とした高さで待機させる。
  for(let i=0;i<100;i++){
    const x=-34.65+i*.7, kind=Math.random()<.22?'archer':'mob';
    const b=spawnEnemy(x,38,kind,false,'blue',{y:-1.08,yari:-1});
    if(b){b.trenchSide='blue';b.trenchHome={x,z:38};b.home=[x,38];b.trenchOrder='hold';b.trenchUnit=true;b.trenchTargetZ=38;b.hold={face:Math.PI};b.passive=true;b.state='idle';b.tgt=null;b.tgtT=0;b.crouch=.25;TRENCH.blue.push(b);}
    const ekind=Math.random()<.22?'archer':'mob';
    const e=spawnEnemy(x,-38,ekind,false,'orange',{y:-1.08,yari:-1});
    if(e){e.trenchSide='orange';e.trenchHome={x,z:-38};e.home=[x,-38];e.trenchOrder='hold';e.trenchUnit=true;e.trenchTargetZ=-38;e.hold={face:0};e.passive=true;e.state='idle';e.tgt=null;e.tgtT=0;e.crouch=.25;TRENCH.orange.push(e);}
  }
  // 各陣地のトーチカ4基に、4人ずつの機関銃分隊を配置（各軍16人）。
  for(const team of ['blue','orange']){
    const list=team==='blue'?TRENCH.blue:TRENCH.orange;
    for(let pi=0;pi<4;pi++){
      const P=TRENCH.posts.filter(p=>p.team===team)[pi];
      for(let k=0;k<4;k++){
        const e=list[list.length-16+pi*4+k];if(!e)continue;
        const xx=P.x+[-1.2,-.4,.4,1.2][k],zz=team==='blue'?47.12:-47.12;
        e.s.position.set(xx,.72,zz);e.px=xx;e.pz=zz;e.baseY=.72;e.home=[xx,zz];e.trenchHome={x:xx,z:zz};e.trenchBunkerCrew=true;e.trenchPost=P;
        e.trenchOrder='hold';e.trenchTargetZ=zz;e.hold={face:team==='blue'?Math.PI:0};e.passive=true;e.state='idle';e.crouch=.05;
        e.trenchSupport=true;
        e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;e.bb.renderOrder=80;
        if(e.mat){e.mat.transparent=true;e.mat.opacity=1;e.mat.alphaTest=.02;e.mat.depthWrite=false;e.mat.depthTest=false;e.mat.side=THREE.DoubleSide;e.mat.needsUpdate=true;}
      }
    }
  }
  $('bTrenchAttack').style.display='block';
  $('bTrenchAttack').disabled=false;
  $('bTrenchAttack').textContent='攻めろ！';
  showBanner('塹壕戦・第一波','味方100人／敵100人。号令まで塹壕内で待機せよ。');
}
function trenchSupportEnsure(){
  const hqStaff=[sec.e,sec2.e,ojou.e,fluter.e,...aides.map(a=>a.e),...runners.map(r=>r.e)];
  const all=[...hqStaff,...medics.blue.map(m=>m.e),...medics.orange.map(m=>m.e)].filter(Boolean);
  for(const e of all){
    if(!isUp(e))continue;
    e.trenchSupport=true;
    e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;
    if(e.mat&&e.fr&&e.fr.tex){e.mat.map=e.fr.tex;e.mat.transparent=true;e.mat.opacity=1;e.mat.alphaTest=.02;e.mat.depthWrite=false;e.mat.side=THREE.DoubleSide;e.mat.needsUpdate=true;}
  }
}
function trenchCharge() {
  if(!TRENCH.on||TRENCH.started||state!=='play')return;
  TRENCH.started=true;TRENCH.blueRetreating=false;TRENCH.blueRetreatT=rand(19,25);
  $('bTrenchAttack').style.display='none';
  for(const e of TRENCH.blue){if(!isUp(e)||e.trenchBunkerCrew)continue;trenchOrder(e,'advance',-38);}
  showBanner('突撃！','青組100人が塹壕を出て敵陣へ前進する。');
  Sfx.fluteCall();
}
function trenchOrder(e,order,targetZ){
  e.trenchOrder=order;e.trenchTargetZ=targetZ;e.trenchTargetX=e.trenchHome?e.trenchHome.x:e.s.position.x;
  e.hold=order==='hold'?{face:e.trenchSide==='blue'?Math.PI:0}:null;e.passive=order==='hold';e.trenchCharge=order==='advance';e.crouch=order==='hold'||order==='retreat'?.25:0;
  e.tgt=null;e.tgtT=0;e.t=0;e.state=order==='advance'?'approach':'idle';e.faceWant=e.trenchSide==='blue'?Math.PI:0;
}
function trenchBrain(e,dt){
  if(!e||!e.s||!isUp(e))return;
  const p=e.s.position;
  if(e.trenchMounted&&e.trenchMounted.car&&!e.trenchMounted.car.dead){
    const C=e.trenchMounted.car,sl=e.trenchMounted.slot,loc=[[-.68,.95,.1],[.68,.95,.1],[-.68,1.08,-.72],[.68,1.08,-.72]][sl%4];
    const wp=C.g.localToWorld(new V3(loc[0],loc[1],loc[2]));p.copy(wp);e.baseY=wp.y;e.px=p.x;e.pz=p.z;e.s.rotation.y=C.g.rotation.y;e.hold=null;e.passive=false;
    e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;e.bb.renderOrder=90;e.s.renderOrder=90;e.tilt.renderOrder=90;
    e.s.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.renderOrder=90;if(o.material){o.material.depthTest=false;o.material.depthWrite=false;o.material.transparent=true;o.material.opacity=1;o.material.side=THREE.DoubleSide;}}});
    if(e.mat){e.mat.transparent=true;e.mat.opacity=1;e.mat.alphaTest=.02;e.mat.depthWrite=false;e.mat.depthTest=false;e.mat.side=THREE.DoubleSide;e.mat.needsUpdate=true;}
    animateNpc(e,dt,0);return;
  }
  if(e.trenchOrder==='hold'||e.trenchBunkerCrew){
    const h=e.trenchHome||{x:p.x,z:p.z};p.x+=(h.x-p.x)*Math.min(1,dt*6);p.z+=(h.z-p.z)*Math.min(1,dt*6);p.y=e.trenchBunkerCrew?.72:-1.08;e.baseY=p.y;e.px=p.x;e.pz=p.z;e.hold={face:e.trenchSide==='blue'?Math.PI:0};e.passive=true;
    e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;e.bb.renderOrder=80;e.s.renderOrder=80;e.tilt.renderOrder=80;e.s.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.renderOrder=80;if(o.material){o.material.depthTest=false;o.material.depthWrite=false;o.material.transparent=true;o.material.opacity=1;o.material.side=THREE.DoubleSide;}}});if(e.mat){e.mat.transparent=true;e.mat.opacity=1;e.mat.alphaTest=.02;e.mat.depthWrite=false;e.mat.depthTest=false;e.mat.side=THREE.DoubleSide;e.mat.needsUpdate=true;}
    animateNpc(e,dt,0);return;
  }
  const tz=e.trenchTargetZ==null?(e.trenchSide==='blue'?-38:38):e.trenchTargetZ,tx=e.trenchTargetX==null?p.x:e.trenchTargetX;
  if(e.trenchOrder==='advance'||e.trenchOrder==='retreat'){
    const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz),spd=(e.trenchOrder==='retreat'?e.speed*1.25:e.speed*.82);
    if(d>.6){p.x+=dx/d*spd*dt;p.z+=dz/d*spd*dt;e.s.rotation.y=Math.atan2(dx,dz);e.kneel=false;e.crouch=0;}
    else{p.x=tx;p.z=tz;if(e.trenchOrder==='retreat'){e.trenchOrder='hold';e.hold={face:e.trenchSide==='blue'?Math.PI:0};e.passive=true;e.crouch=.25;}else e.trenchOrder='fight';}
  }
  p.y=0;e.baseY=0;animateNpc(e,dt,0);
}
function trenchTracer(from,to){
  const T=TRENCH.tracers.find(t=>t.t>=1);if(!T)return;
  T.a.copy(from);T.b.copy(to);T.d=from.distanceTo(to);T.t=0;T.m.visible=true;
}
function trenchPlane(team){
  const g=new THREE.Group(),mat=new THREE.MeshLambertMaterial({color:team==='blue'?0x4c6d87:0x9a4432}),dark=new THREE.MeshLambertMaterial({color:0x33363a});
  const box=(w,h,d,x,y,z,m)=>{const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);g.add(q);return q;};
  box(.65,.38,3.8,0,0,0,mat);box(7,.11,1.05,0,.02,.15,mat);box(2.2,.1,.8,0,.23,-.85,mat);box(.14,.08,1.2,0,-.08,2.1,dark);
  g.position.set(team==='blue'?-108:108,17,team==='blue'?8:-8);g.rotation.y=team==='blue'?Math.PI/2:-Math.PI/2;stageRoot.add(g);
  return {team,g,x:g.position.x,z:g.position.z,dir:team==='blue'?1:-1,shotT:1,hp:100,maxHp:100,active:true,crashing:false};
}
function trenchPlanePilot(A){
  if(!A||A.pilot)return;
  A.g.updateMatrixWorld(true);
  const p=A.g.localToWorld(new V3(0,.43,-.72));
  const e=spawnEnemy(p.x,p.z,'mob',false,A.team,{y:p.y,yari:-1});
  if(!e)return;
  e.trenchPilot=true;e.trenchPlane=A;e.trenchUnit=false;e.hold=null;e.passive=false;e.quietDeath=true;
  e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;e.bb.renderOrder=70;
  if(e.mat){e.mat.transparent=true;e.mat.opacity=1;e.mat.alphaTest=.02;e.mat.depthWrite=false;e.mat.depthTest=false;e.mat.side=THREE.DoubleSide;e.mat.needsUpdate=true;}
  A.pilot=e;
}
function trenchCrashPlane(A,attacker){
  if(!A||!A.active||A.crashing)return;
  A.crashing=true;A.crashV=1.8;A.crashT=0;A.shotT=99;
  if(A.pilot&&isUp(A.pilot)){A.pilot.quietDeath=true;A.pilot.s.visible=true;A.pilot.tilt.visible=true;A.pilot.bb.visible=true;killEnemy(A.pilot,false,new V3(A.g.position.x,A.g.position.y,A.g.position.z));}
  showBanner(A.team==='blue'?'味方戦闘機、被弾！':'敵戦闘機、被弾！','機体が制御を失い、荒野へ墜落していく。');
}
function trenchTeamUnits(team){
  const base=team==='blue'?TRENCH.blue:TRENCH.orange;
  const mounted=TRENCH.cars.filter(C=>C.team===team).flatMap(C=>C.crew||[]);
  return base.concat(mounted);
}
function trenchReinforce(){
  if(TRENCH.reinfDone)return;TRENCH.reinfDone=true;const M=carMats();
  for(const team of ['blue','orange'])for(let i=0;i<3;i++){
    const blue=team==='blue',g=new THREE.Group();keiAssemble(g,M);
    g.position.set((i-1)*5,0,blue?75+i*2:-75-i*2);g.rotation.y=blue?0:Math.PI;stageRoot.add(g);
    const q=plainGun(g,0,1.5,-.6,M);q.flash.visible=false;g.add(q.flash);q.flash.position.set(0,1.5,-1.45);
    const C={g,team,x:g.position.x,z:g.position.z,speed:4.3,dirZ:blue?-1:1,targetZ:blue?12:-12,gun:q.g,flash:q.flash,nextT:1+i*.4,crew:[],dead:false};TRENCH.cars.push(C);
    for(let k=0;k<4;k++){const e=spawnEnemy(C.x,C.z,'mob',false,team,{yari:-1});if(e){e.trenchMounted={car:C,slot:k};e.trenchPassenger=true;e.trenchSeatHp=e.hp;e.trenchUnit=true;e.trenchSide=team;e.hold=null;e.passive=false;e.special=false;C.crew.push(e);}}
  }
  showBanner('機械化分隊が到着','味方・敵の両軍に、機関銃付き軽自動車3台と機械化分隊が到着した。');
}
function trenchUpdate(dt) {
  if(!TRENCH.on||state!=='play')return;
  // The game canvas may hold pointer lock; release it while the assault command is available so screen taps hit the button.
  if(!TRENCH.started&&document.pointerLockElement&&document.exitPointerLock)document.exitPointerLock();
  TRENCH.elapsed+=dt;
  if(TRENCH.elapsed>35)trenchReinforce();
  if(TRENCH.elapsed>52&&!TRENCH.airDone){TRENCH.airDone=true;const A=trenchPlane('blue');TRENCH.planes.push(A);trenchPlanePilot(A);showBanner('味方戦闘機、進入','操縦士が搭乗した味方戦闘機が上空へ進入。敵機との空中戦に備える。');}
  if(TRENCH.elapsed>68&&!TRENCH.enemyAirDone){TRENCH.enemyAirDone=true;const A=trenchPlane('orange');TRENCH.planes.push(A);trenchPlanePilot(A);showBanner('敵戦闘機を確認','敵機にも操縦士が搭乗。双方の戦闘機が空中戦を始める。');}
  if(TRENCH.elapsed>0){
    if(!TRENCH.enemyAssaultUntil){TRENCH.assaultT-=dt;if(TRENCH.assaultT<=0){
      const c=TRENCH.orange.filter(e=>isUp(e)&&e.trenchOrder!=='advance'&&e.trenchOrder!=='retreat'&&!e.trenchBunkerCrew);
      const n=Math.min(c.length,Math.round(rand(22,34)));for(let i=0;i<n;i++){const e=c[(i*7+TRENCH.shots)%c.length];e.trenchEnemyAssault=true;trenchOrder(e,'advance',rand(5,14));}
      TRENCH.enemyAssaultUntil=TRENCH.elapsed+rand(12,17);if(n)showBanner('敵軍、突撃！',n+'人ほどの敵兵が塹壕を出て前進してくる。');
    }}else if(TRENCH.elapsed>=TRENCH.enemyAssaultUntil){
      for(const e of TRENCH.orange)if(isUp(e)&&e.trenchEnemyAssault){e.trenchEnemyAssault=false;trenchOrder(e,'retreat',-38);}
      TRENCH.enemyAssaultUntil=0;TRENCH.assaultT=rand(28,39);showBanner('敵軍、後退','敵兵が塹壕へ戻り、陣地を立て直している。');
    }
  }
  if(TRENCH.started&&!TRENCH.blueRetreating){TRENCH.blueRetreatT-=dt;if(TRENCH.blueRetreatT<=0){
    TRENCH.blueRetreating=true;for(const e of TRENCH.blue)if(isUp(e)&&!e.trenchBunkerCrew)trenchOrder(e,'retreat',38);showBanner('味方、塹壕へ撤退','突撃を中断し、塹壕へ戻って再編成する。');
  }}
  if(TRENCH.blueRetreating&&TRENCH.blue.filter(isUp).every(e=>e.trenchOrder==='hold')){
    TRENCH.started=false;TRENCH.blueRetreating=false;$('bTrenchAttack').style.display='block';$('bTrenchAttack').disabled=false;$('bTrenchAttack').textContent='再突撃！';showBanner('再編成完了','味方は塹壕に戻った。次の突撃を命じられる。');
  }
  for(const P of TRENCH.posts){
    const foes=trenchTeamUnits(P.team==='blue'?'orange':'blue').filter(e=>isUp(e)&&!e.trenchPilot);
    if(!foes.length){P.flash.visible=false;continue;}
    if(P.burst<=0){P.nextT-=dt;if(P.nextT>0){P.flash.visible=false;continue;}let best=null,bd=80;for(const e of foes){const d=Math.hypot(e.s.position.x-P.x,e.s.position.z-P.z);if(d<bd){bd=d;best=e;}}if(!best){P.nextT=.8;continue;}P.target=best;P.burst=5;P.shotT=0;}
    if(!P.target||!isUp(P.target)){P.burst=0;P.nextT=.5;continue;}
    const p=P.target.s.position,from=new V3(P.x,P.y,P.z),to=new V3(p.x,p.y+P.target.figH*.55,p.z);P.gun.rotation.y=Math.atan2(to.x-from.x,to.z-from.z)+Math.PI;P.shotT-=dt;
    if(P.shotT<=0){P.shotT=.18;P.burst--;P.flash.visible=true;P.gun.updateMatrixWorld(true);P.flash.position.copy(P.gun.localToWorld(new V3(0,0,-.85)));trenchTracer(from,to);if(Math.random()<.2)damageEnemy(P.target,1,from,false,{pt:to.clone(),thrust:true},null);if(P.burst<=0)P.nextT=rand(1.5,3.2);}
    else P.flash.visible=false;
  }
  TRENCH.fireT-=dt;
  if(TRENCH.fireT<=0){TRENCH.fireT=.85;
    for(const team of ['blue','orange']){
      const own=team==='blue'?TRENCH.blue:TRENCH.orange,foes=trenchTeamUnits(team==='blue'?'orange':'blue');
      const shooters=own.filter(e=>isUp(e)&&!e.trenchMounted),targets=foes.filter(e=>isUp(e)&&!e.trenchPilot);
      for(let n=0;n<Math.min(6,shooters.length);n++){const e=shooters[(TRENCH.shots+n*13)%shooters.length];let best=null,bd=65;for(const t of targets){const d=Math.hypot(t.s.position.x-e.s.position.x,t.s.position.z-e.s.position.z);if(d<bd){bd=d;best=t;}}if(best){const from=new V3(e.s.position.x,e.s.position.y+e.figH*.62,e.s.position.z),to=new V3(best.s.position.x,best.s.position.y+best.figH*.55,best.s.position.z);trenchTracer(from,to);if(Math.random()<.12)damageEnemy(best,1,from,false,{pt:to.clone(),thrust:true},e);}}
    }TRENCH.shots+=7;
  }
  for(const C of TRENCH.cars){if(C.dead)continue;if((C.dirZ<0&&C.g.position.z>C.targetZ)||(C.dirZ>0&&C.g.position.z<C.targetZ)){C.g.position.z+=C.dirZ*C.speed*dt;C.z=C.g.position.z;}C.nextT-=dt;if(C.nextT<=0){const foes=trenchTeamUnits(C.team==='blue'?'orange':'blue').filter(e=>isUp(e)&&!e.trenchPilot);let best=null,bd=65;for(const e of foes){const d=Math.hypot(e.s.position.x-C.g.position.x,e.s.position.z-C.g.position.z);if(d<bd){bd=d;best=e;}}if(best){const from=new V3(C.g.position.x,1.5,C.g.position.z-1);const to=new V3(best.s.position.x,best.s.position.y+best.figH*.5,best.s.position.z);trenchTracer(from,to);if(Math.random()<.22)damageEnemy(best,1,from,false,{pt:to.clone(),thrust:true},null);C.nextT=.22;}else C.nextT=.8;}}
  for(const A of TRENCH.planes){
    if(!A.active)continue;
    if(A.crashing){
      A.crashT+=dt;A.crashV+=8.5*dt;A.g.position.y-=A.crashV*dt;A.g.rotation.z+=A.dir*1.05*dt;A.g.rotation.x+=.45*dt;
      if(Math.random()<.22)puff(new V3(A.g.position.x,A.g.position.y,A.g.position.z),0x4a4035,3,.35,1.5,.55);
      if(A.g.position.y<=.25){
        A.g.position.y=.25;A.active=false;A.g.rotation.z=A.dir*.15;A.g.rotation.x=0;
        puff(new V3(A.g.position.x,.3,A.g.position.z),0x4b3d2c,20,.5,3.5,1.2);
        puff(new V3(A.g.position.x,.5,A.g.position.z),0xd0a15f,12,.2,2.8,.7);
        showBanner('戦闘機、墜落','機体が荒野に激突した。');
      }
      continue;
    }
    A.x+=A.dir*42*dt;A.g.position.x=A.x;A.shotT-=dt;
    // 先に敵戦闘機を捕捉。双方が機銃を撃ち合い、被弾が重なると墜落する。
    const rival=TRENCH.planes.find(B=>B!==A&&B.active&&!B.crashing&&B.team!==A.team);
    const planeDist=rival?Math.hypot(A.x-rival.x,A.g.position.y-rival.g.position.y,A.z-rival.z):Infinity;
    if(rival&&planeDist<74&&A.shotT<=0){
      const from=new V3(A.x,A.g.position.y,A.z),to=new V3(rival.x,rival.g.position.y,rival.z);
      trenchTracer(from,to);A.shotT=.28;
      if(Math.random()<.43){
        rival.hp-=13;rival.g.rotation.z+=(Math.random()-.5)*.12;
        puff(to.clone(),0xd5b27a,3,.1,1.5,.3);
        if(rival.hp<=0)trenchCrashPlane(rival,A);
      }
      continue;
    }
    // 敵機が射界にいない時は地上部隊へ機銃掃射。
    if(A.shotT<=0){
      const foes=trenchTeamUnits(A.team==='blue'?'orange':'blue').filter(e=>isUp(e)&&!e.trenchPilot);
      let best=null,bd=70;
      for(const e of foes){const d=Math.hypot(e.s.position.x-A.x,e.s.position.z-A.z);if(d<bd){bd=d;best=e;}}
      if(best){
        const from=new V3(A.x,A.g.position.y,A.z),to=new V3(best.s.position.x,best.s.position.y+best.figH*.5,best.s.position.z);
        trenchTracer(from,to);if(Math.random()<.28)damageEnemy(best,2,from,false,{pt:to.clone(),thrust:true},A.pilot||null);A.shotT=.7;
      }else A.shotT=.3;
    }
    if((A.dir>0&&A.x>108)||(A.dir<0&&A.x< -108)){
      A.dir*=-1;A.g.rotation.y=A.dir>0?Math.PI/2:-Math.PI/2;A.pass++;A.shotT=.5;
    }
    // 地上の機関銃にも低確率で撃墜のチャンスを与える。
    if(Math.random()<dt*.025){
      for(const P of TRENCH.posts)if(P.team!==A.team&&Math.abs(P.x-A.x)<42&&Math.abs(P.z-A.z)<78){
        A.hp-=2;if(A.hp<=0){trenchCrashPlane(A,P);break;}
      }
    }
  }
  for(const T of TRENCH.tracers)if(T.t<1){T.t+=dt*5;const k=Math.min(1,T.t);T.m.position.copy(T.a.clone().lerp(T.b,k));T.m.lookAt(T.b);T.m.scale.z=Math.min(2,T.d*.3);if(T.t>=1)T.m.visible=false;}
  const liveBlue=trenchTeamUnits('blue').filter(isUp).length,liveOrange=trenchTeamUnits('orange').filter(isUp).length;
  wave.total={blue:liveBlue,orange:liveOrange};wave.toSpawn=0;wave.blueToSpawn=0;wave.maxAlive=260;
  if(liveOrange===0&&!TRENCH.won){TRENCH.won=true;TRENCH.on=false;$('bTrenchAttack').style.display='none';gameOver(true);return;}
  if(liveBlue===0){TRENCH.on=false;$('bTrenchAttack').style.display='none';gameOver(false);}
}

// ====================================================================
 // 無人島サバイバル模擬戦闘：既存の一人称 Three.js 戦闘・侍女スプライトを使用
 // ====================================================================
const ISLAND = { on:false, hazards:[], trees:[], started:false, plaza:false, warned:{}, casualtyT:0, deadAtCrash:12, lastCount:0, won:false, beachT:0, squadNames:['小早隊','弓分隊','近接分隊','遊撃隊','秘書課','医務班'], lastWarn:0 };
function islandBox(x,y,z,w,h,d,mat,rot=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.y=rot;stageRoot.add(m);return m;}
function buildIsland(){
  ISLAND.on=true; ISLAND.hazards=[];ISLAND.trees=[];ISLAND.started=false;ISLAND.plaza=false;ISLAND.warned={};ISLAND.casualtyT=0;ISLAND.won=false;ISLAND.lastCount=0;
  ground.visible=false; road.visible=false;
  const sand=new THREE.MeshLambertMaterial({color:0xd9c18b}), grass=new THREE.MeshLambertMaterial({color:0x5d7b3a}), darkGrass=new THREE.MeshLambertMaterial({color:0x294b2c}), water=new THREE.MeshLambertMaterial({color:0x286d80}), lakeMat=new THREE.MeshLambertMaterial({color:0x536c55,transparent:true,opacity:.88}), wood=new THREE.MeshLambertMaterial({color:0x5a3e28}), thornMat=new THREE.MeshLambertMaterial({color:0x8b9b5c}), plazaMat=new THREE.MeshLambertMaterial({color:0xb2a17b});
  scene.background.setHex(0x93b9c7);
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(240,240),water);sea.rotation.x=-Math.PI/2;sea.position.set(0,-.12,80);stageRoot.add(sea);
  const beach=new THREE.Mesh(new THREE.PlaneGeometry(58,58),sand);beach.rotation.x=-Math.PI/2;beach.position.set(0,0,55);stageRoot.add(beach);
  const forest=new THREE.Mesh(new THREE.PlaneGeometry(46,90),darkGrass);forest.rotation.x=-Math.PI/2;forest.position.set(0,-.015,-18);stageRoot.add(forest);
  const meadow=new THREE.Mesh(new THREE.PlaneGeometry(48,42),grass);meadow.rotation.x=-Math.PI/2;meadow.position.set(0,-.01,-82);stageRoot.add(meadow);
  const plaza=new THREE.Mesh(new THREE.PlaneGeometry(52,48),plazaMat);plaza.rotation.x=-Math.PI/2;plaza.position.set(0,-.005,-124);stageRoot.add(plaza);
  // 豪華旅客機の機内：革張り座席、金縁、窓、ラウンジ、照明レール。
  const cabin=new THREE.Group();ISLAND.cabin=cabin;stageRoot.add(cabin);
  const cabinWall=new THREE.MeshLambertMaterial({color:0xe7e0d2}),carpet=new THREE.MeshLambertMaterial({color:0x6c273d}),leather=new THREE.MeshLambertMaterial({color:0x3e2630}),gold=new THREE.MeshLambertMaterial({color:0xc8a65b}),glass=new THREE.MeshLambertMaterial({color:0x6da6c4,emissive:0x172d3b}),chrome=new THREE.MeshStandardMaterial({color:0x9da6ab,metalness:.7,roughness:.25});
  const cbox=(x,y,z,w,h,d,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);cabin.add(m);return m;};
  cbox(0,-.18,68,10,.25,25,carpet);cbox(0,2.8,68,10,.22,25,cabinWall);cbox(-5,1.2,68,.22,2.8,25,cabinWall);cbox(5,1.2,68,.22,2.8,25,cabinWall);cbox(0,1.4,55,10,2.8,.25,cabinWall);cbox(0,1.4,81,10,2.8,.25,cabinWall);
  for(let row=0;row<6;row++)for(const side of [-1,1]){const x=side*2.15,z=58+row*3.6;cbox(x,.72,z,1.7,1.05,1.55,leather);cbox(x,.95,z-.52,1.72,.42,.35,leather);cbox(x,.25,z,1.8,.12,1.6,gold);}
  for(let row=0;row<7;row++)for(const side of [-1,1]){const z=57.5+row*3.4;cbox(side*4.88,1.75,z,.08,.72,1.25,glass);cbox(side*4.82,1.75,z,.1,.82,1.35,gold);}
  cbox(0,.55,56,3.8,.12,2.1,gold);cbox(0,.85,56,3.4,.42,1.8,chrome);cbox(-1.6,.4,54.7,1.1,.8,1.1,leather);cbox(1.6,.4,54.7,1.1,.8,1.1,leather);cbox(-2.7,2.65,68,.08,.08,24,gold);cbox(2.7,2.65,68,.08,.08,24,gold);
  for(let z=56;z<81;z+=2.5){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffe6a3}));lamp.position.set(0,2.62,z);cabin.add(lamp);}
  // First-class details: quilted seat headrests, individual reading lamps, brass trim, side consoles and service carts.
  const ivory=new THREE.MeshStandardMaterial({color:0xf4ead7,roughness:.58}), burgundy=new THREE.MeshStandardMaterial({color:0x5a1f35,roughness:.42}), warmGlow=new THREE.MeshBasicMaterial({color:0xffc878});
  for(let row=0;row<6;row++)for(const side of [-1,1]){
    const z=58+row*3.6,x=side*2.15;
    cbox(x,.99,z-.72,1.22,.18,.12,ivory); // padded headrest
    cbox(side*3.55,.48,z,1.05,.08,1.8,gold); // private side console
    cbox(side*3.55,.54,z,0.92,.08,1.65,burgundy);
    cbox(side*3.55,.68,z-.55,.32,.05,.22,chrome); // service control panel
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.07,10,8),warmGlow);lamp.position.set(side*3.45,2.35,z-.4);cabin.add(lamp);
  }
  // Decorative ceiling panels, central aisle runner and lounge tableware.
  for(let z=56.5;z<81;z+=3.1){cbox(0,2.66,z,3.2,.045,1.7,gold);cbox(0,2.69,z,2.95,.035,1.45,cabinWall);}
  cbox(0,.67,56,1.8,.035,.8,ivory);for(const x of [-.48,0,.48]){const glassCup=new THREE.Mesh(new THREE.CylinderGeometry(.07,.055,.14,10),chrome);glassCup.position.set(x,.78,56);cabin.add(glassCup);}
  // Wall sconces and plush trim make the cabin read as a luxury charter aircraft.
  for(const side of [-1,1])for(let z=57;z<81;z+=6){cbox(side*4.7,2.15,z,.12,.36,.52,gold);cbox(side*4.62,2.15,z,.08,.22,.28,warmGlow);}
  ISLAND.introT=0;ISLAND.introDuration=8;ISLAND.crashed=false;
  // shoreline, beach driftwood, forest edge
  for(let i=0;i<16;i++){const x=-24+i*3.2;const log=islandBox(x,.18,32+Math.sin(i*1.7)*2,rand(1.1,2.6),.25,.24,wood,rand(-.5,.5));}
  for(let i=0;i<54;i++){const x=rand(-20,20),z=rand(-59,21);if(Math.abs(x)<3.8&&z>-50&&z<10)continue;tree(x,z,rand(.8,1.5));ISLAND.trees.push({x,z});}
  for(let i=0;i<32;i++){const x=(Math.random()<.5?-1:1)*rand(8,22),z=rand(-105,-58);tree(x,z,rand(.65,1.2));}
  // small island cliffs at the outer edges
  for(const side of [-1,1])for(let i=0;i<12;i++){const r=new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.2,3),0),new THREE.MeshLambertMaterial({color:0x77796d}));r.position.set(side*rand(25,33),rand(.2,1),rand(-120,40));r.scale.y=.6;stageRoot.add(r);}
  // The luxurious cabin itself becomes the forward HQ after the crash.
  const fus=islandBox(0,1.5,78,8,2.5,18,new THREE.MeshLambertMaterial({color:0xbfc6c7}),0);
  const wing=islandBox(0,2.4,77,27,.25,4,new THREE.MeshLambertMaterial({color:0x9da9ad}),.06);
  for(const x of [-2.4,2.4])islandBox(x,2.9,78,1.4,.1,5,new THREE.MeshLambertMaterial({color:0x526b76}));
  const dentMat=new THREE.MeshLambertMaterial({color:0x68777c});
  const dent1=islandBox(-4.05,1.4,72,.18,1.1,5,dentMat,.16),dent2=islandBox(4.02,1.15,82,.18,.8,4,dentMat,-.2);
  ISLAND.damageParts=[dent1,dent2];for(const d of ISLAND.damageParts)d.visible=false;
  // Quicksand and antlion funnels in the beach lane
  for(const [x,z,r,type] of [[-12,48,2.1,'quicksand'],[9,41,2.3,'antlion'],[14,57,2,'quicksand'],[-5,28,2.2,'antlion'],[3,61,1.9,'quicksand']]){
    const m=new THREE.Mesh(new THREE.CircleGeometry(r,24),new THREE.MeshLambertMaterial({color:type==='antlion'?0x7e633e:0x78664b}));m.rotation.x=-Math.PI/2;m.position.set(x,.035,z);stageRoot.add(m);
    const inner=new THREE.Mesh(new THREE.CircleGeometry(r*.48,24),new THREE.MeshLambertMaterial({color:0x302d23}));inner.rotation.x=-Math.PI/2;inner.position.set(x,.04,z);stageRoot.add(inner);ISLAND.hazards.push({type,x,z,r,mesh:m,cd:0});
  }
  // thorn-spitting trees
  for(const [x,z] of [[-12,-10],[10,-19],[-8,-30],[15,-39],[-16,-45],[5,-52],[0,-4]]){
    const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.25,.4,3,7),wood);trunk.position.y=1.5;g.add(trunk);
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2,1),darkGrass);crown.position.y=3.2;g.add(crown);
    for(let k=0;k<9;k++){const q=new THREE.Mesh(new THREE.ConeGeometry(.09,.8,5),thornMat);q.position.set(Math.cos(k*6.28/9)*1.7,3.1+Math.sin(k*3)*.45,Math.sin(k*6.28/9)*1.7);q.rotation.z=Math.cos(k*6.28/9)*.8;q.rotation.x=Math.sin(k*6.28/9)*.8;g.add(q);}
    g.position.set(x,0,z);stageRoot.add(g);ISLAND.hazards.push({type:'thorn',x,z,r:6,cd:rand(1,3)});
  }
  // poisonous lake, off the safest route
  const lake=new THREE.Mesh(new THREE.CircleGeometry(7.5,32),lakeMat);lake.rotation.x=-Math.PI/2;lake.position.set(13,.025,-28);stageRoot.add(lake);
  ISLAND.hazards.push({type:'poison',x:13,z:-28,r:7.5});
  // blood-sucking grass patches
  for(const [x,z] of [[-12,-74],[-4,-88],[8,-79],[16,-92],[-17,-98],[0,-105],[12,-109]]){
    const patch=new THREE.Mesh(new THREE.CircleGeometry(3.5,18),new THREE.MeshLambertMaterial({color:0x425e29}));patch.rotation.x=-Math.PI/2;patch.position.set(x,.02,z);stageRoot.add(patch);
    for(let i=0;i<28;i++){const blade=new THREE.Mesh(new THREE.ConeGeometry(.07,rand(.5,1.2),4),thornMat);blade.position.set(x+rand(-2.8,2.8),.45,z+rand(-2.8,2.8));blade.rotation.z=rand(-.4,.4);stageRoot.add(blade);}
    ISLAND.hazards.push({type:'suckgrass',x,z,r:3.5,cd:0});
  }
  // clearing perimeter, gate-like wrecked timber, and signboards
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2,x=Math.cos(a)*24,z=-124+Math.sin(a)*20;const p=islandBox(x,1.1,z,.35,2.2,1.1,wood,a);}
  maku(0,-145,13,0);
  buildHQ(-3,2,74,83,0,77);
  scene.fog.near=28;scene.fog.far=220;hemiL.intensity=1.45;ambL.intensity=.95;sun.intensity=1.25;
}
function islandAlive(){return enemies.filter(e=>e.islandRoster&&e.team==='blue'&&e.state!=='down').length+1;}
function islandStart(){
  ISLAND.started=true;ISLAND.plaza=false;ISLAND.won=false;ISLAND.deadAtCrash=12;ISLAND.casualtyT=0;ISLAND.introT=0;ISLAND.crashed=false;ISLAND.warned=ISLAND.warned||{};
  player.pos.set(0,0,68);player.yaw=0;player.hp=CFG.maxHp;player.kills=0;player.allyKills=0;
  // All 200 are alive during the flight. The king stays aboard with the HQ staff.
  // 179 field attendants advance after the crash; 8 staff members remain at HQ.
  for(let i=0;i<187;i++){
    const row=Math.floor(i/12),col=i%12,x=(col-5.5)*1.35+rand(-.25,.25),z=66+row*1.35;
    const kind=i%10<7?'archer':'mob',e=spawnEnemy(x,z,kind,false,'blue',{yari:kind==='mob'?1:-1});
    if(!e)continue;e.islandRoster=true;e.islandSquad=ISLAND.squadNames[i%ISLAND.squadNames.length];e.islandCasualty=false;e.state='idle';e.home=[x,z];e.speed=rand(2.8,3.8);e.dmg=0;e.tgt=null;e.passive=true;
    e.islandHQStaff=i<8;e.islandField=!e.islandHQStaff;
    e.s.rotation.y=Math.PI;e.face=Math.PI;
    if(e.islandHQStaff)e.s.position.set((i%4-1.5)*.85,0,76.5+Math.floor(i/4)*1.2);
  }
  wave={n:1,toSpawn:0,spawnT:0,inter:0,maxAlive:0,blueToSpawn:0,blueOwed:0,blueMax:0,total:{blue:188,orange:0}};
  showBanner('上空・豪華旅客機の機内','雲海の上を飛行中。機体が大きく揺れ始める……');
}
function islandPlaza(){
  if(ISLAND.plaza)return;ISLAND.plaza=true;
  const fallenActors=enemies.filter(e=>e.islandCrashBody||(e.islandRoster&&e.state==='down'));
  const fallen=enemies.filter(e=>e.islandRoster&&e.state==='down').length;
  for(const e of fallenActors){e.islandTransferred=true;e.s.visible=false;if(e.bg)e.bg.visible=false;if(e.fg)e.fg.visible=false;if(e.mk)e.mk.visible=false;}
  const count=Math.min(48,Math.max(12,ISLAND.deadAtCrash+fallen));
  for(let i=0;i<count;i++){const x=((i%8)-3.5)*2.2,z=-129+Math.floor(i/8)*3.0;const kind=i%10<7?'archer':'mob';const deadActor=fallenActors[i%Math.max(1,fallenActors.length)];const girlKey=deadActor?Object.keys(GIRLS).find(k=>GIRLS[k]===deadActor.girl):null;const e=spawnEnemy(x,z,kind,false,'orange',{yari:kind==='mob'?1:-1,...(girlKey?{girl:girlKey}:{})});if(e){e.islandZombie=true;e.state='approach';e.hp=Math.max(3,e.hp);e.hpMax=e.hp;e.speed=rand(1.8,2.4);e.dmg=6;e.s.rotation.y=0;e.face=0;}}
  for(const e of enemies)if(e.islandRoster&&e.state!=='down'){e.islandEscape=true;e.dmg=0;e.tgt=null;e.passive=true;}
  wave.total={blue:enemies.filter(e=>e.team==='blue'&&e.state!=='down').length,orange:count};wave.toSpawn=0;wave.blueToSpawn=0;wave.blueOwed=0;wave.inter=0;
  popup('秘書「ここにいるのは、これまでに倒れた侍女たち……！ 模擬戦闘の敵役です。全員を倒して突破してください！」');
  showBanner('最終広場','ここだけ敵味方の人数表示が復活する。敵役を全員倒せ');
}
function updateIsland(dt){
 if(!ISLAND.on||!ISLAND.started||state!=='play')return;
 const p=player.pos;
 if(!ISLAND.crashed){ISLAND.introT+=dt;if(ISLAND.introT<2.8){$('stagedesc').textContent='雲海の上を飛行中 — 豪華な客室';}else if(ISLAND.introT<5.2){$('stagedesc').textContent='警報！ 機体が急降下している';if(!ISLAND.warned.alarm){ISLAND.warned.alarm=true;showBanner('機体トラブル','客室乗務員「衝撃に備えてください！」');}}else if(ISLAND.introT<8){$('stagedesc').textContent='緊急降下 — 不時着の衝撃！';camera.position.x+=(Math.random()-.5)*.12;camera.position.y+=(Math.random()-.5)*.08;}else{
  ISLAND.crashed=true;p.set(0,0,78);player.yaw=0;
  if(ISLAND.damageParts)for(const d of ISLAND.damageParts)d.visible=true;
  let ri=0;
  for(const e of enemies){if(!e.islandRoster)continue;
    if(e.islandHQStaff)e.s.position.set(((ri%4)-1.5)*.85,0,76.5+Math.floor((ri%8)/4)*1.2);
    else{const row=Math.floor((ri-8)/12),col=(ri-8)%12;e.s.position.set((col-5.5)*1.35+rand(-.25,.25),0,54+row*.8);e.home=[e.s.position.x,e.s.position.z];}
    ri++;
  }
  for(let i=0;i<ISLAND.deadAtCrash;i++){const e=spawnEnemy(rand(-3.5,3.5),rand(73,82),i%3?'archer':'mob',false,'blue');if(e){e.quietDeath=true;e.islandCrashBody=true;e.hp=0;killEnemy(e,false,player.pos);e.s.position.set(rand(-4,4),0,74+rand(-2,2));}}
  showBanner('不時着！','王は損傷した機内本陣に残り、侍女たちは島へ進む');}return;}
 // 侍女は王の隊列に固定しない。各自が探索目標を持ち、島を歩き回る。
 const followers=enemies.filter(e=>e.islandRoster&&e.state!=='down');
 for(let i=0;i<followers.length;i++){
   const e=followers[i],q=e.s.position;if(e.islandEscape||e.islandHQStaff)continue;
   e.islandThink=(e.islandThink||rand(.1,2.8))-dt;
   const nearPlayer=Math.hypot(q.x-p.x,q.z-p.z);
   if(!e.islandGoal||e.islandThink<=0||Math.hypot(e.islandGoal.x-q.x,e.islandGoal.z-q.z)<1.3){
     e.islandThink=rand(1.8,4.2);
     const squadIndex=ISLAND.squadNames.indexOf(e.islandSquad),range=squadIndex%4===0?20:squadIndex%4===1?14:10;
     let gx=clamp(q.x+rand(-range,range),-22,22),gz=clamp(q.z-rand(12,32),-112,58);
     // Most avoid obvious hazards, but distracted / reckless members can blunder into them.
     if(Math.random()<.78){for(let tries=0;tries<5;tries++){const bad=ISLAND.hazards.find(h=>['quicksand','antlion','thorn','poison','suckgrass'].includes(h.type)&&Math.hypot(gx-h.x,gz-h.z)<h.r+2);if(!bad)break;gx=clamp(p.x+rand(-range,range),-22,22);gz=clamp(p.z+rand(-range,range),-112,66);}}
     e.islandGoal={x:gx,z:gz};
   }
   const tx=e.islandGoal.x,tz=e.islandGoal.z,d=Math.hypot(tx-q.x,tz-q.z);
   if(d>.65){steer(e,tx,tz,e.speed,dt);e.state='advance';e.passive=true;}
   else{e.state='idle';e.islandGoal=null;}
 }
 ISLAND.casualtyT+=dt;
 // 地形に入った分隊へまとめて危険判定。個々の死亡ポップアップは出さない。
 const activeHazards=ISLAND.hazards.filter(h=>['quicksand','antlion','thorn','poison','suckgrass'].includes(h.type));
 for(const h of activeHazards){
   h.allyCd=(h.allyCd||0)-dt;
   const radius=h.r+(h.type==='thorn'?2.4:h.type==='poison'?1.2:.9);
   const victims=followers.filter(e=>!e.islandEscape&&e.state!=='down'&&Math.hypot(e.s.position.x-h.x,e.s.position.z-h.z)<radius);
   if(victims.length&&h.allyCd<=0){
     h.allyCd=h.type==='thorn'?2.8:1.8;
     const lossCount=Math.min(victims.length,(h.type==='quicksand'||h.type==='antlion')?Math.ceil(rand(2,5)):Math.ceil(rand(1,4)));
     // One hazard event can claim several attendants; never show individual death popups.
     const shuffled=victims.slice().sort(()=>Math.random()-.5);
     for(let k=0;k<lossCount;k++){const e=shuffled[k];if(!e||e.state==='down')continue;e.quietDeath=true;e.hp=0;killEnemy(e,false,p);e.islandHazardDeath=h.type;e.islandGoal=null;}
   }
 }
 if(ISLAND.casualtyT>6&&followers.filter(e=>!e.islandHQStaff).length>8&&Math.random()<dt*.035){ISLAND.casualtyT=0;const field=followers.filter(e=>!e.islandHQStaff),e=field[(Math.random()*field.length)|0];if(e){e.quietDeath=true;e.hp=0;killEnemy(e,false,p);}}
 for(const h of ISLAND.hazards){const d=Math.hypot(p.x-h.x,p.z-h.z);if(h.type==='crashbody')continue;
  if(h.type==='quicksand'&&d<h.r+.6){popup('流砂に足を取られた！');player.hp=0;gameOver(false);return;}
  if(h.type==='antlion'&&d<h.r+.4){popup('アリジゴクに飲み込まれた！');player.hp=0;gameOver(false);return;}
  if(h.type==='poison'&&d<h.r+1){if(!ISLAND.warned.poison){ISLAND.warned.poison=true;showBanner('秘書の警告','これは毒の湖です。貴重な水に見えても近づいてはなりません！');}player.hp-=dt*12;}
  if(h.type==='thorn'&&d<h.r){h.cd-=dt;if(h.cd<=0){h.cd=2.3;const dir=new V3(p.x-h.x,1.1,p.z-h.z).normalize();const thorn=new THREE.Mesh(new THREE.ConeGeometry(.08,.65,5),thornMat);thorn.position.set(h.x+dir.x*1.4,1.1,h.z+dir.z*1.4);thorn.rotation.x=Math.PI/2;stageRoot.add(thorn);ISLAND.hazards.push({type:'thornShot',mesh:thorn,x:thorn.position.x,z:thorn.position.z,life:1.1,vx:dir.x*11,vz:dir.z*11});}}
  if(h.type==='suckgrass'&&d<h.r){h.cd-=dt;if(h.cd<=0){h.cd=.8;player.hp-=4;popup('草が肌に絡みつく！ 吸血する草です。');}}
  if(h.type==='thornShot'){h.life-=dt;h.x+=h.vx*dt;h.z+=h.vz*dt;if(Math.hypot(p.x-h.x,p.z-h.z)<.65){player.hp-=8;h.life=0;popup('棘が刺さった！');}if(h.life<=0){stageRoot.remove(h.mesh);h.type='spent';}}
 }
 ISLAND.hazards=ISLAND.hazards.filter(h=>h.type!=='spent');
 if(player.hp<=0){player.hp=0;gameOver(false);return;}
 if(p.z < -116&&!ISLAND.plaza)islandPlaza();
 if(ISLAND.plaza){const foes=enemies.filter(e=>e.islandZombie&&e.state!=='down');if(foes.length===0&&!ISLAND.won){ISLAND.won=true;gameOver(true);}}
 const live=enemies.filter(e=>e.islandRoster&&e.state!=='down').length;
 wave.total={blue:live+1,orange:ISLAND.plaza?enemies.filter(e=>e.islandZombie&&e.state!=='down').length:0};
 if(ISLAND.plaza){$('stagedesc').textContent='最終広場：味方 '+wave.total.blue+' 名／敵 '+wave.total.orange+' 名';}
}

const STAGES = {
  plains: { name: '平原の戦い', desc: '広い野を軽自動車とはしご車で進み、少し高い砦を落とす。門は閉じていて狭間がある。はしご車を門に付け、はしごでよじ登る。守りは櫓が二つ。投石車がはしご車を狙う。車は奪い合える。弓はタイヤも撃ち、直せる。第2波からは同じ車を使う。' },
  fort: { name: '櫃の戦い', desc: '青組は砦を守る。二基の櫃（やぐら）と壁の足場から射下ろし、門の外の竹束に隠れる橙組を迎え撃つ。梯子で上り下りできる。' },
  castle: { name: '城の戦い', desc: '青組は城を守る。大手門の狭間と櫓から射て、破門隊の丸太を食い止めよ。門が破れれば二の丸、二の丸が落ちれば奥御殿へ。畳の間には隠し落とし穴、襖の陰には伏兵。襖は E（スマホは「襖」ボタン）で開け閉め。' },
  beach: { name: '浜の戦い', desc: '小早で浜へ漕ぎ寄せ、軽自動車（1台に最大4人）で斜面を上がる。トーチカのそばまで着いたら降りて、徒歩で制圧せよ。機関銃の届く沖では舟べりに身を低く。' },
  plane: { name: '機内の戦い', desc: '空の上の旅客機。殿はラウンジの席に、秘書課が客室乗務員のように控える。穏やかな機内で、乗客に紛れた橙組が突然襲いかかる。通路は一人分の幅、座席の背もたれが矢を防ぐ。' },
  snow: { name: '極寒の戦い', desc: '攻め手として細い雪峡谷を突破せよ。雪に隠れたクレバス、谷を一本の暗い川が塞ぐ。雪の岸と流氷。冷えるのは川の中だけ。遺体を縦に並べて橋にし、ブリザードでは遺体を垂直に立てて道しるべにする。かまくらで戦闘が止むと、おにぎりで味方が少し回復する。' },
  mtn: { name: '山城の戦い', desc: '味方が二つに分かれ、西の大手と東の搦手を攻める。頭上の数は、医務班や本陣の者も含めた味方と敵の人数（橙組にも救護班がいる）。攻め手は射ちながら破門隊について門へ上がり、門の次は二の丸、その次が本丸。押された峰は峰道で援軍を乞う。' },
  twofront: { name: '王と西園寺の二正面戦', desc: '西に城、東に山城。王は狭間・大手門・櫓・二の丸の門上と伏兵で守り、西園寺は峰の足場と本丸で守る。落とし穴、つぶて、破城槌、針山もそのまま。性格で間合いが変わり、分隊の戦況は王と西園寺の両方で分かる。' },
  airport: { name: '空港の戦い', desc: '管制塔のガラス張りの管制室が本陣。滑走路や格納庫から地上侵入してくる敵を、管制塔守備隊・近衛・秘書課・医務班と共に迎え撃つ。操作卓とモニターが並ぶ管制室で戦況を見極めよ。' },
  trench: { name: '塹壕の戦い', desc: '荒野の両軍陣地に深い塹壕とトーチカが各4基。第一波は味方100人・敵100人。味方は塹壕内で待機し、「攻めろ！」を押すと突撃。後方の王の本陣・休息所では秘書に話しかけ、肩もみ・食事・遺体の搬入などを頼める。' },
  nightRaid: { name: '月影の関所', desc: '月のない夜、谷川に架かる細い木橋を渡り、松明の灯る関所を突破せよ。両側は岩壁、門楼には弓兵、奥には敵の野営地。夜霧と火の粉に照らされた細い道で、波状攻撃を切り抜けろ。' },
  island: { name: '無人島サバイバル模擬戦闘', desc: '200人を乗せた飛行機が不時着。敵味方の区別をなくして生還を目指す。南側の砂浜の流砂・アリジゴク、森の棘を撃つ木と毒の湖、吸血草の草地を抜け、最後の広場で死亡した侍女たちの敵役を全員倒せ。本陣は不時着した機内。' },
};

// ====================================================================
//  ステージ「月影の関所」：夜襲。谷川の細橋、岩壁、松明、門楼、敵の野営地。
// ====================================================================
function buildNightRaid() {
  ground.visible=false;
  const dirt=new THREE.MeshLambertMaterial({color:0x252b2e});
  const rock=new THREE.MeshLambertMaterial({color:0x343c46});
  const stone=new THREE.MeshLambertMaterial({color:0x41464b});
  const wood=new THREE.MeshLambertMaterial({color:0x49372a});
  const plank=new THREE.MeshLambertMaterial({color:0x66503a});
  const water=new THREE.MeshBasicMaterial({color:0x102b3a,transparent:true,opacity:.92});
  const land=new THREE.Mesh(new THREE.PlaneGeometry(250,250),dirt);
  land.rotation.x=-Math.PI/2;land.position.y=-.12;land.receiveShadow=true;stageRoot.add(land);
  // 川と岸。川は道を横切り、橋の上だけが安全な渡河点。
  const river=new THREE.Mesh(new THREE.PlaneGeometry(100,8),water);river.rotation.x=-Math.PI/2;river.position.set(0,-.035,12);stageRoot.add(river);
  for(const x of [-45,-35,-25,-15,-10,10,15,25,35,45]){
    const bank=trenchBlock(x,-.03,12,4,.18,9,0x343d40);bank.rotation.y=rand(-.08,.08);
  }
  for(let z=5;z<=19;z+=1.65){
    const b=trenchBlock(0,.16,z,6.5,.28,1.45,0x5a4634);b.rotation.y=rand(-.025,.025);
  }
  for(const x of [-3.25,3.25])for(let z=5;z<=19;z+=2.5)trenchBlock(x,.42,z,.16,.45,.16,0x4a3829);
  for(const x of [-2.9,2.9])trenchBlock(x,.68,12,.14,.12,14,0x4a3829);
  // 谷の両側に切り立った岩壁と崩落石。
  for(const side of [-1,1]){
    for(let z=-18;z<=42;z+=6){
      const h=rand(5,11),w=rand(4,8);
      const b=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),rock);b.position.set(side*rand(15,21),h*.42,z+rand(-2,2));b.scale.set(w,h,rand(4,8));b.rotation.set(rand(-.12,.12),rand(-.2,.2),side*rand(-.08,.08));b.castShadow=true;b.receiveShadow=true;stageRoot.add(b);
    }
    for(let z=-12;z<38;z+=9){
      const x=side*rand(7.5,11),r=rand(.7,1.6);
      const b=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),rock);b.position.set(x,r*.45,z);b.scale.y=.55;stageRoot.add(b);
    }
  }
  // 関所の横木塀、中央の門、左右の門楼。
  for(const x of [-31,-26,-21,-16,-11,-7,7,11,16,21,26,31]){
    trenchBlock(x,1.45,-27,.32,2.9,.42,wood);
    trenchBlock(x,2.82,-27,4.8,.2,.55,wood);
  }
  trenchBlock(-4,1.4,-27,6,2.8,.42,wood);trenchBlock(4,1.4,-27,6,2.8,.42,wood);
  for(const x of [-24,24]){
    trenchBlock(x,2.3,-27,6.8,4.6,6.8,stone);
    trenchBlock(x,4.72,-27,7.4,.28,7.4,wood);
    for(const dx of [-2,0,2])trenchBlock(x+dx,5.05,-27,.18,.4,7.5,wood);
    for(const z of [-29,-25])trenchBlock(x,5.05,z,7.5,.4,.18,wood);
    // 狭間の暗い開口
    trenchBlock(x,2.65,-23.52,2.1,.48,.08,0x111820);
  }
  // 奥の陣幕・見張り台・物資置場。
  for(const x of [-13,13]){
    trenchBlock(x,1.4,-45,10,2.8,.25,wood);
    trenchBlock(x,2.85,-45,10,.18,.5,wood);
    for(const z of [-52,-46,-40])trenchBlock(x,1.2,z,.25,2.4,.25,wood);
  }
  for(const x of [-12,12]){
    const tower=trenchBlock(x,3.2,-53,5.5,6.4,5.5,stone);
    trenchBlock(x,6.55,-53,6.2,.3,6.2,wood);
    for(const dx of [-2,0,2])trenchBlock(x+dx,7,-53,.18,.6,6.3,wood);
  }
  // 夜営テント、樽、木箱、旗。
  for(const [x,z] of [[-9,-39],[8,-43],[-4,-58],[5,-60]]){
    const tent=new THREE.Mesh(new THREE.ConeGeometry(3.2,3.1,4),new THREE.MeshLambertMaterial({color:0x454b48,side:THREE.DoubleSide}));
    tent.position.set(x,1.5,z);tent.rotation.y=Math.PI/4;tent.castShadow=true;stageRoot.add(tent);
    trenchBlock(x,0.38,z+1.7,1.2,.75,.65,0x46372c);
  }
  for(let i=0;i<12;i++){const x=rand(-38,38),z=rand(-72,-34);if(Math.abs(x)<9&&z>-61)continue;nobori(x,z,'#7f3b32','#d9c59b',pick(['関所','夜警','橙組']));}
  // 味方の後方陣地と休息所。
  for(const x of [-15,15]){const t=new THREE.Mesh(new THREE.ConeGeometry(3.4,3.3,4),new THREE.MeshLambertMaterial({color:0x283e4b,side:THREE.DoubleSide}));t.position.set(x,1.55,48);t.rotation.y=Math.PI/4;stageRoot.add(t);}
  buildHQ(-8,8,58,75,0,66);
  buildMedPost(-15,63,'blue',0);
  // 松明と火鉢：光源は点光源、炎は常に見える明るいメッシュ。
  const flameMat=new THREE.MeshBasicMaterial({color:0xff9b36});
  const emberMat=new THREE.MeshBasicMaterial({color:0xffd28a});
  for(const [x,z] of [[-12,34],[12,34],[-5,4],[5,4],[-31,-27],[31,-27],[-24,-27],[24,-27],[-12,-44],[12,-44],[-2,-61],[2,-61]]){
    trenchBlock(x,.7,z,.16,1.4,.16,wood);
    const f=new THREE.Mesh(new THREE.ConeGeometry(.22,.62,7),flameMat);f.position.set(x,1.62,z);stageRoot.add(f);
    const e=new THREE.Mesh(new THREE.SphereGeometry(.12,7,6),emberMat);e.position.set(x,1.45,z);stageRoot.add(e);
    const light=new THREE.PointLight(0xff9a45,1.2,13,2);light.position.set(x,1.9,z);stageRoot.add(light);
  }
  // 小さな石標、足跡に見立てた暗い踏み固め土。
  for(let i=0;i<55;i++){const x=rand(-6,6),z=rand(-24,48);const r=rand(.08,.24);const peb=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),i%3?rock:stone);peb.position.set(x,r*.3,z);peb.scale.y=.35;stageRoot.add(peb);}
}

function loadStage(name) {
  if (name !== 'beach') player.god = false; ISLAND.on = name === 'island';
  AIRPORT.on=false;AIRPORT.towerGuards=[];AIRPORT.fieldAllies=[];AIRPORT.drops=[];AIRPORT.gun=null;AIRPORT.tracer=null;
  const am = MODE_STAGES.includes(name) && stageModes[name] === 'atk';
  if (builtStage === name && builtAtk === am) return;
  clearPlainMG();
  mechClear();
  atkMode = am; builtAtk = am; CASTLE.atk = am && name === 'castle'; FORT.atk = am && name === 'fort';
  for (const c of [...stageRoot.children]) stageRoot.remove(c);
  colliders.length = covers.length = flags.length = boxes.length = floors.length = ladders.length = perches.length = 0;
  fortGate = null; hq = null; seirans.length = 0; CAR.g = null; CAR.driver = null; CAR.riding = false;
  road.visible = name === 'plains';
  if (MTN.stones) for (const s of MTN.stones) if (s.m) scene.remove(s.m);
  MTN.stones = []; MTN.on = false;
  SNOW.on = false; SNOW.blizzard = false; BEACH.on = false; TRENCH.on = name === 'trench';
  stageLook(name);
  if (name === 'fort') buildFort(); else if (name === 'plane') buildPlane(); else if (name === 'castle') buildCastle(); else if (name === 'beach') buildBeach(); else if (name === 'snow') buildSnow(); else if (name === 'mtn') buildMountain(); else if (name === 'twofront') buildTwoFront(); else if (name === 'airport') buildAirport(); else if (name === 'trench') buildTrench(); else if (name === 'nightRaid') buildNightRaid(); else if (name === 'island') buildIsland(); else buildPlains();
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
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x7a1218, transparent: true, opacity: 0.94, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
const bloodPoolGeo = new THREE.CircleGeometry(1, 12);
const bloodDecals = [];
function spillBlood(x, y, z, scale) {
  const s = clamp((scale || 1) * 0.16, 0.1, 0.2);
  const pool = new THREE.Mesh(bloodPoolGeo, bloodMat);
  pool.rotation.x = -Math.PI / 2; pool.rotation.z = rand(0, 6.2);
  pool.position.set(x, (y || 0) + 0.02, z); pool.scale.setScalar(s);
  scene.add(pool); bloodDecals.push(pool);
  let best = null, bd = 0.42;
  for (const b of boxes) {
    if (b.y1 != null && b.y1 < 0.4) continue;
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1), d = Math.hypot(x - cx, z - cz);
    if (d < bd && d > 0.02) { bd = d; best = { b, cx, cz, d }; }
  }
  if (best && Math.random() < 0.55) {
    const geo = new THREE.PlaneGeometry(rand(0.05, 0.1), rand(0.08, 0.16));
    const w = new THREE.Mesh(geo, bloodMat);
    w.userData.ownGeo = geo;
    const nx = (x - best.cx) / best.d, nz = (z - best.cz) / best.d;
    const wy = (best.b.y0 || 0) + rand(0.4, 1.15);
    w.position.set(best.cx + nx * 0.03, wy, best.cz + nz * 0.03);
    w.lookAt(best.cx + nx * 2, wy, best.cz + nz * 2);
    scene.add(w); bloodDecals.push(w);
  }
}
function clearBlood() {
  for (const m of bloodDecals) { scene.remove(m); if (m.userData.ownGeo) m.userData.ownGeo.dispose(); }
  bloodDecals.length = 0;
}
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
// 足りない斜め・上・下は、今の服と髪の写真から作る（新しい顔や衣装は足さない）
function synthFrame(base, kind) {
  const img = base && base.tex && base.tex.image;
  if (!img || img.width < 4 || img.height < 4) return null;
  const maxH = 420, sc = Math.min(1, maxH / img.height);
  const w = Math.max(8, Math.round(img.width * sc)), h = Math.max(8, Math.round(img.height * sc));
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  try {
    // 一枚の写真だけを使う。横の写真を横に重ねると、弓や体にもう一人が重なって見える
    if (kind === 'front_diag' || kind === 'back_diag') {
      c.width = Math.round(w * 0.92); c.height = h;
      ctx.save();
      ctx.transform(0.84, 0, kind === 'back_diag' ? 0.05 : -0.05, 1, c.width * 0.1, 0);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else if (kind === 'top') {
      c.width = Math.round(w * 0.86); c.height = h;
      ctx.drawImage(img, 0, 0, img.width, img.height, c.width * 0.14, h * 0.04, c.width * 0.72, h * 0.92);
    } else {
      c.width = w; c.height = h;
      ctx.drawImage(img, 0, 0, img.width, img.height, w * 0.08, h * 0.1, w * 0.84, h * 0.86);
    }
  } catch (err) { return null; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const dir = (kind === 'front_diag' || kind === 'back_diag') ? (base.dir || 0) : 0;
  return { tex, aspect: c.width / c.height, hk: base.hk || 1, ax: base.ax == null ? 0.5 : base.ax, dir };
}
function ensureViews(g) {
  if (!g.front_diag) g.front_diag = synthFrame(g.front, 'front_diag');
  if (!g.back_diag) g.back_diag = synthFrame(g.back || g.front, 'back_diag');
  if (!g.top) g.top = synthFrame(g.front, 'top');
  if (!g.low) g.low = synthFrame(g.front, 'low');
}
// 横歩きの連続写真が無い娘は、横（無ければ正面）の下半身をずらして歩幅を作る
function synthWalk(g) {
  const src = g.side || g.walk || g.front;
  const img = src && src.tex && src.tex.image;
  if (!img || img.width < 8 || img.height < 8) return null;
  const maxH = 420, sc = Math.min(1, maxH / img.height);
  const w = Math.max(8, Math.round(img.width * sc)), h = Math.max(8, Math.round(img.height * sc));
  const shifts = [0, 0.05, 0.02, -0.012, -0.05, -0.02], lifts = [0, -0.015, 0.006, 0, -0.015, 0.006];
  const frs = [];
  try {
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'), split = Math.round(h * 0.52), dx = Math.round(shifts[i] * w), dy = Math.round(lifts[i] * h);
      ctx.drawImage(img, 0, 0, img.width, img.height * 0.52, 0, dy, w, split);
      ctx.drawImage(img, 0, img.height * 0.48, img.width, img.height * 0.52, dx, split - 2, w, h - split + 2);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      frs.push({ tex, aspect: w / h, hk: src.hk || 1, ax: src.ax == null ? 0.5 : src.ax, dir: src.dir || 0 });
    }
  } catch (err) { return null; }
  return { key: 'walk_side', seq: [0, 1, 2, 3, 4, 5], n: 6, steps: 2, contact: 0, frs };
}
const ASSET_V = '20261017za';   // 写真を差し替えたら上げる（ブラウザのキャッシュ対策。index.html の ?v= も合わせる）
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
      if (g.type === 'archer' && !g.bow && !(g.side && g.back)) g.bowOnly = true;   // 弓を引く立ち姿（assets/archerNN.png）だけの弓兵：弓兵として出す（倒れたら archerNN_down）
      if (g.bowOnly) {   // 弓を引く写真しか無い娘：どの見え方もその写真（横は向きに合わせて反転）。倒れたあとは写真のまま横たわる
        const b = g.bow || g.front; g.bow = b; g.front = b; g.side = g.side || b; g.walk = g.walk || b;
      }
      ensureViews(g);
      if (!g.cycle) g.cycle = synthWalk(g);
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
      if (m.ry != null) fr.ry = m.ry; if (m.rx != null) fr.rx = m.rx; if (m.sy != null) fr.sy = m.sy; if (m.sx != null) fr.sx = m.sx;   // seatdown：腰（座面）の位置   // slump：手すりの位置（写真の下からの高さ・左からの位置の比率）
      if (m.cyc) { fr.cyc = m.cyc; m.cyc.frs[m.i] = fr; } else GIRLS[gid][k] = fr;
      framesLoaded++; fin(); };
    const emb = m.cyc ? m.emb : data[gid + '_' + k];
    const fb = () => emb ? loader.load(emb, ok, undefined, () => fin()) : fin();
    if (useFiles) loader.load(m.file + '?v=' + ASSET_V + '_' + (m.hk || 1), ok, undefined, fb); else fb();
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
  // v6：新しい兵の娘 6人（正面・横・斜め・後ろの写真。両軍の通常の兵として全ステージに出る）
  girl26: { type: 'mob', anyRole: true, prof: { name: '白石 麗華', pers: '好戦的', cm: 165, vv: 1, pitch: 1.15 } },  // 夜会巻き・腰に手・自信家
  girl27: { type: 'mob', anyRole: true, prof: { name: '小鳥遊 ここな', pers: '慎重', cm: 157, vv: 2, pitch: 1.35 } }, // 両手ピース・お団子・甘え上手だが用心深い
  girl28: { type: 'mob', anyRole: true, prof: { name: '朝倉 ひなた', pers: '陽気', cm: 158, vv: 2, pitch: 1.45 } },  // 両手ピース・ポニーテール・元気いっぱい
  girl29: { type: 'mob', anyRole: true, prof: { name: '藤宮 しおり', pers: '臆病', cm: 161, vv: 1, pitch: 1.2 } },   // 耳に手・お団子・はにかみ屋
  girl30: { type: 'mob', anyRole: true, prof: { name: '水瀬 りん', pers: '陽気', cm: 159, vv: 1, pitch: 1.3 } },     // 目元でピース・前髪ぱっつん・いたずら好き
  girl31: { type: 'mob', anyRole: true, prof: { name: '久遠 静香', pers: '冷静', cm: 167, vv: 0, pitch: 0.95 } },    // 片手ピース・ポニーテール・落ち着いた長身
};
// 見え方ごとのフレーム（無ければ正面）
function girlFrame(g, k, kind) {
  if (k === 'action') {
    const f = kind === 'archer' ? (g.bow || (g.type === 'archer' ? g.action : null)) : (g.stab || (g.type === 'mob' ? g.action : null));
    return f || g.front;
  }
  return g[k] || g.front;
}
// 倒れ方：横写真から膝を抜いた中割りを足してコマを増やす。モーション側も補間で増やす
function fallImages(e) {
  const g = e.girl; if (!g) return null;
  if (g.fallSeq) return g.fallSeq;
  const src = g.side || g.front; if (!src || !src.tex || !src.tex.image) return null;
  const img = src.tex.image, seq = [src];
  if (img && img.width > 2 && img.height > 2) {
  for (const squash of [0.92, 0.82, 0.72, 0.6]) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height);
    ctx.scale(1, squash);
    try { ctx.drawImage(img, -c.width / 2, -c.height); } catch (err) { break; }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    seq.push({ tex, aspect: src.aspect, hk: (src.hk || 1) * (0.86 + squash * 0.14), ax: src.ax, dir: src.dir || 0 });
  }
  }
  if (g.kneel) seq.push(g.kneel);
  if (g.low) seq.push(g.low);
  if (g.down) seq.push(g.down);
  g.fallSeq = seq; return seq;
}
function pickGirl(kind, perch) {
  const all = Object.values(GIRLS).filter(g => g.id !== SEC_ID && g.id !== SEC2_ID && g.id !== FLUTE_ID && g.id !== MEDIC_ID && (g.type === 'mob' || g.type === 'archer'));
  // 弓兵：弓を引く写真（bow）のある娘、または横・後ろがそろった弓兵の写真。近接兵：侍女（mob）
  let fit = all.filter(g => kind === 'archer' ? (g.bow || g.anyRole || (g.type === 'archer' && g.side && g.back)) : g.type === 'mob');
  if (!fit.length) fit = all.filter(g => kind === 'archer' ? g.type === 'archer' : g.stab);
  const pool = fit.length ? fit : (all.length ? all : Object.values(GIRLS));
  const inUse = new Set(enemies.map(e => e.girl && e.girl.id));
  // 手すり・胸壁・狭間の持ち場：slump の写真がある娘を半分の確率で優先（倒れたとき手すりに崩れる姿が見える）
  if (perch && (perch.gt || perch.gh || perch.seiran || perch.slit || perch.tower) && Math.random() < 0.5) {
    const sl = pool.filter(g => g.slump && !inUse.has(g.id)); if (sl.length) return pick(sl);
  }
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
  if (C.death && C.death.n < 90) {
    const c = C.death, mul = 3, n = c.n, n2 = (n - 1) * mul + 1, F = c.f, G = new Float32Array(n2 * N3);
    for (let i = 0; i < n2; i++) {
      const x = i / mul, i0 = Math.min(n - 1, Math.floor(x)), i1 = Math.min(n - 1, i0 + 1), f = x - i0, a = i0 * N3, b = i1 * N3, o = i * N3;
      for (let j = 0; j < N3; j++) G[o + j] = F[a + j] + (F[b + j] - F[a + j]) * f;
    }
    c.f = G; c.n = n2;
  }
  function densify(c, mul) {
    if (!c || c.n > 60) return;
    const n = c.n, n2 = (n - 1) * mul + 1, F = c.f, G = new Float32Array(n2 * N3);
    for (let i = 0; i < n2; i++) {
      const x = i / mul, i0 = Math.min(n - 1, Math.floor(x)), i1 = Math.min(n - 1, i0 + 1), f = x - i0, a = i0 * N3, b = i1 * N3, o = i * N3;
      for (let j = 0; j < N3; j++) G[o + j] = F[a + j] + (F[b + j] - F[a + j]) * f;
    }
    c.f = G; c.n = n2;
  }
  for (const k of ['walk', 'jog', 'run', 'idle']) densify(C[k], 2);
  if (window.DEATH_CLIPS) {
    for (const [key, src] of [['deathFwd', window.DEATH_CLIPS.fwd], ['deathBack', window.DEATH_CLIPS.back]]) {
      if (!src || !src.f || src.n < 8 || src.f.length < N3 * 2) continue;
      C[key] = { loop: 0, dur: src.dur || 1, n: src.n, f: src.f instanceof Float32Array ? src.f : new Float32Array(src.f) };
    }
  }
  // ユーザー提供の Mixamo の倒れる動き（lib/death_fbx.js）：関節位置と曲線だけ。モデルは表示しない
  const FX = window.DEATH_FBX && window.DEATH_FBX.f && window.DEATH_FBX.n > 8 && !/[?&]fbxdeath=0/.test(location.search) ? window.DEATH_FBX : null;
  if (FX) { C.deathFbx = { loop: 0, dur: FX.dur, n: FX.n, f: new Float32Array(FX.f) }; FX.cv = {}; for (const k in FX.curves) FX.cv[k] = Float32Array.from(FX.curves[k]); }
  const fxAt = (k, u) => { const a = FX.cv[k], x = clamp(u, 0, 1) * (a.length - 1), i = Math.floor(x), j = Math.min(a.length - 1, i + 1); return a[i] + (a[j] - a[i]) * (x - i); };
  // FBX の曲線で写真の板を倒す：前後の傾き th・横の傾き roll（倒れる向きの座標）、腰の沈み→写真の縦の縮み、足の位置（よろめきの踏み替え）、脚の跳ね上げ→小さな弾み
  function fallSpriteFbx(e, D, bounce, H, r, ry) {
    const th = clamp(D.th, -0.15, 1.5), rl = clamp(D.roll, -0.6, 0.6);
    const ax = Math.sin(rl), ay0 = Math.cos(th) * Math.cos(rl), az = Math.sin(th) * Math.cos(rl);
    const cr = Math.cos(ry), sr = Math.sin(ry);
    let ux = ax * cr + az * sr, uy = ay0, uz = -ax * sr + az * cr;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    e.fallTh = th;
    const p = e.s.position, wx = camera.position.x - p.x, wy = camera.position.y - (p.y + 0.4), wz = camera.position.z - p.z;
    let cx = wx * Math.cos(r) - wz * Math.sin(r), cy = wy, cz = wx * Math.sin(r) + wz * Math.cos(r);
    const d = cx * ux + cy * uy + cz * uz; cx -= d * ux; cy -= d * uy; cz -= d * uz;
    let cl = Math.hypot(cx, cy, cz); if (cl < 1e-3) { cx = 0; cy = 1; cz = 0; cl = 1; }
    cx /= cl; cy /= cl; cz /= cl;
    const xx = uy * cz - uz * cy, xy = uz * cx - ux * cz, xz = ux * cy - uy * cx;
    _fm.set(xx, ux, cx, 0, xy, uy, cy, 0, xz, uz, cz, 0, 0, 0, 0, 1);
    e.tilt.quaternion.setFromRotationMatrix(_fm);
    if (e.fallSX0 == null) { e.fallSX0 = e.bb.scale.x; e.fallSY0 = e.bb.scale.y; }
    const sinkK = clamp((D.hip0 - D.hipY) / Math.max(0.1, D.hip0 - 0.15), 0, 1);   // 膝が抜けて腰が落ちた量
    e.bb.scale.x = e.fallSX0; e.bb.scale.y = e.fallSY0 * (1 - 0.22 * sinkK * Math.max(0, Math.cos(th)));
    const lx = (D.px * cr + D.pz * sr) * H, lz = (-D.px * sr + D.pz * cr) * H;
    const w = Math.abs(e.bb.scale.x), h = Math.abs(e.bb.scale.y), bx = e.bb.position.x;
    let minY = 0;
    for (const qx of [bx - w / 2, bx + w / 2]) for (const qy of [0, h]) minY = Math.min(minY, xy * qx + uy * qy);
    const kick = Math.max(0, D.kick - 0.1) * 0.05 * H;   // 倒れた瞬間に脚が跳ね上がる分の小さな弾み
    e.tilt.position.set(lx, -minY + 0.01 + bounce + kick, lz);
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
      const rk = Math.min(1, (e.recoil || 0) / 0.36);
      if (rk > 0.01) {
        for (const j of [I.chest, I.neck, I.head]) { P[j + 2] -= rk * 0.07; }
        P[I.head + 1] += rk * 0.015;
      }
      if ((e.clutch || 0) > 0.01) {
        const w = Math.min(1, e.clutch / 0.35), left = e.clutchArm === 'l';
        const el = left ? I.lEl : I.rEl, wr = left ? I.lWr : I.rWr, sh = left ? I.lSh : I.rSh, sx = left ? 0.05 : -0.05;
        setRel(P, el, sh, sx, -0.1, 0.05, w);
        setRel(P, wr, I.chest, sx * 0.4, 0.02, 0.1, w);
      }
      if (mo.slot >= 0) { const p = e.s.position; write(mo.slot, P, p.x, p.y, p.z, e.s.rotation.y, e.figH); }
      return out;
    },
    // 倒れる（u: 0→1）。人形は倒れる向き fallYaw の座標で死の動きをたどる。板には腰の位置と上体の角度を返す
    death(e, u) {
      const mo = e.mo, P = mo.pose;
      if (!isFinite(e.fallYaw)) e.fallYaw = e.s.rotation.y;
      const clip = FX ? C.deathFbx : (e.fallBack ? C.deathBack : C.deathFwd) || C.deathFwd || C.deathBack || C.death;
      sample(clip, u, P, 1, false);
      if (mo.slot >= 0) { const p = e.s.position; write(mo.slot, P, p.x, p.y, p.z, e.fallYaw, e.figH); }
      const hx = P[I.hips], hy = P[I.hips + 1], hz = P[I.hips + 2];
      const th = Math.atan2(P[I.neck + 2] - hz, P[I.neck + 1] - hy);
      if (FX && e.fallMir) { for (let j = 0; j < N3; j += 3) P[j] = -P[j]; if (mo.slot >= 0) { const p = e.s.position; write(mo.slot, P, p.x, p.y, p.z, e.fallYaw, e.figH); } }   // 左右を鏡写しにした倒れ方
      if (FX) return { hx, hy, hz, th: fxAt('th', u), hr: clip.f[I.hips + 1], fbx: true, roll: fxAt('roll', u), hipY: fxAt('hipY', u), hip0: FX.cv.hipY[0], px: fxAt('px', u), pz: fxAt('pz', u), kick: fxAt('kick', u) };
      return { hx, hy, hz, th, hr: clip.f[I.hips + 1] };
    },
    // 倒れる写真：体の軸（腰→首）を人形と同じに傾け、板はできるだけカメラへ向ける（横から見れば画面の中で倒れ、
    // 手前・奥へ倒れるときは縮んで見える）。腰を支点にするので、膝が抜けると脚は地面の下に沈んで見えない
    fallSprite(e, D, bounce) {
      // 足を地面に置いたまま（写真は決して地面の下に入らない）：膝が抜ける間は写真を少し縦に縮め、上体が倒れるにつれて足元を支点に倒す
      const H = e.figH, r = e.s.rotation.y, ry = e.fallYaw - r;
      if (D.fbx) return fallSpriteFbx(e, D, bounce, H, r, ry);
      // 写真は膝を曲げられないので、膝が抜けて腰が落ちる分も「足元を支点に傾く」角度に足し、いったん傾いたら起き上がらない（単調）
      const want = clamp(Math.max(D.th, 0), 0, 1.4);
      e.fallTh = (e.fallTh || 0) * 0.72 + want * 0.28;
      const th = Math.min(1.45, e.fallTh), s = Math.sin(th), c = Math.cos(th);
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
      if (e.fallSX0 == null) { e.fallSX0 = e.bb.scale.x; e.fallSY0 = e.bb.scale.y; }
      e.bb.scale.x = e.fallSX0; e.bb.scale.y = e.fallSY0;
      // 足元の位置（倒れる向きへ少し滑る）
      const fz = Math.max(0, D.hz - s * D.hr) * H, fx = D.hx * H;
      const lx = fx * Math.cos(ry) + fz * Math.sin(ry), lz = -fx * Math.sin(ry) + fz * Math.cos(ry);
      // 板の四隅のうち一番低い所が地面より上に来るよう持ち上げる
      const w = Math.abs(e.bb.scale.x), h = Math.abs(e.fallSY0), bx = e.bb.position.x;
      let minY = 0;
      for (const qx of [bx - w / 2, bx + w / 2]) for (const qy of [0, h]) minY = Math.min(minY, xy * qx + uy * qy);
      e.tilt.position.set(lx, -minY + 0.01 + bounce, lz);
    },
    get fbx() { return FX; },
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
      if (!Number.isFinite(e.s.rotation.y)) e.s.rotation.y = Number.isFinite(e.fallYaw) ? e.fallYaw : 0;
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
    // v7：寄りかかって倒れた娘など、世界座標の関節（名前→V3）から影の人形を書く
    putWorld(e, J) {
      const mo = e.mo; if (!mo || mo.slot < 0) return;
      const P = mo.pose, p = e.s.position, h = e.figH;
      for (const k in I) { const v = J[k] || J.hips; const j = I[k]; P[j] = (v.x - p.x) / h; P[j + 1] = (v.y - p.y) / h; P[j + 2] = (v.z - p.z) / h; }
      write(mo.slot, P, p.x, p.y, p.z, 0, h);
    },
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
    lines: { spot: ['見つけたっ！ いくよ！', 'いたいた、勝負だよ！', 'よーし、腕が鳴るね！'], attack: ['てやぁっ！', '覚悟しなっ！', 'もらったぁ！'], hit: ['まだまだっ！', 'ふん、効かないね！', 'やるじゃない…！', 'ぐっ…やってくれるね！', 'くっ…！ まだいける！', 'はっ…この程度！', 'いたっ！', 'うっ！ やるじゃん！', 'あっ…！ もう一回！', 'いたた…上等！', 'ちょ、今の反則でしょ！', 'えっ、私！？ 上等じゃん！', 'ぐっ…！', 'くっ…！', 'いっ…！', 'うっ'], defeat: ['くっ…ここまでか…！', 'あーもう、覚えてなさい！', '次は負けないからね！', 'ぐっ…不覚…！', 'くっ…悔しい！', 'うっ…あとは頼んだよ！', 'やられたー…！', 'くやしい…次は勝つ！', 'ごめん…先に抜けるね！', 'あーもう、やられたー！', 'くっ…！ ここまでか…', 'ぐっ…！'], callR: ['右から来てる！'], callL: ['左、回り込まれてる！'], cover: ['援護お願い！ 早く！'], ammo: ['矢、あと少ししかない！'], push: ['いける、押して！'], fall: ['無理無理、いったん下がる！'], seiran: ['せいらん狙って！'], ladder: ['はしご、登ってきてる！'], allydown: ['うそでしょ…！', '仇とるから！', 'よくも！'], kill: ['よっしゃ！', 'やった！', 'おつかれー！'], order_m: ['分隊、前へ！', '一気に行くよ、前へ！'], order_a: ['撃てー！', 'たけたばに隠れて！'], lead: ['私が指揮をとる！ ついてきて！'] } },
  慎重: { desc: '慎重', pitch: 1.1, rate: 1.0, speed: 0.9, atkCd: [1.2, 2.0], hideT: [3.5, 6.0], aimErr: 0.022, aimT: 1.1, keep: [20, 32], retreat: false, cautious: true,
    lines: { spot: ['…敵、発見。', '慎重に、いきましょう。', 'しっ…気づかれないように。'], attack: ['…今っ！', 'そこ、ですね。', '狙って…はいっ！'], hit: ['くっ…油断しました。', 'しまった…！', '…悔しい、当てられました。', 'うっ…！ 下がります。', 'はっ…危なかった。', 'くっ…位置がばれましたか。', 'うっ…！', 'あっ…当てられました。', 'えっ、私ですか…？', 'いたっ…油断しました。', 'ひっ…！ 見られていました。', 'うそ、当たった…？', 'んっ…！', 'う…', 'えっ…', 'うっ'], defeat: ['…無念です。', '読み違えましたね…', '慎重すぎた、かしら…', 'くっ…不覚…！', 'あとは、頼みます…', 'うっ…戦死判定、ですね。', '無念…です。', 'ごめんなさい…先に抜けますね。', 'くやしいです…', '…ここで脱落ですね。', 'あ…っ', 'う…ここまで、です。'], callR: ['右から来ています！'], callL: ['左、回り込まれています！'], cover: ['援護をお願いします！'], ammo: ['矢が、あと少ししかありません！'], push: ['いけます、押しましょう！'], fall: ['無理です、下がります！'], seiran: ['せいらんを狙ってください！'], ladder: ['はしご、登ってきています！'], allydown: ['うそでしょう…', '仇はとりますから。', 'そんな…！'], kill: ['やりました。', 'よし…！', 'おつかれさまでした。'], order_m: ['分隊、前へ。', '慎重に、前へ進みます！'], order_a: ['撃て！', 'たけたばに隠れてください！'], lead: ['私が指揮をとります。ついてきてください！'] } },
  臆病: { desc: '臆病', pitch: 1.55, rate: 1.25, speed: 1.0, atkCd: [1.3, 2.2], hideT: [2.0, 3.5], aimErr: 0.06, aimT: 1.0, keep: [24, 34], retreat: true,
    lines: { spot: ['ひっ、き、来た…！', 'こ、怖くなんかないもん！', 'え、えっと…敵です！'], attack: ['え、えいっ…！', '当たって…！ お願い！', 'やぁっ…！'], hit: ['わわっ！', 'む、無理〜！', 'いったん、下がりますっ！', 'きゃっ！', 'ひっ…！ こ、来ないで！', 'いやっ！ なんで私ばっかり！', 'ひっ！', 'いたい…！', 'いやっ！', 'ちょ、待って！ 待って！', 'うそ、当たった…', 'えっ、私！？ なんで！？', 'あうっ！', 'いっ…！', 'うっ'], defeat: ['やられた〜！', 'もう、だめ〜…', 'うう、負けちゃった…', 'きゃあっ！ やられちゃった…', 'すみません、脱落です！', 'ひっ…！ ここまでです…', 'やられたー…', 'ごめん…先に抜けるね…', 'くやしい…', 'うう…もう抜けます…', 'ひっ…！', 'あうっ…', 'うっ'], callR: ['み、右から来てる！'], callL: ['ひ、左！ 回り込まれてる！'], cover: ['え、援護お願い！'], ammo: ['や、矢がもうないよ〜！'], push: ['い、いけるかも！ 押して！'], fall: ['無理無理、下がる！'], seiran: ['せ、せいらん狙って！'], ladder: ['はしご！ 登ってきてる！'], allydown: ['うそでしょ…', 'やだ…！', 'か、仇とるから…！'], kill: ['や、やった…！', '当たった…！', 'お、おつかれー…！'], order_m: ['ぶ、分隊、前へ！', 'み、みんな、前へ！'], order_a: ['う、撃てー！', 'たけたばに隠れて！'], lead: ['わ、私が指揮をとる…！ ついてきて！'] } },
  冷静: { desc: '冷静', pitch: 0.95, rate: 0.95, speed: 1.0, atkCd: [1.0, 1.5], hideT: [1.5, 2.5], aimErr: 0.008, aimT: 1.2, keep: [18, 28], retreat: false,
    lines: { spot: ['目標、確認。', '捕捉しました。', '…見えています。'], attack: ['射ます。', '狙い通りです。', 'そこです。'], hit: ['…被弾。問題ありません。', 'なるほど、やりますね。', '想定内です。', 'っ…かすっただけです。', 'はっ…いい腕ですね。', 'うっ…！ 修正します。', 'っ…！', 'あっ…。', 'うっ…想定外です。', 'いたっ…問題ありません。', 'えっ、私ですか。', '…当たりましたね。', 'くっ…', 'んっ…', 'え…っ'], defeat: ['…戦死判定、了解です。', '完敗ですね。', '見事な腕前です。', '無念…ここまでですね。', 'くっ…計算違いでした。', 'あとは頼みます…', '無念…。', '脱落します。あとは任せました。', 'くやしいですが、ここまでです。', 'ごめんなさい、先に抜けます。', 'ぐっ…', 'う…'], callR: ['右、来ます。'], callL: ['左、回り込まれています。'], cover: ['援護を。'], ammo: ['矢、残りわずかです。'], push: ['押せます。前へ。'], fall: ['不利です。下がります。'], seiran: ['せいらんを狙って。'], ladder: ['はしご、登ってきます。'], allydown: ['…うそでしょう。', '仇はとります。', '…了解。続けます。'], kill: ['一人。', 'やりました。', 'おつかれさまでした。'], order_m: ['分隊、前へ。', '間合いを詰めます。前へ。'], order_a: ['撃て。', 'たけたばに隠れて。'], lead: ['指揮を引き継ぎます。ついてきて。'] } },
  陽気: { desc: '陽気', pitch: 1.4, rate: 1.15, speed: 1.1, atkCd: [0.9, 1.5], hideT: [1.0, 2.0], aimErr: 0.045, aimT: 0.8, keep: [14, 24], retreat: false,
    lines: { spot: ['みーつけたっ！', 'いっくよー！', 'あ、いたいた！ 勝負〜！'], attack: ['それっ！', 'くらえ〜っ！', 'えーいっ！'], hit: ['わっ、やったなー！', 'あはは、当たっちゃった！', 'もー、ずるい〜！', 'きゃっ！ やったなー！', 'うっ…！ 今のは効いた！', 'いやっ！ 当てられちゃった！', 'きゃっ！', 'いたっ！ もー！', 'あっ…！ やられたかも！', 'ちょ、待って！', 'うそ、当たった…', 'えっ、私？ うそでしょ！', 'あうっ！', 'いっ…！', 'えっ…！', 'うっ'], defeat: ['やられた〜！', 'あちゃ〜、負けちゃった！', 'あー、楽しかった〜！', 'きゃあっ！ やられた〜！', '悔しい〜！ 次は勝つからね！', 'すみません、脱落です！', 'やられたー…！', 'ごめん…先に抜けるね！', 'くやしい〜！', 'おつかれー…私はここまで！', 'あっ…！', 'うっ…', 'うっ'], callR: ['右から来てるよー！'], callL: ['左、回り込まれてる！'], cover: ['援護お願い！'], ammo: ['矢、あと少ししかないよー！'], push: ['いけるいける、押して！'], fall: ['無理無理、下がるー！'], seiran: ['せいらん狙ってー！'], ladder: ['はしご、登ってきてるよ！'], allydown: ['うそでしょ…！', '仇とるからね！', 'えっ、やだ…！'], kill: ['よっしゃ！', 'やったー！', 'おつかれー！'], order_m: ['分隊、前へー！', 'みんな、行くよー！'], order_a: ['撃てー！', 'たけたばに隠れてー！'], lead: ['私が指揮とるね！ ついてきて！'] } },
};
const PERS_KEYS = Object.keys(PERS);
// 分隊どうしの助け合いの掛け声（援護射撃・負傷者の後送・迂回・救援・増援）。収録が無いものは読み上げ
const SUP_LINES = {
  好戦的: { support: ['援護に回るよ！ そっちの敵、こっちで引き受けた！', '加勢する！ 押し返すよ！'], carry: ['ほら、肩貸して！ 救護所まで下がるよ！', 'つかまって！ 後ろまで連れてく！'], flank: ['横から回り込むよ、ついてきて！', '脇から一気に崩す！'], relieve: ['隊長がいないなら、こっちが支える！', '今行く！ 持ちこたえて！'], reinf: ['増援に来たよ！ ここから一緒に！', '助っ人到着！ 任せて！'] },
  慎重: { support: ['援護射撃、入ります。少し下がってください。', 'そちらを援護します。'], carry: ['負傷者を下げます。足元に気をつけて。', '肩につかまってください。救護所へ。'], flank: ['側面に回ります。静かに。', '回り込みます。合図を待って。'], relieve: ['隊長の代わりに、こちらで支えます。', '救援に入ります。陣形を立て直して。'], reinf: ['増援です。こちらの隊に入ります。', '合流しました。指示をください。'] },
  臆病: { support: ['え、援護します！ がんばって！', 'こ、こっちからも撃ちますから！'], carry: ['だ、大丈夫？ 一緒に下がろう…！', 'つかまって…！ 救護所まで行こう！'], flank: ['よ、横から行くんですね…了解です…！', '回り込みます…置いていかないで…！'], relieve: ['た、助けに来ました…！', 'ひとりにしないから…！'], reinf: ['ぞ、増援です…よろしくお願いします…！', 'こ、こっちに入ります…！'] },
  冷静: { support: ['援護射撃に入ります。', '隣の隊を援護。そちらへ。'], carry: ['負傷者を後送します。', '肩を。救護所まで下がります。'], flank: ['側面へ回ります。', '迂回します。正面は任せました。'], relieve: ['指揮系統を補います。こちらへ。', '救援に入ります。立て直して。'], reinf: ['増援として合流します。', 'こちらの隊に加わります。'] },
  陽気: { support: ['援護するよー！ そっちは任せて！', '助けに来たよ、いっしょに押し返そう！'], carry: ['ほら、つかまって！ いったん下がろ！', '救護所まで一緒に行こっ！'], flank: ['横から回っちゃおう！', 'こっそり回り込むね！'], relieve: ['大丈夫、こっちが支えるから！', '今行くね！ もうちょっとがんばって！'], reinf: ['増援だよー！ よろしくね！', '合流！ にぎやかになるよ！'] },
};
for (const k of PERS_KEYS) if (SUP_LINES[k]) Object.assign(PERS[k].lines, SUP_LINES[k]);
// v7：名前の幅を広げる（よくある苗字と名前）。名のある娘（秘書課・固有の娘）はそのまま、一般の兵（同じ写真の二人目も）はこの合わせた中から
const NEW_NAMES = ['佐藤 美咲', '鈴木 陽菜', '高橋 結衣', '田中 愛美', '伊藤 莉子', '渡辺 彩花', '山本 優奈', '中村 美月', '小林 紗希', '加藤 七海',
  '吉田 真央', '山田 葵', '佐々木 凛', '松本 遥', '井上 千尋', '木村 瑞希', '林 里奈', '清水 明日香', '森 沙織', '池田 菜々子'];
const NAME_YOMI = { 美咲: 'みさき', 陽菜: 'ひな', 結衣: 'ゆい', 愛美: 'まなみ', 莉子: 'りこ', 彩花: 'あやか', 優奈: 'ゆうな', 美月: 'みづき', 紗希: 'さき', 七海: 'ななみ',
  真央: 'まお', 遥: 'はるか', 千尋: 'ちひろ', 瑞希: 'みずき', 里奈: 'りな', 明日香: 'あすか', 沙織: 'さおり', 菜々子: 'ななこ',
  佐藤: 'さとう', 鈴木: 'すずき', 高橋: 'たかはし', 田中: 'たなか', 伊藤: 'いとう', 渡辺: 'わたなべ', 山本: 'やまもと', 中村: 'なかむら', 小林: 'こばやし', 加藤: 'かとう',
  吉田: 'よしだ', 山田: 'やまだ', 佐々木: 'ささき', 松本: 'まつもと', 井上: 'いのうえ', 木村: 'きむら', 林: 'はやし', 清水: 'しみず', 森: 'もり', 池田: 'いけだ' };   // 合成音声の読み
const SURN_ALL = [...new Set([...SURN, ...NEW_NAMES.map(n => n.split(' ')[0])])], GIVEN_ALL = [...new Set([...GIVEN, ...NEW_NAMES.map(n => n.split(' ')[1])])];
let NAMED = null;   // 名のある娘のフルネーム（空白なし）と苗字：一般の兵には使わない
function namedSets() {
  if (NAMED) return NAMED;
  const full = new Set(), surn = new Set();
  const add = nm => { if (!nm) return; const p = nm.replace(/^(秘書課|笛役|組頭)\s+/, '').split(' '); if (p.length < 2) return; full.add(p.join('')); surn.add(p[0]); };
  for (const k in GIRLS) if (GIRLS[k].prof) add(GIRLS[k].prof.name);
  for (const o of [sec, sec2, ojou, fluter, ...aides]) add(o.name);
  return NAMED = { full, surn };
}
let usedNames = new Set();
function makeProfile() {
  let name = '';
  const N = namedSets(), onField = nm => enemies.some(o => o.state !== 'down' && o.prof.name.replace('組頭 ', '') === nm);
  for (let k = 0; k < 40; k++) {
    const whole = Math.random() < 0.3;
    name = whole ? pick(NEW_NAMES) : pick(SURN_ALL) + ' ' + pick(GIVEN_ALL);
    const [sn] = name.split(' ');
    if (N.full.has(name.replace(' ', '')) || (!whole && N.surn.has(sn)) || onField(name)) continue;   // 名のある娘と同じ名前・苗字は避ける。戦場に同じ名前は二人いない
    if (!usedNames.has(name) || k > 25) break;
  }
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
  if (kind === 'kill' && e.prof && e.prof.pers === '陽気' && VoicePack.buf && VoicePack.buf['cheer_kill_1_1.mp3']) {
    if (VoicePack.play('cheer_kill_1_1.mp3', d, Math.max(prio, 1), 1)) return;
  }
  if (VoicePack.say(e.prof.pers, kind, i, e.prof.vv, d, prio, { text: lines[i], prof: e.prof })) return;
  Voice.say(lines[i], e.prof, prio);
}

// ====================================================================
//  ゲーム状態
// ====================================================================
const player = { pos: new V3(), speedT: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, kills: 0, allyKills: 0, arrows: 30, weapon: 0, knife: true, knifeT: 0,
  drawing: false, charge: 0, swingT: -1, swingCd: 0, regenT: 0, hurtT: 0, switchT: 0, bob: 0, onGround: true, shake: 0, god: false };
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
  const m = e.medBy, mp = (MECH.on && e.team === 'blue') ? mechMedCenter() : medPost[e.team];
  if (m && m.state !== 'down' && Math.hypot(m.s.position.x - p.x, m.s.position.z - p.z) < 7) { e.kneel = true; e.woundWait = true; e.faceWant = Math.atan2(m.s.position.x - p.x, m.s.position.z - p.z); e.passive = true; return true; }
  const [hx, hz] = mp || e.home || [p.x, p.z], d = Math.hypot(hx - p.x, hz - p.z);
  const eb = e.escortBy, pulled = eb && isUp(eb) && eb.escort === e && Math.hypot(eb.s.position.x - p.x, eb.s.position.z - p.z) < 2.2;   // 仲間が肩を貸すと少し速く下がれる
  if (d > 4.5) { e.kneel = false; e.woundWait = false; steer(e, hx, hz, e.speed * (pulled ? 1.5 : 1), dt); }
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
const isFoe = e => e.team === 'orange' && !e.special && e.state !== 'down';   // 波の残り：救護班など非戦闘員が残っても波は終わらせる
// 増援の上限は戦闘員だけ。頭上の「残敵・味方」は livingHead（全員）
const aliveOf = team => enemies.filter(e => e.team === team && e.state !== 'down' && !e.special);
const livingHead = team => enemies.filter(e => e.team === team && e.state !== 'down').length;
// team: 'orange'（敵・橙組） / 'blue'（味方・青組）
function spawnEnemy(x, z, kind, captain, team = 'orange', opt = {}) {
  const g = (opt.girl && GIRLS[opt.girl]) || pickGirl(kind, opt.perch);
  if (!g) return null;
  const spr = g.spr;                                    // 照準パネルの顔写真
  const prof = makeProfile(), n = wave.n;
  prof.glasses = false;
  if (g.prof && !opt.medic && !opt.aide && !enemies.some(o => o.girl === g && o.state !== 'down')) Object.assign(prof, g.prof);   // 固有の娘（同じ写真が同時に二人いれば二人目は一般の名前）
  if (opt.secretary) Object.assign(prof, { name: sec.name, pers: '冷静', cm: 160, vv: 1 });
  if (opt.fluter) Object.assign(prof, { name: fluter.name, pers: '陽気', cm: 156, vv: 2 });
  if (opt.sec2) Object.assign(prof, { name: sec2.name, pers: '陽気', cm: 158, vv: 2 });
  if (opt.medic) Object.assign(prof, { name: opt.medName, pers: opt.role === 'nurse' ? '陽気' : '冷静', cm: opt.role === 'nurse' ? 157 : 163, vv: opt.role === 'nurse' ? 2 : 1 });
  if (opt.aide) Object.assign(prof, { name: opt.aide.name, pers: opt.aide.pers, cm: opt.aide.cm, vv: opt.aide.vv });
  if (opt.ojou) Object.assign(prof, { name: ojou.name, pers: '冷静', cm: 158, vv: 0 });
  const P = PERS[prof.pers];
  VoicePack.prioritize(prof.pers);
  if (captain) prof.name = '組頭 ' + prof.name;
  const figH = prof.cm / 100;
  const mat = spriteMat(g.front.tex), mats = [mat];
  const s = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.order = 'YXZ';
  const bb = new THREE.Mesh(spriteGeo, mat); bb.frustumCulled = false; tilt.add(bb); s.add(tilt);
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
  e.climber = kind === 'archer' && team === ATK() && Math.random() < 0.25;
  e.raider = kind === 'mob' && team === ATK() && !e.special && Math.random() < 0.35;   // 梯子攻め役（約1/3）：砦の中に入ると櫓・足場の弓兵を狙って梯子を上る   // 砦の中で梯子を上る弓兵（約1/4）
  e.smoker = CASTLE.on && kind === 'mob' && team === CA() && !e.special && !e.raider && Math.random() < 0.16 && enemies.filter(o => o.smoker && isUp(o)).length < 3;   // v8：毒煙玉の投げ手（数人）
  if (e.smoker) e.smokeCd = rand(4, 9);
  if (opt.set) Object.assign(e, opt.set);
  if (kind === 'mob' && !e.special && !e.ramCrew && !e.hiddenAmb && (opt.yari === 1 || (opt.yari !== -1 && Math.random() < YARI.rate))) { e.yari = true; makeYari(e); }   // 槍兵（近接の約2割）
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
const TROOP_K = (() => { const v = parseFloat(new URLSearchParams(location.search).get('troops')); return isFinite(v) && v > 0 ? v : 2.28; })();   // ?troops=1 で以前の人数（v7：1.75→2.28、約+30%。?troops=1.75 で v6 の人数）
// 青組（味方）を一人出す。平原：プレイヤーの後方。櫃の戦い：弓兵は櫃・武者走りの射撃位置、近接兵は門の内側
function spawnAlly() {
  if (MTN.on) {
    const west = enemies.filter(e => e.team === 'blue' && e.mtnSide === 'west' && e.state !== 'down').length;
    const east = enemies.filter(e => e.team === 'blue' && e.mtnSide === 'east' && e.state !== 'down').length;
    const side = west <= east ? 'west' : 'east';
    const x = side === 'west' ? rand(-1.05, 1.05) : rand(10.95, 13.05);
    const z = rand(70, 78);
    const kind = Math.random() < 0.55 ? 'archer' : 'mob';
    const ne = spawnEnemy(x, z, kind, false, 'blue', { y: 0, set: { mtnSide: side } });
    if (ne) mtnGiveSlot(ne);
    return ne;
  }
  if (SNOW.on) {
    const kind = Math.random() < 0.34 ? 'archer' : 'mob';
    const x = clamp(player.pos.x + rand(-2.4, 2.4), -7.2, 7.2);
    const z = clamp(player.pos.z + rand(5, 13), -100, 100);
    return spawnEnemy(x, z, kind, false, 'blue');
  }
  const kind = Math.random() < (PLANE.on ? 0.3 : (CASTLE.atk || FORT.atk) ? 0.4 : ARCHER_RATE) ? 'archer' : 'mob';   // 攻める：攻め手は近接が多め
  if (PLANE.on) return spawnEnemy(rand(-1.0, 1.0), rand(12.5, 13.3), kind, false, 'blue');   // 機内：前方（ラウンジ側）から援軍
  if (CASTLE.on) return CASTLE.atk ? castleAtkSpawn(kind) : castleAllySpawn(kind);
  if (builtStage === 'fort' && FORT.atk) return spawnEnemy(rand(-30, 30), rand(-74, -60), kind, false, 'blue');   // 攻める：門の外の竹束の列の後ろから
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
  if (MECH.on) {
    const R = MECH.rally;
    if (R) return spawnEnemy(rand(-8, 8), rand(R.z - 24, R.z - 7), kind, false, 'blue');
    return spawnEnemy(rand(-8, 8), rand(14, 20.5), kind, false, 'blue');
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
  fort: { blue: [['guard', '近衛分隊'], ['gate', '城門分隊'], ['melee', '近接分隊'], ['yari', '槍分隊'], ['tw1', '第1櫃分隊'], ['tw2', '第2櫃分隊'], ['roam', '遊撃弓隊']],
          orange: [['seiran', '井闌隊'], ['ladder', 'はしご隊'], ['yari', '槍分隊'], ['m1', '第1近接部隊'], ['m2', '第2近接部隊'], ['roam', '遊撃弓隊']] },
  castle: { blue: [['guard', '近衛分隊'], ['yari', '槍衆'], ['gate', '大手門守備隊'], ['bailey', '二の丸分隊'], ['ambush', '奥御殿伏兵隊']],
            orange: [['ram', '破門隊'], ['yari', '槍隊'], ['a1', '第1攻撃隊'], ['a2', '第2攻撃隊'], ['bow', '弓隊']] },
  beach: { blue: [['guard', '近衛分隊'], ['b1', '第1小早隊'], ['b2', '第2小早隊'], ['b3', '第3小早隊'], ['b4', '第4小早隊'], ['b5', '第5小早隊'], ['b6', '第6小早隊']],
           orange: [['p1', '第1トーチカ隊'], ['p2', '第2トーチカ隊'], ['p3', '第3トーチカ隊'], ['p4', '第4トーチカ隊']] },
  snow: { blue: [['guard', '近衛分隊'], ['front', '雪峡谷先遣隊'], ['melee', '近接分隊'], ['yari', '槍分隊'], ['roam', '遊撃弓隊']], orange: [['m1', '雪壁守備隊'], ['m2', 'クレバス伏兵隊'], ['yari', '氷槍隊'], ['roam', '氷弓隊']] },   // 浜：攻め手は舟ごと、守り手はトーチカごと
  mtn: { blue: [['guard', '近衛分隊'], ['west', '西峰攻撃隊'], ['east', '東峰攻撃隊'], ['ramw', '西破城隊'], ['rame', '東破城隊']],
         orange: [['west', '西峰守備隊'], ['east', '東峰守備隊'], ['nino', '二の丸伏兵隊'], ['hon', '本丸守備隊']] },
  twofront: { blue: [['k_gh', '王・大手門'], ['k_slit', '王・狭間'], ['k_tower', '王・櫓'], ['k_gt', '王・二の丸門'], ['k_amb', '王・伏兵'], ['k_yari', '王・槍衆'], ['k_guard', '王・近衛'], ['s_guard', '西園寺・近衛'], ['s_den', '西園寺・伝令'], ['s_west', '西園寺・西峰'], ['s_east', '西園寺・東峰'], ['s_nino', '西園寺・二の丸'], ['s_hon', '西園寺・本丸']],
              orange: [['k_ram', '城・破門隊'], ['k_yari', '城・槍隊'], ['k_atk', '城・攻撃隊'], ['k_bow', '城・弓隊'], ['s_west', '山・西攻め'], ['s_east', '山・東攻め'], ['s_bow', '山・弓隊']] },
  plane: { blue: [['guard', '近衛分隊'], ['front', '前方客室分隊'], ['rear', '後方客室分隊']], orange: [['front', '前方奴襲隊'], ['rear', '後方奴襲隊']] },   // 機内：客室の前と後ろ
  plains: { blue: [['guard', '近衛分隊'], ['front', '前衛分隊'], ['melee', '近接分隊'], ['yari', '槍分隊'], ['a1', '第1弓分隊'], ['a2', '第2弓分隊'], ['roam', '遊撃弓隊']],   // 平原には櫃がないので弓分隊
            orange: [['m1', '第1近接部隊'], ['m2', '第2近接部隊'], ['yari', '槍分隊'], ['a1', '第1弓分隊'], ['a2', '第2弓分隊'], ['roam', '遊撃弓隊']] },
};
// v9 攻める：分隊名を入れ替え（近衛分隊は殿の側のまま）
const SQUAD_ATK = {
  fort: { blue: [['guard', '近衛分隊'], ['seiran', '井闌隊'], ['ladder', 'はしご隊'], ['yari', '槍分隊'], ['m1', '第1近接部隊'], ['m2', '第2近接部隊'], ['roam', '遊撃弓隊']],
          orange: [['gate', '城門分隊'], ['melee', '近接分隊'], ['yari', '槍分隊'], ['tw1', '第1櫃分隊'], ['tw2', '第2櫃分隊'], ['roam', '遊撃弓隊']] },
  castle: { blue: [['guard', '近衛分隊'], ['ram', '破門隊'], ['yari', '槍隊'], ['a1', '第1攻撃隊'], ['a2', '第2攻撃隊'], ['bow', '弓隊']],
            orange: [['yari', '槍衆'], ['gate', '大手門守備隊'], ['bailey', '二の丸分隊'], ['ambush', '奥御殿伏兵隊']] },
};
const squads = { blue: [], orange: [] };
const SQ = { callT: 0, tickT: 0, pending: [], log: [], ord: [], supT: 3, cmdT: 12 };   // log：最近の掛け声（確認用）
const sqLog = (k, e) => { SQ.log.push(k + ':' + (e.sq ? e.sq.name : e.team) + ':' + e.prof.name); if (SQ.log.length > 60) SQ.log.shift(); };
const AMMO_MAX = 24;   // 青組の弓兵の矢（伝令が補給する）。橙組は矢切れなし
function resetSquads() {
  const D = (CASTLE.atk || FORT.atk) ? SQUAD_ATK[builtStage] : SQUAD_DEFS[builtStage] || SQUAD_DEFS.plains;
  for (const t of ['blue', 'orange']) squads[t] = D[t].map(([k, name]) => ({ k, name, team: t, members: [], leader: null, lost: 0, joined: 0, cd: {}, needAmmo: false, served: null, archers: /^(tw|roam|seiran|bow|k_gh|k_slit|k_tower|k_gt|k_bow|s_bow)/.test(k) || (/^a\d/.test(k) && builtStage !== 'castle') || (k === 'gate' && builtStage === 'castle') }));
  SQ.callT = 0; SQ.pending.length = 0;
  nameSquads();
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
  if (e.guard) s = DUAL.on ? sqBy(t, 'k_guard') : sqBy(t, 'guard');
  else if (e.saiGuard) s = sqBy(t, 's_guard');
  else if (e.saiRunner) s = sqBy(t, 's_den');
  else if (BEACH.on) s = t === 'blue' ? (e.boatSq ? sqBy(t, e.boatSq) : pickBalanced(t, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])) : (e.pb != null ? sqBy(t, 'p' + (e.pb + 1)) : pickBalanced(t, ['p1', 'p2', 'p3', 'p4']));
  else if (e.yari && !e.ramCrew && !e.ambush && !e.seated && !PLANE.on && sqBy(t, 'yari')) s = sqBy(t, 'yari');
  else if (CASTLE.on) s = t === CD() ? sqBy(t, e.ambush ? 'ambush' : (e.perch || CASTLE.phase === 0) ? 'gate' : 'bailey') : sqBy(t, e.ramCrew ? 'ram' : e.kind === 'archer' ? 'bow' : 'x') || pickBalanced(t, ['a1', 'a2']);
  else if (PLANE.on) s = e.seated || PLANE.intro ? sqBy(t, e.s.position.z > -4 ? 'front' : 'rear') : pickBalanced(t, ['front', 'rear']);   // 席の位置で前・後ろ、援軍は少ない方へ
  else if (MTN.on) s = t === 'orange'
    ? sqBy(t, e.mtnZone === 'hon' ? 'hon' : e.mtnZone === 'nino' ? 'nino' : e.mtnSide === 'east' ? 'east' : 'west')
    : (e.ramCrew ? sqBy(t, e.mtnSide === 'east' ? 'rame' : 'ramw') : sqBy(t, e.mtnSide === 'east' ? 'east' : 'west'));
  else if (DUAL.on) {
    if (e.dualSq && sqBy(t, e.dualSq)) s = sqBy(t, e.dualSq);
    else if (e.missionFront === 'saionji') s = t === 'blue'
      ? sqBy(t, e.mtnZone === 'hon' ? 's_hon' : e.mtnZone === 'nino' ? 's_nino' : e.mtnSide === 'east' ? 's_east' : 's_west')
      : sqBy(t, e.kind === 'archer' ? 's_bow' : e.mtnSide === 'east' ? 's_east' : 's_west');
    else if (t === 'blue') s = sqBy(t, (e.ambush || e.hiddenAmb) ? 'k_amb' : e.perch && e.perch.gh ? 'k_gh' : e.perch && e.perch.gt ? 'k_gt' : e.perch && e.perch.tower ? 'k_tower' : e.perch && e.perch.slit ? 'k_slit' : 'k_yari');
    else s = sqBy(t, e.ramCrew ? 'k_ram' : e.yari ? 'k_yari' : e.kind === 'archer' ? 'k_bow' : 'k_atk');
  }
  else if (SNOW.on) s = e.kind === 'archer' ? sqBy(t, 'roam') : (t === 'blue' ? sqBy(t, e.screen ? 'front' : 'melee') : pickBalanced(t, ['m1', 'm2']));
  else if (t === DEF() && (t === 'blue' || fort)) {
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
  if (!isUp(L) || L === e || L.wounded || L.seated || !L.tgt || L.perch || L.lad || L.onFloor || L.climb || e.perch || e.lad || e.onFloor || e.climb || e.wounded || e.defending || e.returning || !e.tgt
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
    s.leader = null; s.needRelief = time; if (nb) SQ.pending.push({ t: time + 1.6, fn: () => { if (isUp(nb) && !isUp(s.leader)) setLeader(s, nb, true); } });
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
  squadSupport(dt);
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
    if (lt && !L.passive) { const tp = tgtPos(lt), td = Math.hypot(tp.x - lp.x, tp.z - lp.z); if (s.k === 'yari') { if (td < 14 && (s.cd.yr || 0) < time) { s.cd.yr = time + 30; yariSay(L, 'yari_ready'); sqLog('yari_ready', L); } } else if (s.k === 'guard') { /* 近衛の掛け声は guardBrain */ } else if (td < (s.archers ? 36 : 24)) sqCall(s, L, s.archers ? 'order_a' : 'order_m', 25, 1); }
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
// ---- 分隊の呼び名と、分隊どうしの助け合い ----
//   呼び名（紅椿隊・白鷺隊…）は分隊表・頭上の札・照準の名札に出る。役目の名前（近接分隊など）は s.role に残す
//   助け合い：押されている隣の隊への援護（弓は相手の敵を狙い、近接は駆けつける）／負傷した仲間に肩を貸して救護所へ下げる／
//   側面への迂回／隊長を失った隊の救援／減った隊への増援。秘書課 西園寺 すみれは侍大将として青組の2〜3隊に采配（前進・堅守・援護・迂回）
const SQ_NICKS = ['紅椿隊', '白鷺隊', '山吹隊', '藤波隊', '若竹隊', '撫子隊', '桔梗隊', '菖蒲隊', '白百合隊', '牡丹隊', '楓隊', '朝顔隊', '竜胆隊', '萩隊',
  '鈴蘭隊', '青葉隊', '霞隊', '雲雀隊', '千鳥隊', '翡翠隊', '紫苑隊', '水仙隊', '菫隊', '紅葉隊', '桜花隊', '月見隊', '小百合隊', '朧月隊'];
const SQ_ORD = { support: '援護', flank: '迂回', relieve: '救援', advance: '前進', hold: '堅守' };
const SQ_NOORD = /guard|den/;   // 近衛・伝令は命令を受けない
const sqDisp = s => s.role && s.role !== s.name ? `${s.name}（${s.role}）` : s.name;
const sqOrd = s => s && s.order && s.order.until > time ? s.order : null;
const sqLead = s => isUp(s.leader) ? s.leader : sqAlive(s)[0];
function nameSquads() {   // 面ごとに決まった並び（毎波で名前が変わらない）
  const pool = SQ_NICKS.slice(); let h = 7;
  for (const c of String(builtStage) + (CASTLE.atk || FORT.atk ? 'atk' : '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = pool.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let n = 0;
  for (const t of ['blue', 'orange']) for (const s of squads[t]) {
    s.role = s.name; s.name = pool[n++ % pool.length];
    s.order = null; s.pushCd = 0; s.flankCd = time + 25 + Math.random() * 20; s.reinfCd = 0; s.escCd = 0; s.needRelief = 0; s.cmd = false;
  }
  SQ.supT = 3; SQ.cmdT = 12; SQ.cmdHello = false; ojou.cmd = [];
  if (!SQ.ord) SQ.ord = [];
}
function sqOrder(s, type, o = {}) {
  s.order = Object.assign({ type, until: time + (o.dur || 16), t0: time }, o);
  for (const m of sqAlive(s)) m.regroup = false;
  SQ.ord.push({ t: +time.toFixed(1), team: s.team, s: s.name, type, to: o.to ? o.to.name : null, by: o.by || 'auto' });
  if (SQ.ord.length > 60) SQ.ord.shift();
}
const sqMoveOK = () => !PLANE.on;   // 機内は狭いので動きの命令は出さない（掛け声だけ）
const sqFlankOK = () => !(CASTLE.on || FORT.on || PLANE.on || MTN.on || DUAL.on || BEACH.on);   // 地形の込み入った面では迂回しない
const sqFree = m => isUp(m) && !m.wounded && !m.perch && !m.lad && !m.onFloor && !m.climb && !m.seated && !m.ramCrew && !m.guard && !m.special && !m.defending && !m.returning && !m.escort && !m.silenced;
function medPointOf(e) { const mp = (MECH.on && e.team === 'blue') ? mechMedCenter() : medPost[e.team]; return mp || null; }
// 命令・後送で今フレームの動きが決まるとき true
function squadOrderMove(e, dt) {
  if (!SQUAD_ON) return false;
  if (e.escort) return escortMove(e, dt);
  if (e.sq && e.sq.cmd && ojou.field) { const r = ojouProtect(e, dt); if (r !== null) return r; }
  const s = e.sq, o = sqOrd(s);
  if (!o || o.x === undefined || !sqMoveOK() || !sqFree(e) || !['approach', 'advance'].includes(e.state) || (o.y !== undefined && Math.abs(e.baseY - o.y) > 0.6)) return false;
  const p = e.s.position, arch = e.kind === 'archer';
  if (arch && (o.type === 'support' || o.type === 'relieve') && isUp(o.foe) && e.tgt !== o.foe && Math.hypot(o.foe.s.position.x - p.x, o.foe.s.position.z - p.z) < 38) { e.tgt = o.foe; e.tgtT = 1.5; }   // 援護射撃：隣の隊に迫る敵を狙う
  const tp = e.tgt ? tgtPos(e.tgt) : null, td = tp ? Math.hypot(tp.x - p.x, tp.z - p.z) : 1e9;
  if (td < (arch ? 24 : o.type === 'hold' ? 6 : 7.5)) return false;   // 交戦距離に入ったら各自の判断
  if (o.done && o.done.has(e)) return false;
  const i = Math.max(0, s.members.indexOf(e)), a = i * 2.4 + (e.team === 'blue' ? 0 : Math.PI), r = 1.6 + (i % 3) * 1.4;
  const gx = o.x + Math.cos(a) * r, gz = o.z + Math.sin(a) * r, d = Math.hypot(gx - p.x, gz - p.z);
  if (o.type === 'hold') {
    if (d < 4) { if (tp) e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z); e.ordT = time; return !arch; }   // 持ち場で構えて待つ（弓は撃ってよい）
  } else if (d < (o.type === 'flank' ? 3 : 5)) { (o.done || (o.done = new Set())).add(e); return false; }
  steer(e, gx, gz, e.speed * (o.type === 'support' || o.type === 'relieve' ? 1.2 : o.type === 'flank' ? 1.15 : 1.05), dt);
  e.ordT = time;   // 命令に従って動いた時刻（確認用）
  return true;
}
function endEscort(e) { const w = e.escort; if (w && w.escortBy === e) w.escortBy = null; e.escort = null; e.tagKey = ''; }
function escortMove(e, dt) {   // 負傷した仲間の横（敵の側）に付いて救護所まで下がる
  const w = e.escort, p = e.s.position;
  if (!isUp(e) || !isUp(w) || !w.wounded || time > e.escortT || e.wounded || e.perch || e.lad || e.onFloor) { endEscort(e); return false; }
  const wp = w.s.position, mp = medPointOf(w);
  if (!mp || Math.hypot(mp[0] - wp.x, mp[1] - wp.z) < 5.5 || w.medBy) { endEscort(e); return false; }
  for (const o of enemies) if (o.team !== e.team && isUp(o) && !o.special && Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < 2.6) return false;   // 目の前の敵には応戦
  const ang = Math.atan2(mp[0] - wp.x, mp[1] - wp.z), sd = e.escSide || 1;
  const gx = wp.x + Math.cos(ang) * 0.85 * sd, gz = wp.z - Math.sin(ang) * 0.85 * sd, d = Math.hypot(gx - p.x, gz - p.z);
  if (e.state !== 'approach' && e.state !== 'advance') { e.state = 'approach'; e.t = 0; npcTint(e, 0); }
  e.cover = null;
  if (d > 0.3) steer(e, gx, gz, e.speed * (d > 3 ? 1.3 : 0.85), dt);
  e.faceWant = d > 1.5 ? Math.atan2(gx - p.x, gz - p.z) : ang;
  return true;
}
function squadSupport(dt) {
  if ((SQ.supT -= dt) > 0) return;
  SQ.supT = 1;
  const info = new Map();
  for (const t of ['blue', 'orange']) for (const s of squads[t]) {
    const A = sqAlive(s); if (!A.length) { s.order = null; continue; }
    const sp = squadSpot(s), L = sqLead(s); let fx = 0, fz = 0, fn = 0, near = null, nd = 1e9;
    for (const o of enemies) {
      if (o.team === t || !isUp(o) || o.special) continue;
      const d = Math.hypot(o.s.position.x - sp.x, o.s.position.z - sp.z);
      if (d < 22) { fx += o.s.position.x; fz += o.s.position.z; fn++; }
      if (d < nd) { nd = d; near = o; }
    }
    info.set(s, { A, sp, L, y: L.baseY, fn, fx: fn ? fx / fn : 0, fz: fn ? fz / fn : 0, near, nd });
  }
  // 出ている命令の目標点を更新
  for (const [s, I] of info) {
    const o = sqOrd(s); if (!o) { s.order = null; continue; }
    if (o.type === 'support' || o.type === 'relieve') { const J = info.get(o.to); if (!J) { s.order = null; continue; } o.x = J.sp.x; o.z = J.sp.z; o.y = J.y; o.foe = J.near && J.nd < 26 ? J.near : null; }
    else if (o.type === 'advance') { if (!I.near) { s.order = null; continue; } const np = I.near.s.position; o.x = I.sp.x + (np.x - I.sp.x) * 0.6; o.z = I.sp.z + (np.z - I.sp.z) * 0.6; o.y = I.y; }
  }
  const helper = (s, I, maxD) => {   // いちばん近い、手の空いている同じ組の隊
    let best = null, bd = maxD;
    for (const [y, J] of info) {
      if (y === s || y.team !== s.team || SQ_NOORD.test(y.k) || sqOrd(y) || J.A.length < 2 || J.fn >= J.A.length) continue;
      if (Math.abs(J.y - I.y) > 0.6 && !y.archers) continue;
      const d = Math.hypot(J.sp.x - I.sp.x, J.sp.z - I.sp.z); if (d < bd) { bd = d; best = y; }
    }
    return best;
  };
  const say = (s, m, kind, cd, dly = 0) => SQ.pending.push({ t: time + dly, fn: () => { if (isUp(m)) sqCall(s, m, kind, cd, 1); } });
  for (const [s, I] of info) {
    if (SQ_NOORD.test(s.k)) continue;
    const A = I.A;
    // 押されている隊 → 隣の隊が援護射撃・駆けつけ
    if (I.fn >= 3 && I.fn >= A.length * 1.5 && s.pushCd < time) {
      const y = helper(s, I, 40);
      if (y) { s.pushCd = time + 22; sqOrder(y, 'support', { to: s, dur: 15 }); say(y, sqLead(y), 'support', 12); say(s, pick(A), 'cover', 14, 1.8); }
    }
    // 隊長を失った隊 → 近くの隊が救援
    if (s.needRelief && time - s.needRelief > 0.8) {
      const y = helper(s, I, 45); s.needRelief = 0;
      if (y) { sqOrder(y, 'relieve', { to: s, dur: 14 }); say(y, sqLead(y), 'relieve', 10, 0.4); }
    }
    // 減った隊 → 人数に余裕のある隊から1〜2名の増援
    if (A.length <= 2 && s.joined >= 4 && s.reinfCd < time && I.fn > 0) {
      let donor = null, dd = 50;
      for (const [y, J] of info) {
        if (y === s || y.team !== s.team || SQ_NOORD.test(y.k) || J.A.length < 5) continue;
        const d = Math.hypot(J.sp.x - I.sp.x, J.sp.z - I.sp.z); if (d < dd) { dd = d; donor = y; }
      }
      if (donor) {
        const pool = info.get(donor).A.filter(m => m !== donor.leader && sqFree(m) && Math.abs(m.baseY - I.y) < 0.6 && (m.kind === 'archer') === !!s.archers || (m !== donor.leader && sqFree(m) && Math.abs(m.baseY - I.y) < 0.6 && !s.archers));
        const mv = pool.slice(0, Math.min(2, info.get(donor).A.length - 3));
        for (const m of mv) { donor.members.splice(donor.members.indexOf(m), 1); s.members.push(m); s.joined++; m.sq = s; m.reinfT = time + 14; m.regroup = false; m.tagKey = ''; }
        if (mv.length) { s.reinfCd = time + 40; say(s, mv[0], 'reinf', 20, 0.3); SQ.ord.push({ t: +time.toFixed(1), team: s.team, s: s.name, type: 'reinf', to: donor.name, by: 'auto', n: mv.length }); }
      }
    }
    // 迂回：数で押せている近接の隊は側面へ回る
    if (sqFlankOK() && !s.archers && !sqOrd(s) && s.flankCd < time && A.length >= 4 && I.fn >= 2 && I.fn <= A.length && I.nd > 9 && I.nd < 30) {
      s.flankCd = time + 50; flankOrder(s, I, Math.random() < 0.5 ? 1 : -1, 'auto');
      say(s, sqLead(s), 'flank', 20);
    }
    // 負傷した仲間に肩を貸して救護所へ
    if (s.escCd < time && I.fn > 0) {
      const w = A.find(x => x.wounded && !x.woundFight && !x.escortBy && !x.medBy && medPointOf(x) && Math.hypot(medPointOf(x)[0] - x.s.position.x, medPointOf(x)[1] - x.s.position.z) > 10);
      if (w) {
        let mate = null, md = 12;
        for (const m of A) {
          if (m === w || !sqFree(m) || !['approach', 'advance', 'idle'].includes(m.state) || Math.abs(m.baseY - w.baseY) > 0.5) continue;
          const d = Math.hypot(m.s.position.x - w.s.position.x, m.s.position.z - w.s.position.z); if (d < md) { md = d; mate = m; }
        }
        if (mate) {
          s.escCd = time + 20; mate.escort = w; mate.escortT = time + 18; mate.escSide = Math.random() < 0.5 ? 1 : -1; w.escortBy = mate; mate.tagKey = '';
          say(s, mate, 'carry', 15); SQ.ord.push({ t: +time.toFixed(1), team: s.team, s: s.name, type: 'carry', who: mate.prof.name, hurt: w.prof.name, by: 'auto' });
        }
      }
    }
  }
  ojouCommand(info);
  ojouGuardTick();
}
function flankOrder(s, I, side, by, dur = 12) {   // 敵の塊の横（side=+1 右、-1 左。組の正面から見て）
  const fw = s.team === 'blue' ? -1 : 1, rx = -fw;   // 青の正面は -z、右手は +x
  const cx = I.fn ? I.fx : I.near.s.position.x, cz = I.fn ? I.fz : I.near.s.position.z;
  sqOrder(s, 'flank', { x: cx + rx * side * 10, z: cz - fw * 2, y: I.y, side, dur, by });
}

// ---- 侍大将の出陣：城・持ち場を守る面（二正面・城/砦の守り・浜・機内・行軍）以外では、麾下の隊と一緒に前線へ出る ----
//   （平原の行軍＝車と進む面でも前へ）麾下の近接から二人が側に付く護衛、弓は彼女を狙う・近づく敵を優先、ほかの近接は近づく敵を迎え撃つ
function ojouFieldOK() {
  if (!SQUAD_ON || state !== 'play' || ojou.mode !== 'hq' || DUAL.on || PLANE.on || BEACH.on) return false;
  if (CASTLE.on && !CASTLE.atk) return false;
  if (builtStage === 'fort' && !FORT.atk) return false;
  return (ojou.cmd || []).some(s => sqAlive(s).length >= 2);
}
function ojouFieldBrain(e, dt) {
  const p = e.s.position; let x = 0, z = 0, n = 0;
  for (const s of ojou.cmd || []) for (const m of sqAlive(s)) if (!m.wounded && !m.perch && Math.abs(m.baseY - e.baseY) < 0.8) { x += m.s.position.x; z += m.s.position.z; n++; }
  if (n < 2) return false;
  if (!e.ojouArmor) { e.ojouArmor = true; e.hpMax += 6; e.hp += 6; }   // 侍大将の具足（少しだけ打たれ強い）
  x /= n; z /= n;
  const [hx, hz] = e.home, bd = Math.hypot(hx - x, hz - z) || 1;
  let tx = x + (hx - x) / bd * 2.5, tz = z + (hz - z) / bd * 2.5;   // 隊の真ん中のすぐ後ろ（前線に立つが先頭には出ない）
  let nf = null, nd = 1e9;
  for (const o of enemies) { if (o.team === e.team || !isUp(o) || o.special) continue; const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z); if (d < nd) { nd = d; nf = o; } }
  if (nf && nd < 5) { const fx = p.x - nf.s.position.x, fz = p.z - nf.s.position.z, f = Math.hypot(fx, fz) || 1; tx = p.x + fx / f * 4 + (x - p.x) * 0.3; tz = p.z + fz / f * 4 + (z - p.z) * 0.3; }   // 近すぎる敵からは身を引く
  const d = Math.hypot(tx - p.x, tz - p.z);
  if (d > 1.2) steer(e, tx, tz, e.speed * (nd < 5 ? 1.25 : d > 8 ? 1.15 : 0.85), dt);
  e.faceWant = nf && nd < 25 ? Math.atan2(nf.s.position.x - p.x, nf.s.position.z - p.z) : Math.atan2(tx - p.x, tz - p.z);
  return true;
}
function ojouGuardTick() {   // 1秒ごと：彼女への脅威と護衛の割り当て
  const E = ojou.e; ojou.thr = [];
  if (!ojou.field || !isUp(E)) { for (const s of ojou.cmd || []) for (const m of s.members) m.ojouGuard = false; return; }
  const p = E.s.position;
  for (const o of enemies) {
    if (o.team === E.team || !isUp(o) || o.special) continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z);
    if (o.tgt === E || d < 13) ojou.thr.push([d, o]);
  }
  ojou.thr.sort((a, b) => a[0] - b[0]);
  const G = [];
  for (const s of ojou.cmd) for (const m of sqAlive(s)) if (m.ojouGuard) { const gd = Math.hypot(m.s.position.x - p.x, m.s.position.z - p.z); if (sqFree(m) && m.kind !== 'archer' && (gd < 12 || (m.ojouFarT = (m.ojouFarT || 0) + 1) < 6)) { if (gd < 12) m.ojouFarT = 0; G.push(m); } else { m.ojouGuard = false; m.ojouFarT = 0; } }
  if (G.length < 2) {
    const C = [];
    for (const s of ojou.cmd) for (const m of sqAlive(s)) if (!m.ojouGuard && m !== s.leader && m.kind !== 'archer' && sqFree(m) && Math.abs(m.baseY - E.baseY) < 0.6) C.push([Math.hypot(m.s.position.x - p.x, m.s.position.z - p.z), m]);
    C.sort((a, b) => a[0] - b[0]);
    for (const [, m] of C.slice(0, 2 - G.length)) { m.ojouGuard = true; m.regroup = false; G.push(m); }
  }
  G.forEach((m, i) => { m.ojouSlot = i; });
}
// 麾下の隊員の守り。null＝関係なし（ふだんの動き）、true＝今フレームの動きはこれ、false＝交戦は各自で
function ojouProtect(e, dt) {
  const E = ojou.e; if (!isUp(E) || !sqFree(e)) return null;
  const busy = !['approach', 'advance', 'idle'].includes(e.state);
  const p = e.s.position, q = E.s.position, T = ojou.thr || [];
  const thr = T.find(([, o]) => isUp(o));
  if (e.ojouGuard) {
    if (thr && thr[0] < 8) { const o = thr[1]; if (e.tgt !== o) { e.tgt = o; e.tgtT = 0.8; } return false; }   // 近づく敵に立ちはだかる
    if (busy) return false;
    const side = e.ojouSlot ? -1 : 1;
    const a = (E.home ? Math.atan2(q.x - E.home[0], q.z - E.home[1]) : Math.PI) + side * 0.9;   // 進む向きの左右斜め前
    const gx = q.x + Math.sin(a) * 1.9, gz = q.z + Math.cos(a) * 1.9, d = Math.hypot(gx - p.x, gz - p.z);
    if (d > 0.6) steer(e, gx, gz, e.speed * (d > 5 ? 1.35 : 1), dt);
    else if (e.tgt) { const tp = tgtPos(e.tgt); e.faceWant = Math.atan2(tp.x - p.x, tp.z - p.z); }
    return true;
  }
  if (!thr) return null;
  const o = thr[1];
  if (e.kind === 'archer') { if (e.tgt !== o && Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < 36) { e.tgt = o; e.tgtT = 1.2; } return null; }   // 弓：彼女を狙う敵から
  if (thr[0] < 11 && e.tgt !== o && Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < 22) { e.tgt = o; e.tgtT = 1.0; }   // 近接：迎え撃つ
  return null;
}
// 侍大将 西園寺 すみれの采配（青組の2〜3隊）
const OJOU_ORD = {
  support: ['{a}、{b}を援護なさい。', '{a}、{b}が押されておりますわ。お助けなさい。', '{a}は{b}の援護に回りなさい。急いで。'],
  advance: ['{a}、前へお進みなさい。足並みを揃えて。', '{a}、押し上げなさい。今が好機ですわ。', '{a}、前進なさい。わたくしが見ておりますわ。'],
  hold: ['{a}、その場で持ちこたえなさい。無理はなさらないで。', '{a}、陣を崩さずにお待ちなさい。', '{a}、今は堅く守りなさい。焦りは禁物ですわ。'],
  flank: ['{a}は{s}から回り込みなさい。{b}は正面を押さえて。', '{a}、{s}手へお回りなさい。{b}はそのまま前を。'],
  hello: ['{a}、本日はわたくしの采配に従っていただきますわ。', '侍大将として申し付けます。{a}、わたくしに続きなさい。'],
};
function ojouOrderSay(kind, rep) {
  const L = OJOU_ORD[kind], text = L[(Math.random() * L.length) | 0].replace(/\{(\w)\}/g, (_, k) => rep[k] || '');
  SQ.ojouLast = { t: +time.toFixed(1), kind, text }; SQ.ord.push({ t: +time.toFixed(1), team: 'blue', type: 'ojou_' + kind, text, by: 'ojou' });
  // 采配は字幕・声に出さない（記録だけ。隊の動きと頭上の札で分かる）
}
function ojouCommand(info) {
  const e = ojou.e;
  if (!e || !isUp(e) || !SQUAD_ON || PLANE.on) return;
  let C = (ojou.cmd || []).filter(s => info.get(s));
  if (C.length < 2) {   // 麾下の隊を選ぶ（二正面では西園寺の山城の隊から）
    let cand = squads.blue.filter(s => !SQ_NOORD.test(s.k) && info.get(s) && info.get(s).A.length >= 1);
    if (DUAL.on) { const sc = cand.filter(s => /^s_/.test(s.k)); if (sc.length >= 2) cand = sc; }
    cand.sort((a, b) => info.get(b).A.length - info.get(a).A.length);
    for (const s of squads.blue) s.cmd = false;
    C = cand.slice(0, 3); for (const s of C) s.cmd = true; ojou.cmd = C;
    if (C.length < 2) return;
    if (!SQ.cmdHello) { SQ.cmdHello = true; SQ.cmdT = 9; ojouOrderSay('hello', { a: C.map(s => s.name).join('、') }); return; }
  }
  if ((SQ.cmdT -= 1) > 0) return;
  SQ.cmdT = 15 + Math.random() * 8;
  const I = s => info.get(s), names = L => L.map(s => s.name).join('、');
  const engaged = C.filter(s => I(s).fn > 0), foesNear = new Set();
  for (const s of C) for (const o of enemies) if (o.team !== 'blue' && isUp(o) && !o.special && Math.hypot(o.s.position.x - I(s).sp.x, o.s.position.z - I(s).sp.z) < 26) foesNear.add(o);
  const own = C.reduce((a, s) => a + I(s).A.length, 0), anyFoe = C.some(s => I(s).near);
  if (!anyFoe) return;
  const pushed = C.filter(s => I(s).fn >= 3 && I(s).fn >= I(s).A.length * 1.3).sort((a, b) => I(b).fn - I(a).fn)[0];
  const mv = sqMoveOK(), dur = 18;
  if (pushed) {
    const H = C.filter(s => s !== pushed && I(s).A.length >= 1 && I(s).fn < I(s).A.length * 1.3);
    if (H.length) {
      if (mv) for (const s of H) sqOrder(s, 'support', { to: pushed, dur, by: 'ojou' });
      pushed.pushCd = time + 20; ojouOrderSay('support', { a: names(H), b: pushed.name }); return;
    }
  }
  const melee = C.filter(s => !s.archers && I(s).A.length >= 3 && I(s).near && I(s).nd < 32 && I(s).nd > 8);
  if (mv && sqFlankOK() && own >= foesNear.size * 1.3 && melee.length && C.length >= 2 && Math.random() < 0.55) {
    const f = melee[0], side = Math.random() < 0.5 ? 1 : -1, rest = C.filter(s => s !== f);
    flankOrder(f, I(f), side, 'ojou', dur); f.flankCd = time + 40;
    for (const s of rest) sqOrder(s, 'hold', { x: I(s).sp.x, z: I(s).sp.z, y: I(s).y, dur: 14, by: 'ojou' });
    ojouOrderSay('flank', { a: f.name, b: names(rest), s: side > 0 ? '右' : '左' }); return;
  }
  if (foesNear.size > own * 1.2 && engaged.length) {
    if (mv) for (const s of C) sqOrder(s, 'hold', { x: I(s).sp.x, z: I(s).sp.z, y: I(s).y, dur: 14, by: 'ojou' });
    ojouOrderSay('hold', { a: names(C) }); return;
  }
  if (mv) for (const s of C) { const np = I(s).near.s.position; sqOrder(s, 'advance', { x: I(s).sp.x + (np.x - I(s).sp.x) * 0.6, z: I(s).sp.z + (np.z - I(s).sp.z) * 0.6, y: I(s).y, dur: 16, by: 'ojou' }); }
  ojouOrderSay('advance', { a: names(C) });
}
// 分隊の一覧（秘書の戦況報告・一時停止メニュー）
function squadRows(t) {
  const rows = squads[t].map(s => ({ name: sqDisp(s), role: s.role || s.name, n: sqAlive(s).length, lost: s.lost, lead: isUp(s.leader) ? s.leader.prof.name : '' }));
  const sp = (name, list) => rows.push({ name, role: name, n: list.filter(isUp).length, lost: null, lead: '' });
  if (t === 'blue') { sp('伝令', runners.map(R => R.e)); sp('秘書課', [sec.e, sec2.e, ojou.e, ...aides.map(a => a.e)]); }
  sp('医務班', medics[t].map(m => m.e));
  return rows;
}
function squadTable(t, withLead) {
  if (builtStage === 'twofront') return squadTableDual(t, withLead);
  const tm = t === 'blue' ? '<b style="color:#7cc0ff">青組</b>' : '<b style="color:#ffa040">橙組</b>';
  return '<div>' + tm + '<table>' + squadRows(t).map(r => `<tr><td>${r.name}</td><td>${r.n}名</td><td>${r.lost === null ? '' : r.lost ? '脱落' + r.lost : ''}</td>${withLead ? `<td>${r.lead ? '隊長 ' + r.lead.replace('組頭 ', '') : ''}</td>` : ''}</tr>`).join('') + '</table></div>';
}
function squadTableDual(t, withLead) {
  const rows = squadRows(t);
  const groups = t === 'blue'
    ? [['王の城', r => r.role.startsWith('王')], ['西園寺の山城', r => r.role.startsWith('西園寺')], ['本陣', r => !r.role.startsWith('王') && !r.role.startsWith('西園寺')]]
    : [['城攻め', r => r.role.startsWith('城')], ['山攻め', r => r.role.startsWith('山')], ['その他', r => !r.role.startsWith('城') && !r.role.startsWith('山')]];
  const tm = t === 'blue' ? '<b style="color:#7cc0ff">青組</b>' : '<b style="color:#ffa040">橙組</b>';
  let html = '<div>' + tm;
  for (const [title, pred] of groups) {
    const rs = rows.filter(pred); if (!rs.length) continue;
    html += `<div style="margin-top:4px;color:#ffe9b8">${title}</div><table>` + rs.map(r => `<tr><td>${r.name}</td><td>${r.n}名</td><td>${r.lost === null ? '' : r.lost ? '脱落' + r.lost : ''}</td>${withLead ? `<td>${r.lead ? '隊長 ' + r.lead.replace('組頭 ', '') : ''}</td>` : ''}</tr>`).join('') + '</table>';
  }
  return html + '</div>';
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
  const o = e.sq && sqOrd(e.sq), mk = e.escort ? '【後送】' : e.reinfT > time ? '【増援】' : o ? '【' + SQ_ORD[o.type] + '】' : '';
  const pre = e.ojou ? '侍大将' : e.sq ? e.sq.name + (e.sq.leader === e ? '長' : '') + mk : (e.runner || e.saiRunner) ? '伝令' : e.medic ? '医務班' : '';
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
    if (d < TAG_R && (e.sq || e.runner || e.saiRunner || e.medic || e.ojou)) tagNear.push([d, e]);
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
  const FD = MOTION && e.mo && e.mo.D && e.mo.D.fbx ? e.mo.D : null;   // FBX：倒れ終わりの体の向き（横の傾き）と足の位置に合わせて横たわる
  if (FD && !e.lieTilt) e.s.rotation.y = e.fallYaw + clamp(FD.roll, -0.6, 0.6);
  if (e.lieTilt) { e.s.rotation.order = 'YXZ'; e.s.rotation.x = -e.lieTilt; }   // 機内：頭の側が座席・肘掛けに乗る（または通路へ落ちる）
  e.s.updateMatrixWorld(true);
  for (const a of e.stuck) e.s.attach(a);
  e.lying = { t: 0 };
  e.tilt.rotation.set(0, 0, 0); e.tilt.position.set(FD ? FD.px * e.figH : 0, -0.04, e.figH * (0.5 + (FD ? Math.max(0, FD.pz) * 0.5 : 0)));
  setFrame(e, fr, false); e.bb.position.x = 0;
  e.mat.transparent = true; e.mat.needsUpdate = true;
  // 地面に置く写真（真上から見たとき用）
  const dm = new THREE.MeshBasicMaterial({ map: fr.tex, transparent: true, opacity: 0, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const L = e.figH, H = clamp(e.figH * fr.hk, 0.45, 0.55);
  const dc = new THREE.Mesh(new THREE.PlaneGeometry(L, H), dm);
  dc.rotation.order = 'YXZ'; dc.rotation.set(-Math.PI / 2, Math.PI / 2, 0);   // 写真の左（頭）を体の頭の側へ
  dc.position.set(e.tilt.position.x, 0.025, e.tilt.position.z); e.s.add(dc); e.decal = dc; e.mats.push(dm);
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
    if (b.snowPost) {
      b.tilt.rotation.set(0, Math.atan2(camera.position.x - b.s.position.x, camera.position.z - b.s.position.z) - b.s.rotation.y, 0);
      continue;
    }
    const ly = b.lying;
    if (b.lean) { updateLean(b, 0); continue; }
    if (b.slump) { seatPose(b, 1); continue; }
    if (!ly) {
      if (MOTION && b.mo && b.mo.D && b.mo.D.fbx && b.state === 'down') Mo.fallSprite(b, b.mo.D, 0);   // FBX の倒れ終わりの姿のまま
      else if (b.genericCorpse) {
        // 汎用遺体は倒れた姿勢を維持し、視点に合わせて胴体だけ少し向きを補正する。
        b.tilt.rotation.x = Math.PI * 0.43;
        b.tilt.rotation.y = Math.atan2(camera.position.x - b.s.position.x, camera.position.z - b.s.position.z) - b.s.rotation.y;
        b.tilt.rotation.z = (b.id % 2 ? 1 : -1) * 0.10;
      } else if (MOTION && b.mo && b.mo.D && b.state === 'down') Mo.fallSprite(b, b.mo.D, 0);
      continue;
    }   // down画像のない兵種も汎用遺体姿で残す
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
// ====================================================================
//  v7：寄りかかる戦死。柵・胸壁・塀・手すりのすぐそば（0.6m 以内）で倒れた娘は、ときどき（約6割）
//   ・背中を預けて座り込む（sit）　・壁に向かって膝をつき、もたれかかる（kneel）　・手すりに前のめりに覆いかぶさる（drape）
//  のどれかでそのまま残る。写真は横たわった写真（down：頭が左、目を閉じた姿）を腰・膝で折り曲げた数枚の板で表す
//  （それぞれの板は体の軸に沿い、軸のまわりでカメラへ向く）。接地影と、モーション時は影の人形も同じ姿勢。血は無し
// ====================================================================
const LEAN_P = (() => { const v = parseFloat(new URLSearchParams(location.search).get('lean')); return isFinite(v) ? clamp(v, 0, 1) : 0.6; })();
const LEAN_HIP_U = 0.40, LEAN_KNEE_U = 0.70;   // 横たわった写真の、腰（帯）・膝の位置（頭＝0、足先＝1）
const _lm = new THREE.Matrix4(), _lv = new V3(), _lc = new V3(), _lx = new V3();
function findLean(e) {
  if (PLANE.on || e.lad || e.climb || e.seated || e.pit || e.ramCrew || !(e.girl.down || e.girl.slump)) return null;
  const p = e.s.position, y = e.baseY; let best = null, bd = 0.6;
  for (const b of boxes) {
    if (b.noLean || b.y1 <= b.y0 || b.y0 > y + 0.3 || b.y1 < y + 0.7) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < 0.02 || d >= bd) continue;
    let nx = 0, nz = 0, len, ox = cx, oz = cz, thick;
    if (Math.abs(dx) > Math.abs(dz) * 3) { nx = Math.sign(dx); len = b.z1 - b.z0; oz = clamp(p.z, b.z0 + 0.22, b.z1 - 0.22); thick = b.x1 - b.x0; }
    else if (Math.abs(dz) > Math.abs(dx) * 3) { nz = Math.sign(dz); len = b.x1 - b.x0; ox = clamp(p.x, b.x0 + 0.22, b.x1 - 0.22); thick = b.z1 - b.z0; }
    else continue;   // 角は使わない
    if (len < 0.45) continue;
    bd = d; best = { b, nx, nz, ox, oz, rh: b.y1 - y, thick };
  }
  return best;
}
// 倒れた瞬間に呼ぶ：寄りかかるなら姿勢を決めて true
function tryLean(e) {
  const L = findLean(e), pr = e.perch;
  // 狭間（壁の穴）で射っていた娘：穴の下の壁に向かって崩れる（slump の写真があるときだけ）
  if (e.girl.slump && pr && pr.slit && !e.seated && trySlumpSlit(e, pr, L)) return true;
  if (!L) return false;
  const f = e.s.rotation.y, fx = Math.sin(f), fz = Math.cos(f), fd = -(fx * L.nx + fz * L.nz);   // 正：壁の方を向いている
  // v9：門上の胸壁・櫃の胸壁・井闌の手すり（slumpSpot）では、slump の写真がある娘は手すりに前のめりに崩れる（確率 SLUMP_P）
  const spot = L.b.slumpSpot || (pr && (pr.gt || pr.gh || pr.seiran || pr.tower));
  if (e.girl.slump && L.rh >= 0.7 && L.rh <= 1.35 && fd > -0.3 && (spot ? Math.random() < SLUMP_P : (fd > 0.2 && L.thick <= 0.36 && Math.random() < LEAN_P * 0.5))) {
    e.lean = { kind: 'slump', L, rh: L.rh, t: 0, p0: e.s.position.clone(), F: new V3(-L.nx, 0, -L.nz), W: 0 };
    buildSlump(e); return true;
  }
  // slump の写真が無い娘：手すりの持ち場では、横たわった写真を手すりに折り曲げて掛ける（drape）を優先
  const spotDrape = spot && L.rh >= 0.7 && L.rh <= 1.35 && fd > -0.3;
  if (!e.girl.down || (!spotDrape && Math.random() >= LEAN_P)) return false;
  const W = e.figH * e.girl.down.hk * e.girl.down.aspect;
  const hipY = Math.min(L.rh - 0.1, (1 - LEAN_HIP_U) * W * 0.92);
  const railOK = L.rh <= 1.3 && L.rh >= 0.75 && L.thick <= 0.36 && Math.hypot(0.14, L.rh + 0.05 - hipY) < (LEAN_HIP_U - 0.12) * W;
  let kind = (fd > 0.2 || spotDrape) && railOK ? 'drape' : fd > 0.35 ? 'kneel' : fd < -0.2 ? 'sit' : (Math.random() < 0.6 ? 'sit' : 'kneel');
  if (kind === 'kneel' && L.rh < 1.0) kind = 'sit';   // 低い胸壁には膝をついてもたれない
  e.lean = { kind, L, t: 0, side: Math.random() < 0.5 ? -1 : 1, view: null, p0: e.s.position.clone(), W };
  buildLeanPose(e);
  return true;
}
function buildLeanPose(e) {
  const ln = e.lean, L = ln.L, n = new V3(L.nx, 0, L.nz), up = new V3(0, 1, 0), t = new V3(-L.nz, 0, L.nx), W = ln.W;
  const T = LEAN_HIP_U * W, Th = (LEAN_KNEE_U - LEAN_HIP_U) * W, S = (1 - LEAN_KNEE_U) * W;
  const O = new V3(L.ox, e.baseY, L.oz), at = (a, b, c) => O.clone().addScaledVector(n, a).addScaledVector(up, b).addScaledVector(t, c || 0);
  let pts, segs;
  if (ln.kind === 'sit') {          // 背中を預けて座り込む：上体は壁へ少し倒れ、脚は前へ投げ出す
    const H = at(0.22, 0.1), K = H.clone().addScaledVector(n, Th * 0.96).addScaledVector(up, 0.1);
    const fy = 0.05, dh = Math.sqrt(Math.max(0.01, S * S - (K.y - O.y - fy) ** 2)), Fo = K.clone().addScaledVector(n, dh); Fo.y = O.y + fy;
    const tilt = new V3().addScaledVector(up, 0.95).addScaledVector(n, -0.2).addScaledVector(t, 0.14 * ln.side).normalize();
    const Tp = H.clone().addScaledVector(tilt, T);
    pts = { Fo, K, H, Tp }; segs = [['H', 'Tp', LEAN_HIP_U, 0], ['H', 'K', LEAN_HIP_U, LEAN_KNEE_U], ['K', 'Fo', LEAN_KNEE_U, 1]];
    ln.F = n.clone();
  } else if (ln.kind === 'kneel') { // 壁に向かって膝をつき、上体を壁に預ける
    const K = at(0.44, 0.08), Fo = K.clone().addScaledVector(n, S * 0.96); Fo.y = O.y + 0.05;
    const H = K.clone().addScaledVector(new V3().addScaledVector(up, 0.95).addScaledVector(n, -0.2).normalize(), Th);
    const hn = H.clone().sub(O).dot(n), sa = clamp((hn - 0.1) / T, 0.15, 0.8), ca = Math.sqrt(1 - sa * sa);
    const Tp = H.clone().addScaledVector(up, T * ca).addScaledVector(n, -T * sa).addScaledVector(t, 0.08 * ln.side);
    pts = { Fo, K, H, Tp }; segs = [['H', 'Tp', LEAN_HIP_U, 0], ['K', 'H', LEAN_KNEE_U, LEAN_HIP_U], ['K', 'Fo', LEAN_KNEE_U, 1]];
    ln.F = n.clone().negate();
  } else {                          // 手すり・胸壁に前のめりに覆いかぶさる
    const R = L.rh, E = at(-0.01, R + 0.05), E2 = at(-L.thick - 0.04, R + 0.04);
    const H = at(0.13, Math.min(R - 0.1, (S + Th) * 0.92));
    let Fo = at(0.36, 0.03); const dHF = H.distanceTo(Fo), LL = S + Th;
    // 膝：足と腰の間で、前（壁の側）へ少し曲げる
    const mid = H.clone().add(Fo).multiplyScalar(0.5), half = Math.min(dHF / 2, LL / 2 * 0.999), bend = Math.sqrt(Math.max(0, (LL / 2) ** 2 - half * half));
    const K = mid.addScaledVector(n, -bend);
    const L1 = H.distanceTo(E), L2 = E.distanceTo(E2), uE = LEAN_HIP_U - L1 / W, uE2 = uE - L2 / W;
    const hang = Math.max(0.05, uE2) * W, D = new V3().addScaledVector(n, -0.5).addScaledVector(up, -0.86).addScaledVector(t, 0.1 * ln.side).normalize();
    const Tp = E2.clone().addScaledVector(D, hang);
    pts = { Fo, K, H, E, E2, Tp };
    segs = [['K', 'Fo', LEAN_KNEE_U, 1], ['H', 'K', LEAN_HIP_U, LEAN_KNEE_U], ['H', 'E', LEAN_HIP_U, uE], ['E', 'E2', uE, uE2], ['E2', 'Tp', uE2, 0]];
    ln.F = n.clone().negate();
  }
  ln.pts = pts; ln.segs = segs;
  // 立った姿勢（倒れ始め）の同じ点
  const p0 = ln.p0, H0 = e.figH, st = {};
  for (const k in pts) st[k] = p0.clone();
  const uy = { Fo: 0, K: 0.27, H: 0.5, E: 0.68, E2: 0.78, Tp: 1 };
  for (const k in st) st[k].y = e.baseY + uy[k] * H0;
  ln.st = st;
  // 板（写真を区切った数枚）
  const fr = e.girl.down;
  setFrame(e, fr, false); e.tilt.visible = false;
  const grp = new THREE.Group(); scene.add(grp); e.extra.push(grp); ln.grp = grp;
  ln.quads = segs.map(([a, b, u0, u1]) => {
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
    const pa = g.attributes.position.array, ua = g.attributes.uv.array;
    for (let i = 0; i < ua.length / 2; i++) { const x = pa[i * 3], y = pa[i * 3 + 1]; ua[i * 2] = u0 + (u1 - u0) * y; ua[i * 2 + 1] = x + 0.5; }
    const m = new THREE.Mesh(g, e.mat); m.frustumCulled = false; grp.add(m);
    return { m, a, b };
  });
  ln.cur = {}; for (const k in pts) ln.cur[k] = pts[k].clone();
  ln.hd = e.figH * fr.hk;   // 板の幅（横たわった写真の高さ）
}
// ---- v9：手すり・窓枠に前のめりに崩れる（slump）。写真 assets/frames/<id>_slump.png（frames の slump）
//   写真の約束：横から見た姿。左に脚（手すりの手前に立つ側）、右へ上体・腕・頭が手すりの向こうに垂れる。背景は透明。
//   手すりの上端は写真の下から ry（既定 0.55）、左右は左から rx（既定 0.45）の位置。手すりの高さに合わせて大きさを決める
const SLUMP_P = (() => { const v = parseFloat(new URLSearchParams(location.search).get('slump')); return isFinite(v) ? clamp(v, 0, 1) : 0.95; })();
function trySlumpSlit(e, pr, W) {
  if (Math.random() >= SLUMP_P) return false;
  // 狭間の壁：壁が見つかればその面、無ければ射っていた向きを法線にする。穴の下枠（約 1.15m）に上体を預ける
  const f = e.s.rotation.y, nx = W ? W.nx : -Math.sin(f), nz = W ? W.nz : -Math.cos(f);
  const L = { b: W ? W.b : null, nx, nz, ox: W ? W.ox : e.s.position.x - nx * 0.35, oz: W ? W.oz : e.s.position.z - nz * 0.35, rh: 1.15, thick: 0.3, slit: true };
  e.lean = { kind: 'slump', L, rh: 1.15, t: 0, p0: e.s.position.clone(), F: new V3(-nx, 0, -nz), W: 0 };
  buildSlump(e); return true;
}
function buildSlump(e) {
  const ln = e.lean, fr = e.girl.slump;
  ln.ry = fr.ry || 0.55; ln.rx = fr.rx == null ? 0.45 : fr.rx;
  const hn = e.figH * (fr.hk || 0.9), hr = ln.rh / ln.ry;
  ln.h = clamp(hn, hr * 0.95, hr * 1.15);   // 写真の高さ：本来の大きさに近づけ、手すりの高さとの差は足元を少し沈めて合わせる
  ln.dy = ln.rh - ln.ry * ln.h;
  e.s.rotation.set(0, 0, 0); e.tilt.visible = true; e.tilt.rotation.set(0, 0, 0); e.crouch = 0;
  setFrame(e, e.girl.front, false);   // 倒れ始めは立ち姿のまま
}
function updateSlump(e, dt) {
  const ln = e.lean, L = ln.L; ln.t += dt;
  const off = _lv.copy(e.s.position).sub(ln.p0);   // 動く井闌の上：一緒に動く
  const ax = L.ox + off.x, az = L.oz + off.z;     // 手すりの手前の端（脚と上体の境）
  const k = Math.min(1, ln.t / 0.45);
  e.s.rotation.set(0, 0, 0);
  const camYaw = Math.atan2(camera.position.x - ax, camera.position.z - az);
  e.tilt.position.set(ax - e.s.position.x, 0, az - e.s.position.z);
  e.tilt.rotation.set(0, camYaw, 0);
  if (k < 1) {   // 前へ傾きながら手すりへ（0.45 秒）。その後 slump の写真に切り替える
    if (e.fr !== e.girl.front) setFrame(e, e.girl.front, false);
    const lean = k * k * 0.18; e.tilt.position.x += -L.nx * lean; e.tilt.position.z += -L.nz * lean;   // 手すりの方へ少し寄る
  } else {
    const fr = e.girl.slump;
    // 画面上で脚が手前側（法線の向き）に来るよう左右を決める：写真は「左に脚」
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);   // カメラから見た右（ビルボードの +x）
    const mirror = (L.nx * rx + L.nz * rz) > 0;              // 法線が画面の右 → 脚を右へ（反転）
    if (e.fr !== fr) { e.fr = fr; e.mat.map = fr.tex; e.mat.userData.uTexel.value.set(1 / fr.tex.image.width, 1 / fr.tex.image.height); }
    const h = ln.h, w = h * fr.aspect, sg = mirror ? -1 : 1;
    e.bb.scale.set(w * sg, h, 1);
    e.bb.position.x = (0.5 - ln.rx) * w * sg;   // 手すりの位置を立ち位置に
    e.bb.position.y = ln.dy || 0;   // 写真の手すりの線を実際の手すりの高さに
    if (!ln.thud) { ln.thud = true; const pp = new V3(ax, e.baseY + off.y + ln.rh, az); Sfx.impactBody(pp); Sfx.thudAt(Math.hypot(pp.x - player.pos.x, pp.z - player.pos.z)); }
  }
  e.shadow.material = lieShadowMat; e.shadow.visible = true;
  e.shadow.position.set(e.tilt.position.x + L.nx * 0.3, 0.015, e.tilt.position.z + L.nz * 0.3); e.shadow.scale.set(0.55, 1, 0.55);
}
function updateLean(e, dt) {
  if (e.lean.kind === 'slump') return updateSlump(e, dt);
  const ln = e.lean; ln.t += dt;
  const k = Math.min(1, ln.t / 0.65), q = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
  const off = _lv.copy(e.s.position).sub(ln.p0);   // 動く井闌の上：一緒に動く
  for (const key in ln.pts) ln.cur[key].copy(ln.st[key]).lerp(ln.pts[key], q).add(off);
  const C = ln.cur, cam = camera.position, floorY = e.baseY + off.y, hw = ln.hd;
  for (const Q of ln.quads) {
    const A = C[Q.a], B = C[Q.b], ax = _lx.subVectors(B, A); const len = ax.length() || 1e-3; ax.divideScalar(len);
    const c = _lc.set(cam.x - (A.x + B.x) / 2, cam.y - (A.y + B.y) / 2, cam.z - (A.z + B.z) / 2);
    c.addScaledVector(ax, -c.dot(ax)); let cl = c.length(); if (cl < 1e-3) { c.set(0, 1, 0); cl = 1; } c.divideScalar(cl);
    const xx = ax.y * c.z - ax.z * c.y, xy = ax.z * c.x - ax.x * c.z, xz = ax.x * c.y - ax.y * c.x;
    _lm.set(xx, ax.x, c.x, 0, xy, ax.y, c.y, 0, xz, ax.z, c.z, 0, 0, 0, 0, 1);
    Q.m.quaternion.setFromRotationMatrix(_lm);
    Q.m.scale.set(hw, len, 1);
    // 床より下に板の角が入らないよう、その板だけ少し持ち上げる
    const minY = Math.min(A.y, B.y) - Math.abs(xy) * hw / 2, lift = Math.max(0, floorY + 0.012 - minY);
    Q.m.position.set(A.x, A.y + lift, A.z);
  }
  // 接地影：腰のあたり
  const H = C.H;
  e.shadow.material = lieShadowMat; e.shadow.visible = true;
  e.shadow.position.set(H.x - e.s.position.x + ln.F.x * 0.15, 0.015, H.z - e.s.position.z + ln.F.z * 0.15);
  e.s.rotation.set(0, 0, 0); e.shadow.scale.set(0.75, 1, 0.75);
  if (MOTION && e.mo && (ln.t < 1 || frameNo % 4 === 0)) leanDoll(e);
  if (!ln.thud && k >= 0.8) { ln.thud = true; const pp = H.clone(); Sfx.impactBody(pp); Sfx.thudAt(Math.hypot(pp.x - player.pos.x, pp.z - player.pos.z)); puff(pp.setY(floorY + 0.15), 0xc8b48a, 4, 0.5, 1.2, 0.6); }
}
// 影の人形：折れ線（腰→頭）に沿って関節を置く
function leanDoll(e) {
  const ln = e.lean, C = ln.cur, W = ln.W, segs = ln.segs, F = ln.F, h = e.figH;
  const Lv = new V3(F.z, 0, -F.x);   // 左
  const along = u => {   // 写真の u（頭0〜足1）にあたる点
    for (const [a, b, u0, u1] of segs) { const lo = Math.min(u0, u1), hi = Math.max(u0, u1); if (u >= lo && u <= hi) { const f = (u - u0) / ((u1 - u0) || 1); return C[a].clone().lerp(C[b], f); } }
    return C.H.clone();
  };
  const fl = e.baseY + (e.s.position.y - ln.p0.y) + 0.03;
  const J = {}, side = (v, s, w) => v.clone().addScaledVector(Lv, s * w * h);
  const hips = C.H.clone(), knee = C.K, foot = C.Fo, chest = along(0.25), neck = along(0.12), head = along(0.06), sh = along(0.14);
  Object.assign(J, { hips, chest, neck, head, lHip: side(hips, 1, 0.055), rHip: side(hips, -1, 0.055), lKnee: side(knee, 1, 0.055), rKnee: side(knee, -1, 0.055),
    lAnkle: side(foot, 1, 0.05), rAnkle: side(foot, -1, 0.05), lToe: side(foot, 1, 0.05).addScaledVector(F, 0.05 * h), rToe: side(foot, -1, 0.05).addScaledVector(F, 0.05 * h) });
  for (const s of [1, -1]) {   // 腕：力が抜けて垂れる（床で止まる）
    const S0 = side(sh, s, 0.11), El = S0.clone(); El.y = Math.max(fl, El.y - 0.17 * h); El.addScaledVector(F, 0.03 * h);
    const Wr = El.clone(); Wr.y = Math.max(fl, Wr.y - 0.15 * h); Wr.addScaledVector(F, 0.05 * h);
    J[s > 0 ? 'lSh' : 'rSh'] = S0; J[s > 0 ? 'lEl' : 'rEl'] = El; J[s > 0 ? 'lWr' : 'rWr'] = Wr;
  }
  Mo.putWorld(e, J);
}
function startWave(n) {
  if (AIRPORT.on) { airportStartWave(n); return; }
  if (BEACH.on && !BEACH.king) beachKingBoats();
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
  if (n > 1 && GUARD.list) { const k = guardFill(n, true); wave.blueToSpawn = Math.max(2, wave.blueToSpawn - k); }   // 倒れた近衛は援軍から補充
  wave.blueMax = Math.min(Math.round((8 + n * 2) * TROOP_K), 52);
  wave.maxAlive = Math.min(Math.round(wave.blueMax * ENEMY_RATIO), 68); wave.captain = n >= 2;
  if (CASTLE.atk || FORT.atk) { wave.toSpawn = Math.round(wave.blueToSpawn * (FORT.atk ? 1.1 : 0.85)); wave.blueMax = Math.round(wave.blueMax * (FORT.atk ? 1.0 : 1.2)); }   // 攻める：攻め手（青組）が守り手の約1.2〜1.3倍（後続が寄せ続ける）
  wave.total = { blue: wave.blueToSpawn, orange: wave.toSpawn };
  const sk = seiranWave(n);                      // 櫃の戦い：井闌の上の弓兵（同じ人数だけ味方も増やす）
  if (sk) { if (FORT.atk) wave.blueToSpawn = Math.max(2, wave.blueToSpawn - sk); else { wave.blueToSpawn += sk; wave.blueOwed = (wave.blueOwed || 0) + sk; } }   // 攻める：井闌の弓兵は味方の数に含める
  wave.archerRate = ARCHER_RATE;
  if (SNOW.on) {   // 狭い峡谷なので人数を抑え、弓は少なめ。上書きされないよう兵数決定の最後に掛ける
    wave.toSpawn = Math.max(5, Math.round(wave.toSpawn * 0.42));
    wave.blueToSpawn = Math.max(4, Math.round(wave.blueToSpawn * 0.7));
    wave.maxAlive = Math.min(9, 5 + n);
    wave.blueMax = Math.min(wave.blueMax, 12);
    wave.archerRate = 0.34;
    wave.total = { blue: wave.blueToSpawn, orange: wave.toSpawn };
    SNOW.spawnI = 0;
  }
  if (MTN.on) {
    wave.archerRate = 0.62;
    wave.maxAlive = 90;
    wave.blueMax = 120;
    if (n === 1 && !MTN.garrison) { MTN.garrison = true; mtnBoot(); mtnFillRoster(); }
    if (n === 1) {
      wave.toSpawn = 0; wave.blueToSpawn = 0; wave.blueOwed = 0;
      const o = enemies.filter(e => e.team === 'orange' && !e.special).length;
      const b = enemies.filter(e => e.team === 'blue' && !e.special).length;
      wave.total = { blue: b, orange: o };
      MTN.roster = { blue: b, orange: o, bootBlue: b, bootOrange: o };
    } else if (n === 2) {
      wave.toSpawn = 16; wave.blueToSpawn = 12; wave.blueOwed = 0;
      wave.total = { blue: 12, orange: 16 };
      MTN.spawnZone = 'ridge';
    } else {
      wave.toSpawn = 12; wave.blueToSpawn = 8; wave.blueOwed = 0;
      wave.total = { blue: 8, orange: 12 };
      MTN.spawnZone = 'hon';
    }
  }
  if (CASTLE.on) { wave.archerRate = 0.5; const k = castleWave(n); if (CASTLE.atk) wave.toSpawn = Math.max(2, wave.toSpawn - k); else wave.blueToSpawn = Math.max(2, wave.blueToSpawn - k); wave.ramWant = CASTLE.phase === 0 ? 4 : 0; }   // 城：攻め手は近接が多め。伏兵は味方の数に含める
  if (BEACH.on) { wave.archerRate = 0.35; beachWave(n); beachSeatStaff(); Sfx.fluteCall(); setTimeout(() => { if (state === 'play' && !VoicePack.extra('command', 0)) Voice.say('漕げーっ！', { pitch: 1.3, rate: 1.1 }, 1); }, 600); return; }
  if (PLANE.on) { wave.archerRate = 0.3; if (n === 1) { planeIntro(); return; } }   // 機内：狭いので弓は少なめ（懐刀が中心）
  if (MECH.on) {
    if (n <= 1) {
      const foot = Math.max(2, wave.blueToSpawn - 16), foe = Math.max(8, wave.toSpawn - 6);
      wave.blueToSpawn = foot * 3 + 32;
      wave.toSpawn = foe * 2;
    } else {
      wave.blueToSpawn = Math.round(wave.blueToSpawn * 3);
      wave.toSpawn = Math.round(wave.toSpawn * 2);
    }
    wave.blueMax = Math.min(180, Math.max(wave.blueToSpawn + 16, wave.blueMax * 3));
    wave.maxAlive = Math.min(180, Math.max(wave.toSpawn + 16, wave.maxAlive * 2));
    mechWave(n);
  }
  showBanner(`第${waveName(n)}波`, n === 1 ? (MTN.on ? '弓を撃ちながら破門隊について門へ。次は二の丸、その次が本丸' : SNOW.on ? '極寒の峡谷を突破せよ。冷えるのは橋の無い川だけ。遺体を縦に並べて渡れ' : CASTLE.atk ? '模擬戦、開始！ 城を攻めよ — 破門隊の丸太で大手門を破れ。奥御殿の本陣の旗が目標' : FORT.atk ? '模擬戦、開始！ 砦を攻めよ — 井闌と梯子で二基の櫃を奪え' : CASTLE.on ? '模擬戦、開始！ 城を守れ — 破門隊の丸太が大手門へ' : MECH.on ? '軽自動車とはしご車で砦へ。門は広いが閉まっている' : '模擬戦、開始！ 青組の味方と共に戦え') : MTN.on ? (n === 2 ? '第二波。稜線と二の丸に新手' : '第三波。本丸に新手') : SNOW.on ? '敵の弓兵が峡谷の要所を守っている。川は遺体の橋で渡れ' : PLANE.on ? '後方ギャレーから新手！ 前方から青組の援軍' : MECH.on ? '車は増やさない。空いた席を使え' : '新手の橙組が迫る！ 青組の援軍が到着');
  Sfx.fluteCall();
  setTimeout(() => { if (state === 'play' && !VoicePack.extra('command', 0)) Voice.say('かかれーっ！', { pitch: 1.3, rate: 1.1 }, 1); }, 600);
}
function waveUpdate(dt) {
  if (ISLAND.on) return;
  if (AIRPORT.on) { airportUpdate(dt); return; }
  if (TRENCH.on) { trenchUpdate(dt); return; }
  if (BEACH.on) { beachWaveTick(dt); return; }
  if (PLANE.intro) { PLANE.introT -= dt; if (PLANE.introT <= 0) planeAmbush(); return; }
  if (wave.inter > 0) { wave.inter -= dt; if (wave.inter <= 0) startWave(wave.n + 1); return; }
  wave.spawnT -= dt;
  const foes = enemies.filter(isFoe).length;
  if (wave.toSpawn > 0 && wave.spawnT <= 0 && foes < wave.maxAlive) {
    let cx, cz;
    if (builtStage === 'fort') { cx = rand(-30, 30); cz = rand(-80, -62); }   // 門の外、竹束の列の向こうから
    else if (PLANE.on) { cx = 0; cz = -17.6; }   // 機内：後方ギャレーから
    else if (CASTLE.on) { if (CASTLE.phase === 0) { cx = rand(-24, 24); cz = rand(-60, -48); } else if (CASTLE.phase === 1) { cx = rand(-10, 10); cz = rand(-22, -12); } else { cx = rand(-8, 8); cz = rand(3, 9); } }   // 城：門の外の陣から／破れた門から／二の丸から
    else if (builtStage === 'snow') {
      const posts = SNOW.posts[Math.min(SNOW.posts.length - 1, Math.max(0, wave.n - 1))];
      const slot = posts[(SNOW.spawnI++) % posts.length];
      cx = clamp(slot[0] + rand(-0.9, 0.9), -7.2, 7.2);
      cz = clamp(slot[1] + rand(-1.4, 1.4), -102, 102);
    } else if (MTN.on) {
      if (wave.n >= 3 || MTN.spawnZone === 'hon') {
        const spots = [[-2.4, -17, 12.8, null, 'hon'], [2.6, -20, 12.8, null, 'hon'], [0.2, -24, 12.8, null, 'hon'], [-3.6, -22, 12.8, null, 'hon'], [3.4, -15, 12.8, null, 'hon']];
        const slot = spots[(MTN.spawnI++) % spots.length];
        cx = slot[0]; cz = slot[1]; MTN.spawnY = slot[2]; MTN.spawnSide = slot[3]; MTN.spawnZone = slot[4];
      } else if (wave.n >= 2) {
        const spots = [[-4.2, 2.2, 9.6, null, 'nino'], [4.2, 1.2, 9.6, null, 'nino'], [-2.4, -0.8, 9.6, null, 'nino'], [3.2, -1.4, 9.6, null, 'nino'], [0.2, 2.4, 9.6, null, 'nino'],
          [-8, 14.8, 6.4, 'west', 'approach'], [-3, 14.8, 6.4, 'west', 'approach'], [4, 14.8, 6.4, 'east', 'approach'], [10, 14.8, 6.4, 'east', 'approach'], [15, 14.8, 6.4, 'east', 'approach']];
        const slot = spots[(MTN.spawnI++) % spots.length];
        cx = slot[0]; cz = slot[1]; MTN.spawnY = slot[2]; MTN.spawnSide = slot[3]; MTN.spawnZone = slot[4];
      } else {
        const side = mtnHotSide();
        const spots = (MTN.sidePosts && MTN.sidePosts[side]) || [];
        const slot = spots.length ? spots[(MTN.spawnI++) % spots.length] : [side === 'west' ? 0 : 12, 42, 4.6];
        cx = slot[0]; cz = slot[1]; MTN.spawnY = slot[2]; MTN.spawnSide = side; MTN.spawnZone = 'approach';
      }
    } else if (MECH.on) {
      const F = MECH.forts.find((f, i) => i >= MECH.fi && !f.done) || mechFort();
      cx = F ? rand(-12, 12) : rand(-18, 18);
      cz = F ? rand(F.z - 26, F.z - 8) : rand(-205, -182);
    } else {
      const front = Math.random() < 0.7;
      const a = front ? -Math.PI / 2 + rand(-1.2, 1.2) : rand(0, Math.PI * 2);
      const r = rand(42, 58);
      cx = clamp(player.pos.x + Math.cos(a) * r, -CFG.field + 5, CFG.field - 5);
      cz = clamp(player.pos.z + Math.sin(a) * r, -CFG.field + 5, CFG.field - 5);
    }
    const grp = Math.min(wave.toSpawn, 2 + ((Math.random() * Math.min(5, 1 + wave.n)) | 0));
    for (let i = 0; i < grp; i++) {
      if (CASTLE.atk || FORT.atk) { const k = Math.random() < wave.archerRate ? 'archer' : 'mob'; if (CASTLE.atk) castleAllySpawn(k); else fortDefSpawn(k); wave.toSpawn--; continue; }   // 攻める：橙組は守りの持ち場に出る
      const cap = wave.captain && wave.toSpawn === 1;
      const sp = MTN.on ? [cx + rand(-0.4, 0.4), cz + rand(-0.4, 0.4)] : SNOW.on ? [clamp(cx + rand(-0.5, 0.5), -7.4, 7.4), cz + rand(-0.6, 0.6)] : PLANE.on ? [cx + rand(-1.4, 1.4), cz + rand(-1.0, 1.0)] : [cx + rand(-3, 3), cz + rand(-3, 3)];
      const crew = CASTLE.on && CASTLE.phase === 0 && !cap && (wave.ramWant || 0) > CASTLE.ram.crew.filter(isUp).length;   // 破門隊：丸太の担ぎ手を 4 人まで
      const ne = spawnEnemy(sp[0], sp[1], crew ? 'mob' : Math.random() < wave.archerRate ? 'archer' : 'mob', cap, 'orange', crew ? { set: { ramCrew: true } } : (MTN.on ? { yari: -1 } : {}));
      if (MTN.on && ne) {
        const y = MTN.spawnY || 4.6;
        ne.s.position.set(cx + rand(-0.2, 0.2), y, cz + rand(-0.2, 0.2));
        ne.baseY = y; ne.footOk = [ne.s.position.x, ne.s.position.z];
        ne.mtnSide = MTN.spawnSide || null; ne.mtnZone = MTN.spawnZone || 'approach'; ne.mtnPost = [cx, cz, y, MTN.spawnSide || null]; ne.mtnHold = true;
        if (ne.kind === 'mob') ne.stone = true;
      }
      if (crew && ne) { CASTLE.ram.crew.push(ne); if (!CASTLE.ram.crew.some((m, j) => j < CASTLE.ram.crew.length - 1 && isUp(m)) && CASTLE.ram.y < 0.5 && CASTLE.ram.z < -20) { CASTLE.ram.x = sp[0]; CASTLE.ram.z = sp[1] + 2; } }
      wave.toSpawn--;
      if (cap) wave.captain = false;
    }
    wave.blueOwed = (wave.blueOwed || 0) + (MTN.on ? 0 : grp / ENEMY_RATIO);   // 山城の味方は波ごとに決めた人数だけ。二倍にはしない
    if (wave.toSpawn <= 0) wave.blueOwed = Math.max(wave.blueOwed, wave.blueToSpawn);   // 端数を残さない
    wave.spawnT = rand(0.6, 1.4);
  }
  if (wave.blueOwed >= 1 && wave.blueToSpawn > 0 && aliveOf('blue').length < (wave.blueMax || wave.maxAlive)) {
    const k = Math.min(Math.floor(wave.blueOwed), wave.blueToSpawn);
    for (let i = 0; i < k; i++) spawnAlly();
    wave.blueOwed -= k; wave.blueToSpawn -= k;
  }
  if ((CASTLE.atk || FORT.atk) && wave.blueToSpawn <= 0 && (wave.trickT = (wave.trickT || 0) - dt) <= 0) { wave.trickT = 3.5; if (aliveOf('blue').length < (wave.blueMax || 20)) spawnAlly(); }   // 攻める：攻め手は後続が途切れず寄せる（守り手は波ごとに決まった数）
  if (MTN.on) {
    if (wave.toSpawn <= 0 && (wave.blueToSpawn || 0) <= 0 && (wave.blueOwed || 0) < 1 && wave.n < 3) {
      const zAlive = z => enemies.some(e => e.team === 'orange' && e.state !== 'down' && !e.special && e.mtnZone === z);
      const clear = wave.n <= 1 ? !zAlive('approach') : (!zAlive('approach') && !zAlive('nino'));
      if (clear) {
        wave.inter = 6;
        showBanner(wave.n <= 1 ? '坂の守りが落ちた' : '二の丸の守りが落ちた', wave.n <= 1 ? '第二波が稜線と二の丸へ来る' : '第三波が本丸を固める');
        Sfx.fanfare();
        player.arrows = Math.min(arrowsMax(), player.arrows + 10);
        for (const e of enemies) if (e.ammo !== undefined) e.ammo = AMMO_MAX;
        for (const s of squads.blue) s.needAmmo = false;
        player.hp = Math.min(CFG.maxHp, player.hp + 20);
      }
    }
    return;
  }
  // Plains Battle's fortress objective: finish every wave-one enemy and every fortress defender before wave 2.
  const plainsPostsReady = builtStage !== 'plains' || (PLAINMG.on && PLAINMG.posts.length === 2 && PLAINMG.posts.every(P => P.gunners.length === 4));
  const plainsGuardsCleared = builtStage === 'plains' && PLAINMG.on && plainsPostsReady && PLAINMG.posts.every(P => P.gunners.every(e => !isFoe(e)));
  if (builtStage === 'plains' && wave.n === 1 && !PLAINMG.objectiveCleared && wave.toSpawn <= 0 && foes === 0) {
    if (!plainsGuardsCleared) return;
    PLAINMG.objectiveCleared = true;
    wave.inter = 5;
    showBanner('敵の砦を制圧！', '砦の敵兵を全員撃破。第二波が接近！');
    Sfx.fanfare();
    player.arrows = Math.min(arrowsMax(), player.arrows + 10);
    for (const e of enemies) if (e.ammo !== undefined) e.ammo = AMMO_MAX;
    for (const s of squads.blue) s.needAmmo = false;
    player.hp = Math.min(CFG.maxHp, player.hp + 20);
    return;
  }
  if (!MECH.on && !DUAL.on && wave.toSpawn <= 0 && foes === 0) {
    if ((SNOW.on && wave.n >= 3) || (MTN.on && (wave.n >= 3 || MTN.phase >= 2))) {
      if (SNOW.on && !SNOW.cleared) { SNOW.cleared = true; showBanner('敵の守りが崩れた', 'かまくらを抜け、峡谷の北口へ'); }
      if (MTN.on && MTN.phase >= 2 && !MTN.cleared) { MTN.cleared = true; showBanner('二の丸の先は本丸', '石段の奥。残った守りを落とせ'); }
      else if (MTN.on && !MTN.cleared) { MTN.cleared = true; showBanner('寄せ手が尽きた', '門を破って上へ'); }
      wave.inter = 0;
    } else {
    wave.inter = 5;
    showBanner(`第${waveName(wave.n)}波 制圧！`, '矢と体力が少し回復した');
    Sfx.fanfare();
    player.arrows = Math.min(arrowsMax(), player.arrows + 10);
    for (const e of enemies) if (e.ammo !== undefined) e.ammo = AMMO_MAX;   // 波の合間に矢を補充
    for (const s of squads.blue) s.needAmmo = false;
    player.hp = Math.min(CFG.maxHp, player.hp + 20);
    }
  }
}

// ---- 命中・戦死判定 ----
// by: 'player' | 攻撃した NPC。hit: { u, y, arrow, thrust }
function damageEnemy(e, dmg, from, crit, hit, by = null) {
  if (e.state === 'down') return;
  const byPlayer = by === 'player';
  if (PLANE.intro) planeAmbush();   // 静かな機内で攻撃すれば、その場で奇襲が始まる
  if (e.hiddenAmb) castleSpring(e.hiddenAmb, by && by !== 'player' ? by : null);   // 伏兵が見つかった
  if (TEST) { const D = window.__dmgT || (window.__dmgT = {}); D[e.team] = (D[e.team] || 0) + dmg; }
  if (TEST && CASTLE.on) { const G = window.__gt || (window.__gt = { out: 0, inn: 0, outK: 0, inK: 0 }); const gp = q => q && (q.gt || (q.slit && q.inner)); if (by && by !== 'player' && gp(by.perch)) { G.out++; if (e.hp - dmg <= 0) G.outK++; } if (gp(e.perch)) { G.inn++; if (e.hp - dmg <= 0) G.inK++; } }
  if (e.seated && e.standAt == null && !(e.seated.boat && !e.seated.boat.beached) && !e.seated.car) e.standAt = time + rand(0.1, 0.4);   // 舟の上・車の中では座ったまま
  // 話している最中の娘が撃たれた：会話を打ち切る（メニューを閉じ、声と字幕を止める。短い悲鳴だけ）
  const partner = menuOpen && menuGirl() === e;
  e.hurtAt = time;   // 撃たれた娘はしばらく状況台詞を言わない
  e.wasTalking = partner || Talk.speaking(e);
  if (e.wasTalking) { if (partner) closeSecMenu(false); Talk.hush(e); }
  e.hp -= dmg; e.flash = TRENCH.on ? 0 : 0.12; if (TRENCH.on) npcGlow(e,0,0,0); else npcGlow(e,0.9,0.9,0.9); // 塹壕戦では被弾時の白い発光を完全に消す
  let hitPos = null;
  if (hit && hit.pt) {
    hitPos = hitSurface(e, hit.pt, from);
    if (hit.arrow && hit.dir) stickArrow(e, hit.pt, hit.dir);
  }
  if (!hitPos) { hitPos = e.s.position.clone(); hitPos.y += e.figH * 0.6; }
  puff(hitPos, 0xb10f25, 7, 0.18, 1.8, 0.34);                             // 赤い飛沫・ダメージパーティクル
  puff(hitPos, 0xff263f, 4, 0.12, 2.2, 0.2);                              // 赤いヒットエフェクト
  puff(e.s.position.clone().setY(e.baseY + 0.3), builtStage === 'snow' ? 0xd7e5ef : 0xc8b48a, 3, 0.6, 1.2, 0.6);   // 雪煙／砂埃
  let kx = 0, kz = 1;
  if (from) { kx = e.s.position.x - from.x; kz = e.s.position.z - from.z; }
  const kl = Math.hypot(kx, kz) || 1;
  const k = new V3(kx / kl, 0, kz / kl);
  if (!e.perch) e.knock.addScaledVector(k, crit ? 4 : 2.5);
  e.recoil = 0.36;
  if (e.prof && (e.prof.pers === '臆病' || e.prof.pers === '慎重' || e.prof.pers === '冷静' || Math.random() < 0.4)) {
    e.clutch = 0.85; e.clutchArm = Math.random() < 0.5 ? 'l' : 'r';
  }
  if (e.state === 'windup' || e.state === 'aim' || e.state === 'zanshin') { e.state = 'stagger'; e.t = 0; }
  if (byPlayer) { hitMarker(); Sfx.hit(); if (crit) popup('急所！'); else if (e.team === 'blue') popup('味方に命中！'); }
  else if (!(hit && hit.arrow)) Sfx.impactBody(hitPos);   // 矢は updateArrows で「ズブッ」
  if (by && by !== 'player' && by.state !== 'down' && enemies.includes(by)) { e.tgt = by; e.tgtT = 2; }   // 撃ってきた相手に向き直る
  if (e.perch && e.perch.tower && e.team === DEF()) { const t = e.perch.x < 0 ? towers.west : towers.east; t.press += 1.5; }
  if (TEST && e.hp <= 0 && by && by.mg) { window.__mgk = (window.__mgk || 0) + 1; e.mgKilled = true; (window.__mgkl = window.__mgkl || []).push([e.boat ? e.boat.name : '-', e.seated ? 'boat' : (e.s.position.z < 0 ? 'shallows' : 'beach'), Math.round(e.s.position.z)]); }
  if (e.hp <= 0) { if (!byPlayer && by && by.prof) e.killer = by;
    if (window.__kstat) window.__kstat.push({ team: e.team, kind: e.kind, by: byPlayer ? 'player' : by && by.kind }); killEnemy(e, byPlayer, from); return; }
  if (e.wasTalking) npcSay(e, 'hit', 1); else npcSay(e, 'hit', 0, byPlayer ? 0.5 : 0.25);
  if (!e.medic && e.hp <= e.hpMax * WOUND_K) setWounded(e, true);
  if (e.P.retreat && !e.perch && !e.retreated && e.hp / e.hpMax <= 0.5) { e.retreated = true; e.state = 'retreat'; e.t = 0; e.retreatT = rand(3, 4.5); }
}
// 戦死判定：倒れるアニメを一度だけ再生し、その姿勢のまま地面に残る（以後は動かない・しゃべらない）
function killEnemy(e, byPlayer, from) {
  if (e.airportCrewActor && AIRPORT.on) {
    for (const p of AIRPORT.posts || []) if (p.crew === e) p.crewAlive = false;
    for (const v of AIRPORT.vehicles || []) {
      if (v.driver === e) { v.driverAlive = false; v.alive = false; }
      if (v.gunner === e) v.gunnerAlive = false;
    }
    if (AIRPORT.fighter && e.airportSeatParent === AIRPORT.fighter.g && e.airportRole === 'pilot') {
      const seats = enemies.filter(o => o.airportCrewActor && o.airportSeatParent === AIRPORT.fighter.g && o.airportRole === 'pilot');
      const idx = seats.indexOf(e);
      if (idx === 0) AIRPORT.fighter.pilotAlive = false; else AIRPORT.fighter.copilotAlive = false;
    }
  }
  if (e.icicleMesh) { stageRoot.remove(e.icicleMesh); e.icicleMesh.geometry.dispose(); e.icicleMesh.material.dispose(); e.icicleMesh = null; }
  if (e.trenchPassenger && e.trenchMounted && e.trenchMounted.car) {
    const C=e.trenchMounted.car; C.crewDown=(C.crewDown||0)+1;
    e.trenchPassengerDead=true;
  }
  e.state = 'down'; e.t = 0;
  if (e.spear) yariDrop(e);   // 槍は手を離れて床に落ちる
  e.knock.set(0, 0, 0);
  const leaned = !e.lad && !e.climb && !e.seated && !(BEACH.on && e.boat) && !e.driver && tryLean(e);   // v7：柵・胸壁のそばなら寄りかかる（向きは倒れた瞬間のまま）
  if (from) {
    const toAtk = Math.atan2(from.x - e.s.position.x, from.z - e.s.position.z);
    e.fallBack = Math.abs(angDiff(e.s.rotation.y, toAtk)) < Math.PI * 0.5;
    e.face = toAtk;
  } else e.fallBack = false;
  if (e.perch) { e.perch.taken = null; }
  if (e.climb) { if (e.climb.q.taken === e) e.climb.q.taken = null; e.climb = null; e.baseY = 0; e.s.position.y = 0; }
  if (e.climbPerch) { if (e.climbPerch.taken === e) e.climbPerch.taken = null; e.climbPerch = null; }
  if (e.lad) {   // 梯子の途中で倒れた：梯子の下へ落ちる
    const c = e.lad; if (c.L.occ === e) c.L.occ = null;
    if (c.ph === 'climb' || (c.ph === 'step' && !c.up) || (c.ph === 'exit' && !c.up)) { const P = ladPts(c.L); e.s.position.x = P.base[0]; e.s.position.z = P.base[1]; e.baseY = 0; e.s.position.y = 0; e.onFloor = null; }
    e.lad = null;
  }
  if (e.secretary) { sec.mode = 'dead'; sec.esc = null; sec.e = null; e.secretary = false; e.wasSecretary = true; if (menuOpen) closeSecMenu(false); if (!e.quietDeath) popup('秘書課の侍女に戦死判定…次の波で本陣に戻ります'); }
  e.downAt = time;
  if (e.sec2) { sec2.dead = true; sec2.e = null; sec2.mode = 'dead'; e.sec2 = false; e.wasSec2 = true; e.kneel = false; if (menuOpen && menuWho === 'sec2') closeSecMenu(false); if (!e.quietDeath) popup('秘書課の侍女（二人目）に戦死判定…次の波で本陣に戻ります'); }
  if (e.medBy) { const m = e.medBy; e.medBy = null; if (m.patient === e) endTreat(m); }
  if (e.medic) { const m = medics[e.team][e.slot]; if (m && m.e === e) { m.dead = true; m.e = null; } endTreat(e); e.kneel = false; if (e.band) e.band.visible = false; const rn = e.role === 'surgeon' ? '外科医' : '看護師'; if (!e.quietDeath) popup(e.team === 'blue' ? rn + 'に戦死判定…（次の波で持ち場に戻ります）' : '橙組の' + rn + 'に戦死判定'); }
  if (e.ojou) { ojou.dead = true; ojou.e = null; ojou.mode = 'dead'; e.ojou = false; e.wasOjou = true; if (menuOpen && menuWho === 'ojou') closeSecMenu(false); if (!e.quietDeath) popup('秘書課 西園寺 すみれに戦死判定…次の波で本陣に戻ります'); }
  if (e.aide) { const A = e.aide; if (A.e === e) { A.e = null; A.dead = true; } e.wasAide = A; e.aide = null; if (e.band) e.band.visible = false; if (!e.quietDeath) popup(A.name + 'に戦死判定…次の波で本陣に戻ります'); }
  if (e.runner) { const R = e.runner; if (R.e === e) { R.e = null; R.dead = true; if (R.job && R.job.s.served === e) R.job.s.served = null; R.job = null; } e.runner = null; e.wasRunner = true; if (e.band) e.band.visible = false; if (!e.quietDeath) popup('伝令に戦死判定…次の波で本陣に戻ります'); }
  if (e.tag) e.tag.visible = false;
  squadOnDeath(e);
  if (e.fluter) { fluter.dead = true; fluter.e = null; if (!e.quietDeath) popup('笛役の娘に戦死判定…遠くの笛だけが続く（次の波で戻ります）'); }
  // 倒れる向き：攻撃してきた側から離れる方向
  const fx = from ? e.s.position.x - from.x : Math.sin(e.s.rotation.y), fz = from ? e.s.position.z - from.z : Math.cos(e.s.rotation.y);
  e.fallYaw = Math.atan2(fx, fz) + rand(-0.35, 0.35);
  if (MOTION && Mo.fbx && Number.isFinite(e.s.rotation.y)) {   // FBX の倒れる向き（顔の向きから見た角度 rel、左右はランダムに鏡写し）が「攻撃から離れる向き」に近ければそれを使う
    const away = Math.atan2(fx, fz), rel = Mo.fbx.rel, cand = [e.s.rotation.y + rel, e.s.rotation.y - rel];
    const best = cand.reduce((a, b) => Math.abs(angDiff(a, away)) <= Math.abs(angDiff(b, away)) ? a : b);
    if (Math.abs(angDiff(best, away)) < 1.25) e.fallYaw = best + rand(-0.12, 0.12);
    e.fallMir = best === cand[1];
  }
  const seatCtx = seatCtxOf(e), seatYaw = e.s.rotation.y;
  if (PLANE.on) planeFall(e);
  if (e.driver && e.seated && !(e.seated && e.seated.kei)) { e.slump = { side: -0.6, fwd: 0.42 }; e.seated = null; e.face = CAR.yaw; }   // 運転手：ハンドルに突っ伏す
  else if (e.seated && e.seated.kei) {   // 浜の軽自動車：席に残したまま。そばで降ろすまで車と一緒
    const C = e.seated.kei; e.slump = { side: ((e.keiSlot || 0) % 2 ? 1 : -1), fwd: -rand(0.05, 0.12) }; e.keiDead = C; e.face = C.yaw; e.seated = null; e.keiGo = null;
  }
  else if (BEACH.on && e.boat && (e.seated || inBoat(e.boat, e.s.position.x, e.s.position.z, 0.2))) boatFall(e);   // 舟の中で崩れる（海には落ちない）
  if (e.slump && seatCtx) startSeatDown(e, seatCtx, seatYaw);
  if (e.keiGo) e.keiGo = null;
  if (e.keiTail) { e.keiTail = null; e.crouch = 0; }
  if (e.beachBundle) { e.beachBundle.bearer = null; e.beachBundle = null; }
  e.bg.visible = e.fg.visible = e.mk.visible = false; if (e.wmk) e.wmk.visible = false; e.wounded = false; e.kneel = false;
  e.fallT = rand(0.5, 0.62);
  if (byPlayer) {
    if (e.team === 'orange') player.kills++;
    else { player.allyKills++; popup('味方撃破…！'); }
  }
  if (e.wasTalking) { Talk.hush(e); e.silenced = true; }
  else if (!e.quietDeath) npcSay(e, 'defeat', 2);
  SITU.down(e);
  e.silenced = true;
  if (!e.quietDeath) kiaLabel(e.s.position, e.baseY + e.figH);
  if (!e.frozen && !(MOTION && Mo.fbx)) spillBlood(e.s.position.x, e.baseY, e.s.position.z, rand(0.7, 1));   // FBX の倒れ方：血・傷は出さない
  if (e.team === 'orange') {
    const r = Math.random();
    if (r < 0.38) addPickup('arrow', e.s.position);
    else if (r < 0.38 + (player.hp < 60 ? 0.18 : 0.08)) addPickup('food', e.s.position);
  }
}

// ---- 席で事切れた娘（seatdown）：座ったまま背もたれへ沈み、頭が横へ傾き、腕は膝・脇へ垂れる。血は出さない
//   写真 assets/frames/<id>_seatdown.png（tools/add_seatdown.py）があればそれに切り替え、腰（sy・sx）を座面に合わせる。無ければ立ち姿を沈めて傾ける
//   車（殿の車・軽自動車・トラック）ではシートベルトを描く
const SEAT_HIP = 0.53, _sdV = new THREE.Vector3();   // 立ち姿の腰の高さ（身長比）
function seatCtxOf(e) { const S = e.seated; if (!S) return null; return S.boat ? 'boat' : S.seat ? 'plane' : S.kei ? (S.kei.kind === 'cata' ? 'cata' : 'kei') : S.car ? 'car' : 'seat'; }
const beltMat = new THREE.MeshBasicMaterial({ color: 0x1e2024, side: THREE.DoubleSide });
const beltGeo = new THREE.PlaneGeometry(1, 1);
function startSeatDown(e, ctx, yaw) {
  e.seatDown = { ctx, yaw, mir: Math.random() < 0.5, ty0: e.tilt.position.y, belt: ctx === 'car' || ctx === 'kei' };
  if (e.seatDown.belt && !e.belt) {
    const a = new THREE.Mesh(beltGeo, beltMat), b = new THREE.Mesh(beltGeo, beltMat);
    a.renderOrder = b.renderOrder = 3; e.belt = [a, b]; e.tilt.add(a); e.tilt.add(b);
  }
}
function endSeatDown(e) { if (e.belt) { for (const m of e.belt) if (m.parent) m.parent.remove(m); e.belt = null; } e.seatDown = null; }
function placeBelt(e, hipY, shY, w, mir) {   // 肩から反対の腰へ斜めの帯、腰に横の帯（写真の前にわずかに浮かせる）
  if (!e.belt) return;
  const sg = mir ? -1 : 1, x0 = 0.11 * sg * e.figH / 1.6, x1 = -0.12 * sg * e.figH / 1.6, z = 0.02;
  const [a, b] = e.belt, dx = x1 - x0, dy = hipY - shY, L = Math.hypot(dx, dy);
  a.position.set((x0 + x1) / 2, (shY + hipY) / 2, z); a.scale.set(0.045, L, 1); a.rotation.set(0, 0, Math.atan2(-dx, dy));
  b.position.set(0, hipY + 0.02, z); b.scale.set(w, 0.04, 1); b.rotation.set(0, 0, 0);
}
function seatPose(e, k) {
  const q = 1 - (1 - k) * (1 - k), sl = e.slump || { side: 1, fwd: 0 }, sd = e.seatDown, g = e.girl, p = e.s.position;
  const cam = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  const yaw = sd ? (e.keiDead && e.keiDead.yaw != null ? e.keiDead.yaw : sd.yaw) : e.s.rotation.y;
  const rel = angDiff(cam, yaw), behind = Math.abs(rel) > 2.0;
  if (sd && g && g.seatdown && k >= 0.5 && !behind) {   // 座ったまま事切れた写真
    const fr = g.seatdown; setFrame(e, fr, sd.mir);
    const h = e.figH * fr.hk, sy = fr.sy != null ? fr.sy : 0.42, hip = e.figH * SEAT_HIP - SEAT_SINK;
    e.tilt.position.set(0, hip - sy * h, 0);
    e.tilt.rotation.set(0, yaw + clamp(rel, -1.1, 1.1) - e.s.rotation.y, 0);
    placeBelt(e, sy * h, sy * h + 0.31 * e.figH, 0.34 * e.figH / 1.6, sd.mir);
    return;
  }
  if (sd && g && g.seatdown && e.fr === g.seatdown) { setFrame(e, g.front, false); }   // 後ろから：立ち姿を沈めたまま（背もたれの陰）
  // 写真が無いとき：立ち姿を沈めたまま、頭と上体を横へ傾け、背もたれへ少し沈む
  e.tilt.rotation.x = q * sl.fwd; e.tilt.rotation.z = q * (sd ? 0.24 : 0.34) * sl.side;
  e.tilt.rotation.y = cam - e.s.rotation.y;
  if (sd) {   // 腰を支点に傾ける（足元を支点にすると上体が席の外へ出る）
    const hy = e.figH * SEAT_HIP; _sdV.set(0, hy, 0).applyEuler(e.tilt.rotation);
    e.tilt.position.set(-_sdV.x, sd.ty0 - 0.05 * q * e.figH / 1.6 + hy - _sdV.y, -_sdV.z);
  }
  if (e.belt) placeBelt(e, e.figH * SEAT_HIP, e.figH * 0.82, 0.34 * e.figH / 1.6, false);
}
function toBodies(e) {
  enemies.splice(enemies.indexOf(e), 1);
  scene.remove(e.bg); scene.remove(e.fg); scene.remove(e.mk);
  npcGlow(e, 0, 0, 0);
  e.shadow.visible = false;
  if (e.landY !== undefined) { e.baseY = e.landY; e.s.position.y = e.landY; }
  if (e.lean) { e.shadow.visible = true; }   // 寄りかかったまま
  else if (e.slump) { /* 席で崩れたまま */ }
  else if (e.girl && e.girl.down) startLying(e);
  else if (MOTION && e.mo) { Mo.contactAO(e); e.genericCorpse = true; }
  else {
    // down画像を持たない兵種用の仮汎用遺体姿：既存の兵モデルを地面に横たえ、頭の向きを固定する。
    e.genericCorpse = true;
    e.s.rotation.y = e.fallYaw;
    e.tilt.rotation.set(Math.PI * 0.43, 0, (e.id % 2 ? 1 : -1) * 0.10);
    e.tilt.position.set(0, 0.04, e.figH * 0.34);
    e.shadow.visible = true;
    e.shadow.scale.set(0.95, 1, 1.35 * e.figH);
  }
  bodies.push(e);
  while (bodies.length > CFG.maxBodies) {
    const i = bodies.findIndex(b => !b.snowUsed);
    if (i < 0) break;
    disposeNpc(bodies.splice(i, 1)[0]);
  }
}

// ---- 標的選び：最も近い敵対者（橙組→プレイヤーか青組、青組→橙組） ----
const PLAYER_T = { isPlayer: true };
function tgtPos(t) { return t.isPlayer ? player.pos : t.s.position; }
const tgtY = t => t.isPlayer ? player.pos.y : t.baseY;
function elevD(e) {   // 高さの差（浜は斜面の地面からの高さで比べる）
  const t = e.tgt, y = tgtY(t);
  if (!BEACH.on) return Math.abs(y - e.baseY);
  const tp = t.isPlayer ? player.pos : t.s.position, ep = e.s.position;
  return Math.abs((y - Math.max(BH.WATER, groundH(tp.x, tp.z))) - (e.baseY - Math.max(BH.WATER, groundH(ep.x, ep.z))));
}
// 近接兵は高所（櫃・武者走り）の相手には届かないので、地上の相手を優先する
// 近接兵の守り：自分の組の弓兵に迫る近接兵を優先して迎え撃ち、守られた弓兵は後回し
const SCREEN = { rate: 0.45, guardR: 10, interceptK: 0.45, archerK: 1.3, kiteR: 8, kiteAggR: 4, holdOut: 4.5 };
if (/[?&]screen=0/.test(location.search)) Object.assign(SCREEN, { rate: 0, guardR: 0, interceptK: 1, archerK: 1, kiteR: 0, kiteAggR: 0 });   // 比較用：以前の動き
function groundArchers(team) { return enemies.filter(o => o.team === team && o.kind === 'archer' && !o.perch && !o.special && o.state !== 'down'); }
function chooseTarget(e) {
  const p = e.s.position, melee = e.kind === 'mob';
  let best = null, bd = 1e9;
  const mine = melee && !e.special ? groundArchers(e.team) : null;
  const castleView = !!(CASTLE.on || (DUAL.on && e.missionFront === 'king'));
  const cands = castleView && !melee ? [] : null;
  const consider = (t, x, z, y) => {
    if (castleView && !castleCanTarget(e, t, x, z)) return;
    if (BEACH.on && !beachCanTarget(e, t, x, z)) return;
    if (FORT.atk && fortGate && e.team === 'orange' && melee && !e.special && z < -8) return;   // 攻める（櫃）：守り手の近接は砦の前から離れない
    if (e.guard && !guardCanTarget(e, x, z)) return;   // 近衛：殿の近くの敵だけ
    let d = Math.hypot(x - p.x, z - p.z);
    if (t.medic) d *= t.medPhase === 'treat' ? 0.55 : 0.85;   // 医療係は狙われやすい（手当て中は止まっている）
    if (mine && t.kind === 'mob' && !t.special && !t.isPlayer && mine.some(a => Math.hypot(a.s.position.x - x, a.s.position.z - z) < SCREEN.guardR)) d *= SCREEN.interceptK;   // 味方の弓兵に迫る近接兵を迎え撃つ
    else if (melee && t.kind === 'archer' && d > 5 && !e.raider) d *= SCREEN.archerK;   // 弓兵より先に前に立つ近接兵と当たる
    if (melee && !BEACH.on && Math.abs(y - e.baseY) > 1.5) d += (fortGate || (CASTLE.on && CASTLE.phase >= 1)) && !e.special && (e.onFloor || tgtFloor(t)) ? (e.raider && (fortGate ? inFort(p.x, p.z) : castleRegion(p.x, p.z) >= 1) ? 2 : 14) : 80;   // 梯子で届く高所は少し遠い扱い（梯子攻め役は砦に入ると櫓を狙う）
    if (melee && t.lad && t.team !== e.team && t.baseY < 1.6) d *= 0.6;
    if (castleView && !melee && CASTLE.phase >= 1 && t.perch && t.perch.gt && e.team === CA()) d *= 0.3;   // v9：二の丸の攻め手の弓は中門の上・狭間の弓兵を優先して撃ち返す   // 梯子に取り付いた敵を下で迎え撃つ
    if (cands) { cands.push([d, t]); return; }
    if (d < bd) { bd = d; best = t; }
  };
  const fin = () => { if (!cands) return best; cands.sort((a, b) => a[0] - b[0]); for (let i = 0; i < Math.min(5, cands.length); i++) if (castleLOS(e, cands[i][1])) return cands[i][1]; return null; };   // 城：見通しのある相手だけ（壁・襖・狭間）
  if (e.secretary) {   // 護衛：プレイヤーから 40m 以内の敵だけ
    for (const o of enemies) if (o.team === 'orange' && o.state !== 'down' && Math.hypot(o.s.position.x - player.pos.x, o.s.position.z - player.pos.z) < 40) consider(o, o.s.position.x, o.s.position.z, o.baseY);
    return fin();
  }
  if (e.team === 'orange' && !inHQ()) consider(PLAYER_T, player.pos.x, player.pos.z, player.pos.y);   // 本陣にいる間は狙われない
  for (const o of enemies) {
    if (o.team === e.team || o.state === 'down') continue;
    consider(o, o.s.position.x, o.s.position.z, o.baseY);
  }
  return fin();
}
// 砦の壁を越える移動は門を通る（櫃の戦いのみ）
function inFort(x, z) { return z > 0.3 && Math.abs(x) < 42; }
// 機内：胴体の内側に必ず収める（壁・前後の隔壁・天井）。r＝体の半径
const PL_IN = { x: 2.02, zLo: () => PL.zTail + 0.62, zHi: () => PL.zNose - 0.02, yMax: 0.55 };
function planeClamp(pos, r) {
  pos.x = clamp(pos.x, -PL_IN.x + r, PL_IN.x - r);
  pos.z = clamp(pos.z, PL_IN.zLo() + r, PL_IN.zHi() - r);
}
function routeTo(p, tx, tz) {
  if (PLANE.on) return planeRoute(p, tx, tz);
  if (CASTLE.on) return castleRoute(p, tx, tz);
  if (BEACH.on) return beachRoute(p, tx, tz);
  if (MTN.on) return mtnRoute(p, tx, tz);
  if (DUAL.on) return dualRoute(p, tx, tz);
  const g = fortGate; if (!g) return [tx, tz];
  const pin = inFort(p.x, p.z);
  if (pin === inFort(tx, tz)) return [tx, tz];
  if (Math.abs(p.x) < g.half && Math.abs(p.z) < 3.4) return [p.x * 0.5, pin ? -4.5 : 4.5];   // 門の中：そのまま抜ける
  return [clamp(p.x, -1, 1) * 0.8, pin ? 3 : -3];                                              // まず門の前へ
}
// 当たり箱（壁・柱）から押し出す
function pushOutBoxes(pos, r, y0, y1, skip) {
  for (const b of boxes) {
    if (skip && skip(b)) continue;
    if (b.ceil || b.y1 <= y0 || b.y0 >= y1) continue;
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
function hitsBox(p, team) {
  for (const b of boxes) if (!b.noShot && p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y > b.y0 && p.y < b.y1) {
    if (b.slits && p.y > b.sy0 && p.y < b.sy1) { const w = slitHalfW(b, team); if (b.slits.some(sx => Math.abs(p.x - sx) < w)) continue; }   // 狭間：内からは通しやすく、外からは細い
    return true;
  }
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
    if (c.up && e.tgt && elevD(e) < 1.2 && Math.hypot((e.tgt.isPlayer ? player.pos : e.tgt.s.position).x - p.x, (e.tgt.isPlayer ? player.pos : e.tgt.s.position).z - p.z) < 7) { endClimb(e, 4); return; }   // 下で敵に迫られたら上るのをやめて戦う
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
  if (e.tgt && elevD(e) < 1.2) return;
  const L = ladderTo(e.onFloor, e.s.position.x, e.s.position.z);
  if (L) startClimb(e, L, false); else e.onFloor = null;
}
// 橙組の弓兵（一部）：砦の中で味方の櫃・武者走りの梯子の近くまで来たら、空いた射撃位置へ上る
function tryArcherClimb(e) {
  if (e.team !== ATK() || !e.climber || e.onFloor || (e.noClimbT || 0) > 0 || !fortGate) return false;
  const p = e.s.position; if (!inFort(p.x, p.z)) return false;
  for (const L of ladders) {
    ladMeta(L); if (!L.F || L.F.seiran || Math.hypot(ladX(L) - p.x, ladZ(L) - p.z) > 16) continue;
    const q = perches.find(q => !q.taken && !q.seiran && Math.abs(q.y - L.F.y) < 0.2 && q.x > L.F.x0 && q.x < L.F.x1 && q.z > L.F.z0 && q.z < L.F.z1 && Math.hypot(q.x - ladX(L), q.z - ladZ(L)) < 9);
    if (!q) continue;
    if (enemies.filter(o => o.team === e.team && o.state !== 'down' && onOrTo(o, L.F)).length >= CLIMB_CAP) continue;
    q.taken = e; e.climbPerch = q; startClimb(e, L, true); return true;
  }
  e.noClimbT = 4; return false;
}
// ---- 遮蔽（竹林）を使う。基準は自分の標的の位置 ----
function findCover(e, minD, maxD, tx, tz) {
  let best = null, bd = 1e9;
  for (const c of covers) {
    if (fortGate && e.team === DEF() && !inFort(c.x, c.z)) continue;   // 味方は砦の外の竹束を使わない
    if (CASTLE.on && (e.team === 'blue' ? castleRegion(c.x, c.z) === 0 : CASTLE.phase === 0 && castleRegion(c.x, c.z) !== 0)) continue;   // 城：塀の向こうの遮蔽物は使えない
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
  if (BEACH.on) { if (p.z > 11 && p.z < 23) sp *= 0.72; else if (p.z > BH.Z1 && p.z < BH.Z2 && tz > p.z) sp *= 0.85; }   // 乱杭の中・斜面の上り
  if (PLANE.on && bodies.length) { const h = pileAt(p.x, p.z); if (h > 0) sp *= h > 0.5 ? 0.3 : 0.5; }   // 倒れた娘をまたぐ・乗り越える
  const rt = routeTo(p, tx, tz), routed = rt[0] !== tx || rt[1] !== tz;
  if (CASTLE.on || DUAL.on) castleDoorTouch(e, rt[0], rt[1]);   // 閉じた襖：通るなら開ける
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
  // 本陣の一角を「リラックススペース」に。畳風の敷物、座布団、屏風、行灯。
  if (!['plane','airport'].includes(stageName)) {
    const mat = new THREE.MeshLambertMaterial({color:0x667451});
    const trim = new THREE.MeshLambertMaterial({color:0xc7b78a});
    const pillow = new THREE.MeshLambertMaterial({color:0x6f3030});
    const rug = new THREE.Mesh(new THREE.BoxGeometry(3.1,0.08,2.35),mat);
    rug.position.set(sx-2.35,0.04,sz-0.05); stageRoot.add(rug);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(3.16,0.025,2.41),trim);
    rim.position.set(sx-2.35,0.085,sz-0.05); stageRoot.add(rim);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(.68,.13,.62),pillow);
    cushion.position.set(sx-2.35,.15,sz+.38); stageRoot.add(cushion);
    const lowTable = new THREE.Mesh(new THREE.BoxGeometry(1.05,.12,.62),WOOD_L);
    lowTable.position.set(sx-2.35,.17,sz-.62); stageRoot.add(lowTable);
    for (const dx of [-.42,.42]) for (const dz of [-.22,.22]) {
      const leg=new THREE.Mesh(new THREE.BoxGeometry(.06,.13,.06),WOOD_D);
      leg.position.set(sx-2.35+dx,.065,sz-.62+dz);stageRoot.add(leg);
    }
    const screenMat=new THREE.MeshLambertMaterial({color:0x4a3827});
    const panelMat=new THREE.MeshLambertMaterial({color:0xb6a174});
    for(let i=0;i<3;i++){
      const x=sx-4.25+i*.95;
      const frame=new THREE.Mesh(new THREE.BoxGeometry(.07,1.45,.08),screenMat);
      frame.position.set(x,.73,sz-1.34);stageRoot.add(frame);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(.82,1.3,.035),panelMat);
      panel.position.set(x+.43,.72,sz-1.34);stageRoot.add(panel);
    }
    for(const dx of [-3.9,-.8]){
      const lamp=new THREE.Group();
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,.1,8),WOOD_D);base.position.y=.05;lamp.add(base);
      const glow=new THREE.Mesh(new THREE.BoxGeometry(.24,.38,.24),new THREE.MeshLambertMaterial({color:0xffd78b,emissive:0x5a3612}));
      glow.position.y=.3;lamp.add(glow);lamp.position.set(sx+dx,.02,sz+.82);stageRoot.add(lamp);
    }
    const sign=new THREE.Mesh(new THREE.BoxGeometry(1.65,.75,.09),WOOD_D);
    sign.position.set(sx-2.35,1.7,sz-1.4);stageRoot.add(sign);
    const signTex=canvasTex(256,128,g=>{g.fillStyle='#e6d6ad';g.fillRect(0,0,256,128);g.strokeStyle='#47321f';g.lineWidth=7;g.strokeRect(5,5,246,118);g.fillStyle='#382819';g.font='bold 43px serif';g.textAlign='center';g.textBaseline='middle';g.fillText('休息所',128,64);});
    const signFace=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.62),new THREE.MeshBasicMaterial({map:signTex,transparent:true,side:THREE.DoubleSide}));
    signFace.position.set(sx-2.35,1.7,sz-1.345);stageRoot.add(signFace);
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
  ca() { caBit(); },
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
window.__ojouDbg = () => { const e = ojou.e, g = GIRLS[OJOU_ID]; if (!e || !g) return null;
  const real = k => !!(g[k] && g[k].tex && g[k].tex.image && !(g[k].tex.image instanceof HTMLCanvasElement));
  let key = Object.keys(g).find(k => g[k] === e.fr && g[k] && g[k].tex) || null;
  if (!key && g.cycle) { const i = g.cycle.frs.indexOf(e.fr); if (i >= 0) key = g.cycle.key + '_' + i; }
  const p = e.s.position, cy = Math.atan2(camera.position.x - p.x, camera.position.z - p.z), c = +Math.cos(angDiff(e.s.rotation.y, cy)).toFixed(2), el = +Math.atan2(camera.position.y - (e.baseY + e.figH * 0.6), Math.hypot(camera.position.x - p.x, camera.position.z - p.z)).toFixed(2);
  return { key, c, el, moving: e.vs > 0.35, view: e.view, view2: e.view2, mode: ojou.mode, x: e.s.position.x, z: e.s.position.z, y: e.baseY, figH: e.figH, real: { front_diag: real('front_diag'), back_diag: real('back_diag'), top: real('top'), low: real('low'), cycle: !!(g.cycles && g.cycles.walk_side) } }; };
window.__ojou = ojou;
if (TEST) window.__GIRLS = GIRLS;
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
  ojou.field = ojouFieldOK();
  const dpx = player.pos.x - p.x, dpz = player.pos.z - p.z, dp = Math.hypot(dpx, dpz);
  if (ojou.mode === 'follow') {   // 王様の右斜め後ろ
    const fx = player.pos.x + Math.sin(player.yaw) * 2.6 + Math.cos(player.yaw) * 1.8, fz = player.pos.z + Math.cos(player.yaw) * 2.6 - Math.sin(player.yaw) * 1.8;
    const d = Math.hypot(fx - p.x, fz - p.z);
    if (d > 0.8) { const rt = routeTo(p, fx, fz); steer(e, rt[0], rt[1], d > 6 ? e.speed * 1.35 : e.speed * 0.9, dt); e.faceWant = Math.atan2(fx - p.x, fz - p.z); }
    else e.faceWant = Math.atan2(dpx, dpz);
    return;
  }
  if (ojou.field && ojouFieldBrain(e, dt)) return;
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
  ca() { caBit(); },
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
const MED_HOME = [[0, 0], [1.4, 0.9], [-1.0, 1.0], [2.4, -0.6], [-2.2, 1.5], [0.2, 2.2], [-2.6, -0.8], [1.6, 2.4]];   // 持ち場の中の立ち位置
const medPost = { blue: null, orange: null };
const MED_R = 60;          // 救護班が出向く範囲（持ち場から）
const SURGEON_ID = 'surgeon';
const clothMat = new THREE.SpriteMaterial({ map: canvasTex(64, 48, (g, w, h) => {
  g.fillStyle = '#fbfaf6'; g.beginPath(); g.moveTo(6, 10); g.lineTo(56, 4); g.lineTo(60, 40); g.lineTo(8, 44); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(160,160,150,.6)'; g.lineWidth = 2; for (const y of [16, 26, 34]) { g.beginPath(); g.moveTo(10, y); g.lineTo(56, y - 4); g.stroke(); }
}), transparent: true, depthWrite: false });
function buildMedPost(x, z, team, y) {
  y = y || 0;
  medPost[team] = [x, z, y];
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 1.9), new THREE.MeshLambertMaterial({ color: 0xece8dc })); mat.position.set(x + 1.2, y + 0.03, z); stageRoot.add(mat);   // 担架の敷布
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), WOOD_L); box.position.set(x - 0.9, y + 0.15, z + 0.3); stageRoot.add(box);   // 薬箱
  if (team === 'orange' && y < 1) { nobori(x - 2, z - 1, '#d9741c', '#fff6e8', '救護'); maku(x + 0.5, z - 2.5, 6, 0); }
}
function spawnMedic(team, m) {
  removeMedic(m);
  const hp = medPost[team]; if (!hp) return;
  const i = medics[team].indexOf(m), gid = m.role === 'surgeon' && GIRLS[SURGEON_ID] ? SURGEON_ID : MEDIC_ID;
  if (!GIRLS[gid]) return;
  const [dx, dz] = (PLANE.on ? PLANE_MED[team][i] : MED_HOME[i]) || [0, 0], sg = PLANE.on || team === 'blue' ? 1 : -1;
  const y = hp[2] || 0;
  const names = MED_NAMES[team][m.role];
  const nth = medics[team].slice(0, i + 1).filter(x => x.role === m.role).length - 1;
  const e = spawnEnemy(hp[0] + dx * sg, hp[1] + dz * sg, 'mob', false, team, { y, medic: true, role: m.role, slot: i, girl: gid, medName: names[nth] || names[nth % names.length] });
  if (e) { e.baseY = y; e.s.position.y = y; e.footOk = [e.s.position.x, e.s.position.z]; if (MTN.on && team === 'orange') { e.mtnZone = 'hon'; e.mtnHold = true; } }
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
  const [bx, bz] = ptPos(b);
  let hp = e.follow ? [player.pos.x, player.pos.z] : medPost[e.team] || e.home;
  let R = e.follow ? 22 : MED_R;
  if (MECH.on && e.team === 'blue') { hp = mechMedCenter(); R = 90; }
  return Math.hypot(bx - hp[0], bz - hp[1]) <= R && Math.abs(b.baseY - e.baseY) <= 0.5;
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
  if (!pt) {   // 持ち場へ戻る／待つ。浜では本陣も止まらず、先頭の車の後ろへ
    let hx, hz;
    if (BEACH.on && e.team === 'blue' && !e.follow) { const g = beachHqPoint(e); hx = g[0]; hz = g[1]; }
    else if (MECH.on && e.team === 'blue') { const g = mechMedFront(e); hx = g[0]; hz = g[1]; }
    else { const h = e.follow ? followPt(e.fi) : e.home; hx = h[0]; hz = h[1]; }
    const d = Math.hypot(hx - p.x, hz - p.z);
    if (d > 0.5) { const rt = routeTo(p, hx, hz); steer(e, rt[0], rt[1], e.speed * (d > 6 ? (e.follow ? 1.35 : 1.05) : 0.7), dt); e.faceWant = Math.atan2(hx - p.x, hz - p.z); e.crouch = 0; }
    else { e.faceWant = e.follow ? Math.atan2(player.pos.x - p.x, player.pos.z - p.z) : 0; if (BEACH.on && e.team === 'blue') { e.hqSid = (e.hqSid || 0) + dt; if (e.hqSid > 1.4) { e.hqSid = 0; p.x += (e.id % 2 ? 0.8 : -0.8); } } }
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
const CAR_RING = [[1.0, 0.2], [-1.0, 0.4], [1.0, -1.3], [-1.0, -1.3], [0, -1.6], [0.9, -2.6], [-0.9, -2.6], [0, -3.4]];
function carRingPt(i, out = 1.4) {   // 殿が車に乗っている間：車の横と後ろ（前には立たない）
  const [rx, rz] = CAR_RING[i % CAR_RING.length], lx = rx ? Math.sign(rx) * (CAR_W / 2 + out + (i >= 8 ? 1 : 0)) : 0, lz = rz < -1.5 ? -CAR_L / 2 + rz + 0.3 : rz;
  return carW(lx, lz);
}
function followPt(i) {   // 殿の後ろに扇形に並ぶ位置
  if (CAR.riding && carOn()) return carRingPt(i + 2, 1.0);
  const a = player.yaw + Math.PI + ((i % 5) - 2) * 0.42, r = 1.6 + (i % 3) * 0.55;   // v7：秘書課・救護は内側（近衛分隊は 2.8〜3.6m の外側）
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
  subtitle(text); { const el = $('subtitle'); if (el) el.textContent = A.name.replace('秘書課 ', '') + '「' + text + '」'; }
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
    const aReal = livingHead('blue'), eReal = livingHead('orange') + Math.max(0, wave.toSpawn), w = clamp(wave.n, 1, 20);
    const a = Math.min(30, aReal), e = Math.min(30, eReal);
    const oj = menuWho === 'ojou';
    const text = oj ? `王様、ご報告いたしますわ。味方は${aReal}名、敵は${eReal}名。ただいま、第${w}波ですわ。` : `ご報告いたします。味方は${aReal}名、敵は${eReal}名。ただいま、第${w}波です。`;
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
  corpse() {
    if (!hq || !inHQ()) { popup('本陣の休息所に戻ってから頼んで'); return; }
    const targetX=hq.sx-2.35, targetZ=hq.sz+0.08;
    const candidates=bodies.filter(b=>!b.relaxCorpse && b.state==='down' && !b.snowPost);
    if (!candidates.length) { popup('運んでこられる遺体がまだない'); $('secsay').textContent='「承知しました。運べる方が見つかりましたら、お連れします」'; return; }
    candidates.sort((a,b)=>Math.hypot(a.s.position.x-player.pos.x,a.s.position.z-player.pos.z)-Math.hypot(b.s.position.x-player.pos.x,b.s.position.z-player.pos.z));
    const body=candidates[0];body.relaxCorpse=true;body.s.position.set(targetX,0.02,targetZ);body.baseY=0.02;body.px=targetX;body.pz=targetZ;body.s.rotation.y=body.fallYaw||body.s.rotation.y;
    if(body.shadow){body.shadow.position.set(targetX,0.025,targetZ);body.shadow.visible=true;}
    if(body.decal){body.decal.position.set(targetX,0.03,targetZ);body.decal.visible=true;}
    if(body.wmk)body.wmk.visible=false;
    $('secsay').textContent='「…承知しました。お休みの場所までお連れします」';
    showBanner('遺体を運びました','休息所の敷物のそばに、遺体を運び入れた。');
    popup('遺体を休息所へ運んだ');
  },
  fan() { sec.fanT = 4; Sfx.noiseBurst(1.2, 'bandpass', 500, 300, 0.12, 0.6); secReply('sec_fan'); },
  coldclothes() {
    if (!SNOW.on) return;
    const cat = secCat('sec_cold');
    const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra[cat];
    const i = L && L.length ? (Math.random() * L.length) | 0 : 0;
    const text = (L && L[i] && L[i].text) || '王の仰せでこの格好です。寒いです。でも、命じられたとおりにしています。';
    $('secsay').textContent = `「${text}」`;
    secSay([[cat, i]], text);
    popup(menuWho === 'ojou' ? 'すみれは扇で口元を隠し、それでも袖をすぼめた' : menuWho === 'sec2' ? '二人目の秘書は鼻の頭をこすり、肩をすくめた' : '秘書は肩をすくめ、袖の中で指を丸めた');
  },
  seppuku() {
    if (!hq || !inHQ()) { popup('本陣の中で言え'); return; }
    const cat = secCat('sec_seppuku');
    const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra[cat];
    const i = L && L.length ? (Math.random() * L.length) | 0 : 0;
    const text = (L && L[i] && L[i].text) || '…承知しました。御前は立ったままで。わたくしどもが腹を切ります。';
    $('secsay').textContent = `「${text}」`;
    secSay([[cat, i]], text);
    closeSecMenu(false);
    showBanner('切腹', '本陣の者たちが一言残して腹を切る。殿は切らない');
    let n = 0, said = 0;
    const hx0 = hq.x0 - 1.4, hx1 = hq.x1 + 1.4, hz0 = hq.z0 - 2.2, hz1 = hq.z1 + 1.4;
    const talker = menuGirl();
    for (const e of enemies) {
      if (e.state === 'down' || e.state === 'seppuku' || e.team !== 'blue' || e.guard) continue;
      const q = e.s.position;
      const inBox = q.x > hx0 && q.x < hx1 && q.z > hz0 && q.z < hz1;
      const staff = e.secretary || e.sec2 || e.ojou || e.aide || e.fluter || e.runner || e.medic;
      const near = Math.hypot(q.x - hq.sx, q.z - hq.sz) < 11;
      if (!(inBox || (staff && near))) continue;
      if (e.secretary && sec.mode !== 'hq' && !inBox) continue;
      if (e.sec2 && sec2.mode !== 'hq' && !inBox) continue;
      if (e.ojou && ojou.mode !== 'hq' && !inBox) continue;
      if (e.aide && e.aide.follow && !inBox) continue;
      e.state = 'seppuku'; e.t = 0; e.kneel = true; e.tgt = null; e.quietDeath = true; e.passive = true; n++;
      if (e !== talker && said < 2) { e.sepSay = 0.55 + said * 1.05; said++; }
    }
    if (!n) popup('本陣に切る者はいない');
  },
  follow() { startEscort(); },
  back() { sendBack(); },
  ca() { caBit(); },
  arrows() {
    if (player.arrows >= arrowsMax()) { secReply('sec_arrows_full', 0); return; }
    player.arrows = arrowsMax(); popup('矢を補充した'); Sfx.pickup(); secReply('sec_arrows', 0);
  },
};
// ---- 機内のみ：「CAさんみたいなことしてよ」（殿の無茶振り）。秘書ごとに性格で反応が変わる（照れながらの機内放送／飲み物／安全の案内の身ぶり／やんわり断る）
const CA_GESTURE = { sec: '（腰の前でシートベルトを締める身ぶりをしてみせる）', sec2: '（両手をそろえて、前方と後方の非常口を指し示す）', ojou: '（酸素マスクを口元に当てる身ぶりを、優雅にしてみせる）' };
const caCD = { t: 0 };
function caBit() {
  if (!PLANE.on) return;
  const who = menuWho, g = menuGirl(); if (!g) return;
  const pre = who === 'sec2' ? 'sec2_' : who === 'ojou' ? 'ojou_' : 'sec_';
  const r = Math.random();
  const kind = who === 'ojou' ? (r < 0.4 ? 'announce' : r < 0.75 ? 'drink' : 'demo')
    : (r < 0.3 ? 'announce' : r < 0.6 ? 'drink' : r < 0.85 ? 'demo' : 'refuse');
  const X = VoicePack.man && VoicePack.man._extra, nOf = c => (X && X[c] ? X[c].length : 1);
  const seq = [];
  if (who === 'ojou') seq.push(['ojou_ca_intro', 0]);   // 親戚の頼みですもの、仕方ありませんわね
  const cat = pre + 'ca_' + (kind === 'drink' ? 'drink_ask' : kind);
  seq.push([cat, (Math.random() * nOf(cat)) | 0]);
  const text = seq.map(([c, i]) => secLine(c, i)).filter(Boolean).join('');
  sec.caWho = g;
  Talk.as(g, () => { $('secsay').textContent = text ? `「${text}」` : ''; secSay(seq, text); });
  if (kind === 'demo') popup(CA_GESTURE[who] || CA_GESTURE.sec);
  if (kind === 'drink') { sec.caPre = pre; showSub('secdrinks'); }
}
function caDrink(k) {
  const pre = sec.caPre || 'sec_', g = menuGirl(); if (!g || !PLANE.on) return;
  const hp = caCD.t > time ? 0 : 12; if (hp) { player.hp = Math.min(CFG.maxHp, player.hp + hp); caCD.t = time + 20; popup((k === 'tea' ? 'お茶' : 'お水') + ' 体力+' + hp); Sfx.pickup(); }
  const cat = pre + 'ca_drink_' + (k === 'tea' ? 'tea' : 'water'), text = secLine(cat, 0);
  Talk.as(g, () => { $('secsay').textContent = text ? `「${text}」` : ''; secSay([[cat, 0]], text); });
}
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
  for (const k of ['secremarks', 'secmeals', 'secdrinks']) $(k).style.display = k === id ? 'grid' : 'none';
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
  $('hqtag').textContent = inside ? (builtStage === 'trench' ? '王の本陣・休息所（安全）' : '本陣（安全）') + (sec.buffT > 0 ? `　肩もみ ${Math.ceil(sec.buffT)}秒` : '') + (player.speedT > 0 ? `　靴 ${Math.ceil(player.speedT)}秒` : '') : '';
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
  if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt);
  if (e.clutch > 0) e.clutch = Math.max(0, e.clutch - dt);
  const vx = p.x - e.px, vz = p.z - e.pz, v = Math.hypot(vx, vz) / Math.max(dt, 1e-4);
  e.px = p.x; e.pz = p.z;
  e.vs = (e.vs || 0) + (v - (e.vs || 0)) * Math.min(1, dt * 8);   // 速度（平滑化）
  const sv = e.vs;
  const covered = e.state === 'hide' && (e.perch || (e.cover && e.cover.type === 'bundle'));
  const kyu = e.kind === 'archer' && e.state === 'aim', ka = e.aimK || 1;
  const acting = e.state === 'windup' || e.state === 'icicle' || e.state === 'recover' || e.state === 'zanshin' || (e.state === 'aim' && (!kyu || e.t >= KY_SET * ka));   // 胴造りの間はまだ構えない
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
  e.crouch += ((e.seated ? (SEAT_SINK + (e.seated.boat && e.seated.boat.fireT > time ? 0.3 : 0)) / (0.42 * e.figH) : (covered && sv < 0.5) || (e.kneel && !kneelFr) ? 1 : 0) - e.crouch) * Math.min(1, dt * 5);   // 席：腰が座面の高さまで沈む
  // 向き：移動中は進む方向、構え・射撃・待機は標的の方向（なめらかに回る）
  let face = e.face;
  if (e.passive) face = e.faceWant;
  else if (e.tgt && (!moving || e.state === 'backoff')) { const tp = tgtPos(e.tgt); face = Math.atan2(tp.x - p.x, tp.z - p.z); }
  else if (sv > 0.35) face = Math.atan2(vx, vz);
  if (!Number.isFinite(e.s.rotation.y)) e.s.rotation.y = Number.isFinite(face) ? face : 0;   // 向きが未設定（faceWant 無しの passive 等）でも NaN にしない（NaN だと板が消え、倒れた後の接地影も壊れる）
  if (!Number.isFinite(face)) face = e.s.rotation.y;
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
    const thrusting = e.melee && (e.state === 'windup' || e.state === 'icicle' || e.state === 'recover');
    fr = thrusting ? (g.stab || g.front) : girlFrame(g, 'action', e.kind); mirror = fr.dir ? fr.dir !== sgn : false;
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
  // 空港の空挺兵は、通常の視点別フレーム選択で透明／欠落フレームに切り替わる場合があるため、
  // 着地後の生存中だけ、必ず実在する正面写真へ戻して描画状態を復元する。
  const airportAirborne = AIRPORT.on && e.airElite && e.state === 'airportDrop' && isUp(e);
  const airportGroundAlive = AIRPORT.on && e.airElite && e.airLanded && isUp(e);
  if (airportAirborne || airportGroundAlive) {
    // 降下中も着地後も、欠落した横・後ろフレームへ切り替えず実在する正面写真を維持する。
    fr = g.front || g.side || fr;
    mirror = false;
    e.s.visible = true; e.tilt.visible = true; e.bb.visible = true;
    e.bb.frustumCulled = false;
    if (e.mat) { e.mat.transparent = false; e.mat.opacity = 1; e.mat.alphaTest = 0.42; e.mat.needsUpdate = true; }
    if (airportAirborne && e.airChute) e.airChute.visible = true;
  }
  setFrame(e, fr, mirror);
  // 空港ステージの生存兵は、状態遷移や方向別写真の欠落で本体メッシュが消えたままにならないよう、
  // 毎フレーム、有効な写真テクスチャと描画設定を復旧する。負傷中の味方にも適用する。
  if (AIRPORT.on && isUp(e) && !e.airportCrewActor) {
    if (!fr || !fr.tex || !fr.tex.image || !fr.tex.image.width || !fr.tex.image.height) {
      fr = g.front;
      mirror = false;
      if (fr && fr.tex) setFrame(e, fr, mirror);
    }
    e.s.visible = true;
    e.tilt.visible = true;
    e.bb.visible = true;
    e.bb.frustumCulled = false;
    if (e.mat && fr && fr.tex) {
      e.mat.map = fr.tex;
      e.mat.transparent = true;
      e.mat.opacity = 1;
      e.mat.alphaTest = 0.02;
      e.mat.depthWrite = false;
      e.mat.side = THREE.DoubleSide;
      e.mat.needsUpdate = true;
    }
  }
  // 塹壕のトーチカ要員・軽自動車の乗員・本陣スタッフは、写真フレーム切替後も描画状態を復旧する。
  if (TRENCH.on && isUp(e) && (e.trenchBunkerCrew || e.trenchMounted || e.trenchSupport)) {
    if (!fr || !fr.tex || !fr.tex.image || !fr.tex.image.width || !fr.tex.image.height) {
      fr = g.front || g.side || fr; mirror = false;
      if (fr && fr.tex) setFrame(e, fr, mirror);
    }
    e.s.visible = true; e.tilt.visible = true; e.bb.visible = true;
    e.bb.frustumCulled = false;
    e.bb.renderOrder = e.trenchBunkerCrew ? 90 : (e.trenchMounted ? 85 : 8);
    if (e.mat && fr && fr.tex) {
      e.mat.map = fr.tex;
      e.mat.transparent = true; e.mat.opacity = 1; e.mat.alphaTest = 0.02;
      e.mat.depthWrite = false; e.mat.side = THREE.DoubleSide;
      if (e.trenchBunkerCrew || e.trenchMounted) e.mat.depthTest = false;
      e.mat.needsUpdate = true;
    }
  }
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
  // ビルボード（Y 軸のみ）：板をカメラへ向ける。被弾は一瞬、後ろへ反る
  e.tilt.rotation.set(e.recoil > 0 ? -Math.sin(Math.min(1, e.recoil / 0.36) * Math.PI) * 0.16 : 0, camYaw - f + twist, lean * 0.5 + rock);
  e.tilt.position.set(sway, bob - e.crouch * 0.42 * e.figH, surge - (e.recoil > 0 ? 0.05 * e.figH * Math.sin(Math.min(1, e.recoil / 0.36) * Math.PI) : 0));
}
// 歩行サイクルを使っているときのモーションの効き（1＝そのまま）。横から見るので左右の揺れ（画面の奥行き）とひねりも小さく
const CYCLE_DAMP = { bob: 0.2, roll: 0.25, sway: 0.5, surge: 0.6, twist: 0.3 };
// ---- NPC の行動 ----
const tmp = new V3();
const MELEE_RANGE = 1.8;   // 懐刀の突き：短く狭い
// 弓兵（味方・敵とも）：近い相手には懐刀の突き。雪の敵弓兵はツララで突く。投げナイフは使わない
function archerMelee(e, dt, dist, nx, nz, tx, tz) {
  if (e.kind !== 'archer' || e.perch || e.seated) return false;
  if (e.special && !(e.secretary && sec.mode === 'escort')) return false;
  if (elevD(e) >= 1.2) return false;
  const icy = SNOW.on && e.team === 'orange';
  const reach = icy ? 3.6 : 3.1;
  const chase = icy ? 11 : 7.2;
  const swinging = e.melee && (e.state === 'windup' || e.state === 'icicle' || e.state === 'recover');
  if (!swinging && dist >= chase) { e.melee = false; return false; }
  e.melee = true;
  e.faceWant = Math.atan2(nx, nz);
  const p = e.s.position;
  if (e.state === 'recover') {
    if (e.t > 0.32) { e.state = 'advance'; e.t = 0; e.melee = false; }
    return true;
  }
  if (!swinging && dist > reach) {
    steer(e, tx - nx * 1.15, tz - nz * 1.15, e.speed * (icy ? 1.35 : 1.15), dt);
    if (e.state !== 'advance') { e.state = 'advance'; e.t = 0; e.cover = null; }
    return true;
  }
  if (e.state !== 'windup' && e.state !== 'icicle') {
    if (e.cd > 0) return true;
    e.state = icy ? 'icicle' : 'windup'; e.t = 0;
    if (icy) {
      if (e.icicleMesh) { stageRoot.remove(e.icicleMesh); e.icicleMesh.geometry.dispose(); e.icicleMesh.material.dispose(); }
      e.icicleMesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.15, 5), new THREE.MeshLambertMaterial({ color: 0xd7f6ff }));
      stageRoot.add(e.icicleMesh);
    }
  }
  if (e.icicleMesh) {
    const u = Math.min(1, e.t / 0.42);
    e.icicleMesh.position.set(p.x + nx * (0.35 + u * 0.75), e.baseY + 0.95, p.z + nz * (0.35 + u * 0.75));
    e.icicleMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0.05, nz).normalize());
  }
  if (e.t >= 0.42) {
    e.state = 'recover'; e.t = 0; e.cd = icy ? 0.85 : 0.65;
    p.x += nx * 0.38; p.z += nz * 0.38;
    const d2 = Math.hypot(tx - p.x, tz - p.z);
    if (d2 < reach + 0.35) {
      if (e.tgt && e.tgt.isPlayer) hurtPlayer(icy ? 14 : (e.dmg || 8));
      else if (e.tgt && e.tgt.state !== 'down') {
        const tp2 = e.tgt.s.position;
        damageEnemy(e.tgt, icy ? 2 : 1, p, false, { pt: new V3(tp2.x, e.tgt.baseY + e.tgt.figH * 0.55, tp2.z), thrust: true }, e);
      }
    }
    if (e.icicleMesh) { stageRoot.remove(e.icicleMesh); e.icicleMesh.geometry.dispose(); e.icicleMesh.material.dispose(); e.icicleMesh = null; }
  }
  return true;
}
function updateEnemies(dt) {
  frameNo++;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], p = e.s.position, P = e.P;
    if (TRENCH.on && e.trenchPilot && e.trenchPlane && isUp(e)) {
      const A=e.trenchPlane;
      if(A.active&&!A.crashing){
        A.g.updateMatrixWorld(true);
        const q=A.g.localToWorld(new V3(0,.43,-.72));
        p.copy(q);e.baseY=q.y;e.px=q.x;e.pz=q.z;e.s.rotation.y=A.g.rotation.y;
        e.s.visible=true;e.tilt.visible=true;e.bb.visible=true;e.bb.frustumCulled=false;e.bb.renderOrder=70;
        if(e.mat){e.mat.depthTest=false;e.mat.depthWrite=false;e.mat.transparent=true;e.mat.opacity=1;e.mat.side=THREE.DoubleSide;}
        animateNpc(e,dt,0);
      }
      continue;
    }
    if (TRENCH.on && e.trenchUnit && isUp(e)) { trenchBrain(e, dt); continue; }
    if (e.airChute && e.state !== 'airportDrop') { e.s.remove(e.airChute); e.airChute = null; }
    if (MTN.on || DUAL.on) MTN.who = e;
    if (e.state === 'airportDrop') { airportParatrooperStep(e, dt); animateNpc(e, dt, 0); continue; }
    // 空港：着地後の敵兵は通常の敵更新で表示状態を維持する。
    // 降下アニメーション中に切り替わった可視フラグが残り、地上で消えるケースを防ぐ。
    // 空港の空挺兵は、着地後も写真メッシュが視錐台カリングで消えないようにする。
    // 生存中の兵だけに適用し、戦死・伏せ動作の可視状態は変更しない。
    if (AIRPORT.on && e.airportCrewActor && isUp(e)) {
      if (e.airportSeatParent) {
        e.airportSeatParent.updateMatrixWorld(true);
        const seatPos=e.airportSeatParent.localToWorld(e.airportSeatLocal.clone());
        p.copy(seatPos); e.baseY=seatPos.y; e.px=seatPos.x; e.pz=seatPos.z;
      }
      animateNpc(e, dt, 0); continue;
    }
    if (AIRPORT.on && e.airElite && e.airLanded && isUp(e)) {
      e.s.visible = true; e.tilt.visible = true; e.bb.visible = true; e.bb.frustumCulled = false;
      if (e.shadow) e.shadow.visible = true;
      if (e.mat) { e.mat.transparent = false; e.mat.opacity = 1; e.mat.alphaTest = 0.42; }
    }
    if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) npcGlow(e, 0, 0, 0); }
    if (e.state === 'seppuku') {
      e.t += dt; e.kneel = true; e.tgt = null; e.passive = true; p.y = e.baseY;
      animateNpc(e, dt, 0);
      e.tilt.rotation.x += Math.min(0.85, e.t * 0.55);
      if (!e.sepBlood && e.t > 1.05) { e.sepBlood = true; spillBlood(p.x, e.baseY, p.z, 0.85); puff(p.clone().setY(e.baseY + 0.7), 0x7a1218, 6, 0.08, 0.8, 0.3); }
      if (e.sepSay && e.t > e.sepSay) {
        e.sepSay = 0;
        const Ls = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra.sep_comment;
        const si = Ls && Ls.length ? (Math.random() * Ls.length) | 0 : 0;
        const line = Ls && Ls[si] ? Ls[si].text : '殿は、お切りにならぬよう。';
        subtitle(e.prof.name + '「' + line + '」');
        if (!(Ls && Ls[si] && VoicePack.extra('sep_comment', si))) Voice.say(line, { pitch: 1.02, rate: 0.94 }, 1);
      }
      if (e.t > 2.15) { e.kneel = false; killEnemy(e, false, player.pos); }
      continue;
    }
    if (e.state === 'pit') { castlePitStep(e, dt); continue; }   // 落とし穴に落ちていく
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
      if (e.lean) {   // v7：柵・胸壁・塀に寄りかかって崩れる
        updateLean(e, dt);
        if (e.t >= 0.95) toBodies(e);
        continue;
      }
      if (e.slump) {   // 機内：席に座ったまま崩れる（横へ傾き、少し前へうなだれる）
        const k = Math.min(1, e.t / 0.7);
        p.y = e.baseY; seatPose(e, k);
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
      if (MOTION) {   // 膝が抜けて沈み、腰を支点に倒れる。中割りの写真を順に出す
        const FXD = Mo.fbx, T = e.fallT2 || (e.fallT2 = FXD ? FXD.dur * rand(0.94, 1.04) : rand(1.25, 1.45)), u = Math.min(1, e.t / T), D = Mo.death(e, u), H = e.figH;
        if (D.fbx && e.fallMir) { D.roll = -D.roll; D.px = -D.px; }
        e.mo.D = D;
        Mo.fallSprite(e, D, u >= 1 ? Math.sin(Math.min(1, (e.t - T) / 0.22) * Math.PI) * 0.015 : 0);   // 立った写真の大きさのまま倒す（横たわる絵に差し替えると一瞬巨大になる）
        const ry = e.fallYaw - e.s.rotation.y;
        const k = Math.min(1, u * 1.4);
        e.shadow.scale.set(0.75 + k * 0.3, 1, 0.6 + k * 0.6 * H); e.shadow.position.set(Math.sin(ry) * D.hz * H * 0.8, 0.02, Math.cos(ry) * D.hz * H * 0.8);
        if (!e.thud && u >= (Mo.fbx ? (Mo.fbx.events.impact || 1.8) / Mo.fbx.dur - 0.02 : 0.84)) { e.thud = true; Sfx.impactBody(p.clone().setY(e.baseY + 0.2)); Sfx.thudAt(Math.hypot(p.x - player.pos.x, p.z - player.pos.z)); puff(p.clone().setY(e.baseY + 0.2).addScaledVector(new V3(Math.sin(e.fallYaw), 0, Math.cos(e.fallYaw)), e.figH * 0.5), 0xc8b48a, 5, 0.8, 1.5, 0.8); }
        if (e.t >= T + (Mo.fbx ? 0.1 : 0.25)) toBodies(e);
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
    if(TRENCH.on&&(e.trenchUnit||e.trenchMounted)){trenchBrain(e,dt);continue;}
    let lean = 0;
    e.bowSeat = BEACH.on && e.seated && e.seated.boat && e.kind === 'archer' && !e.special && e.seated.boat.z > -42 && !e.seated.boat.beached;   // 浜：舟の弓兵は漕ぎながら射る
    e.passive = (e.secretary && sec.mode === 'hq') || e.fluter || e.medic || e.aide || e.runner || !!e.hold || (!!e.seated && !e.bowSeat) || !!e.hiddenAmb;   // hold: テスト用に止める／seated: 機内の席に座っている
    e.defending = e.armed && !e.hold && !(e.polishT > 0) && !(e.secretary && sec.mode !== 'hq') ? secThreat(e) : null;   // 護衛中の秘書は通常の戦い方
    if (e.defending) { e.passive = false; e.kneel = false; if (e.state === 'idle') { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.t = 0; } }
    if (e.seated && !e.bowSeat) seatedBrain(e, dt);
    else if (e.carCall && carCallBrain(e, dt)) { /* 運転を代わりに行く */ }
    else if (BEACH.on && e.keiTail && keiTailBrain(e, dt)) { /* 浜：軽自動車のすぐ後ろを歩く */ }
    else if (BEACH.on && e.keiGo && e.team !== 'orange' && keiWalkBrain(e, dt)) { /* 浜：軽自動車まで歩いて乗る */ }
    else if (BEACH.on && e.team === 'orange' && keiOrangeBrain(e, dt)) { /* 橙組：止まった軽自動車を奪って浜へ */ }
    else if (BEACH.on && beachHqBrain(e, dt)) { /* 本陣は止まらず前へ */ }
    else if (MECH.on && e.ojouGuard && ojou.field && !e.lad && ojouProtect(e, dt) === true) { /* 行軍中も侍大将の護衛は側を離れない */ }
    else if (MECH.on && !e.lad && e.sq && e.sq.cmd && sqOrd(e.sq) && sqOrd(e.sq).by === 'ojou' && squadOrderMove(e, dt)) { /* 行軍中も侍大将の采配（前進・堅守・援護・迂回）に従う */ }
    else if (MECH.on && mechYield(e, dt)) { /* 車の前からはどく */ }
    else if (MECH.on && e.team === 'blue' && mechTakeCata(e, dt)) { /* 立ち尽くすなら投石車を奪う */ }
    else if (MECH.on && mechFixJob(e, dt)) { /* 破れたタイヤへ。秘書も直す */ }
    else if (MECH.on && e.team === 'blue' && mechFillJob(e, dt)) { /* 人が足りない車に乗って前へ */ }
    else if (MECH.on && e.team === 'blue' && mechSiegeJob(e, dt)) { /* 井闌の梯子を登る */ }
    else if (DUAL.on && dualBrain(e, dt)) { /* 二正面：自分の戦線を守り、援軍は向こうへ */ }
    else if (MECH.on && e.team === 'blue' && mechClimb(e, dt)) { /* はしごが門にかかっていれば壁へ */ }
    else if (MECH.on && e.team === 'blue' && mechPress(e, dt)) { /* 砦の中を攻め続ける */ }
    else if (MECH.on && e.team === 'orange' && mechCounter(e, dt)) { /* 優勢なら車を奪って本陣へ */ }
    else if (MECH.on && e.team === 'blue' && mechMarch(e, dt)) { /* 車について野を進む */ }
    else if (SMOKE.clouds.length && smokeFlee(e, dt)) { /* 毒煙から逃げる */ }
    else if (e.smoker && !e.hold && smokerBrain(e, dt)) { /* 毒煙玉を投げる */ }
    else if (e.knife === false && e.kind === 'archer' && !e.hold && npcKnifeFetch(e, dt)) { /* 投げた懐刀を拾いに行く */ }
    else if (e.sec2 && !e.hold && !e.defending) { e.passive = true; sec2Brain(e, dt); }
    else if (e.ojou && !e.hold && !e.defending) { e.passive = true; ojouBrain(e, dt); }
    else if (e.medic && !e.hold) medicBrain(e, dt);
    else if (e.runner && !e.hold) runnerBrain(e, dt);
    else if (e.guard && !e.hold && e.state !== 'charge' && e.state !== 'windup' && e.state !== 'recover' && guardBrain(e, dt)) { /* 近衛：殿のまわりの輪 */ }
    else if (CASTLE.on && !e.hold && !e.special && castleBrain(e, dt)) { /* 城：伏兵・破門隊・退却・門を打つ */ }
    else if (MTN.on && e.team === 'blue' && e.smoker && mtnSmokeBrain(e, dt)) { /* 山城：開かない門の足場へ毒煙 */ }
    else if (MTN.on && e.ramCrew && mtnRamBrain(e, dt)) { /* 山城：破城槌を担いで門の前まで */ }
    else if (MTN.on && e.bundleBear && mtnBundleBrain(e, dt)) { /* 山城：竹束を押し立てて前進 */ }
    else if (MTN.on && e.team === 'blue' && mtnAllyAdvance(e, dt)) { /* 竹束の陰について坂を上る */ }
    else if (MTN.on && e.team === 'orange' && mtnDefenderBrain(e, dt)) { /* 階段の上と横の足場から射る。門は開けない */ }
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
      e.tgt = nt; e.tgtT = CASTLE.on && nt && nt.perch && nt.perch.gt && e.kind === 'archer' ? 5 : 0.6;   // v9：中門の上を狙う弓兵は狙いを保つ（遮蔽物へ向かい直し続けない）
    }
    e.cd -= dt; e.t += dt; e.moving = false;
    const tint = k => npcTint(e, k);

    if (e.noClimbT > 0) e.noClimbT -= dt;
    if (!e.lad && e.onFloor) maybeDescend(e);
    if (e.lad) npcLadder(e, dt);
    else if (squadOrderMove(e, dt)) { /* 分隊の命令（援護・迂回・救援・前進・堅守）／負傷者の後送 */ }
    else if (squadRegroup(e, dt)) { /* 分隊：隊長のまわりへ寄る */ }
    else if (!e.tgt) {
      // 敵がいない：青組はプレイヤーの近くに集まる
      if (e.perch) { if (e.state !== 'hide') { e.state = 'hide'; e.hideT = 1; npcTint(e, 0); } }
      else if (e.returning && hq) steer(e, hq.sx, hq.sz, e.speed, dt);
      else if (e.secretary) {   // 護衛：プレイヤーの斜め後ろについて歩く
        let fx = player.pos.x + Math.sin(player.yaw) * 2.2 + Math.cos(player.yaw) * 1.4, fz = player.pos.z + Math.cos(player.yaw) * 2.2 - Math.sin(player.yaw) * 1.4;
        if (CAR.riding && carOn()) [fx, fz] = carRingPt(1, 1.0);
        if (Math.hypot(fx - p.x, fz - p.z) > 0.8) steer(e, fx, fz, Math.hypot(fx - p.x, fz - p.z) > 6 ? e.speed * 1.4 : e.speed, dt);
      } else {
        const cs = CASTLE.on && e.team === CD() ? castleIdleSpot(e) : CASTLE.atk ? castleAtkSpot(e) : FORT.atk && fortGate && e.team === 'blue' && !e.guard ? [(e.id % 2 ? -12 : 12) + Math.cos(e.ph) * 3, 12.5 + Math.sin(e.ph) * 1.5] : BEACH.on ? beachIdleSpot(e) : null;
        const fx = cs ? cs[0] : fortGate ? Math.cos(e.ph) * 7 : player.pos.x + Math.cos(e.ph) * 5;
        const fz = cs ? cs[1] : fortGate ? 9 + Math.sin(e.ph) * 3 : player.pos.z + 4 + Math.sin(e.ph) * 3;
        if (Math.hypot(fx - p.x, fz - p.z) > 1.5) steer(e, fx, fz, e.speed, dt);
      }
      if (!e.perch && ['windup', 'aim', 'zanshin', 'peek', 'return', 'hide', 'tocover'].includes(e.state)) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; npcTint(e, 0); }
    } else {
      const tp = tgtPos(e.tgt), tx = tp.x, tz = tp.z;
      const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist, nz = dz / dist;
      if (!e.spotted && dist < 32) { e.spotted = true; npcSay(e, 'spot', 0, e.team === 'orange' ? 0.45 : 0.25); }

      if (MTN.on && e.stone && e.team === 'orange' && dist > 4.5 && dist < 17 && e.cd <= 0 && elevD(e) < 6 && e.state !== 'windup' && e.state !== 'recover' && e.state !== 'icicle') {
        mtnThrowStone(e); e.cd = rand(1.35, 2.15); e.faceWant = Math.atan2(nx, nz);
      }
      if (CASTLE.on && e.team === CA() && e.kind === 'archer' && !e.perch && !e.special) e.pressMelee = !castleAtkHasMelee();
      if (archerMelee(e, dt, dist, nx, nz, tx, tz)) { /* 弓兵の突き。雪の敵はツララ */ }
      else if (e.pressMelee && e.kind === 'archer' && !e.perch && dist > 2.2) {
        steer(e, tx - nx * 1.15, tz - nz * 1.15, e.speed * 1.15, dt);
        e.faceWant = Math.atan2(nx, nz); e.state = 'advance'; e.cover = null;
      }
      else if (e.state === 'retreat') {            // 臆病：被弾すると一旦下がる
        steer(e, p.x - nx * 10, p.z - nz * 10, e.speed * 1.2, dt);
        e.retreatT -= dt;
        if (e.retreatT <= 0) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.cover = null; }
      } else if (e.state === 'stagger') {
        lean = Math.sin(e.t * 30) * 0.08;
        if (e.t > 0.4) { e.state = e.kind === 'archer' ? 'hide' : 'approach'; e.hideT = 0.6; e.cd = Math.max(e.cd, 0.4); }
      } else if (e.perch) {
        // ===== 櫃・武者走りの弓兵：胸壁の陰にしゃがみ、立ち上がって射る =====
        if (e.state === 'zanshin') {
          if (e.t >= KY_ZAN) { if (typeof e.zanNext === 'function') e.zanNext(); else { e.state = 'hide'; e.t = 0; e.hideT = 0.4; } }
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
        if (!e.pressMelee && !e.climb && !['backoff', 'aim', 'zanshin'].includes(e.state) && (thd < (P === PERS.好戦的 ? SCREEN.kiteAggR : SCREEN.kiteR) * (PLANE.on ? 0.45 : 1) || (dist < (PLANE.on ? 2.5 : 6) && P !== PERS.好戦的))) { e.state = 'backoff'; e.t = 0; e.kite = th; e.cover = null; }
        if (e.state === 'advance' && e.team === ATK() && seirans.length && !e.climb && (e.clT = (e.clT || 0) - dt) <= 0) { e.clT = 2; if (!tryArcherClimb(e)) seiranBoard(e); }
        if (e.climb) seiranClimb(e, dt);
        else if (e.state === 'advance' && CASTLE.on && e.tgt && e.tgt.perch && e.tgt.perch.gt && dist < 28 && e.t > 1.6 && ammoOK(e) && (e.cover && !e.cover.open ? Math.hypot(e.cp ? e.cp.x - p.x : 0, e.cp ? e.cp.z - p.z : 0) < 1.2 || e.t > 4 : true)) { e.state = 'aim'; e.t = 0; }   // v9：中門の上へ撃ち返す（遮蔽物に着いたら／開けた所ならその場で）
        else if (e.state === 'advance' && BEACH.on && dist < (e.team === 'orange' ? 52 : e.bowSeat ? 46 : 40) && e.t > (e.bowSeat ? 0.6 : 1.4) && ammoOK(e)) { e.state = 'aim'; e.t = 0; e.cover = null; }   // 浜：斜面越しに、その場で射る
        else if (e.state === 'advance') {
          if (!e.cover || e.t > 8) {
            e.t = 0;
            const kf = (e.team === 'blue' && allyStance === 'def' ? 1.4 : 1) * (PLANE.on ? 0.28 : 1) * (CASTLE.on && (inCastleBldg(p.x, p.z) || inCastleBldg(tx, tz)) ? 0.3 : 1);   // 城内：部屋の中の短い間合い   // 守勢：距離を取る／機内：通路に沿った短い間合い
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
          if (e.t >= KY_ZAN) { if (typeof e.zanNext === 'function') e.zanNext(); else { e.state = 'advance'; e.t = 0; e.cover = null; } }
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
          const elev = elevD(e) > 1.5;      // 櫃の上などには届かない
          const rt = routeTo(p, tx, tz), routed = rt[0] !== tx || rt[1] !== tz;
          if (e.team === 'blue' && allyStance === 'def' && !FORT.atk && !CASTLE.atk && dist > 16 && e.state === 'approach') {   // 守勢：持ち場で待つ
            const gx = fortGate ? clamp(e.px, -8, 8) : player.pos.x + Math.cos(e.ph) * 6, gz = fortGate ? 6 + (e.ph % 3) : player.pos.z - 4 + Math.sin(e.ph) * 3;
            if (Math.hypot(gx - p.x, gz - p.z) > 1.5) steer(e, gx, gz, e.speed, dt);
            e.state = 'approach';
          } else
          if (e.state === 'approach' && elev && (fortGate || (CASTLE.on && CASTLE.phase >= 1)) && tgtY(e.tgt) > e.baseY && tryClimb(e, tgtFloor(e.tgt))) { /* 梯子へ */ }
          else if (e.state === 'approach' && routed) steer(e, rt[0], rt[1], e.speed, dt);
          else if (e.state === 'approach' && elev) { if (dist > 4) steer(e, tx, tz, e.speed, dt); }
          else if (e.state === 'approach' && e.screen && dist > SCREEN.guardR && screenHold(e, tx, tz, dt)) { /* 弓兵の前に立って待つ */ }
          else if (e.state === 'approach' && e.yari && yariApproach(e, dt, dist, nx, nz, tx, tz)) { /* 槍：突撃／懐から下がる */ }
          else if (e.state === 'approach') {
            if (dist > (e.yari ? YARI.reach : MELEE_RANGE) - 0.35) {
              const side = Math.sin(time * 0.7 + e.ph) * (P.cautious ? 0.6 : 0.35) * e.strafe * Math.min(1, dist / 6);
              steer(e, p.x + (nx - nz * side) * 3, p.z + (nz + nx * side) * 3, e.speed, dt);
            } else if (e.cd <= 0) {
              e.state = 'windup'; e.t = 0;
              const T = P === PERS.好戦的 ? 0.4 : 0.5;
              if (e.tgt.isPlayer || Math.random() < 0.4) npcSay(e, 'attack', 0, 0.3);
            }
          }
        } else if (e.state === 'tocover' && !e.cover) { e.state = 'approach';   // 遮蔽物が無くなった（城の区域が変わった等）
        } else if (e.state === 'tocover') {
          e.cp = coverPoint(e.cover, tx, tz);
          if (steer(e, e.cp.x, e.cp.z, e.speed, dt) < 0.6 || e.t > 10) { e.state = 'hide'; e.t = 0; e.hideT = rand(P.hideT[0], P.hideT[1]); }
        } else if (e.state === 'hide') {
          e.hideT -= dt;
          if (e.hideT <= 0 || dist < 5) { e.state = 'approach'; e.hid = true; }
        } else if (e.state === 'charge') { yariCharge(e, dt);
        } else if (e.state === 'windup') {
          // 構え：少し引いてから…（槍は長く構える）
          const T = e.yari ? YARI.windup : P === PERS.好戦的 ? 0.4 : 0.5, k = e.t / T;
          tint(k);
          p.x -= nx * 0.6 * dt; p.z -= nz * 0.6 * dt;
          if (e.t >= T) {
            // 突き：正面に踏み込み、標的一人だけを判定
            e.state = 'recover'; e.t = 0; e.cd = rand(P.atkCd[0], P.atkCd[1]); npcTint(e, 0);
            p.x += nx * 0.45; p.z += nz * 0.45;
            const d2 = Math.hypot(tx - p.x, tz - p.z);
            const miss = e.yari && d2 < YARI.inside && Math.random() < 0.55;   // 槍：懐に入られると突きが外れやすい
            if (e.yari) e.cd += 0.5;
            if (!miss && d2 < (e.yari ? YARI.reach + 0.45 : MELEE_RANGE) && elevD(e) < 1.2) {
              if (e.tgt.isPlayer) hurtPlayer(e.dmg);
              else {
                const tp2 = e.tgt.s.position;
                damageEnemy(e.tgt, 1, p, false, { pt: new V3(tp2.x - nx * 0.15, e.tgt.baseY + e.tgt.figH * rand(0.5, 0.68), tp2.z - nz * 0.15), thrust: true }, e);
              }
            }
          }
        } else if (e.state === 'recover') {
          if (e.t > (e.yari ? YARI.recover : 0.35)) e.state = 'approach';   // 槍は引き戻しが遅い
        } else e.state = 'approach';
      }
    }
    }
    // 群れの分離
    if (!e.perch && !e.seated && !(e.lad && e.lad.ph !== 'go') && !e.ramCrew) for (const o of enemies) {
      if (o === e || o.state === 'down' || o.seated || Math.abs(o.baseY - e.baseY) > 1) continue;
      const ox = p.x - o.s.position.x, oz = p.z - o.s.position.z, d2 = ox * ox + oz * oz;
      if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += ox / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); p.z += oz / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); }
    }
    const pdx = player.pos.x - p.x, pdz = player.pos.z - p.z, pd = Math.hypot(pdx, pdz);
    if (!e.perch && !e.seated && pd < 0.9 && pd > 1e-4 && Math.abs(player.pos.y - e.baseY) < 1) { p.x -= pdx / pd * (0.9 - pd); p.z -= pdz / pd * (0.9 - pd); }
    const lim = MECH.on ? MECH.lim : CFG.field;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    if ((MTN.on || DUAL.on) && !e.perch && !e.seated && !(e.lad && e.lad.ph !== 'go') && e.state !== 'down' && e.state !== 'seppuku') {
      const fy = floorUnder(p.x, p.z, e.baseY + 0.45);
      const voidDrop = fy < 0.25 && fy < e.baseY - 1.05 && e.baseY > 0.35;
      if (MTN.on && voidDrop && e.footOk) { p.x = e.footOk[0]; p.z = e.footOk[1]; }
      else {
        if (fy > e.baseY + 0.02) e.baseY = Math.min(fy, e.baseY + 3.4 * dt);
        else e.baseY = Math.max(fy, e.baseY - 3.8 * dt);
        e.footOk = [p.x, p.z];
      }
    }
    if (!e.perch && !e.seated && !(e.lad && e.lad.ph !== 'go') && boxes.length) {
      const slipBar = DUAL.on && MTN.bar && ((DUAL.betrayed && (e.saiRunner || e === DUAL.miyashita)) || (e.missionRelief && e.team === 'blue'));
      const slipGate = e.missionRelief && e.team === 'blue' && DUAL.on;
      pushOutBoxes(p, 0.3, e.baseY + 0.1, e.baseY + 1.6, (slipBar || slipGate) ? (b => (slipBar && b === MTN.bar) || (slipGate && (MTN.gates || []).some(g => g.boxes && g.boxes.includes(b)))) : null);
    }
    if (PLANE.on && !e.seated) planeClamp(p, 0.28);
    if (e.onFloor && !e.lad && !e.perch) { const F = e.onFloor; p.x = clamp(p.x, F.x0 + 0.25, F.x1 - 0.25); p.z = clamp(p.z, F.z0 + 0.25, F.z1 - 0.25); }   // 床から落ちない
    if (e.bowSeat) { p.x = e.seated.x; p.z = e.seated.z; e.baseY = e.seated.boat.floor.y; }
    if (BEACH.on) beachFeet(e, p);
    if (BEACH.on && e.beachBundle) { if (e.seated) beachStowBundle(e); else beachSyncBundle(e); }
    if (!e.seated && CAR.g) carPush(p, 0.3);
    if (BEACH.on && !e.seated) keiPushAll(p, 0.3);
    p.y = e.baseY;
    if (PLANE.on && !e.seated) { const h = bodies.length ? pileAt(p.x, p.z) * 0.8 : 0; e.overY = (e.overY || 0) + (h - (e.overY || 0)) * Math.min(1, dt * 8); p.y += e.overY; }   // 倒れた娘の上に足を載せる
    animateNpc(e, dt, lean);
    if (e.yari && !e.spear) { if (e.spDrop) { e.spDrop.parent && e.spDrop.parent.remove(e.spDrop); e.spDrop = null; } makeYari(e); }   // 手当てで起き上がった槍兵：槍を拾い直す
    if (e.spear) yariPose(e, dt);
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
  if (player.god && BEACH.on) return;
  if (state !== 'play' || inHQ()) return;
  player.hp -= dmg; player.hurtT = 0.5; player.shake = 0.25;
  puff(player.pos.clone().setY(1), 0xb10f25, 7, 0.16, 1.6, 0.3);
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
  if (TEST && CASTLE.on && e.perch && (e.perch.gt || (e.perch.slit && e.perch.inner))) { const G = window.__gt || (window.__gt = { out: 0, inn: 0, outK: 0, inK: 0 }); G.shots = (G.shots || 0) + 1; }
  if (TEST && CASTLE.on && t && t.perch && (t.perch.gt || (t.perch.slit && t.perch.inner))) { const G = window.__gt || (window.__gt = { out: 0, inn: 0, outK: 0, inK: 0 }); G.shotsIn = (G.shotsIn || 0) + 1; }
  const tp = tgtPos(t);
  const target = new V3(tp.x, t.isPlayer ? player.pos.y + 1.2 : t.baseY + t.figH * (t.baseY > 0.5 ? 0.78 : 0.65), tp.z);
  if (MECH.on && e.kind === 'archer' && Math.random() < 0.62) { const w = mechAimWheel(e); if (w) target.copy(w); }
  const v = 30, d = from.distanceTo(target), tf = d / v;
  const dir = target.sub(from).normalize();
  const err = e.P.aimErr * (1 + d / 40);
  dir.x += gauss() * err; dir.y += gauss() * err; dir.z += gauss() * err; dir.normalize();
  const vel = dir.multiplyScalar(v); vel.y += 0.5 * 9.8 * tf;
  from.addScaledVector(dir, 0.5);
  addArrow(e.team, from, vel, { dmg: (e.captain ? 12 : 8) + Math.min(6, wave.n), shooter: e, gtShot: TEST && CASTLE.on && t && t.perch && (t.perch.gt || (t.perch.slit && t.perch.inner)) });
  Sfx.twangAt(e.s.position.clone().setY(e.baseY + 1.3));
}
function hitsCover(p) {
  if (p.y > (MTN.on ? 24 : 9)) return false;
  for (const c of covers) {
    if (c.mtn && p.y < (c.y || 0) - 0.25) continue;   // 山の竹束は、その段より下の矢までは遮らない
    if (p.y < (c.h || 7.5) && Math.hypot(p.x - c.x, p.z - c.z) < c.r * 0.85) return c;
  }
  return null;
}
function beachBundleOnSeg(p0, sx, sz, sy, sl, maxT) {
  let best = null, bt = maxT == null ? 1 : maxT;
  for (const cv of covers) {
    if (!cv.beach || cv.broken) continue;
    const t = clamp(((cv.x - p0.x) * sx + (cv.z - p0.z) * sz) / sl, 0, 1);
    if (t >= bt) continue;
    if (Math.hypot(p0.x + sx * t - cv.x, p0.z + sz * t - cv.z) > 0.78) continue;
    const y = p0.y + sy * t;
    if (y < (cv.y || 0) + 0.05 || y > (cv.h || 1.5) + 0.02) continue;
    bt = t; best = cv;
  }
  return best;
}
function beachArrowBundle(cv) {
  cv.hp -= 1;
  const p = new V3(cv.x, (cv.y || 0) + 0.85, cv.z);
  puff(p, 0xc5d6a4, 4, 0.16, 1.2, 0.3); Sfx.impactBamboo(p);
  if (cv.hp <= 0) breakBundle(cv);
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
    if (MECH.on) {
      const th = mechTireHit(p0, p1, a.team);
      if (th && th.t < best) {
        mechPuncture(th.C, th.i, a.team);
        puff(new V3(p0.x + (p1.x - p0.x) * th.t, 0.36, p0.z + (p1.z - p0.z) * th.t), 0x222222, 4, 0.15, 1.1, 0.3);
        scene.remove(a.m); arrows.splice(i, 1); continue;
      }
    }
    // プレイヤーへの当たり判定（橙組の矢のみ）
    if (a.team === 'orange') {
      const t = clamp(((player.pos.x - p0.x) * sx + (player.pos.z - p0.z) * sz) / sl, 0, 1);
      const d = Math.hypot(p0.x + sx * t - player.pos.x, p0.z + sz * t - player.pos.z);
      const y = p0.y + (p1.y - p0.y) * t - player.pos.y;
      if (d < 0.45 && y > 0 && y < 1.85 && t < best) {
        const cv = BEACH.on && beachBundleOnSeg(p0, sx, sz, p1.y - p0.y, sl, t);
        if (cv) { beachArrowBundle(cv); scene.remove(a.m); arrows.splice(i, 1); continue; }
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
      const cv = BEACH.on && beachBundleOnSeg(p0, sx, sz, p1.y - p0.y, sl, best);
      if (cv) { beachArrowBundle(cv); scene.remove(a.m); arrows.splice(i, 1); continue; }
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
    let boxHit;
    if (CASTLE.on || BEACH.on) {   // 城・浜：薄い襖・壁も線分で判定（すり抜けない）。狭間の窓は通す
      boxHit = false;
      if (a.team === 'player' || a.life > 0.06 || a.shooter && !a.shooter.perch) { const t = castleSegHit(p0, p1, a.team); if (t >= 0) { p1.lerpVectors(p0, p1, Math.max(0, t - 0.02)); boxHit = true; } }
    } else boxHit = (a.team === 'player' || a.life > 0.08) && boxes.length && hitsBox(p1);
    if (TEST && a.gtShot && (boxHit || hitsCover(p1))) { const L = window.__gtA || (window.__gtA = []); if (L.length < 60) L.push([boxHit ? 'box' : 'cov', +p1.x.toFixed(1), +p1.y.toFixed(2), +p1.z.toFixed(2)]); }
    if (TEST && (boxHit || hitsCover(p1))) { const A = window.__arr || (window.__arr = {}); const k = a.team + (boxHit ? ':box' : ':cov') + Math.round(p1.z / 10) * 10; A[k] = (A[k] || 0) + 1; }
    if (boxHit) { hitWood(p1); noteTowerHit(p1, a.team === 'orange' ? 'orange' : 'blue'); }
    if (MTN.on && a.team === 'player') mtnGateShot(p0, p1, a);
    const cv = boxHit ? null : hitsCover(p1);
    if (cv || boxHit) {   // 竹林・竹束・木の壁が矢を防ぐ。竹束は何本か受けると壊れる
      if (cv && cv.breakable) {
        cv.hp -= 1;
        puff(p1.clone(), 0xc5d6a4, 4, 0.18, 1.1, 0.3);
        if (cv.hp <= 0) { breakBundle(cv); scene.remove(a.m); arrows.splice(i, 1); continue; }
      }
      a.stuck = true; a.life = 0;
      if (boxHit) Sfx.impactWood(p1); else Sfx.impactBamboo(p1);
      continue;
    }
    const fl = floorUnder(p1.x, p1.z, p1.y);
    if (p1.y <= fl + 0.02) {
      p1.y = fl + 0.05; a.stuck = true; a.life = 0; if (TEST && a.gtShot) { const L = window.__gtA || (window.__gtA = []); if (L.length < 60) L.push(['gnd', +p1.x.toFixed(1), +p1.y.toFixed(2), +p1.z.toFixed(2)]); } if (TEST) { const A = window.__arr || (window.__arr = {}); const k = a.team + ':gnd' + Math.round(p1.z / 10) * 10; A[k] = (A[k] || 0) + 1; }
      if (BEACH.on && p1.z < 0 && fl <= BH.WATER + 0.01) { puff(p1.clone(), 0xdfeef5, 4, 0.5, 1.2, 0.5); Sfx.impactGround(p1); }
      else if (BEACH.on ? (floors.some(f => f.y === fl)) : fl > 0.1) Sfx.impactWood(p1);
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
  } else if ((MTN.on || DUAL.on) && mtnMeleeHon()) { /* 本丸の扉は近接で叩く */ }
  else if (MTN.on) mtnMeleeGate();
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
  lordSecTalk();
  const bg = $('bGod');
  if (bg) {
    const show = BEACH.on && state === 'play';
    bg.style.display = show ? 'block' : 'none';
    if (show) { bg.textContent = player.god ? '無敵解除' : '無敵'; bg.classList.toggle('on', !!player.god); }
  }
  const foeN = wave.toSpawn + livingHead('orange');
  const allyN = livingHead('blue');
  const islandSurvivors = enemies.filter(e=>e.islandRoster&&e.state!=='down').length+1;
  setText('remain', ISLAND.on ? (ISLAND.plaza ? `敵役 ${enemies.filter(e=>e.islandZombie&&e.state!=='down').length}　味方 ${islandSurvivors}` : `生存者 ${islandSurvivors} / 200　敵味方の区別なし`) : (wave.inter > 0 ? '次の波まで ' + Math.ceil(wave.inter) + ' 秒' : `残敵 ${foeN}　味方 ${allyN}${SNOW.on ? '　寒気 ' + Math.min(99, SNOW.cold | 0) + (snowInRiver(player.pos.x, player.pos.z) && !snowOnBridge(player.pos.x, player.pos.z) ? '（川）' : '') : ''}${MTN.on ? '　' + (MTN.phase <= 0 ? '門前' : MTN.phase === 1 ? '二の丸' : '本丸') : ''}${castleHud()}${FORT.atk && builtStage === 'fort' ? `　櫃 西${towers.west.clear ? '○' : '×'} 東${towers.east.clear ? '○' : '×'}` : ''}${BEACH.on ? '　トーチカ 残り ' + BEACH.pbs.filter(P => !P.taken).length : ''}`));
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
    const html = (pic ? `<img src="${pic}" alt="">` : '') + `${tm}${t.sq && !disg ? `<small class="sq">${sqDisp(t.sq)}${t.sq.leader === t ? '・隊長' : ''}${t.sq.cmd ? '・侍大将の麾下' : ''}</small>` : t.runner || t.wasRunner || t.saiRunner ? '<small class="sq">伝令</small>' : t.medic ? '<small class="sq">医務班</small>' : ''}<b>${t.prof.name}</b><span>${t.P.desc}・${t.medic ? (t.role === 'surgeon' ? '外科医' : '看護師') : t.fluter ? '笛役' : t.runner || t.wasRunner || t.saiRunner ? '伝令' : t.ojou ? '秘書課・侍大将' : t.secretary || t.wasSecretary || t.sec2 || t.wasSec2 || t.aide || t.wasAide || t.wasOjou ? '秘書課' : t.kind === 'archer' ? '弓兵' : '近接兵'}　${t.prof.cm}cm</span>` +
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
  { const v = CAR.riding ? 'hidden' : 'visible'; if (wc.style.visibility !== v) wc.style.visibility = v; }   // 助手席では武器の絵を出さない
  if (CAR.riding) { /* 助手席：武器は膝の上（描かない） */ } else if (player.weapon === 0) drawBow(W, H, bobX, bobY); else if (player.knife !== false) drawDagger(W, H, bobX, bobY);
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
  tapBtn('bThrow', () => {});
  tapBtn('bRun', b => { touch.run = !touch.run; b.classList.toggle('on', touch.run); });
  tapBtn('bJump', () => { if (player.onGround) { player.vy = 5.2; player.onGround = false; player.pos.y += 0.01; } });
  tapBtn('bPause', () => pauseGame());
  tapBtn('bTalk', () => { if (menuOpen) closeSecMenu(); else if (sec.near) openSecMenu(); });
  tapBtn('bLad', () => { if (keiUse()) return; if (carUse()) return; if (mechUse()) return; if (!castleUse()) ladderGo(); });
  // iOS のピンチ・ダブルタップ拡大やスクロールを止める
  document.addEventListener('gesturestart', e => e.preventDefault(), opt);
  document.addEventListener('touchmove', e => { if (e.target.closest && !e.target.closest('.screen, .screen-menu .panel')) e.preventDefault(); }, opt);
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
  if (e.code === 'KeyE') { if (menuOpen) closeSecMenu(); else if (keiUse()) { /* 浜の軽自動車 */ } else if (carUse()) { /* 平原の軽自動車 */ } else if (mechUse()) { /* 破れたタイヤ */ } else if (castleDoorClose() && castleUse()) { /* すぐ前の襖を優先 */ } else if (sec.near) openSecMenu(); else if (!castleUse()) ladderGo(); }
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
addEventListener('wheel', e => { if (!MOBILE && state === 'play' && !menuOpen) setWeapon(player.weapon ^ 1); }, { passive: true });
function primaryDown() {
  if (CAR.riding && carOn()) { carCommand(); return; }
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
  DUAL.on = builtStage === 'twofront';
  if (!DUAL.on) DUAL.won = false;
  if (menuOpen) closeSecMenu(false);
  clearBlood();
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
  player.deathCold = false;
  for (const q of perches) q.taken = null;
  seiranReset();
  FORT.hold = 0; FORT.won = false; FORT.t = 0; FORT.log = []; for (const k in towers) towers[k].clear = false;
  if (builtStage === 'island') { player.pos.set(0,0,68); player.yaw=0; }
  else if (builtStage === 'airport') { player.pos.set(-32, 0, 7.8); player.yaw = Math.PI; }
  else if (builtStage === 'trench') { player.pos.set(0, 0, 64.2); player.yaw = Math.PI; }
  else if (builtStage === 'nightRaid') { player.pos.set(0, 0, 49); player.yaw = 0; }
  else if (builtStage === 'twofront') { player.pos.set(DUAL_COX - 1, 0, 64.5); player.yaw = 0; }
  else if (builtStage === 'snow') { player.pos.set(0, 0, 88); player.yaw = 0; }
  else if (builtStage === 'mtn') { player.pos.set(0, 0, 80); player.yaw = 0; }
  else if (builtStage === 'fort' && FORT.atk) { player.pos.set(0, 0, -80); player.yaw = Math.PI; }   // 攻める：門の外の陣幕から
  else if (builtStage === 'fort') player.pos.set(-12, 6, 8.6);   // 左の櫃の上から
  else if (builtStage === 'plane') player.pos.set(-0.95, 0, 17.8);   // ラウンジの殿の席
  else if (builtStage === 'castle') { if (CASTLE.atk) { player.pos.set(-1, 0, -52); player.yaw = Math.PI; } else player.pos.set(-1, 0, 65.6); castleReset(); }   // 奥御殿の本陣から
  else if (builtStage === 'beach') beachReset();   // 殿の舟の屋形の中
  else player.pos.set(0, 0, 0);
  PLANE.intro = false; PLANE.introT = 0; PLANE.alarm = 0; player.seated = false; setStripColor(false); hemiL.intensity = PLANE.on ? 1.25 : SNOW.on ? 1.35 : LOOK0.hemi[2];
  wave = { n: 0, toSpawn: 0, spawnT: 0, inter: 0, maxAlive: 8 };
  if (CAR.g && builtStage === 'plains') carReset();
  if (MECH.on) mechPark();
  player.god = false;
  smokeReset(); knifeReset();
}
function startGame() {
  Sfx.init(); if (Voice.ok) { Voice.pick(); speechSynthesis.cancel(); }
  if (stageName === 'snow' || stageName === 'mtn' || stageName === 'airport' || stageName === 'trench' || stageName === 'island') builtStage = null;   // 罠・門・川をやり直しのたびに戻す
  loadStage(stageName);
  resetGame();
  if (builtStage === 'airport') airportCrewRebuild();
  plainMGCrewEnsure();
  $('bTrenchAttack').style.display='none';
  // 塹壕戦は戦闘員を配置してから、通常の秘書・医務班・伝令・補佐役を追加する。
  if (builtStage !== 'trench' && builtStage !== 'island') {
    spawnSecretary(); spawnSec2(); spawnOjou();
    for (const t of ['blue','orange']) for (const m of medics[t]) spawnMedic(t,m);
    for (const A of aides) spawnAide(A);
    for (const R of runners) spawnRunner(R);
  }
  GUARD.list = []; GUARD.lead = null; wave.n = 1; if (builtStage !== 'twofront' && builtStage !== 'trench' && builtStage !== 'island') guardFill(1, false);   // 近衛分隊
  unlockAudio(); goFullscreen(); resetTouch();
  $('title').style.display = 'none'; $('over').style.display = 'none'; $('pause').style.display = 'none';
  $('hud').style.display = 'block';
  SITU.reset(); SITU.preload();
  state = 'play'; lock();
  if (builtStage === 'island') { islandStart(); }
  else if (builtStage === 'airport') { airportSpawnForces(); startWave(1); }
  else if (builtStage === 'trench') {
    trenchStartBattle();
    spawnSecretary(); spawnSec2(); spawnOjou();
    for (const t of ['blue','orange']) for (const m of medics[t]) spawnMedic(t,m);
    for (const A of aides) spawnAide(A);
    for (const R of runners) spawnRunner(R);
    trenchSupportEnsure();
  }
  else if (builtStage === 'twofront') startDualMission(); else startWave(1);
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
  $('bTrenchAttack').style.display='none';
  state = 'title'; resetGame(); removeSecretary(); removeFluter();
  $('pause').style.display = 'none'; $('over').style.display = 'none'; $('hud').style.display = 'none'; $('title').style.display = 'flex';
}
function gameOver(win) {
  if (state === 'play') try { SITU.end(win); } catch (_) {}
  state = 'over'; player.drawing = false; CAR.riding = false; $('banner').style.opacity = 0; bannerTimer = 0;
  if (!win && !player.deathCold) spillBlood(player.pos.x, player.pos.y, player.pos.z, 0.7);
  { const h1 = document.querySelector('#over h1'), h2 = document.querySelector('#over h2'); if (h1) h1.textContent = win ? '勝利' : '敗北'; if (h2) h2.textContent = win ? (AIRPORT.on ? '地上侵入部隊を撃退した' : ISLAND.on ? '最終広場の敵役を全員倒し、生還した' : MTN.on ? '山城の本丸を落とした' : SNOW.on ? '極寒の峡谷を突破した' : BEACH.on ? 'すべてのトーチカを制圧した' : MECH.on ? '砦を落とした' : '勝利') : (AIRPORT.on ? '管制塔の守備隊が全滅した' : player.deathCold ? '凍死した。血は出ていない' : SNOW.on && SNOW.cold > 36 ? '凍傷で倒れた' : 'あなたに戦死判定が下った'); }
  if (document.exitPointerLock) document.exitPointerLock();
  $('result').innerHTML = `撃破数（戦死判定） <b>${player.kills}</b>　／　味方撃破 <b>${player.allyKills}</b>　／　到達 第${waveName(wave.n)}波`;
  $('over').style.display = 'flex';
}
$('startBtn').onclick = startGame;
$('bTrenchAttack').addEventListener('click', trenchCharge);
// Pointer lock/canvas can win hit-testing on some mobile/desktop browsers. Route a press
// inside the visible assault button to the command before the canvas handles it.
window.addEventListener('pointerdown', ev => {
  if (!TRENCH.on || TRENCH.started || state !== 'play') return;
  const b = $('bTrenchAttack'), r = b.getBoundingClientRect();
  if (b.style.display !== 'none' && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
    ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    trenchCharge();
  }
}, true);
$('retryBtn').onclick = startGame;
const godBtn = $('bGod');
if (godBtn) {
  let godTap = 0;
  godBtn.addEventListener('touchend', ev => { ev.preventDefault(); ev.stopPropagation(); godTap = performance.now(); toggleGod(); }, { passive: false });
  godBtn.addEventListener('click', ev => { ev.stopPropagation(); if (performance.now() - godTap < 700) return; toggleGod(); });
}
const mtnOpenBtn = $('bMtnOpen');
if (mtnOpenBtn) {
  let mtnOpenTap = 0;
  mtnOpenBtn.addEventListener('touchend', ev => {
    ev.preventDefault(); ev.stopPropagation(); mtnOpenTap = performance.now(); openMtnHonDoorByKing();
  }, { passive: false });
  mtnOpenBtn.addEventListener('click', ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (performance.now() - mtnOpenTap < 700) return;
    openMtnHonDoorByKing();
  });
}
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
  const honBtn = $('bMtnOpen'), honBar = MTN.bar;
  const honNear = !!(honBtn && DUAL.on && state === 'play' && !menuOpen && honBar && !honBar.gone &&
    mtnHonDoorDistance() < 3.15 && Math.abs(player.pos.y - honBar.y0) < 1.7);
  if (honBtn) honBtn.style.display = honNear ? 'block' : 'none';
  let t = '';
  if (player.autoClimb) t = player.autoClimb.up ? '上っています…' : '下りています…';
  else if (n) { const what = n.L.seiran ? '井闌の梯子' : '梯子'; t = MOBILE ? `${what}：スティックを${n.up ? '前' : '後ろ'}に倒す／「梯子」ボタン` : `${what}：${n.up ? 'W（前進）で上る' : 'S（後退）で下りる'}　E で自動`; }
  const dr = !n && !player.autoClimb && state === 'play' && !menuOpen ? castleDoorNearHint() : null;   // 城：襖
  if (dr) t = MOBILE ? `襖：「襖」ボタンで${dr.open ? '閉める' : '開ける'}` : `襖：E で${dr.open ? '閉める' : '開ける'}`;
  const tire = !menuOpen && MECH.on && state === 'play' && mechNearLame();
  const anyTire = !menuOpen && state === 'play' && mechAnyLame();
  if (tire) t = 'タイヤ：修理ボタン、または E';
  const ch = !menuOpen && carOn() ? carHint() : (!menuOpen && BEACH.on ? keiHint() : ''), car = !!ch;   // 軽自動車（平原の運転手／浜の乗り合い）
  if (car) t = ch;
  if (t !== ladHintTxt) { ladHintTxt = t; if (el) { el.textContent = t; el.classList.toggle('on', !!t); } document.documentElement.classList.toggle('canlad', !!n || !!player.autoClimb || !!dr || car);
    const bl = $('bLadL'); if (bl) bl.textContent = car ? (CAR.riding ? '降りる' : '乗る') : dr ? (dr.open ? '閉める' : '開ける') : player.autoClimb ? '止める' : n && !n.up ? '下りる' : '上る';
    const bt = document.querySelector('#bLad span'); if (bt) bt.textContent = car ? '車' : dr ? '襖' : '梯子'; }
  document.documentElement.classList.toggle('canfix', !!anyTire);
}
function updatePlayer(dt) {
  updateLadderHint();
  if (player.kei) { keiSeatPlayer(); keiCam(dt); return; }   // 浜の軽自動車
  if (CAR.riding && carOn()) { carSeatPlayer(); carCamera(dt); return; }   // 平原の助手席
  // 移動
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW) { mx += fx; mz += fz; } if (keys.KeyS) { mx -= fx; mz -= fz; }
  if (keys.KeyA) { mx += fz; mz -= fx; } if (keys.KeyD) { mx -= fz; mz += fx; }
  if (touch.jx || touch.jy) { const jf = -touch.jy, jr = touch.jx; mx += fx * jf - fz * jr; mz += fz * jf + fx * jr; }   // 仮想スティック
  const ml = Math.hypot(mx, mz), mag = Math.min(1, ml);
  let sp = ((keys.ShiftLeft || keys.ShiftRight || touch.run) && !player.drawing ? CFG.run : CFG.walk) * (player.speedT > 0 ? 1.2 : 1);   // 靴を磨いてもらうと少し速い
  if (player.drawing) sp *= 0.5;
  if (PLANE.on && bodies.length) { const h = pileAt(player.pos.x, player.pos.z); if (h > 0) sp *= h > 0.5 ? 0.45 : 0.65; }
  if (SNOW.on && SNOW.cold > 20) sp *= SNOW.cold > 36 ? 0.62 : 0.82;   // 寒さで足が鈍る
  if (MTN.on && MTN.slowT > 0) sp *= 0.42;   // トラバサミで足を取られている
  // 梯子：前進で上る・後退で下りる（途中は横移動しない）
  let fin = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - touch.jy;
  // 自動で上り下り（E キー／スマホの「梯子」ボタン）：梯子の中心へ寄せ、端まで運ぶ。逆の入力・跳ぶで止める
  const AC = player.autoClimb;
  let mechLadPass = !!(AC && AC.L && AC.L.mech);
  if (AC) {
    const L = AC.L, cx = (L.x0 + L.x1) / 2, zc = (L.z0 + L.z1) / 2, F = L.F;
    AC.t += dt;
    if ((AC.up ? fin < -0.3 : fin > 0.3) || keys.Space || AC.t > 14 || !ladders.includes(L)) player.autoClimb = null;
    else if (L.mech && AC.up && L.zTop != null) {
      const k = clamp(player.pos.y / Math.max(0.4, L.y1), 0, 1);
      const tz = L.zStand + (L.zTop - L.zStand) * k;
      const s = Math.min(1, dt * 7);
      player.pos.x += (cx - player.pos.x) * s; player.pos.z += (tz - player.pos.z) * s;
      fin = 1;
      if (player.pos.y >= L.y1 - 0.05 && F) {
        player.pos.y = L.y1; player.pos.z = L.zTop; player.pos.x = clamp(cx, F.x0 + 0.5, F.x1 - 0.5);
        player.autoClimb = null; player.onGround = true; mechLadPass = true;
      }
    } else {
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
  if (player.climbing && lad && lad.mech) mechLadPass = true;
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
  player.pos.x = clamp(player.pos.x, -(MECH.on ? MECH.lim : CFG.field), MECH.on ? MECH.lim : CFG.field); player.pos.z = clamp(player.pos.z, -(MECH.on ? MECH.lim : CFG.field), MECH.on ? MECH.lim : CFG.field);
  for (const c of colliders) {
    if (player.pos.y > 2) continue;
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.35;
    if (d < r && d > 1e-4) { player.pos.x = c.x + dx / d * r; player.pos.z = c.z + dz / d * r; }
  }
  if (PLANE.on) { player.autoClimb = null; player.climbing = false; }   // 機内に梯子は無い（他のステージの上り下りを持ち込まない）
  if (boxes.length && !mechLadPass) pushOutBoxes(player.pos, 0.35, player.pos.y + 0.15, Math.min(player.pos.y + 1.75, PLANE.on ? 2.3 : 99));
  if (PLANE.on) planeClamp(player.pos, 0.35);
  if (BEACH.on) beachPlayerClamp();
  if (BEACH.on && !player.kei) keiPushAll(player.pos, 0.35);
  let gh = floorUnder(player.pos.x, player.pos.z, player.pos.y);
  if (PLANE.on) {   // 倒れた娘の上に乗る（なめらかに）・天井に頭をぶつけない
    const ph = bodies.length ? pileAt(player.pos.x, player.pos.z) * 0.8 : 0;
    if (ph > gh && player.pos.y < ph) { player.pos.y += (ph - player.pos.y) * Math.min(1, dt * 10); player.vy = Math.max(0, player.vy); player.onGround = true; }
    gh = Math.max(gh, Math.min(ph, player.pos.y));
    if (player.pos.y > PL_IN.yMax) { player.pos.y = PL_IN.yMax; player.vy = Math.min(0, player.vy); }   // 頭が天井（2.34m）に届かない高さまで
  }
  if (player.pos.y <= gh && !player.climbing) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  if (MTN.on && player.onGround) {
    const slot = player.mtnFoot;
    if (slot && player.pos.y > 0.35 && gh < slot[2] - 1.05 && gh < 0.25) {
      player.pos.x = slot[0]; player.pos.z = slot[1]; player.pos.y = slot[2]; player.vy = 0; gh = slot[2];
    } else player.mtnFoot = [player.pos.x, player.pos.z, player.pos.y];
  }
  if (PLANE.on) { if (player.pos.y < 0) player.pos.y = 0; planeClamp(player.pos, 0.35); }
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
  if (TEST && typeof window.__camPre === 'function') try { window.__camPre(camera); } catch (_) {}   // テスト撮影用：見え方の選択の前にカメラを置く
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
  if (TEST && window.__tick) try { window.__tick(dt); } catch (_) {}   // テスト撮影用：毎フレームの位置・向きの固定
  if (state === 'play') {
    time += dt;
    if (TEST) testBot(dt);
    stepBudget = 3;
    if (BEACH.on) updateBeach(dt); if (CAR.g) updateCar(dt); if (PLAINMG.on) plainMGUpdate(dt); if (MECH.on) updateMech(dt); if (DUAL.on) updateDual(dt); if (SMOKE.clouds.length || SMOKE.balls.length) updateSmoke(dt); if (KNIFE.fly.length || KNIFE.ground.length || !player.knife) updateKnives(dt);
    updatePlayer(dt); if (SNOW.on) updateSnow(dt); if (MTN.on) updateMountain(dt); updateHQ(dt); updateAides(dt); waveUpdate(dt); if (seirans.length) updateSeiran(dt); if (CASTLE.on) { updateCastle(dt); castleAtkWin(dt); } fortAtkUpdate(dt); updateGuards(); updateEnemies(dt); if (ISLAND.on) updateIsland(dt); updateBodies(dt); updateArrows(dt); updatePickups(dt); updateHud(dt); updateSquads(dt);
    if (window.__cam) { const C = window.__cam; camera.position.set(C.p[0], C.p[1], C.p[2]); camera.lookAt(C.t[0], C.t[1], C.t[2]); }   // テスト撮影用の視点
    updateTags();
  } else if (state === 'title') {
    time += dt;
    if (builtStage === 'island') { camera.position.set(Math.sin(time*.035)*32,22,20+Math.cos(time*.035)*16);camera.lookAt(0,0,-35); }
    else if (builtStage === 'beach') {   // 浜：沖から高台のトーチカを望む
      if (BEACH.on) updateBeach(dt);
      camera.position.set(Math.sin(time * 0.08) * 14, 4.5, -38); camera.lookAt(Math.sin(time * 0.05) * 6, 3.5, 40);
    } else if (builtStage === 'plane') {   // 機内：ラウンジから客室の奥を眺める
      camera.position.set(Math.sin(time * 0.1) * 0.5, 1.5, 14.8 - Math.sin(time * 0.07) * 1.5);
      camera.rotation.set(-0.03, Math.sin(time * 0.08) * 0.35, 0);
    } else if (builtStage === 'castle') {   // 城：二の丸から大手門と櫓を眺める
      camera.position.set(Math.sin(time * 0.06) * 10, 7, 22 + Math.cos(time * 0.06) * 3);
      camera.rotation.set(-0.12, Math.PI + Math.sin(time * 0.06) * 0.25, 0);
    } else if (builtStage === 'mtn') {
      camera.position.set(Math.sin(time * 0.05) * 5, 3.4, 82);
      camera.lookAt(0, 9, 28);
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
    Sfx.ambience(dt, playing, combat); Sfx.flute(!playing ? false : fluter.e && fluter.e.state !== 'down' ? fluter.e.s.position.clone().setY(1.5) : null, combat); AudioGuard.tick(dt); SITU.tick(dt); }
  if (sec.fanT > 0 && state === 'play') {   // 扇の風（画面の端に流れる線）
    paintG.strokeStyle = `rgba(255,255,255,${Math.min(0.35, sec.fanT * 0.15)})`; paintG.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = innerHeight * (0.2 + i * 0.1) + Math.sin(time * 3 + i) * 10, x = ((time * 400 + i * 180) % (innerWidth + 300)) - 150;
      paintG.beginPath(); paintG.moveTo(x, y); paintG.quadraticCurveTo(x + 60, y - 12, x + 140, y); paintG.stroke(); }
  }
  for (const f of flags) f.mesh.rotation.y = Math.sin(time * 1.7 + f.ph) * 0.35;
  if (document.body.classList.contains('playing') !== (state === 'play')) document.body.classList.toggle('playing', state === 'play');
  if (document.documentElement.classList.contains('dagger') !== (player.weapon === 1 && !!player.knife)) document.documentElement.classList.toggle('dagger', player.weapon === 1 && !!player.knife);
  if (MOBILE) { const wl = player.weapon === 0 ? '弓矢' : '懐刀'; if ($('bWpnL').textContent !== wl) { $('bWpnL').textContent = wl; $('bAtkL').textContent = player.weapon === 0 ? '長押しで引く' : 'タップで突く'; } }
  sky.position.copy(camera.position);
  if (AIRPORT.on) airportCrewFaceAll();
  if (PLANE.on) updatePlaneFx(state === 'play' ? dt : state === 'title' ? dt : 0);
  if (MOTION) { updateSunShadow((now - (frame.prev || now)) / 1000); frame.prev = now; Mo.flush(); }
  if (window.__camOverride) window.__camOverride(camera);   // テスト用（見え方の確認）
  renderer.render(scene, camera);
  drawWeapon();
}
resize();
setupTouch();
let fixTap = 0;
{
  const fixBtn = $('bFix');
  const doFix = () => { if (state !== 'play') return; if (!mechUse()) popup('破れたタイヤのそばまで来て'); };
  fixBtn.addEventListener('touchend', ev => { ev.preventDefault(); ev.stopPropagation(); fixTap = performance.now(); doFix(); }, { passive: false });
  fixBtn.addEventListener('click', ev => { ev.stopPropagation(); if (performance.now() - fixTap < 700) return; doFix(); });
}
// ステージ選択（タイトル画面）
const STAGE_Q = (location.search.match(/[?&]stage=(\w+)/) || [])[1];
if (STAGE_Q && STAGES[STAGE_Q]) stageName = STAGE_Q;
if (!STAGES[stageName]) stageName = 'plains';
function selectStage(name) {
  stageName = name; try { localStorage.setItem('onna_stage', name); } catch (e) {}
  for (const b of document.querySelectorAll('#stagesel button')) b.classList.toggle('on', b.dataset.st === name);
  const ms = MODE_STAGES.includes(name), md = stageModes[name] || 'def';
  $('modesel').style.display = ms ? 'flex' : 'none';
  for (const b of document.querySelectorAll('#modesel button')) b.classList.toggle('on', b.dataset.md === md);
  $('stagedesc').textContent = ms && md === 'atk' ? STAGE_ATK_DESC[name] : STAGES[name].desc;
  loadStage(name);
}
const STAGE_ATK_DESC = {
  fort: '【攻める】青組（殿の側）が砦を攻める。井闌（攻城櫓）の弓兵、梯子攻め役、近接・槍で門から押し入り、橙組が守る二基の櫃を奪え（両方の櫃から橙組を除き、そばで押さえれば勝ち）。殿の本陣は門の外の陣幕。',
  castle: '【攻める】青組（殿の側）が城を攻める。破門隊の丸太で大手門を破り、二の丸で中門の門櫓・狭間の弓と撃ち合い、毒煙玉の投げ手が守りを崩す。奥御殿の伏兵・落とし穴を越えて、橙組の本陣（いちばん奥の間）を奪えば勝ち。殿の本陣は門の外の陣幕。',
};
for (const b of document.querySelectorAll('#modesel button')) b.addEventListener('click', () => { stageModes[stageName] = b.dataset.md; try { localStorage.setItem('onna_modes', JSON.stringify(stageModes)); } catch (e) {} selectStage(stageName); });
for (const b of document.querySelectorAll('#stagesel button')) b.addEventListener('click', () => selectStage(b.dataset.st));
selectStage(stageName);
// 用件を選んだらメニューを閉じて、その様子を画面で見せる（返事は字幕）。小メニュー（ご飯・感想）を開くだけのときは開いたまま
function secAct(fn) {
  if (!menuOpen || state !== 'play') return;
  fn();
  const sub = ['secremarks', 'secmeals', 'secdrinks'].some(k => $(k).style.display === 'grid');
  if (menuOpen && !sub) closeSecMenu(false);
}
for (const b of document.querySelectorAll('#secmenu [data-req3]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => OJOU_REQ[b.dataset.req3]()); });
for (const b of document.querySelectorAll('#secmenu [data-req2]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => SEC2_REQ[b.dataset.req2]()); });
for (const b of document.querySelectorAll('#secmenu [data-req]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => SEC_REQ[b.dataset.req]()); });
$('secRemark').addEventListener('click', ev => { ev.stopPropagation(); showSub('secremarks'); });
for (const b of document.querySelectorAll('#secmenu [data-sub-back]')) b.addEventListener('click', ev => { ev.stopPropagation(); showSub(null); });
for (const id of ['onigiriRem', 'secOnigiri']) $(id).addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); if (state === 'play') { onigiriRemark(); if (menuOpen) closeSecMenu(false); } });
for (const b of document.querySelectorAll('#secdrinks [data-drink]')) b.addEventListener('click', ev => { ev.stopPropagation(); secAct(() => { caDrink(b.dataset.drink); showSub(null); }); });
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

window.__doorSet = (d, o, by) => doorSet(d, o, by);
window.__game = { scene, stageRoot, ground, get stage(){return stageName;}, get state(){return state;}, get enemies(){return enemies;}, get bodies(){return bodies;}, get hq(){return hq;}, get player(){return player;}, SEC_REQ, inHQ, startGame, damageEnemy, AIRPORT, airportUpdate, airportSpawnForces, SMOKE, KNIFE, castleGateBreak, castleLOS, castleCanTarget, chooseTarget, smokeCloud, playerThrowKnife, carDbg: () => { const L = []; for (const o of enemies) { const [lx, lz] = carL(o.s.position.x, o.s.position.z); if (Math.abs(lx) < 3 && lz > -3 && lz < 6) L.push([o.prof.name, o.state, +lx.toFixed(2), +lz.toFixed(2), !!o.guard, !!o.secretary, !!o.aide, o === CAR.driver]); } for (const o of bodies) { const [lx, lz] = carL(o.s.position.x, o.s.position.z); if (Math.abs(lx) < 3 && lz > -3 && lz < 6) L.push(['body', +lx.toFixed(2), +lz.toFixed(2)]); } return L; }, BEACH, TRENCH, ISLAND, updateIsland, islandPlaza, trenchCharge, CAR, MG, BH, PLAINMG, plainMGUpdate, plainMGCrewEnsure, isUp, cataSit, carUse, carCommand, carNear, carOn, groundH, boatAt, kingSay, beachLand, keiSit, keiUse, keiDrop, keiBeside, keiCount, updateKei, beachHqBrain, mgShot, updateCar, GUARD, YARI, CASTLE, CS, castleRegion, castleRoute, castleUse, castleSpring, updateCastle, get lean() { return { LEAN_P }; }, get drawCalls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; }, PLANE, PL, pileAt, planeAmbush, plCellAt, planeRoute, hq: () => hq, squads, runners, SQ, updateSquads, AMMO_MAX, tagLabel, showSquadReport, pauseGame, resumeGame, AudioGuard, ladders, floors, ladPts, tryClimb, startClimb, tgtFloor, ladderTo, get gtime() { return time; }, ojou, OJOU_REQ, enemyShoot, seiranSync, spawnEnemy, FOLLOW, Talk, seirans, seiranWave, aides, updateAides, MOTION, Mo, sec2, SEC2_REQ, get menuWho() { return menuWho; }, medics, medPost, revivePatient, get state() { return state; }, towers, sayRemark, sec, SEC_REQ, openSecMenu, closeSecMenu, inHQ, get menuOpen() { return menuOpen; }, get allyStance() { return allyStance; }, GIRLS, get framesLoaded() { return framesLoaded; }, get stage() { return builtStage; }, MTN, perches, VoicePack, player, get enemies() { return enemies; }, get bodies() { return bodies; }, get wave() { return wave; }, get texLoaded() { return texLoaded; }, MOBILE, touch, get arrows() { return arrows; }, covers, colliders, SPR, startGame, damageEnemy, startWave, startEscort, askMeal, orderMeal, onigiriRemark, fluter, Sfx, MECH, toggleGod, seatPose, seatCtxOf, killEnemy: (e, f) => killEnemy(e, f), hurtPlayer, updateMech, mechSit, mechPuncture, mechTireHit, mechFix, mechUse, mechCrew, mechPark, mechWave, lordSecTalk, mechClimb, mechMarch, mechVehicles, updateEnemies, updatePlayer, spawnAlly, waveUpdate, DUAL, updateDual, routeTo };
})();
