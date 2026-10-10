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
  noiseBurst(dur, type, f0, f1, gain, q = 1, delay = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  },
  tone(type, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  twangFar(d) { const k = clamp(1 - d / 60, 0.08, 1); this.tone('triangle', 200, 80, 0.3, 0.35 * k); this.noiseBurst(0.12, 'bandpass', 2200, 700, 0.18 * k, 2); },
  hitFar(d) { const k = clamp(1 - d / 50, 0.05, 1); this.tone('sine', 220, 70, 0.12, 0.35 * k); this.noiseBurst(0.06, 'lowpass', 3000, 300, 0.25 * k); },
  thudAt(d) { const k = clamp(1 - d / 50, 0.05, 1); this.noiseBurst(0.25, 'lowpass', 400, 60, 0.5 * k); },
  stab() { this.noiseBurst(0.12, 'highpass', 1800, 5000, 0.3, 0.8); this.tone('sine', 900, 1400, 0.06, 0.06); },
  thunk() { this.tone('sine', 520, 300, 0.08, 0.15); this.noiseBurst(0.05, 'bandpass', 1500, 900, 0.15, 3); },
  twang(p) { this.tone('triangle', 170 + p * 140, 65, 0.4, 0.55); this.tone('sawtooth', 340 + p * 220, 110, 0.12, 0.1); this.noiseBurst(0.18, 'bandpass', 2600, 700, 0.3, 2); },
  drawCreak() { this.noiseBurst(0.5, 'bandpass', 260, 520, 0.05, 6); },
  swing() { this.noiseBurst(0.22, 'bandpass', 500, 3800, 0.4, 1.4); },
  hit() { this.tone('sine', 240, 60, 0.14, 0.6); this.noiseBurst(0.07, 'lowpass', 3500, 300, 0.45); },
  clash() { this.tone('square', 1800, 1200, 0.08, 0.08); this.tone('sine', 2600, 2400, 0.25, 0.08); this.hit(); },
  hurt() { this.tone('square', 120, 45, 0.22, 0.22); this.noiseBurst(0.18, 'lowpass', 900, 100, 0.55); },
  thud() { this.noiseBurst(0.25, 'lowpass', 400, 60, 0.5); },
  pickup() { this.tone('sine', 660, 990, 0.12, 0.25); this.tone('sine', 990, 1320, 0.14, 0.2, 0.08); },
  drum() { for (let i = 0; i < 3; i++) { this.tone('sine', 95, 38, 0.4, 0.9, i * 0.3); this.noiseBurst(0.1, 'lowpass', 300, 80, 0.4, 1, i * 0.3); } },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.25, i * 0.12)); },
  empty() { this.tone('square', 300, 240, 0.05, 0.1); },
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

