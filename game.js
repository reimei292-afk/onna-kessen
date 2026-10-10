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
    A.bed.gain.setTargetAtTime(playing ? 0.01 + A.combat * 0.03 : 0, c.currentTime, 0.5);
    if (!playing || !combat) return;
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
    if (!pos) { F.out.gain.setTargetAtTime(0, now, 0.3); F.next = 0; F.idx = 0; return; }
    const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, d = Math.hypot(dx, dz), k = clamp(1 - d / 90, 0, 1);
    F.out.gain.setTargetAtTime((0.025 + k * k * 0.42) * (combat ? 1 : 0.7), now, 0.2);
    F.lp.frequency.setTargetAtTime(clamp(9000 - d * 110, 1200, 9000), now, 0.2);
    if (F.pan) F.pan.pan.setTargetAtTime(clamp((dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / (d || 1), -1, 1) * 0.8, now, 0.1);
    const beat = 60 / (combat ? 138 : 84);
    if (F.next < now) F.next = now + 0.05;
    while (F.next < now + 0.3) {
      const [n, b] = this.FLUTE_MEL[F.idx]; F.idx = (F.idx + 1) % this.FLUTE_MEL.length;
      const dur = b * beat;
      if (n !== null) this.fluteNote(587.33 * Math.pow(2, n / 12), F.next, dur * (combat ? 0.88 : 0.95), combat ? 0.32 : 0.22);
      F.next += dur;
    }
  },
  // 波の開始の合図（太鼓の代わりに笛の短い呼び）
  fluteCall() {
    const c = this.ctx; if (!c || !this.fl.out) return; const t = c.currentTime + 0.05;
    [[7, .15], [9, .15], [12, .5]].reduce((tt, [n, d]) => { this.fluteNote(587.33 * Math.pow(2, n / 12), tt, d, 0.4); return tt + d; }, t);
  },
};

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
    const now = performance.now(), busy = speechSynthesis.speaking || speechSynthesis.pending;
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
    u.onend = u.onerror = () => { this.prio = 0; };
    this.prio = prio;
    speechSynthesis.speak(u);
  },
};
if (Voice.ok) { Voice.pick(); speechSynthesis.onvoiceschanged = () => Voice.pick(); }
// ---- 収録済みボイス：edge-tts（ja-JP-NanamiNeural）で事前生成した mp3（assets/voices/、目録は voices.js）
//   WebAudio で再生し、距離で音量を変える。ファイルが無い・file:// で開いた時は Web Speech にフォールバック。
const VV_RATE = [0.965, 1.0, 1.035];   // 侍女ごとの声の高さ・速さの個体差（控えめ）
const VoicePack = {
  man: window.VOICE_MANIFEST || null, buf: {}, loading: {}, playing: 0, lastLow: 0, ok: false, out: null,
  init() {
    this.ok = !!(this.man && Sfx.ctx && /^https?:/.test(location.protocol) && window.fetch);
    if (this.ok && !this.out) { this.out = Sfx.ctx.createGain(); this.out.gain.value = 1; this.out.connect(Sfx.ctx.destination); }
  },
  load(fn) {
    if (fn in this.buf || this.loading[fn]) return;
    this.loading[fn] = fetch('assets/voices/' + fn).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => Sfx.ctx.decodeAudioData(ab, res, rej)))
      .then(b => { this.buf[fn] = b; }, () => { this.buf[fn] = null; });
  },
  preload() {
    if (!this.ok) return;
    for (const k in this.man) for (const c in this.man[k]) for (const l of this.man[k][c]) for (const f of l.files) this.load(f);
  },
  // true = 収録音声で処理した（再生した・混雑で省略した）／false = フォールバックが必要
  play(fn, dist, prio, rate = 1) {
    if (!this.ok || !fn) return false;
    const b = this.buf[fn];
    if (b === null) return false;
    if (b === undefined) { this.load(fn); return prio < 2; }
    const now = performance.now();
    const k = clamp(1 - dist / 60, 0.12, 1);
    if (prio < 2) {
      if (this.playing >= 3 || now - this.lastLow < 450 || k < 0.15) return true;
      this.lastLow = now;
    } else if (this.playing >= 6) return true;
    const c = Sfx.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = b; g.gain.value = 1.15 * k * k + 0.05;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * 0.03);   // ±3% の揺らぎ
    src.connect(g); g.connect(this.out);
    this.playing++; src.onended = () => { this.playing--; };
    src.start();
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
scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x55603a, 1.6));
scene.add(new THREE.AmbientLight(0xffffff, 0.75));   // 3D の侍女の陰が真っ黒にならないように
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
const mtMat = new THREE.MeshBasicMaterial({ color: 0x8c9db0, fog: false });
const mtMat2 = new THREE.MeshBasicMaterial({ color: 0xa6b4c2, fog: false });
for (let i = 0; i < 26; i++) {
  const a = i / 26 * Math.PI * 2 + rand(-.1, .1), r = rand(520, 640), h = rand(60, 150);
  const m = new THREE.Mesh(new THREE.ConeGeometry(rand(90, 160), h, 6), i % 2 ? mtMat : mtMat2);
  m.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r); m.renderOrder = 0; scene.add(m);
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
      bamboobundle(x, z + rand(-2, 2), rand(-0.25, 0.25));
    }
  }
  for (let i = 0; i < 10; i++) nobori(rand(-45, 45), rand(-95, -80), '#d9741c', '#fff6e8', pick(['橙組', '必勝', '勝鬨', '一番']));
  // 周りの木々
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(55, CFG.field + 20), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < 0 && z > -100 && Math.abs(x) < 50) continue;
    if (z >= -2 && z < 40 && Math.abs(x) < 46) continue;
    tree(x, z, rand(0.8, 1.6));
  }
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
  for (const l of ladders) if (x > l.x0 && x < l.x1 && z > l.z0 - 0.3 && z < l.z1 + 0.3 && y > l.y0 - 0.1 && y < l.y1 + 0.3) return l;
  return null;
}
const STAGES = {
  plains: { name: '平原の戦い', desc: '竹林の点在する平原で、青組と橙組が正面からぶつかる。' },
  fort: { name: '櫃の戦い', desc: '青組は砦を守る。二基の櫃（やぐら）と壁の足場から射下ろし、門の外の竹束に隠れる橙組を迎え撃つ。梯子で上り下りできる。' },
};
function loadStage(name) {
  if (builtStage === name) return;
  for (const c of [...stageRoot.children]) stageRoot.remove(c);
  colliders.length = covers.length = flags.length = boxes.length = floors.length = ladders.length = perches.length = 0;
  fortGate = null; hq = null;
  road.visible = name === 'plains';
  if (name === 'fort') buildFort(); else buildPlains();
  builtStage = name;
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
function loadFrames(done) {
  const meta = window.FRAME_META || {}, data = window.FRAME_DATA || {};
  const useFiles = /^https?:/.test(location.protocol), loader = new THREE.TextureLoader();
  const jobs = [];
  // 元の写真が無く、frames に正面がある娘（医療係など）
  for (const gid in meta) if (!GIRLS[gid] && meta[gid].front) GIRLS[gid] = { id: gid, type: gid === 'medic' ? 'medic' : 'extra', spr: null, front: null };
  for (const gid in meta) for (const k in meta[gid]) if (GIRLS[gid]) jobs.push([gid, k, meta[gid][k]]);
  const done2 = () => {
    for (const gid in GIRLS) { const g = GIRLS[gid]; if (!g.front) { delete GIRLS[gid]; continue; }
      if (!g.spr) g.spr = { id: gid, img: g.front.tex.image, top: Math.max(0, 1 - 1 / g.front.hk), tex: g.front.tex, aspect: g.front.aspect }; }
    if (!GIRLS[SEC2_ID]) SEC2_ID = Object.keys(GIRLS).find(k => GIRLS[k].type === 'mob' && k !== SEC_ID && k !== FLUTE_ID) || SEC_ID;
    if (!GIRLS[MEDIC_ID]) MEDIC_ID = GIRLS.mob05 ? 'mob05' : SEC_ID;
    done();
  };
  let left = jobs.length; if (!left) { done2(); return; }
  const fin = () => { if (--left === 0) done2(); };
  for (const [gid, k, m] of jobs) {
    const ok = t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      GIRLS[gid][k] = { tex: t, aspect: m.aspect || t.image.width / t.image.height, hk: m.hk || 1, ax: m.ax == null ? 0.5 : m.ax, dir: m.dir || 0 }; framesLoaded++; fin(); };
    const emb = data[gid + '_' + k];
    const fb = () => emb ? loader.load(emb, ok, undefined, () => fin()) : fin();
    if (useFiles) loader.load(m.file + '?v=' + (m.hk || 1), ok, undefined, fb); else fb();
  }
}
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
  let fit = all.filter(g => kind === 'archer' ? (g.bow || (g.type === 'archer' && g.side && g.back)) : g.type === 'mob');
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
    lines: { spot: ['見つけたっ！ いくよ！', 'いたいた、勝負だよ！', 'よーし、腕が鳴るね！'], attack: ['てやぁっ！', '覚悟しなっ！', 'もらったぁ！'], hit: ['まだまだっ！', 'ふん、効かないね！', 'やるじゃない…！', 'ぐっ…やってくれるね！', 'くっ…！ まだいける！', 'はっ…この程度！'], defeat: ['くっ…ここまでか…！', 'あーもう、覚えてなさい！', '次は負けないからね！', 'ぐっ…不覚…！', 'くっ…悔しい！', 'うっ…あとは頼んだよ！'] } },
  慎重: { desc: '慎重', pitch: 1.1, rate: 1.0, speed: 0.9, atkCd: [1.2, 2.0], hideT: [3.5, 6.0], aimErr: 0.022, aimT: 1.1, keep: [20, 32], retreat: false, cautious: true,
    lines: { spot: ['…敵、発見。', '慎重に、いきましょう。', 'しっ…気づかれないように。'], attack: ['…今っ！', 'そこ、ですね。', '狙って…はいっ！'], hit: ['くっ…油断しました。', 'しまった…！', '…悔しい、当てられました。', 'うっ…！ 下がります。', 'はっ…危なかった。', 'くっ…位置がばれましたか。'], defeat: ['…無念です。', '読み違えましたね…', '慎重すぎた、かしら…', 'くっ…不覚…！', 'あとは、頼みます…', 'うっ…戦死判定、ですね。'] } },
  臆病: { desc: '臆病', pitch: 1.55, rate: 1.25, speed: 1.0, atkCd: [1.3, 2.2], hideT: [2.0, 3.5], aimErr: 0.06, aimT: 1.0, keep: [24, 34], retreat: true,
    lines: { spot: ['ひっ、き、来た…！', 'こ、怖くなんかないもん！', 'え、えっと…敵です！'], attack: ['え、えいっ…！', '当たって…！ お願い！', 'やぁっ…！'], hit: ['わわっ！', 'む、無理〜！', 'いったん、下がりますっ！', 'きゃっ！', 'ひっ…！ こ、来ないで！', 'いやっ！ なんで私ばっかり！'], defeat: ['やられた〜！', 'もう、だめ〜…', 'うう、負けちゃった…', 'きゃあっ！ やられちゃった…', 'すみません、脱落です！', 'ひっ…！ ここまでです…'] } },
  冷静: { desc: '冷静', pitch: 0.95, rate: 0.95, speed: 1.0, atkCd: [1.0, 1.5], hideT: [1.5, 2.5], aimErr: 0.008, aimT: 1.2, keep: [18, 28], retreat: false,
    lines: { spot: ['目標、確認。', '捕捉しました。', '…見えています。'], attack: ['射ます。', '狙い通りです。', 'そこです。'], hit: ['…被弾。問題ありません。', 'なるほど、やりますね。', '想定内です。', 'っ…かすっただけです。', 'はっ…いい腕ですね。', 'うっ…！ 修正します。'], defeat: ['…戦死判定、了解です。', '完敗ですね。', '見事な腕前です。', '無念…ここまでですね。', 'くっ…計算違いでした。', 'あとは頼みます…'] } },
  陽気: { desc: '陽気', pitch: 1.4, rate: 1.15, speed: 1.1, atkCd: [0.9, 1.5], hideT: [1.0, 2.0], aimErr: 0.045, aimT: 0.8, keep: [14, 24], retreat: false,
    lines: { spot: ['みーつけたっ！', 'いっくよー！', 'あ、いたいた！ 勝負〜！'], attack: ['それっ！', 'くらえ〜っ！', 'えーいっ！'], hit: ['わっ、やったなー！', 'あはは、当たっちゃった！', 'もー、ずるい〜！', 'きゃっ！ やったなー！', 'うっ…！ 今のは効いた！', 'いやっ！ 当てられちゃった！'], defeat: ['やられた〜！', 'あちゃ〜、負けちゃった！', 'あー、楽しかった〜！', 'きゃあっ！ やられた〜！', '悔しい〜！ 次は勝つからね！', 'すみません、脱落です！'] } },
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
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z);
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
const isFoe = e => e.team === 'orange';
// 秘書・笛役（special）は人数に数えない
const aliveOf = team => enemies.filter(e => e.team === team && e.state !== 'down' && !e.special);
// team: 'orange'（敵・橙組） / 'blue'（味方・青組）
function spawnEnemy(x, z, kind, captain, team = 'orange', opt = {}) {
  const g = (opt.girl && GIRLS[opt.girl]) || pickGirl(kind);
  if (!g) return null;
  const spr = g.spr;                                    // 照準パネルの顔写真
  const prof = makeProfile(), n = wave.n;
  prof.glasses = false;
  if (opt.secretary) Object.assign(prof, { name: sec.name, pers: '冷静', cm: 160, vv: 1 });
  if (opt.fluter) Object.assign(prof, { name: fluter.name, pers: '陽気', cm: 156, vv: 2 });
  if (opt.sec2) Object.assign(prof, { name: sec2.name, pers: '陽気', cm: 158, vv: 2 });
  if (opt.medic) Object.assign(prof, { name: MEDIC_NAMES[team], pers: '冷静', cm: 160, vv: 1 });
  const P = PERS[prof.pers];
  if (captain) prof.name = '組頭 ' + prof.name;
  const figH = prof.cm / 100;
  const mat = spriteMat(g.front.tex), mats = [mat];
  const s = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.order = 'YXZ';
  const bb = new THREE.Mesh(spriteGeo, mat); tilt.add(bb); s.add(tilt);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.scale.set(0.75, 1, 0.6); shadow.position.y = 0.02; s.add(shadow);
  const baseY = opt.y || 0;
  s.position.set(x, baseY, z); s.rotation.y = team === 'orange' ? 0 : Math.PI; scene.add(s);
  const hpMax = opt.secretary ? 8 : opt.fluter || opt.medic ? 5 : opt.sec2 ? 6 : Math.max(2, Math.round((3 + Math.floor((n - 1) / 3)) * (captain ? 2.5 : 1)) - (kind === 'archer' ? 1 : 0));
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
  if (e.perch) { e.perch.taken = e; e.state = 'hide'; e.hideT = rand(0.5, 2); e.crouch = 1; }
  if (opt.secretary) { e.secretary = true; e.special = true; e.speed = 4.2; s.rotation.y = e.face = Math.PI; e.home = [x, z]; }
  if (opt.sec2) {   // 二人目の秘書：青組の腕章とほんのり青
    e.sec2 = true; e.special = true; e.speed = 4.0; s.rotation.y = e.face = Math.PI; e.home = [x, z]; e.state = 'idle';
    e.tintBase = [0, 0.015, 0.05]; npcGlow(e, 0, 0, 0);
    const band = new THREE.Mesh(armbandGeo, armbandMat.blue); e.band = band; tilt.add(band);
  }
  if (opt.medic) {   // 医療係：組の色の腕章と、ほんのり組の色
    e.medic = true; e.special = true; e.speed = 3.6; s.rotation.y = e.face = team === 'blue' ? Math.PI : 0; e.home = [x, z]; e.state = 'idle';
    e.tintBase = team === 'blue' ? [0, 0.015, 0.05] : [0.045, 0.022, 0]; npcGlow(e, 0, 0, 0);
    mk.scale.set(0.3, 0.3, 1);
    const band = new THREE.Mesh(armbandGeo, armbandMat[team]); e.band = band; tilt.add(band);
  }
  if (opt.fluter) {
    e.fluter = true; e.special = true; e.speed = 2.5; s.rotation.y = e.face = Math.PI; e.home = [x, z]; e.state = 'idle';
    if (!g.flute) {   // 笛を構えた写真が無いときは、正面写真の口元に横笛を添える
      const fl = makeFlute(); fl.position.set(-0.17 * figH * 0.6, figH * 0.885, 0.06); fl.rotation.z = 0.12; tilt.add(fl); e.fluteMesh = fl;
    }
  }
  enemies.push(e);
  return e;
}
// 弓道の間合い：胴造り（0.3s）→ 打起し・引分け（0.5s、少し上がって収まる）→ 会（性格で 0.6〜1.0s）→ 離れ → 残心（0.3s）
const KAI = { 冷静: 1.0, 慎重: 0.95, 臆病: 0.75, 陽気: 0.65, 好戦的: 0.6 };
const KY_SET = 0.3, KY_DRAW = 0.5, KY_ZAN = 0.3;
function aimTotal(e, close) { const k = close ? 0.6 : 1; e.aimK = k; return (KY_SET + KY_DRAW + (KAI[e.prof.pers] || 0.8) + (e.ph % 1) * 0.12) * k; }
// 射のあとの隠れる時間は、間合いで長くなった分だけ短くして射る間隔を以前とほぼ同じに
const zanHide = (e, h, T) => Math.max(0.25, h - (T + KY_ZAN - e.P.aimT));
const ARCHER_RATE = 0.7;   // 両軍とも弓兵が約7割
// 青組（味方）を一人出す。平原：プレイヤーの後方。櫃の戦い：弓兵は櫃・武者走りの射撃位置、近接兵は門の内側
function spawnAlly() {
  const kind = Math.random() < ARCHER_RATE ? 'archer' : 'mob';
  if (builtStage === 'fort') {
    if (kind === 'archer') {
      const free = perches.filter(q => !q.taken);
      if (free.length) {
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
// ---- 倒れた娘：横たわった写真（down）を地面に沿った低いビルボードで。上から見ると地面の写真へ切り替わる ----
const lieShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
function startLying(e) {
  const fr = e.girl.down;
  // 体の向き（足→頭＝fallYaw）に e.s を回し、刺さった矢を胴のあたりに残す
  e.s.rotation.y = e.fallYaw; e.tilt.rotation.y = 0; e.s.updateMatrixWorld(true);
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
  e.shadow.material = lieShadowMat; e.shadow.visible = true; e.shadow.position.set(0, 0.015, e.figH * 0.5); e.shadow.scale.set(0.6, 1, e.figH * 1.1);
}
function stopLying(e) {   // 手当てで起き上がるとき
  if (!e.lying) return;
  e.lying = null;
  if (e.decal) { e.s.remove(e.decal); e.decal = null; }
  e.mat.transparent = false; e.mat.opacity = 1; e.mat.alphaTest = 0.42; e.mat.needsUpdate = true;
  e.tilt.position.set(0, 0, 0); e.tilt.rotation.set(Math.PI / 2, 0, 0);
  e.shadow.material = shadowMat; e.shadow.position.set(0, 0.02, 0);
  setFrame(e, girlFrame(e.girl, 'side'), false);
}
function updateBodies(dt) {
  for (const b of bodies) {
    const ly = b.lying; if (!ly) continue;
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
  if (sec2.dead || (!sec2.e && hq)) { const was = sec2.dead; spawnSec2(); if (n > 1 && was) popup('秘書課の侍女（二人目）が本陣に戻りました'); }
  for (const t of ['blue', 'orange']) if (medics[t].dead || !medics[t].e) { const was = medics[t].dead; spawnMedic(t); if (n > 1 && was && t === 'blue') popup('医療係が本陣に戻りました'); }
  if (fluter.dead || (!fluter.e && hq)) { spawnFluter(); if (n > 1 && fluter.dead) popup('笛役の娘が本陣に戻りました'); fluter.dead = false; }
  wave.n = n; wave.toSpawn = 5 + n * 3; wave.spawnT = 1.5; wave.inter = 0;
  wave.blueToSpawn = wave.toSpawn;              // 味方も同数
  wave.maxAlive = Math.min(8 + n * 2, 28); wave.captain = n >= 2;
  wave.archerRate = ARCHER_RATE;
  showBanner(`第${waveName(n)}波`, n === 1 ? '模擬戦、開始！ 青組の味方と共に戦え' : '新手の橙組が迫る！ 青組の援軍が到着');
  Sfx.fluteCall();
  setTimeout(() => { if (state === 'play' && !VoicePack.extra('command', 0)) Voice.say('かかれーっ！', { pitch: 1.3, rate: 1.1 }, 1); }, 600);
}
function waveUpdate(dt) {
  if (wave.inter > 0) { wave.inter -= dt; if (wave.inter <= 0) startWave(wave.n + 1); return; }
  wave.spawnT -= dt;
  const foes = enemies.filter(isFoe).length;
  if (wave.toSpawn > 0 && wave.spawnT <= 0 && foes < wave.maxAlive) {
    let cx, cz;
    if (builtStage === 'fort') { cx = rand(-30, 30); cz = rand(-80, -62); }   // 門の外、竹束の列の向こうから
    else {
      const front = Math.random() < 0.7;
      const a = front ? -Math.PI / 2 + rand(-1.2, 1.2) : rand(0, Math.PI * 2);
      const r = rand(42, 58);
      cx = clamp(player.pos.x + Math.cos(a) * r, -CFG.field + 5, CFG.field - 5);
      cz = clamp(player.pos.z + Math.sin(a) * r, -CFG.field + 5, CFG.field - 5);
    }
    const grp = Math.min(wave.toSpawn, 1 + ((Math.random() * Math.min(4, 1 + wave.n)) | 0));
    for (let i = 0; i < grp; i++) {
      const cap = wave.captain && wave.toSpawn === 1;
      spawnEnemy(cx + rand(-3, 3), cz + rand(-3, 3), Math.random() < wave.archerRate ? 'archer' : 'mob', cap, 'orange');
      wave.toSpawn--;
      if (cap) wave.captain = false;
    }
    wave.blueOwed = (wave.blueOwed || 0) + grp;   // 同じ人数の味方を出す
    wave.spawnT = rand(0.8, 2.0);
  }
  if (wave.blueOwed > 0 && wave.blueToSpawn > 0 && aliveOf('blue').length < wave.maxAlive) {
    const k = Math.min(wave.blueOwed, wave.blueToSpawn);
    for (let i = 0; i < k; i++) spawnAlly();
    wave.blueOwed -= k; wave.blueToSpawn -= k;
  }
  if (wave.toSpawn <= 0 && foes === 0) {
    wave.inter = 5;
    showBanner(`第${waveName(wave.n)}波 制圧！`, '矢と体力が少し回復した');
    Sfx.fanfare();
    player.arrows = Math.min(arrowsMax(), player.arrows + 10);
    player.hp = Math.min(CFG.maxHp, player.hp + 20);
  }
}

// ---- 命中・戦死判定 ----
// by: 'player' | 攻撃した NPC。hit: { u, y, arrow, thrust }
function damageEnemy(e, dmg, from, crit, hit, by = 'player') {
  if (e.state === 'down') return;
  const byPlayer = by === 'player';
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
  else Sfx.impactBody(hitPos);
  if (by !== 'player' && by.state !== 'down') { e.tgt = by; e.tgtT = 2; }   // 撃ってきた相手に向き直る
  if (e.perch && e.perch.tower && e.team === 'blue') { const t = e.perch.x < 0 ? towers.west : towers.east; t.press += 1.5; }
  if (e.hp <= 0) { killEnemy(e, byPlayer, from); return; }
  npcSay(e, 'hit', 0, byPlayer ? 0.5 : 0.25);
  if (e.P.retreat && !e.perch && !e.retreated && e.hp / e.hpMax <= 0.5) { e.retreated = true; e.state = 'retreat'; e.t = 0; e.retreatT = rand(3, 4.5); }
}
// 戦死判定：倒れるアニメを一度だけ再生し、その姿勢のまま地面に残る（以後は動かない・しゃべらない）
function killEnemy(e, byPlayer, from) {
  e.state = 'down'; e.t = 0;
  e.knock.set(0, 0, 0);
  if (from) e.face = Math.atan2(from.x - e.s.position.x, from.z - e.s.position.z);   // 攻撃側を向いてから倒れる
  if (e.perch) { e.perch.taken = null; }
  if (e.secretary) { sec.mode = 'dead'; sec.esc = null; sec.e = null; e.secretary = false; e.wasSecretary = true; if (menuOpen) closeSecMenu(false); popup('秘書課の侍女に戦死判定…次の波で本陣に戻ります'); }
  e.downAt = time;
  if (e.sec2) { sec2.dead = true; sec2.e = null; sec2.mode = 'dead'; e.sec2 = false; e.wasSec2 = true; e.kneel = false; if (menuOpen && menuWho === 'sec2') closeSecMenu(false); popup('秘書課の侍女（二人目）に戦死判定…次の波で本陣に戻ります'); }
  if (e.medBy) { const m = e.medBy; e.medBy = null; if (m.patient === e) endTreat(m); }
  if (e.medic) { medics[e.team].dead = true; medics[e.team].e = null; endTreat(e); e.kneel = false; if (e.band) e.band.visible = false; popup(e.team === 'blue' ? '医療係に戦死判定…（次の波で本陣に戻ります）' : '橙組の医療係に戦死判定'); }
  if (e.fluter) { fluter.dead = true; fluter.e = null; popup('笛役の娘に戦死判定…笛が止んだ（次の波で戻ります）'); }
  // 倒れる向き：攻撃してきた側から離れる方向
  const fx = from ? e.s.position.x - from.x : Math.sin(e.s.rotation.y), fz = from ? e.s.position.z - from.z : Math.cos(e.s.rotation.y);
  e.fallYaw = Math.atan2(fx, fz) + rand(-0.35, 0.35);
  e.bg.visible = e.fg.visible = e.mk.visible = false;
  e.fallT = rand(0.5, 0.62);
  if (byPlayer) {
    if (e.team === 'orange') player.kills++;
    else { player.allyKills++; popup('味方撃破…！'); }
  }
  npcSay(e, 'defeat', 2);                // 最後の台詞（これ以降は一切しゃべらない）
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
  if (e.girl.down) startLying(e);
  bodies.push(e);
  while (bodies.length > CFG.maxBodies) disposeNpc(bodies.shift());
}

// ---- 標的選び：最も近い敵対者（橙組→プレイヤーか青組、青組→橙組） ----
const PLAYER_T = { isPlayer: true };
function tgtPos(t) { return t.isPlayer ? player.pos : t.s.position; }
const tgtY = t => t.isPlayer ? player.pos.y : t.baseY;
// 近接兵は高所（櫃・武者走り）の相手には届かないので、地上の相手を優先する
function chooseTarget(e) {
  const p = e.s.position, melee = e.kind === 'mob';
  let best = null, bd = 1e9;
  const consider = (t, x, z, y) => {
    let d = Math.hypot(x - p.x, z - p.z);
    if (t.medic) d *= t.medPhase === 'treat' ? 0.55 : 0.85;   // 医療係は狙われやすい（手当て中は止まっている）
    if (melee && Math.abs(y - e.baseY) > 1.5) d += 80;
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
  const dx = c.x - tx, dz = c.z - tz, d = Math.hypot(dx, dz) || 1;
  return { x: c.x + dx / d * (c.r + 0.8), z: c.z + dz / d * (c.r + 0.8), px: -dz / d, pz: dx / d };
}
function steer(e, tx, tz, sp, dt) {
  if (e.perch) return 0;
  const p = e.s.position;
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
  sec.esc = sec.e; sec.e.returning = false; sec.mode = 'escort';
  sec.e.state = 'advance'; sec.e.t = 0;
  secReply('sec_follow');
  closeSecMenu(false);
}
function sendBack() {
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
  const e = spawnEnemy(hq.sx - 4, hq.sz + 0.5, 'mob', false, 'blue', { fluter: true, girl: FLUTE_ID });
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
  const e = spawnEnemy(hq.sx - 2.2, hq.sz - 2.4, 'mob', false, 'blue', { sec2: true, girl: SEC2_ID });
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
  if (sec2.mode === 'carry') {   // 荷物持ち：プレイヤーの左斜め後ろ
    const fx = player.pos.x + Math.sin(player.yaw) * 2.0 - Math.cos(player.yaw) * 1.4, fz = player.pos.z + Math.cos(player.yaw) * 2.0 + Math.sin(player.yaw) * 1.4;
    const d = Math.hypot(fx - p.x, fz - p.z);
    if (d > 0.8) { steer(e, fx, fz, d > 6 ? e.speed * 1.4 : e.speed, dt); e.faceWant = Math.atan2(fx - p.x, fz - p.z); }
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
    sec2.mode = 'carry'; sec2.refT = 0; secReply('sec2_carry'); popup('荷物持ち：そばにいる間 矢の上限+10・少しずつ補充'); closeSecMenu(false);
  },
  home() {
    if (sec2.mode !== 'carry') { secReply('sec2_already_hq', 0); return; }
    sec2.mode = 'returning'; secReply('sec2_return', 0); closeSecMenu(false);
  },
};
function updateSec2(dt) {
  if (player.speedT > 0) player.speedT -= dt;
  if (carrying() && player.arrows < arrowsMax()) { sec2.refT += dt; if (sec2.refT >= 2.5) { sec2.refT = 0; player.arrows++; } }
}
// ---- 医療係（両軍の本陣に一人ずつ。非戦闘員だが戦死判定は受ける）：倒れた味方へ駆け寄り、膝をついて手当て ----
// 手当ては膝をつく姿・白い布・声だけ（傷などの表現は一切なし）。倒れて間もない娘ほど復帰しやすい
const medics = { blue: { e: null, dead: false }, orange: { e: null, dead: false } };
const medPost = { blue: null, orange: null };
const MED_R = 60;          // 医療係が出向く範囲（持ち場から）
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
function spawnMedic(team) {
  removeMedic(team);
  const hp = medPost[team]; if (!hp || !GIRLS[MEDIC_ID]) return;
  const e = spawnEnemy(hp[0], hp[1], 'mob', false, team, { medic: true, girl: MEDIC_ID });
  medics[team].e = e; medics[team].dead = false;
}
function removeMedic(team) {
  const e = medics[team].e; medics[team].e = null;
  if (e) { endTreat(e); const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeNpc(e); }
}
function medSay(e, key, quiet) {
  const d = Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z) + (quiet ? 6 : 0);
  if (d > 45) return;
  const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra['med_' + key];
  if (!L || !L.length) return;
  const j = (Math.random() * L.length) | 0;
  if (!VoicePack.play(L[j].files[0], d, 1)) Voice.say(L[j].text, { pitch: 0.95, rate: 0.9 }, 1);
}
const bodyMid = b => [b.s.position.x + Math.sin(b.fallYaw || 0) * b.figH * 0.45, b.s.position.z + Math.cos(b.fallYaw || 0) * b.figH * 0.45];
function findPatient(e) {
  const hp = e.home, p = e.s.position; let best = null, bd = 1e9;
  for (const b of bodies) {
    if (b.team !== e.team || b.special || b.medDone || b.medBy || time - (b.downAt || 0) > 90) continue;
    const [bx, bz] = bodyMid(b);
    if (Math.hypot(bx - hp[0], bz - hp[1]) > MED_R || Math.abs(b.baseY - e.baseY) > 0.5) continue;
    const d = Math.hypot(bx - p.x, bz - p.z); if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function endTreat(e) {
  if (e.cloth) { scene.remove(e.cloth); e.cloth = null; }
  if (e.patient && e.patient.medBy === e) e.patient.medBy = null;
  e.patient = null; e.kneel = false; e.medPhase = null;
}
function revivePatient(b) {
  const i = bodies.indexOf(b); if (i < 0) return;
  bodies.splice(i, 1);
  stopLying(b);
  for (const a of b.stuck) a.parent && a.parent.remove(a);
  b.stuck = [];
  b.hp = Math.max(1, Math.ceil(b.hpMax * 0.4));
  b.state = 'rise'; b.t = 0; b.fallInit = false; b.thud = false; b.tgt = null; b.cover = null; b.perch = null; b.spotted = false; b.medBy = null; b.medDone = true; b.flash = 0;
  b.knock.set(0, 0, 0); b.shadow.visible = true; b.mk.visible = true;
  scene.add(b.bg); scene.add(b.fg); scene.add(b.mk);
  enemies.push(b);
  if (b.team === 'blue') popup('味方が手当てを受けて復帰！'); else popup('橙組の娘が手当てを受けて復帰…');
}
function medicBrain(e, dt) {
  const p = e.s.position; e.t += dt; e.tgt = null; e.state = 'idle'; e.cd -= dt;
  let pt = e.patient;
  if (pt && (!bodies.includes(pt) || (pt.medDone && e.medPhase !== 'treat'))) { endTreat(e); pt = null; }
  if (!pt) {
    e.kneel = false;
    if ((e.scanT = (e.scanT || 0) - dt) <= 0) {
      e.scanT = 0.6;
      pt = findPatient(e);
      if (pt) { e.patient = pt; pt.medBy = e; e.medPhase = 'go'; e.medT = 0; if (Math.random() < 0.5) medSay(e, 'go'); }
    }
  }
  if (!pt) {   // 持ち場へ戻る／待つ
    const [hx, hz] = e.home, d = Math.hypot(hx - p.x, hz - p.z);
    if (d > 0.5) { steer(e, hx, hz, e.speed * (d > 6 ? 0.9 : 0.5), dt); e.faceWant = Math.atan2(hx - p.x, hz - p.z); }
    else e.faceWant = e.team === 'blue' ? Math.PI : 0;
    return;
  }
  const [bx, bz] = bodyMid(pt);
  // 体の横（倒れた向きの右側）に膝をつく
  const sx = bx + Math.cos(pt.fallYaw) * 0.62, sz = bz - Math.sin(pt.fallYaw) * 0.62;
  if (e.medPhase === 'go') {
    const d = Math.hypot(sx - p.x, sz - p.z);
    if (d > 0.3) { steer(e, sx, sz, e.speed, dt); e.faceWant = Math.atan2(sx - p.x, sz - p.z); }
    else {
      e.medPhase = 'treat'; e.medT = 0; e.medStep = 0;
      e.medWill = Math.random() < (time - pt.downAt < 35 ? 0.45 : 0.1);   // 倒れて間もないほど助かりやすい
      e.cloth = new THREE.Sprite(clothMat); e.cloth.scale.set(0.26, 0.19, 1); scene.add(e.cloth);
    }
    return;
  }
  // 手当て
  e.medT += dt; e.kneel = true; e.faceWant = Math.atan2(bx - p.x, bz - p.z);
  if (e.cloth) e.cloth.position.set(bx + Math.sin(time * 3) * 0.05, pt.baseY + 0.16 + Math.abs(Math.sin(time * 4.2)) * 0.05, bz);
  const T = e.medT;
  if (e.medStep === 0) { e.medStep = 1; medSay(e, pt.stuck.length ? 'arrow' : 'start'); }
  if (e.medStep === 1 && T > 1.6) {
    e.medStep = 2;
    if (pt.stuck.length) { for (const a of pt.stuck) a.parent && a.parent.remove(a); pt.stuck = []; Sfx.whoosh && Sfx.whoosh(new V3(bx, pt.baseY + 0.3, bz), 3); }
  }
  if (e.medStep === 2 && T > 2.4) { e.medStep = 3; if (Math.random() < 0.6) medSay(e, 'care'); }
  if (e.medStep === 3 && T > 4.2) {
    e.medStep = 4; pt.medDone = true;
    if (e.medWill) { medSay(e, 'ok'); revivePatient(pt); }
    else medSay(e, 'lost', true);
  }
  if (e.medStep === 4 && T > 5.2) endTreat(e);
}
// 収録音声を順につなげて再生（足りなければ Web Speech で全文）
let subTimer = 0;
function subtitle(text) {   // 秘書の返事（メニューを閉じても字幕で見える）
  const el = $('subtitle'); if (!el) return;
  el.textContent = text ? `「${text}」` : ''; el.style.opacity = text ? 1 : 0;
  clearTimeout(subTimer); subTimer = setTimeout(() => { el.style.opacity = 0; }, 2500 + text.length * 120);
}
function secSay(parts, text) {
  subtitle(text);
  if (VoicePack.ok) {
    const L = VoicePack.man && VoicePack.man._extra, fns = [];
    for (const [cat, i] of parts) { const e = L && L[cat] && L[cat][i]; if (!e) { fns.length = 0; break; } fns.push(e.files[0]); }
    if (fns.length && fns.every(f => VoicePack.buf[f])) {
      const c = Sfx.ctx; let t = c.currentTime + 0.02;
      for (const f of fns) { const src = c.createBufferSource(), g = c.createGain(); src.buffer = VoicePack.buf[f]; g.gain.value = 1.1; src.connect(g); g.connect(VoicePack.out); src.start(t); t += VoicePack.buf[f].duration - 0.05; }
      return;
    }
    fns.forEach(f => VoicePack.load(f));
  }
  Voice.say(text, { pitch: 1.05, rate: 0.95 }, 1);
}
const secLine = (cat, i) => { const L = VoicePack.man && VoicePack.man._extra && VoicePack.man._extra[cat]; return L ? L[i].text : ''; };
function secCat(cat) {   // 二人目の秘書と話しているときは sec2_ の台詞（あれば）
  const X = VoicePack.man && VoicePack.man._extra;
  if (menuWho === 'sec2' && cat.startsWith('sec_')) { const c2 = 'sec2_' + cat.slice(4); if (!X || X[c2]) return c2; }
  return cat;
}
function secReply(cat, i = null) {
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
    const text = `ご報告いたします。味方は${a}名、敵は${e}名。ただいま、第${w}波です。`;
    $('secsay').textContent = `「${text}」`;
    const s2 = menuWho === 'sec2' ? 'sec2_' : '';
    secSay([[s2 ? 'sec2_report' : 'sec_report', 0], [s2 + 'num_ally', a], [s2 + 'num_enemy', e], [s2 + 'num_wave', w - 1]], text);
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
        const d = makeDish(k); d.position.set(hq.sx + 1.8, 0.748, hq.sz - 0.12); scene.add(d); sec.dish = d; sec.dish.userData.kind = k;
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
  $('secClose').style.display = id ? 'none' : 'block';
}
function openSecMenu() {
  if (menuOpen || state !== 'play') return;
  menuOpen = true; player.drawing = false; player.charge = 0;
  menuWho = talkWho || 'sec';
  $('secName').textContent = menuWho === 'sec2' ? sec2.name : sec.name;
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
  updateSec2(dt);
  // 話しかけられる相手：そばにいる秘書（二人いれば近いほう）
  let best = null, bd = 3;
  for (const [who, se] of [['sec', sec.e], ['sec2', sec2.e]]) {
    if (!se || se.state === 'down' || se.polishT > 0 || Math.abs(player.pos.y - se.baseY) > 0.8) continue;
    const d = Math.hypot(player.pos.x - se.s.position.x, player.pos.z - se.s.position.z);
    if (d < bd) { bd = d; best = who; }
  }
  if (!menuOpen) talkWho = best;
  sec.near = !!best;
  $('talk').style.opacity = sec.near && !menuOpen ? 1 : 0;
  document.documentElement.classList.toggle('cantalk', sec.near && !menuOpen);
  if (menuOpen) {
    const se = menuWho === 'sec2' ? sec2.e : sec.e;
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
    const ph = Math.floor((e.stepT += dt * sv * 1.5) / Math.PI);
    if (ph !== e.stepPh) {
      e.stepPh = ph;
      if (stepBudget > 0) { const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < 16) { stepBudget--; Sfx.step(e.baseY > 0.3, sv > 3.1 ? 0.9 : 0.6, p); } }
    }
  }
  const kneelFr = e.kneel && e.girl.kneel;
  e.crouch += (((covered && sv < 0.5) || (e.kneel && !kneelFr) ? 1 : 0) - e.crouch) * Math.min(1, dt * 5);
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
  let fr, mirror = false, bob = 0, rock = 0;
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
  if (e.band) e.band.visible = !(fr === g.kneel && !e.medic);
  if (e.band) {   // 腕章：正面・後ろの写真では左の二の腕、横・膝つきでは手前の腕のあたり
    const h = e.figH, sg = mirror ? -1 : 1, front = fr === g.front || fr === g.back || fr === g.walk;
    e.band.scale.set(front ? 0.075 : 0.085, 0.05, 1);
    e.band.position.set(front ? (fr === g.back ? 0.115 : -0.115) * h : (fr === g.kneel ? 0.135 : 0.01) * h * sg, (fr === g.kneel ? 0.44 : 0.73) * h, 0.03);
  }
  // ビルボード（Y 軸のみ）：板をカメラへ向ける
  e.tilt.rotation.set(0, camYaw - f, lean * 0.5 + rock);
  e.tilt.position.y = bob - e.crouch * 0.42 * e.figH;          // 物陰ではしゃがむ（体が沈む）
}
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
      e.shadow.scale.set(0.75 + (1 - q) * 0.4, 1, 0.6 + (1 - q) * 0.9 * e.figH);
      if (k >= 1) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.t = 0; e.cd = 1; e.tilt.rotation.x = 0; e.shadow.scale.set(0.75, 1, 0.6); }
      continue;
    }
    if (e.state === 'down') {
      // 戦死判定：横向きの写真が倒れる方向へ伏せる（一度きり）。伏せたらそのまま静止して残る
      e.t += dt;
      p.y = e.baseY;
      if (!e.fallInit) {
        e.fallInit = true;
        const fr = girlFrame(e.girl, 'side');
        setFrame(e, fr, Math.random() < 0.5);
        e.tilt.rotation.set(0, e.fallYaw - e.s.rotation.y, 0);
        e.tilt.position.y = 0; e.tilt.updateMatrixWorld(true);
        for (const a of e.stuck) e.tilt.attach(a);
        if (e.fluteMesh) e.fluteMesh.visible = false;
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
    e.passive = (e.secretary && sec.mode === 'hq') || e.fluter || e.medic || !!e.hold;   // hold: テスト用に止める
    if (e.sec2 && !e.hold) { e.passive = true; sec2Brain(e, dt); }
    else if (e.medic && !e.hold) medicBrain(e, dt);
    else if (e.passive) {
      const [hx, hz] = e.hold ? [p.x, p.z] : e.home || [p.x, p.z];
      e.cd -= dt; e.t += dt;
      if (Math.hypot(hx - p.x, hz - p.z) > 0.4) steer(e, hx, hz, e.speed * 0.7, dt);
      e.tgt = null; if (!e.hold) e.state = 'idle';
      const dpx = player.pos.x - p.x, dpz = player.pos.z - p.z;
      e.faceWant = e.hold ? e.hold.face : e.secretary && Math.hypot(dpx, dpz) < 8 ? Math.atan2(dpx, dpz) : Math.PI;
    } else {
    // 標的の更新
    e.tgtT -= dt;
    if (e.returning) { e.tgt = null; e.tgtT = 1; }
    else if (!e.tgt || e.tgtT <= 0 || (!e.tgt.isPlayer && e.tgt.state === 'down')) {
      const nt = chooseTarget(e);
      if (nt !== e.tgt && e.kind === 'archer' && !['aim', 'zanshin', 'retreat', 'stagger'].includes(e.state)) { e.cover = null; if (e.state !== 'advance') { e.state = 'advance'; e.t = 0; } }
      e.tgt = nt; e.tgtT = 0.6;
    }
    e.cd -= dt; e.t += dt; e.moving = false;
    const tint = k => npcTint(e, k);

    if (!e.tgt) {
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
          if (e.hideT <= 0 && dist < 80) { e.state = 'aim'; e.t = 0; }
        }
      } else if (e.secretary && e.state !== 'aim' && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) > 12) {
        steer(e, player.pos.x, player.pos.z, e.speed * 1.3, dt); e.state = 'advance'; e.cover = null;   // 離れすぎたら戻る
      } else if (e.kind === 'archer') {
        // ===== 弓兵 =====
        if (dist < 6 && !['backoff', 'aim', 'zanshin'].includes(e.state) && P !== PERS.好戦的) { e.state = 'backoff'; e.t = 0; }
        if (e.state === 'advance') {
          if (!e.cover || e.t > 8) {
            e.t = 0;
            const kf = e.team === 'blue' && allyStance === 'def' ? 1.4 : 1;   // 守勢：距離を取る
            e.cover = findCover(e, P.keep[0] * kf, P.keep[1] * kf, tx, tz) || { x: tx - nx * rand(P.keep[0], P.keep[1]) * kf, z: tz - nz * rand(P.keep[0], P.keep[1]) * kf, r: 0, open: true };
            if (e.secretary && e.cover.open) e.cover = { x: player.pos.x + rand(-2, 2), z: player.pos.z + rand(1, 3), r: 0, open: true };
          }
          e.cp = e.cover.open ? { x: e.cover.x, z: e.cover.z, px: -nz, pz: nx } : coverPoint(e.cover, tx, tz);
          if (steer(e, e.cp.x, e.cp.z, e.speed, dt) < 0.6) {
            e.state = 'hide'; e.t = 0; e.hideT = rand(P.hideT[0], P.hideT[1]) * (e.cover.open ? 0.4 : 1);
          }
        } else if (e.state === 'hide') {
          e.hideT -= dt;
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
          steer(e, p.x - nx * 10 + e.strafe * nz * 4, p.z - nz * 10 - e.strafe * nx * 4, e.speed * 1.1, dt);
          if (e.t > 1.6) { e.state = dist < 8 ? 'aim' : 'advance'; e.t = 0; e.cover = null; }
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
          if (e.state === 'approach' && routed) steer(e, rt[0], rt[1], e.speed, dt);
          else if (e.state === 'approach' && elev) { if (dist > 4) steer(e, tx, tz, e.speed, dt); }
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
    if (!e.perch) for (const o of enemies) {
      if (o === e || o.state === 'down' || Math.abs(o.baseY - e.baseY) > 1) continue;
      const ox = p.x - o.s.position.x, oz = p.z - o.s.position.z, d2 = ox * ox + oz * oz;
      if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += ox / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); p.z += oz / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); }
    }
    const pdx = player.pos.x - p.x, pdz = player.pos.z - p.z, pd = Math.hypot(pdx, pdz);
    if (!e.perch && pd < 0.9 && pd > 1e-4 && Math.abs(player.pos.y - e.baseY) < 1) { p.x -= pdx / pd * (0.9 - pd); p.z -= pdz / pd * (0.9 - pd); }
    p.x = clamp(p.x, -CFG.field, CFG.field); p.z = clamp(p.z, -CFG.field, CFG.field);
    if (!e.perch && boxes.length) pushOutBoxes(p, 0.3, e.baseY + 0.1, e.baseY + 1.6);
    p.y = e.baseY;
    animateNpc(e, dt, lean);
    const top = e.baseY + e.figH * (1 - 0.38 * e.crouch);
    e.mk.position.set(p.x, top + (e.hp < e.hpMax ? 0.5 : 0.32), p.z);
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
    // 近くをかすめる矢の音（自分の矢以外。1本につき1回）
    if (a.team !== 'player' && !a.wh && a.life > 0.1) {
      const hx = player.pos.x, hy = player.pos.y + 1.5, hz = player.pos.z, syy = p1.y - p0.y;
      const t = clamp(((hx - p0.x) * sx + (hy - p0.y) * syy + (hz - p0.z) * sz) / (sl + syy * syy), 0, 1);
      const d = Math.hypot(p0.x + sx * t - hx, p0.y + syy * t - hy, p0.z + sz * t - hz);
      if (d < 3.2) { a.wh = true; Sfx.whoosh(p1, d); }
    }
    // プレイヤーへの当たり判定（橙組の矢のみ）
    if (a.team === 'orange') {
      const t = clamp(((player.pos.x - p0.x) * sx + (player.pos.z - p0.z) * sz) / sl, 0, 1);
      const d = Math.hypot(p0.x + sx * t - player.pos.x, p0.z + sz * t - player.pos.z);
      const y = p0.y + (p1.y - p0.y) * t - player.pos.y;
      if (d < 0.45 && y > 0 && y < 1.85 && t < best) {
        hurtPlayer(a.dmg); popup('被弾！');
        scene.remove(a.m); arrows.splice(i, 1); continue;
      }
    }
    if (hit) {
      const e = hit.e, info = { pt: hit.pt, dir: a.vel.clone(), arrow: true };
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
    const tm = t.team === 'blue' ? '<u style="color:#7cc0ff">青組（味方）</u>' : '<u style="color:#ffa040">橙組</u>';
    const pic = portraitOf(t.spr);
    const html = (pic ? `<img src="${pic}" alt="">` : '') + `${tm}<b>${t.prof.name}</b><span>${t.P.desc}・${t.medic ? '医療係' : t.fluter ? '笛役' : t.secretary || t.wasSecretary || t.sec2 || t.wasSec2 ? '秘書課' : t.kind === 'archer' ? '弓兵' : '近接兵'}　${t.prof.cm}cm</span>` +
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
  if (e.code === 'KeyE') { if (menuOpen) closeSecMenu(); else if (sec.near) openSecMenu(); }
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
  removeSec2(); sec2.dead = false; sec2.mode = 'hq'; player.speedT = 0; menuWho = 'sec'; talkWho = null;
  for (const t of ['blue', 'orange']) { removeMedic(t); medics[t].dead = false; }
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
  if (builtStage === 'fort') player.pos.set(-12, 6, 8.6);   // 左の櫃の上から
  else player.pos.set(0, 0, 0);
  wave = { n: 0, toSpawn: 0, spawnT: 0, inter: 0, maxAlive: 8 };
}
function startGame() {
  Sfx.init(); if (Voice.ok) { Voice.pick(); speechSynthesis.cancel(); }
  loadStage(stageName);
  resetGame();
  spawnSecretary(); spawnSec2(); spawnMedic('blue'); spawnMedic('orange');
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

function updatePlayer(dt) {
  // 移動
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW) { mx += fx; mz += fz; } if (keys.KeyS) { mx -= fx; mz -= fz; }
  if (keys.KeyA) { mx += fz; mz -= fx; } if (keys.KeyD) { mx -= fz; mz += fx; }
  if (touch.jx || touch.jy) { const jf = -touch.jy, jr = touch.jx; mx += fx * jf - fz * jr; mz += fz * jf + fx * jr; }   // 仮想スティック
  const ml = Math.hypot(mx, mz), mag = Math.min(1, ml);
  let sp = ((keys.ShiftLeft || keys.ShiftRight || touch.run) && !player.drawing ? CFG.run : CFG.walk) * (player.speedT > 0 ? 1.2 : 1);   // 靴を磨いてもらうと少し速い
  if (player.drawing) sp *= 0.5;
  // 梯子：前進で上る・後退で下りる（途中は横移動しない）
  const fin = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - touch.jy;
  const lad = ladderAt(player.pos.x, player.pos.z, player.pos.y);
  const midLadder = lad && player.pos.y > lad.y0 + 0.08 && player.pos.y < lad.y1 - 0.45;
  player.climbing = !!lad && (Math.abs(fin) > 0.2 || midLadder);
  if (ml > 0 && !(player.climbing && midLadder)) {
    const hk = player.climbing && fin < 0 && player.pos.y > lad.y0 + 0.08 ? 0.2 : 1;
    player.pos.x += mx / ml * sp * mag * dt * hk; player.pos.z += mz / ml * sp * mag * dt * hk;
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
    if (keys.Space && player.onGround) { player.vy = 5.2; player.onGround = false; }
    player.vy -= 14 * dt; player.pos.y += player.vy * dt;
  }
  player.pos.x = clamp(player.pos.x, -CFG.field, CFG.field); player.pos.z = clamp(player.pos.z, -CFG.field, CFG.field);
  for (const c of colliders) {
    if (player.pos.y > 2) continue;
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.35;
    if (d < r && d > 1e-4) { player.pos.x = c.x + dx / d * r; player.pos.z = c.z + dz / d * r; }
  }
  if (boxes.length) pushOutBoxes(player.pos, 0.35, player.pos.y + 0.15, player.pos.y + 1.75);
  const gh = floorUnder(player.pos.x, player.pos.z, player.pos.y);
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
  camera.position.set(player.pos.x, player.pos.y + CFG.eyeH + (player.onGround ? Math.abs(Math.sin(player.bob)) * 0.05 : 0), player.pos.z);
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
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') {
    time += dt;
    if (TEST) testBot(dt);
    stepBudget = 3;
    updatePlayer(dt); updateHQ(dt); waveUpdate(dt); updateEnemies(dt); updateBodies(dt); updateArrows(dt); updatePickups(dt); updateHud(dt);
  } else if (state === 'title') {
    time += dt;
    if (builtStage === 'fort') {
      camera.position.set(Math.sin(time * 0.06) * 14, 9, 30 + Math.cos(time * 0.06) * 4);
      camera.rotation.set(-0.2, Math.sin(time * 0.06) * 0.25, 0);
    } else {
      camera.position.set(Math.sin(time * 0.05) * 6, 2.2, 6 + Math.cos(time * 0.05) * 6);
      camera.rotation.set(-0.02, time * 0.05 + Math.PI * 0.02, 0);
    }
  }
  updateParticles(state === 'pause' || state === 'over' ? 0 : dt);
  drawScreenPaint(state === 'play' ? dt : 0);
  { const playing = state === 'play', combat = playing && !(wave.inter > 0);
    Sfx.ambience(dt, playing, combat); Sfx.flute(playing && fluter.e && fluter.e.state !== 'down' ? fluter.e.s.position.clone().setY(1.5) : null, combat); }
  if (sec.fanT > 0 && state === 'play') {   // 扇の風（画面の端に流れる線）
    paintG.strokeStyle = `rgba(255,255,255,${Math.min(0.35, sec.fanT * 0.15)})`; paintG.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = innerHeight * (0.2 + i * 0.1) + Math.sin(time * 3 + i) * 10, x = ((time * 400 + i * 180) % (innerWidth + 300)) - 150;
      paintG.beginPath(); paintG.moveTo(x, y); paintG.quadraticCurveTo(x + 60, y - 12, x + 140, y); paintG.stroke(); }
  }
  for (const f of flags) f.mesh.rotation.y = Math.sin(time * 1.7 + f.ph) * 0.35;
  if (document.body.classList.contains('playing') !== (state === 'play')) document.body.classList.toggle('playing', state === 'play');
  if (MOBILE) { const wl = player.weapon === 0 ? '弓矢' : '懐刀'; if ($('bWpnL').textContent !== wl) { $('bWpnL').textContent = wl; $('bAtkL').textContent = player.weapon === 0 ? '長押しで引く' : 'タップで突く'; } }
  sky.position.copy(camera.position);
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

window.__game = { sec2, SEC2_REQ, get menuWho() { return menuWho; }, medics, medPost, revivePatient, get state() { return state; }, towers, sayRemark, sec, SEC_REQ, openSecMenu, closeSecMenu, inHQ, get menuOpen() { return menuOpen; }, get allyStance() { return allyStance; }, GIRLS, get framesLoaded() { return framesLoaded; }, get stage() { return builtStage; }, perches, VoicePack, player, get enemies() { return enemies; }, get bodies() { return bodies; }, get wave() { return wave; }, get texLoaded() { return texLoaded; }, MOBILE, touch, get arrows() { return arrows; }, covers, SPR, startGame, damageEnemy, startWave, startEscort, askMeal, orderMeal, onigiriRemark, fluter, Sfx };
})();