// ---- 風景 ----
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
  g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = Math.random() * 6; scene.add(g);
  colliders.push({ x, z, r: 0.5 * s });
}
function rock(x, z, s = 1) {
  const r = new THREE.Mesh(G.rock, M.rock); r.position.set(x, s * 0.35, z);
  r.scale.set(s * rand(.8, 1.3), s * rand(.5, .8), s * rand(.8, 1.3)); r.rotation.y = Math.random() * 6; scene.add(r);
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
  g.position.set(x, 0, z); g.rotation.y = ang; scene.add(g);
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
  g.position.set(x, 0, z); g.rotation.y = rand(-0.5, 0.5); scene.add(g);
  flags.push({ mesh: b, ph: Math.random() * 6, base: g.rotation.y });
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
  m.position.set(x, 1.25, z); m.rotation.y = ang; scene.add(m);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(G.post, M.pole);
    p.position.set(x + Math.cos(ang) * s * len / 2, 1.1, z - Math.sin(ang) * s * len / 2); scene.add(p);
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
  covers.push({ x, z, r });
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
  scene.add(im);
  const lg = new THREE.IcosahedronGeometry(1, 0);
  const lm = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0x4f7a32, flatShading: true }), bambooLeaves.length);
  bambooLeaves.forEach((l, i) => { m4.compose(new V3(l.x, l.y, l.z), q.identity(), new V3(l.s * 1.2, l.s * 0.45, l.s * 1.2)); lm.setMatrixAt(i, m4); });
  scene.add(lm);
}
(function buildWorld() {
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
  maku(0, 22, 12, 0); maku(-6, 28, 12, Math.PI / 2); maku(6, 28, 12, Math.PI / 2);
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
})();

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
      SPR[kind][i] = { tex: t, img: t.image, aspect: t.image.width / t.image.height, top: tops[i] || 0 };
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
//  塗料（模擬戦用の練習武器）：命中箇所にチームカラーの塗料が付く
//   自軍＝青組（青）、敵軍＝橙組（橙）。血ではなく塗料。
// ====================================================================
const TEAM_PAINT = { blue: ['#1e8cff', '#8fd0ff'], orange: ['#ff8a12', '#ffd080'] };
TEAM_PAINT.player = TEAM_PAINT.blue; TEAM_PAINT.enemy = TEAM_PAINT.orange;
const paintOf = team => team === 'orange' ? 'orange' : 'blue';   // 攻撃側の塗料色（プレイヤーは青組）
function ensurePaintCanvas(e) {
  if (e.pc) return;
  const img = e.spr.img, c = document.createElement('canvas');
  const sc = Math.min(1, 320 / img.height);
  c.width = Math.max(8, Math.round(img.width * sc)); c.height = Math.max(8, Math.round(img.height * sc));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  e.pc = c; e.pg = g; e.ptex = t; e.mat.map = t; e.mat.needsUpdate = true;
}
// u: 左右 (0..1), v: 上からの比率 (0..1), size: 画像高さに対する半径
function paintSplat(e, u, v, size, slash, paint = 'blue') {
  ensurePaintCanvas(e);
  const g = e.pg, W = e.pc.width, H = e.pc.height, x = u * W, y = v * H, r = size * H;
  const [c1, c2] = TEAM_PAINT[paint];
  g.save(); g.globalCompositeOperation = 'source-atop';   // 人物の上にだけ塗る
  g.fillStyle = c1;
  if (slash) {
    g.translate(x, y); g.rotate(rand(-0.9, -0.3));
    g.beginPath(); g.ellipse(0, 0, r * 2.6, r * 0.45, 0, 0, 7); g.fill();
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rand(-r * 2.6, r * 2.6), rand(-r * 0.9, r * 0.9), r * rand(0.12, 0.3), 0, 7); g.fill(); }
    g.fillStyle = c2; g.beginPath(); g.ellipse(-r * 0.4, -r * 0.1, r * 1.2, r * 0.12, 0, 0, 7); g.fill();
  } else {
    for (let i = 0; i < 7; i++) { const a = rand(0, 6.28), d = r * rand(0, 0.6); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rand(0.35, 0.7), 0, 7); g.fill(); }
    for (let i = 0; i < 8; i++) { const a = rand(0, 6.28), d = r * rand(1, 1.9); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rand(0.08, 0.2), 0, 7); g.fill(); }
    g.fillStyle = c2; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.22, 0, 7); g.fill();
  }
  g.restore(); e.ptex.needsUpdate = true;
}
// 刺さった練習矢（スプライトに重ねる小さなスプライト。同じ位置・回転を共有するので倒れても一緒に動く）
const makeStuckTex = col => [false, true].map(flip => canvasTex(64, 64, g => {
  if (flip) { g.translate(64, 0); g.scale(-1, 1); }
  g.strokeStyle = '#d2b47a'; g.lineWidth = 3.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(8, 56); g.lineTo(52, 12); g.stroke();
  g.fillStyle = '#f6f6f6';
  g.beginPath(); g.moveTo(44, 20); g.lineTo(60, 0); g.lineTo(54, 18); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(44, 20); g.lineTo(64, 6); g.lineTo(50, 22); g.closePath(); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(9, 55, 6.5, 0, 7); g.fill();   // 塗料玉の鏃
}));
const stuckTex = { blue: makeStuckTex(TEAM_PAINT.blue[0]), orange: makeStuckTex(TEAM_PAINT.orange[0]) };
function stickArrow(e, u, y, paint = 'blue') {
  const flip = Math.random() < 0.5 ? 1 : 0;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stuckTex[paint][flip], transparent: true, alphaTest: 0.1 }));
  const S = 0.34; s.scale.set(S, S, 1);
  const hs = flip ? 1 - 9 / 64 : 9 / 64, ht = 1 - 55 / 64;
  s.center.set(hs - (u - 0.5) * e.w / S, ht - y / S);
  s.position.copy(e.s.position); s.renderOrder = 2; s.frustumCulled = false; scene.add(s);
  e.stuck.push(s);
  if (e.stuck.length > 10) { const o = e.stuck.shift(); scene.remove(o); o.material.dispose(); }
}
function syncOverlays(e) {
  for (const o of e.stuck) { o.position.copy(e.s.position); o.material.rotation = e.mat.rotation; }
}
function disposeNpc(e) {
  scene.remove(e.s); e.mat.dispose(); if (e.ptex) e.ptex.dispose();
  for (const o of e.stuck) { scene.remove(o); o.material.dispose(); }
  scene.remove(e.bg); scene.remove(e.fg); e.fg.material.dispose(); scene.remove(e.mk);
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
    lines: { spot: ['見つけた！', 'いざ勝負！', '腕が鳴るわね！'], attack: ['てやぁっ！', '覚悟！', 'もらった！'], hit: ['まだまだ！', '効かないね！', 'やるじゃない！'], defeat: ['くっ…ここまでか…！', '覚えてなさい！', '次は負けない！'] } },
  慎重: { desc: '慎重', pitch: 1.1, rate: 1.0, speed: 0.9, atkCd: [1.2, 2.0], hideT: [3.5, 6.0], aimErr: 0.022, aimT: 1.1, keep: [20, 32], retreat: false, cautious: true,
    lines: { spot: ['…敵影あり。', '慎重にいくわ。', '気づかれないように…'], attack: ['今っ！', 'そこ！'], hit: ['くっ…油断した。', 'しまった…'], defeat: ['無念…', '読み違えた…', '慎重すぎたかしら…'] } },
  臆病: { desc: '臆病', pitch: 1.55, rate: 1.25, speed: 1.0, atkCd: [1.3, 2.2], hideT: [2.0, 3.5], aimErr: 0.06, aimT: 1.0, keep: [24, 34], retreat: true,
    lines: { spot: ['ひっ、来た…！', 'こ、怖くないもん！'], attack: ['えいっ…！', '当たって…！'], hit: ['わわっ！', 'む、無理〜！', 'いったん下がります！'], defeat: ['やられた〜！', 'もうだめ〜…', 'うう、負けちゃった…'] } },
  冷静: { desc: '冷静', pitch: 0.95, rate: 0.95, speed: 1.0, atkCd: [1.0, 1.5], hideT: [1.5, 2.5], aimErr: 0.008, aimT: 1.2, keep: [18, 28], retreat: false,
    lines: { spot: ['目標確認。', '捕捉しました。'], attack: ['射る。', '狙い通り。', 'そこです。'], hit: ['…被弾。', '問題ありません。'], defeat: ['…戦死判定、了解です。', '完敗です。', '見事な腕前ですね。'] } },
  陽気: { desc: '陽気', pitch: 1.4, rate: 1.15, speed: 1.1, atkCd: [0.9, 1.5], hideT: [1.0, 2.0], aimErr: 0.045, aimT: 0.8, keep: [14, 24], retreat: false,
    lines: { spot: ['みーつけた！', 'いっくよー！'], attack: ['それっ！', 'くらえ〜！', 'えーいっ！'], hit: ['わっ、やったなー！', 'あはは、当たった！'], defeat: ['やられた〜！', 'あちゃ〜、負けた！', '楽しかった〜！'] } },
};
const PERS_KEYS = Object.keys(PERS);
let usedNames = new Set();
function makeProfile() {
  let name = '';
  for (let k = 0; k < 30; k++) { name = pick(SURN) + ' ' + pick(GIVEN); if (!usedNames.has(name)) break; }
  usedNames.add(name);
  const pers = pick(PERS_KEYS), P = PERS[pers];
  const cm = Math.round(rand(150, 175));
  return { name, pers, cm,
    pitch: clamp(P.pitch + rand(-0.15, 0.15) + (163 - cm) * 0.01, 0.6, 2),
    rate: clamp(P.rate + rand(-0.08, 0.08), 0.7, 1.6) };
}
function npcSay(e, kind, prio = 0, chance = 1) {
  if (Math.random() > chance) return;
  Voice.say(pick(e.P.lines[kind]), e.prof, prio);
}

// ====================================================================
//  ゲーム状態
// ====================================================================
const player = { pos: new V3(), vy: 0, yaw: 0, pitch: 0, hp: 100, kills: 0, allyKills: 0, arrows: 30, weapon: 0,
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
const isFoe = e => e.team === 'orange';
const aliveOf = team => enemies.filter(e => e.team === team && e.state !== 'down');
// team: 'orange'（敵・橙組） / 'blue'（味方・青組）
function spawnEnemy(x, z, kind, captain, team = 'orange') {
  const set = SPR[kind].length ? SPR[kind] : SPR.mob;
  if (!set.length) return;
  if (!SPR[kind].length) kind = 'mob';
  const spr = pick(set), prof = makeProfile(), P = PERS[prof.pers], n = wave.n;
  if (captain) prof.name = '組頭 ' + prof.name;
  const mat = new THREE.SpriteMaterial({ map: spr.tex, transparent: true, alphaTest: 0.08 });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0); s.renderOrder = 1;
  const figH = prof.cm / 100, h = figH / (1 - spr.top), w = h * spr.aspect;
  s.scale.set(w, h, 1); s.position.set(x, 0, z); scene.add(s);
  const baseColor = captain ? new THREE.Color(1, 0.9, 0.72) : new THREE.Color(1, 1, 1);
  mat.color.copy(baseColor);
  const hpMax = Math.max(2, Math.round((3 + Math.floor((n - 1) / 3)) * (captain ? 2.5 : 1)) - (kind === 'archer' ? 1 : 0));
  const bg = new THREE.Sprite(barBgMat); bg.scale.set(0.8, 0.08, 1); bg.visible = false; bg.renderOrder = 4; scene.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: team === 'blue' ? 0x5ab0ff : (captain ? 0xffd040 : 0xffa040), depthWrite: false }));
  fg.scale.set(0.76, 0.05, 1); fg.visible = false; fg.renderOrder = 5; scene.add(fg);
  const mk = new THREE.Sprite(markerMat[team]); mk.scale.set(0.22, 0.22, 1); mk.renderOrder = 5; scene.add(mk);
  enemies.push({
    id: ++npcId, team, kind, prof, P, spr, s, mat, h, w, figH, hp: hpMax, hpMax, captain, baseColor,
    speed: Math.min(4.6, rand(2.0, 2.6) + n * 0.12) * P.speed * (captain ? 0.85 : 1) * (kind === 'archer' ? 0.9 : 1),
    dmg: (captain ? 14 : 8) + Math.min(8, n),
    state: kind === 'archer' ? 'advance' : 'approach', t: 0, cd: rand(0.5, 1.5),
    knock: new V3(), flash: 0, ph: Math.random() * 6, strafe: Math.random() < 0.5 ? -1 : 1,
    bg, fg, mk, stuck: [], spotted: false, hid: false, cover: null, cp: null, hideT: 0, retreated: false, evalT: 0,
    tgt: null, tgtT: 0,
  });
}
// 青組の援軍（自陣側＝プレイヤーの後方から合流。弓兵が約7割）
function spawnAllies(count) {
  const cap = 12 - aliveOf('blue').length;
  for (let i = 0; i < Math.min(count, cap); i++) {
    const a = rand(0.6, 2.5), r = rand(10, 18);   // プレイヤーの後方（+Z 側）
    const x = clamp(player.pos.x + Math.cos(a) * r, -CFG.field + 3, CFG.field - 3);
    const z = clamp(player.pos.z + Math.sin(a) * r, -CFG.field + 3, CFG.field - 3);
    spawnEnemy(x, z, Math.random() < 0.7 ? 'archer' : 'mob', false, 'blue');
  }
}
function startWave(n) {
  wave.n = n; wave.toSpawn = 5 + n * 3; wave.spawnT = 1.5; wave.inter = 0;
  wave.maxAlive = Math.min(8 + n * 2, 28); wave.captain = n >= 2;
  wave.archerRate = Math.min(0.45, 0.3 + n * 0.02);
  spawnAllies(n === 1 ? 4 : 2 + Math.floor(n / 2));
  showBanner(`第${waveName(n)}波`, n === 1 ? '模擬戦、開始！ 青組の味方と共に戦え' : '新手の橙組が迫る！ 青組の援軍が到着');
  Sfx.drum();
  setTimeout(() => state === 'play' && Voice.say('かかれーっ！', { pitch: 1.3, rate: 1.1 }, 1), 600);
}
function waveUpdate(dt) {
  if (wave.inter > 0) { wave.inter -= dt; if (wave.inter <= 0) startWave(wave.n + 1); return; }
  wave.spawnT -= dt;
  const foes = enemies.filter(isFoe).length;
  if (wave.toSpawn > 0 && wave.spawnT <= 0 && foes < wave.maxAlive) {
    const front = Math.random() < 0.7;
    const a = front ? -Math.PI / 2 + rand(-1.2, 1.2) : rand(0, Math.PI * 2);
    const r = rand(42, 58);
    const cx = clamp(player.pos.x + Math.cos(a) * r, -CFG.field + 5, CFG.field - 5);
    const cz = clamp(player.pos.z + Math.sin(a) * r, -CFG.field + 5, CFG.field - 5);
    const grp = Math.min(wave.toSpawn, 1 + ((Math.random() * Math.min(4, 1 + wave.n)) | 0));
    for (let i = 0; i < grp; i++) {
      const cap = wave.captain && wave.toSpawn === 1;
      spawnEnemy(cx + rand(-3, 3), cz + rand(-3, 3), Math.random() < wave.archerRate ? 'archer' : 'mob', cap, 'orange');
      wave.toSpawn--;
      if (cap) wave.captain = false;
    }
    wave.spawnT = rand(0.8, 2.0);
  }
  if (wave.toSpawn <= 0 && foes === 0) {
    wave.inter = 5;
    showBanner(`第${waveName(wave.n)}波 制圧！`, '矢と体力が少し回復した');
    Sfx.fanfare();
    player.arrows = Math.min(CFG.arrowsMax, player.arrows + 10);
    player.hp = Math.min(CFG.maxHp, player.hp + 20);
  }
}

// ---- 命中・戦死判定 ----
// by: 'player' | 攻撃した NPC。hit: { u, y, arrow, thrust }
function damageEnemy(e, dmg, from, crit, hit, by = 'player') {
  if (e.state === 'down') return;
  const byPlayer = by === 'player';
  const paint = byPlayer ? 'blue' : paintOf(by.team);
  e.hp -= dmg; e.flash = 0.12;
  if (hit) {
    const v = clamp(1 - hit.y / e.h, 0.02, 0.98);
    paintSplat(e, hit.u, v, hit.thrust ? 0.032 : 0.045, false, paint);
    if (hit.arrow) stickArrow(e, hit.u, hit.y, paint);
  }
  const hitPos = e.s.position.clone(); hitPos.y += hit ? hit.y : e.figH * 0.6;
  puff(hitPos, 0xffffff, 3, 0.3, 1.6, 0.22);                              // 白い閃光
  puff(e.s.position.clone().setY(0.3), 0xc8b48a, 3, 0.6, 1.2, 0.6);       // 砂埃
  const k = new V3(e.s.position.x - from.x, 0, e.s.position.z - from.z).normalize();
  e.knock.addScaledVector(k, crit ? 4 : 2.5);
  if (e.state === 'windup' || e.state === 'aim') { e.state = 'stagger'; e.t = 0; e.mat.color.copy(e.baseColor); }
  if (byPlayer) { hitMarker(); Sfx.hit(); if (crit) popup('急所！'); else if (e.team === 'blue') popup('味方に命中！'); }
  else Sfx.hitFar(Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z));
  if (by !== 'player' && by.state !== 'down') { e.tgt = by; e.tgtT = 2; }   // 撃ってきた相手に向き直る
  if (e.hp <= 0) { killEnemy(e, byPlayer); return; }
  npcSay(e, 'hit', 0, byPlayer ? 0.5 : 0.25);
  if (e.P.retreat && !e.retreated && e.hp / e.hpMax <= 0.5) { e.retreated = true; e.state = 'retreat'; e.t = 0; e.retreatT = rand(3, 4.5); }
}
function killEnemy(e, byPlayer) {
  e.state = 'down'; e.t = 0; e.side = Math.random() < 0.5 ? -1 : 1;
  e.knock.set(0, 0, 0); e.mat.color.copy(e.baseColor);
  e.bg.visible = e.fg.visible = e.mk.visible = false;
  if (byPlayer) {
    if (e.team === 'orange') player.kills++;
    else { player.allyKills++; popup('味方撃破…！'); }
  }
  npcSay(e, 'defeat', 2);                // 最後の台詞（これ以降は一切しゃべらない）
  kiaLabel(e.s.position, e.figH);
  if (e.team === 'orange') {
    const r = Math.random();
    if (r < 0.38) addPickup('arrow', e.s.position);
    else if (r < 0.38 + (player.hp < 60 ? 0.18 : 0.08)) addPickup('food', e.s.position);
  }
}
function toBodies(e) {
  enemies.splice(enemies.indexOf(e), 1);
  scene.remove(e.bg); scene.remove(e.fg); scene.remove(e.mk);
  bodies.push(e);
  while (bodies.length > CFG.maxBodies) disposeNpc(bodies.shift());
}

// ---- 標的選び：最も近い敵対者（橙組→プレイヤーか青組、青組→橙組） ----
const PLAYER_T = { isPlayer: true };
function tgtPos(t) { return t.isPlayer ? player.pos : t.s.position; }
function chooseTarget(e) {
  const p = e.s.position;
  let best = null, bd = 1e9;
  if (e.team === 'orange') { bd = Math.hypot(player.pos.x - p.x, player.pos.z - p.z); best = PLAYER_T; }
  for (const o of enemies) {
    if (o.team === e.team || o.state === 'down') continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ---- 遮蔽（竹林）を使う。基準は自分の標的の位置 ----
function findCover(e, minD, maxD, tx, tz) {
  let best = null, bd = 1e9;
  for (const c of covers) {
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
  const p = e.s.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const k = Math.min(d, sp * dt) / d; p.x += dx * k; p.z += dz * k; e.moving = true; }
  return d;
}

// ---- NPC の行動 ----
const tmp = new V3();
const MELEE_RANGE = 1.8;   // 懐刀の突き：短く狭い
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], p = e.s.position, P = e.P;
    if (e.flash > 0) { e.flash -= dt; e.mat.color.copy(e.baseColor).multiplyScalar(e.flash > 0 ? 3 : 1); }
    if (e.state === 'down') {
      // 戦死判定：横に倒れて、以後は完全に静止したまま残る（消えない・動かない・しゃべらない）
      e.t += dt; const k = Math.min(1, e.t / 0.55);
      e.mat.rotation = e.side * 1.5 * k * k;
      p.y = 0.1 * k;
      syncOverlays(e);
      if (k >= 1) { Sfx.thudAt(Math.hypot(p.x - player.pos.x, p.z - player.pos.z)); puff(p.clone().setY(0.2), 0xc8b48a, 4, 0.8, 1.5, 0.8); toBodies(e); }
      continue;
    }
    p.addScaledVector(e.knock, dt); e.knock.multiplyScalar(Math.exp(-7 * dt));
    // 標的の更新
    e.tgtT -= dt;
    if (!e.tgt || e.tgtT <= 0 || (!e.tgt.isPlayer && e.tgt.state === 'down')) {
      const nt = chooseTarget(e);
      if (nt !== e.tgt && e.kind === 'archer' && !['aim', 'retreat', 'stagger'].includes(e.state)) { e.cover = null; if (e.state !== 'advance') { e.state = 'advance'; e.t = 0; } }
      e.tgt = nt; e.tgtT = 0.6;
    }
    e.cd -= dt; e.t += dt; e.moving = false;
    let lean = 0;
    const tint = k => { if (e.flash <= 0) e.mat.color.setRGB(1, 1 - 0.2 * k, 1 - 0.5 * k).multiply(e.baseColor); };

    if (!e.tgt) {
      // 敵がいない：青組はプレイヤーの近くに集まる
      const fx = player.pos.x + Math.cos(e.ph) * 5, fz = player.pos.z + 4 + Math.sin(e.ph) * 3;
      if (Math.hypot(fx - p.x, fz - p.z) > 1.5) steer(e, fx, fz, e.speed, dt);
      if (['windup', 'aim', 'peek', 'return', 'hide', 'tocover'].includes(e.state)) { e.state = e.kind === 'archer' ? 'advance' : 'approach'; e.mat.color.copy(e.baseColor); }
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
      } else if (e.kind === 'archer') {
        // ===== 弓兵 =====
        if (dist < 6 && !['backoff', 'aim'].includes(e.state) && P !== PERS.好戦的) { e.state = 'backoff'; e.t = 0; }
        if (e.state === 'advance') {
          if (!e.cover || e.t > 8) {
            e.t = 0;
            e.cover = findCover(e, P.keep[0], P.keep[1], tx, tz) || { x: tx - nx * rand(P.keep[0], P.keep[1]), z: tz - nz * rand(P.keep[0], P.keep[1]), r: 0, open: true };
          }
          e.cp = e.cover.open ? { x: e.cover.x, z: e.cover.z, px: -nz, pz: nx } : coverPoint(e.cover, tx, tz);
          if (steer(e, e.cp.x, e.cp.z, e.speed, dt) < 0.6) {
            e.state = 'hide'; e.t = 0; e.hideT = rand(P.hideT[0], P.hideT[1]) * (e.cover.open ? 0.4 : 1);
          }
        } else if (e.state === 'hide') {
          e.hideT -= dt;
          if (e.hideT <= 0) {
            if (e.cover && !e.cover.open) {
              const side = Math.random() < 0.5 ? -1 : 1, c = e.cover;
              e.peek = { x: c.x + e.cp.px * side * (c.r + 1.3) + (e.cp.x - c.x) * 0.3, z: c.z + e.cp.pz * side * (c.r + 1.3) + (e.cp.z - c.z) * 0.3 };
              e.state = 'peek';
            } else e.state = 'aim';
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
          const T = P.aimT * (dist < 6 ? 0.5 : 1);
          tint(e.t / T); lean = -0.04 * e.strafe;
          if (e.t >= T) {
            enemyShoot(e, e.tgt);
            if (e.tgt.isPlayer || Math.random() < 0.5) npcSay(e, 'attack', 0, 0.35);
            e.mat.color.copy(e.baseColor);
            e.t = 0;
            if (P === PERS.好戦的 && Math.random() < 0.6) { e.state = 'advance'; e.cover = null; }       // さらに前へ
            else if (e.cover && !e.cover.open) { e.state = 'return'; }
            else { e.state = 'hide'; e.hideT = rand(P.hideT[0], P.hideT[1]) * 0.5; }
          }
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
          if (e.state === 'approach') {
            if (dist > MELEE_RANGE - 0.35) {
              const side = Math.sin(time * 0.7 + e.ph) * (P.cautious ? 0.6 : 0.35) * e.strafe * Math.min(1, dist / 6);
              steer(e, p.x + (nx - nz * side) * 3, p.z + (nz + nx * side) * 3, e.speed, dt);
            } else if (e.cd <= 0) { e.state = 'windup'; e.t = 0; if (e.tgt.isPlayer || Math.random() < 0.4) npcSay(e, 'attack', 0, 0.3); }
            lean = Math.sin(time * 9 + e.ph) * 0.04;
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
            e.state = 'recover'; e.t = 0; e.cd = rand(P.atkCd[0], P.atkCd[1]); e.mat.color.copy(e.baseColor);
            p.x += nx * 0.45; p.z += nz * 0.45;
            const d2 = Math.hypot(tx - p.x, tz - p.z);
            if (d2 < MELEE_RANGE) {
              if (e.tgt.isPlayer) hurtPlayer(e.dmg);
              else damageEnemy(e.tgt, 1, p, false, { u: 0.5 + rand(-0.04, 0.04) / e.tgt.w, y: e.tgt.figH * rand(0.5, 0.68), thrust: true }, e);
            }
          }
        } else if (e.state === 'recover') {
          if (e.t > 0.35) e.state = 'approach';
        } else e.state = 'approach';
      }
    }
    // 群れの分離
    for (const o of enemies) {
      if (o === e || o.state === 'down') continue;
      const ox = p.x - o.s.position.x, oz = p.z - o.s.position.z, d2 = ox * ox + oz * oz;
      if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += ox / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); p.z += oz / d * (0.9 - d) * 0.5 * Math.min(1, dt * 10); }
    }
    const pdx = player.pos.x - p.x, pdz = player.pos.z - p.z, pd = Math.hypot(pdx, pdz);
    if (pd < 0.9 && pd > 1e-4) { p.x -= pdx / pd * (0.9 - pd); p.z -= pdz / pd * (0.9 - pd); }
    p.x = clamp(p.x, -CFG.field, CFG.field); p.z = clamp(p.z, -CFG.field, CFG.field);
    p.y = e.moving ? Math.abs(Math.sin(time * 8 + e.ph)) * 0.05 : 0;
    e.mat.rotation = lean;
    syncOverlays(e);
    e.mk.position.set(p.x, e.figH + (e.hp < e.hpMax ? 0.5 : 0.32), p.z);
    if (e.hp < e.hpMax) {
      const f = Math.max(0, e.hp / e.hpMax);
      e.bg.visible = e.fg.visible = true;
      e.bg.position.set(p.x, e.figH + 0.25, p.z);
      e.fg.position.set(p.x, e.figH + 0.25, p.z);
      // 左端を固定して縮める（スプライトの center で左寄せ）
      e.fg.scale.x = Math.max(0.001, 0.76 * f); e.fg.center.set(0.38 / Math.max(0.001, 0.76 * f), 0.5);
    }
  }
}

// ---- プレイヤー被弾（橙色の塗料が画面に付く） ----
function hurtPlayer(dmg) {
  if (state !== 'play') return;
  player.hp -= dmg; player.hurtT = 0.5; player.shake = 0.25;
  addScreenPaint();
  Sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

// ---- 矢（鏃は塗料玉）。team: 'player' | 'blue' | 'orange' ----
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
const arrowTpl = { player: makeArrowTemplate(0x1e8cff), orange: makeArrowTemplate(0xff8a12) };
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
  const from = e.s.position.clone(); from.y = e.figH * 0.85;
  const tp = tgtPos(t);
  const target = new V3(tp.x, t.isPlayer ? player.pos.y + 1.2 : t.figH * 0.65, tp.z);
  const v = 30, d = from.distanceTo(target), tf = d / v;
  const dir = target.sub(from).normalize();
  const err = e.P.aimErr * (1 + d / 40);
  dir.x += gauss() * err; dir.y += gauss() * err; dir.z += gauss() * err; dir.normalize();
  const vel = dir.multiplyScalar(v); vel.y += 0.5 * 9.8 * tf;
  from.addScaledVector(dir, 0.5);
  addArrow(e.team, from, vel, { dmg: (e.captain ? 12 : 8) + Math.min(6, wave.n), shooter: e });
  Sfx.twangFar(Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z));
}
function hitsCover(p) {
  if (p.y > 7.5) return false;
  for (const c of covers) if (Math.hypot(p.x - c.x, p.z - c.z) < c.r * 0.85) return true;
  return false;
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
      const y = p0.y + (p1.y - p0.y) * t;
      if (d < 0.3 && y > 0 && y < e.figH && t < best) { best = t; hit = { e, y, lat: (cx - ep.x) * rx + (cz - ep.z) * rz }; }
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
      const e = hit.e, um = 0.16 / e.w;
      const u = clamp(0.5 + hit.lat / e.w, 0.5 - um, 0.5 + um);
      if (a.team === 'player') {
        const crit = hit.y > e.figH * 0.86;
        let dmg = a.charge >= 0.95 ? 3 : (a.charge > 0.5 ? 2 : 1);
        if (crit) dmg *= 2;
        damageEnemy(e, dmg, p0, crit, { u, y: hit.y, arrow: true }, 'player');
      } else {
        damageEnemy(e, 1, p0, false, { u, y: hit.y, arrow: true }, a.shooter || { team: a.team, state: 'down' });
      }
      scene.remove(a.m); arrows.splice(i, 1); continue;      // 3D の矢は消え、スプライトに刺さった矢が残る
    }
    if (hitsCover(p1)) { a.stuck = true; a.life = 0; if (a.team === 'player') Sfx.thunk(); continue; }   // 竹林が矢を防ぐ
    if (p1.y <= 0.02) {
      p1.y = 0.05; a.stuck = true; a.life = 0;
      puff(p1.clone(), 0xc8b48a, 2, 0.4, 0.8, 0.5);
    }
    if (a.life > 6) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}

// ---- 懐刀（練習用・刃先に塗料）：突きのみ。正面・短距離・単体 ----
function swing() {
  if (player.swingCd > 0) return;
  player.swingT = 0; player.swingCd = 0.45; player.swingHit = false;
  Sfx.stab();
}
function swingResolve() {
  const fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  let best = null, bd = 1e9;
  for (const e of enemies) {                      // 同士討ちあり：両軍が対象
    if (e.state === 'down') continue;
    const dx = e.s.position.x - player.pos.x, dz = e.s.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.9) continue;
    const along = dx * fwd.x + dz * fwd.z, lateral = Math.abs(dx * fwd.z - dz * fwd.x);
    if (along <= 0.2 || lateral > 0.45) continue;     // 正面の細い範囲だけ
    if (along < bd) { bd = along; best = e; }
  }
  if (best) {
    damageEnemy(best, 2, player.pos, false, { u: 0.5 + rand(-0.04, 0.04) / best.w, y: clamp(camera.position.y - 0.25, best.figH * 0.45, best.figH * 0.75), thrust: true }, 'player');
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
      if (p.type === 'arrow' && player.arrows < CFG.arrowsMax) { player.arrows = Math.min(CFG.arrowsMax, player.arrows + 6); popup('矢 +6'); take = true; }
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
  setText('arrowcnt', String(player.arrows)); setText('arrowmax', String(CFG.arrowsMax));
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
    const cx = rayDir.x * t - ex, cz = rayDir.z * t - ez, y = o.y + rayDir.y * t;
    if (Math.hypot(cx, cz) < 0.32 && y > 0 && y < e.figH + 0.1) { best = e; bt = t; }
  }
  if (best) return best;
  // 倒れている侍女（地面との交点で判定）
  if (rayDir.y < -0.02) {
    const t = -o.y / rayDir.y;
    if (t < 60) {
      const gx = o.x + rayDir.x * t, gz = o.z + rayDir.z * t;
      const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      for (const b of bodies) {
        const hx = -rx * b.side, hz = -rz * b.side;     // 頭の向き（画面上で倒れた方向）
        const px = gx - b.s.position.x, pz = gz - b.s.position.z;
        const along = clamp(px * hx + pz * hz, 0, b.figH);
        if (Math.hypot(px - hx * along, pz - hz * along) < 0.45) return b;
      }
    }
  }
  return null;
}
function updateTargetInfo(dt) {
  const e = pickTarget();
  if (e) { targetShown = e; targetHold = 0.6; }
  else targetHold -= dt;
  const el = $('target');
  if (targetShown && targetHold > 0) {
    const t = targetShown, dead = t.state === 'down';
    const tm = t.team === 'blue' ? '<u style="color:#7cc0ff">青組（味方）</u>' : '<u style="color:#ffa040">橙組</u>';
    const html = `${tm}<b>${t.prof.name}</b><span>${t.P.desc}・${t.kind === 'archer' ? '弓兵' : '近接兵'}　${t.prof.cm}cm</span>` +
      (dead ? '<em>戦死判定</em>' : `<i style="width:${Math.max(0, t.hp / t.hpMax * 100)}%;background:${t.team === 'blue' ? '#5ab0ff' : '#ffb040'}"></i>`);
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.opacity = Math.min(1, targetHold * 3);
  } else el.style.opacity = 0;
}

// ---- 被弾時の画面の塗料（橙組の塗料。血ではない） ----
const paintCv = $('paint'), paintG = paintCv.getContext('2d');
let screenPaint = [];
function addScreenPaint() {
  const a = rand(0, 6.283), r = rand(0.28, 0.45);
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([rand(-1, 1), rand(-1, 1), rand(0.3, 0.7)]);
  for (let i = 0; i < 10; i++) { const b = rand(0, 6.28), d = rand(1.2, 2); blobs.push([Math.cos(b) * d, Math.sin(b) * d, rand(0.06, 0.15)]); }
  screenPaint.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r * 0.9, s: rand(0.05, 0.08), t: 0, blobs });
  if (screenPaint.length > 10) screenPaint.shift();
}
function drawScreenPaint(dt) {
  const W = innerWidth, H = innerHeight;
  paintG.clearRect(0, 0, W, H);
  screenPaint = screenPaint.filter(p => (p.t += dt) < 2.6);
  for (const p of screenPaint) {
    paintG.globalAlpha = p.t < 1.8 ? 0.85 : 0.85 * (1 - (p.t - 1.8) / 0.8);
    const R = p.s * H, cx = p.x * W, cy = p.y * H;
    paintG.fillStyle = TEAM_PAINT.enemy[0];
    for (const [bx, by, br] of p.blobs) { paintG.beginPath(); paintG.arc(cx + bx * R, cy + by * R, br * R, 0, 7); paintG.fill(); }
    paintG.fillStyle = TEAM_PAINT.enemy[1]; paintG.beginPath(); paintG.arc(cx - R * 0.25, cy - R * 0.25, R * 0.18, 0, 7); paintG.fill();
  }
  paintG.globalAlpha = 1;
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
    wg.fillStyle = TEAM_PAINT.player[0]; wg.beginPath(); wg.moveTo(tx + ux * hl, ty + uy * hl); wg.lineTo(tx + px_ * hw, ty + py_ * hw); wg.lineTo(tx - px_ * hw, ty - py_ * hw); wg.fill();
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
  // 刃先の塗料（青組）
  wg.fillStyle = TEAM_PAINT.player[0]; wg.beginPath(); wg.ellipse(-H * 0.003, -H * 0.305, H * 0.016, H * 0.03, 0, 0, 7); wg.fill();
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
  tapBtn('bJump', () => { if (player.onGround) { player.vy = 5.2; player.onGround = false; } });
  tapBtn('bPause', () => pauseGame());
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
  Sfx.init();
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
  if (!locked() && state === 'play') pauseGame();
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'Digit1') setWeapon(0);
  if (e.code === 'Digit2') setWeapon(1);
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
  for (const e of enemies) disposeNpc(e);
  for (const b of bodies) disposeNpc(b);
  for (const l of labels) scene.remove(l.s);
  labels.length = 0; screenPaint = []; usedNames = new Set(); targetShown = null;
  if (Voice.ok) speechSynthesis.cancel();
  for (const a of arrows) scene.remove(a.m);
  for (const p of pickups) scene.remove(p.g);
  for (const p of particles) scene.remove(p.s);
  enemies = []; bodies = []; arrows = []; pickups = []; particles.length = 0;
  Object.assign(player, { hp: CFG.maxHp, kills: 0, allyKills: 0, arrows: CFG.arrowsStart, weapon: 0, drawing: false, charge: 0, swingT: -1, swingCd: 0,
    regenT: 0, hurtT: 0, switchT: 0, vy: 0, yaw: 0, pitch: 0, shake: 0 });
  player.pos.set(0, 0, 0);
  wave = { n: 0, toSpawn: 0, spawnT: 0, inter: 0, maxAlive: 8 };
}
function startGame() {
  Sfx.init(); if (Voice.ok) { Voice.pick(); speechSynthesis.cancel(); }
  resetGame();
  unlockAudio(); goFullscreen(); resetTouch();
  $('title').style.display = 'none'; $('over').style.display = 'none'; $('pause').style.display = 'none';
  $('hud').style.display = 'block';
  state = 'play'; lock();
  startWave(1);
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause'; player.drawing = false; $('pause').style.display = 'flex';
}
function resumeGame() {
  if (MOBILE && innerHeight > innerWidth) return;   // 縦向きのままでは再開しない
  state = 'play'; $('pause').style.display = 'none'; unlockAudio(); goFullscreen(); resetTouch(); lock();
}
function toTitle() {
  state = 'title'; resetGame();
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
  let sp = (keys.ShiftLeft || keys.ShiftRight || touch.run) && !player.drawing ? CFG.run : CFG.walk;
  if (player.drawing) sp *= 0.5;
  if (ml > 0) {
    player.pos.x += mx / ml * sp * mag * dt; player.pos.z += mz / ml * sp * mag * dt;
    if (player.onGround) player.bob += dt * sp * 1.6;
  }
  if (keys.Space && player.onGround) { player.vy = 5.2; player.onGround = false; }
  player.vy -= 14 * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  player.pos.x = clamp(player.pos.x, -CFG.field, CFG.field); player.pos.z = clamp(player.pos.z, -CFG.field, CFG.field);
  for (const c of colliders) {
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.35;
    if (d < r && d > 1e-4) { player.pos.x = c.x + dx / d * r; player.pos.z = c.z + dz / d * r; }
  }
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
  if (player.arrows < CFG.arrowsMax) { player.regenT += dt; if (player.regenT >= CFG.arrowRegen) { player.regenT = 0; player.arrows++; } }
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
    updatePlayer(dt); waveUpdate(dt); updateEnemies(dt); updateArrows(dt); updatePickups(dt); updateHud(dt);
  } else if (state === 'title') {
    time += dt;
    camera.position.set(Math.sin(time * 0.05) * 6, 2.2, 6 + Math.cos(time * 0.05) * 6);
    camera.rotation.set(-0.02, time * 0.05 + Math.PI * 0.02, 0);
  }
  updateParticles(state === 'pause' || state === 'over' ? 0 : dt);
  drawScreenPaint(state === 'play' ? dt : 0);
  for (const f of flags) f.mesh.rotation.y = Math.sin(time * 1.7 + f.ph) * 0.35;
  if (document.body.classList.contains('playing') !== (state === 'play')) document.body.classList.toggle('playing', state === 'play');
  if (MOBILE) { const wl = player.weapon === 0 ? '弓矢' : '懐刀'; if ($('bWpnL').textContent !== wl) { $('bWpnL').textContent = wl; $('bAtkL').textContent = player.weapon === 0 ? '長押しで引く' : 'タップで突く'; } }
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  drawWeapon();
}
resize();
setupTouch();
$('startBtn').disabled = true;
loadSprites(() => {
  $('loading').textContent = texLoaded ? '' : '侍女の画像の読み込みに失敗しました';
  $('startBtn').disabled = false;
  if (TEST) startGame();
});
requestAnimationFrame(frame);

window.__game = { get state() { return state; }, player, get enemies() { return enemies; }, get bodies() { return bodies; }, get wave() { return wave; }, get texLoaded() { return texLoaded; }, MOBILE, touch, get arrows() { return arrows; }, covers, SPR, startGame };
})();
