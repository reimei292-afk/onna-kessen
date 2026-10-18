// ====================================================================
//  フランス人形編 第一幕「宣戦」（?stage=frDeclare）
//   英国が降ったあと、共和国のコルベットが王の港へ来て、「侍女たちの解放」を突きつける。
//   戦いは無い。岸と甲板を歩き、使者と言葉を交わし、岸の奥の幟で幕を閉じる。
//   フランスの娘はフランス語、英国のエレノアは英語、日本の侍女は日本語。殿の台詞は字幕だけ。
//   選択は localStorage onnaFrAct1（refuse / ask / peace）に残り、次の幕が読む。
// ====================================================================
var FR = { on: false, phase: 'off', t: 0, girls: [], by: {}, jp: [], jpBy: {}, talked: new Set(), parleyDone: false, pick: '', goal: '', near: null, ended: false, lastOk: null, sea: null, flags: [], balloon: null, balloonY: 9.4, banner: [7.2, 27.5] };
const FR_DECK = 2.32, FR_QD = 3.42, FR_QUAY = 1.15;
const FR_PROF = {
  fr01: { name: 'カミーユ・ローラン', en: 'Camille Laurent', pers: '陽気', cm: 168, age: 22, vv: 2, role: '近衛歩兵の小隊長', desc: '長い金髪のウェーブ。社交的で、仲間を置いていかない。', face: 0, at: [4.2, -7.6], y: FR_DECK },
  fr02: { name: 'エリーズ・モロー', en: 'Élise Moreau', pers: '冷静', cm: 172, age: 24, vv: 0, role: '共和国の使者・参謀副官', desc: '低いポニーテール。几帳面で、皮肉が正確。', face: 0, at: [0.15, 3.55], y: FR_QUAY, leader: true },
  fr03: { name: 'マルゴー・プティ', en: 'Margaux Petit', pers: '陽気', cm: 160, age: 19, vv: 2, role: '鼓手', desc: 'オーバーンのショートボブ。好奇心が先に出る。', face: 0.4, at: [-4.6, -7.2], y: FR_DECK },
  fr04: { name: 'イネス・ベナリ', en: 'Inès Benali', pers: '冷静', cm: 170, age: 23, vv: 0, role: '選抜射手', desc: '長い黒髪。言葉は少ない。', face: 0.2, at: [7.4, -9.6], y: FR_DECK },
  fr05: { name: 'ジュリエット・ルソー', en: 'Juliette Rousseau', pers: '慎重', cm: 165, age: 21, vv: 1, role: '衛生兵', desc: '赤褐色の巻き毛。生存者だけを治療する。', face: 0.6, at: [-1.8, -10.0], y: FR_DECK },
  fr06: { name: 'エレーヌ・ド・ヴァロワ', en: 'Hélène de Valois', pers: '冷静', cm: 174, age: 26, vv: 0, role: '胸甲騎兵の指揮官', desc: 'アッシュブロンドをまとめ、礼を崩さない。', face: -0.25, at: [1.85, 3.85], y: FR_QUAY },
  fr07: { name: 'クロエ・ベルナール', en: 'Chloé Bernard', pers: '臆病', cm: 166, age: 20, vv: 1, role: '通訳・書記', desc: 'ライトブラウンのぱっつん。日本語を少し話す。', face: 0.35, at: [-1.75, 4.15], y: FR_QUAY },
  fr08: { name: 'レア・フォンテーヌ', en: 'Léa Fontaine', pers: '好戦的', cm: 163, age: 22, vv: 2, role: '斥候', desc: '短い髪と、止まらない足。', face: 0, at: [-7.2, 1.35], y: FR_QUAY, patrol: [[-8.2, 1.25], [6.8, 1.25]] },
  fr09: { name: 'マノン・ジラール', en: 'Manon Girard', pers: '陽気', cm: 162, age: 25, vv: 1, role: '補給・炊事の長', desc: 'プラチナのボブ。腹が減ると判断を誤る、と言う。', face: 0.8, at: [1.4, -10.3], y: FR_DECK },
  fr10: { name: 'セヴリーヌ・デュボワ', en: 'Séverine Dubois', pers: '好戦的', cm: 171, age: 24, vv: 0, role: '擲弾兵の軍曹', desc: '黒いウェーブ。列を乱されるのが嫌い。', face: 0, at: [-6.2, -7.5], y: FR_DECK, patrol: [[-6.4, -7.5], [1.2, -7.6]] },
};
const FR_JP = {
  sumi: { girl: () => SEC_ID, name: '秘書課 白瀬 澄', pers: '冷静', cm: 160, vv: 1, role: '秘書課', face: Math.PI, at: [-1.45, 10.1] },
  fumi: { girl: () => FUMI_ID, name: '秘書課 綾瀬 文乃', pers: '陽気', cm: 157, vv: 1, role: '秘書課・母方のハトコ', face: Math.PI, at: [-2.7, 11.5] },
  ojou: { girl: () => OJOU_ID, name: '秘書課 西園寺 すみれ', pers: '冷静', cm: 158, vv: 0, role: '侍大将・父方の遠縁', face: Math.PI, at: [1.35, 9.9] },
  sec2: { girl: () => SEC2_ID, name: '秘書課 早瀬 ことね', pers: '臆病', cm: 158, vv: 2, role: '秘書課・母方のハトコ', face: Math.PI, at: [2.65, 11.35] },
  eleanor: { girl: () => 'uk06', name: 'エレノア・アシュコム', en: 'Lady Eleanor Ashcombe', pers: '冷静', cm: 170, vv: 0, role: '降伏した英国の使者', face: Math.PI, at: [0.15, 12.55] },
};
const FR_WHO = { king: '殿', narr: '', sumi: '秘書課 白瀬 澄', fumi: '秘書課 綾瀬 文乃', ojou: '秘書課 西園寺 すみれ', sec2: '秘書課 早瀬 ことね', eleanor: 'エレノア・アシュコム' };
let FRM = null;
function frMats() {
  if (FRM) return FRM;
  const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  const deck = canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 16) for (let x = -rand(0, 80); x < w;) { const l = rand(-18, 14), ww = rand(70, 170); g.fillStyle = `rgb(${132 + l | 0},${104 + l | 0},${72 + l | 0})`; g.fillRect(x, y, ww - 2, 15); g.fillStyle = 'rgba(40,26,14,.55)'; g.fillRect(x + ww - 2, y, 2, 15); x += ww; }
    for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(30,20,10,.65)'; g.fillRect(0, y + 15, w, 1.4); }
  }, 1);
  const sea = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1c4e72'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${rand(12, 36) | 0},${rand(60, 100) | 0},${rand(110, 150) | 0},.35)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(18, 55), rand(3, 9), rand(-0.3, 0.3), 0, 7); g.fill(); }
    for (let i = 0; i < 180; i++) { g.fillStyle = `rgba(220,235,245,${rand(0.08, 0.35)})`; g.fillRect(Math.random() * w, Math.random() * h, rand(6, 18), 1.2); }
  }, 1);
  sea.wrapS = sea.wrapT = THREE.RepeatWrapping; sea.repeat.set(48, 48);
  const tri = canvasTex(90, 60, (g, w, h) => { g.fillStyle = '#0055a4'; g.fillRect(0, 0, w / 3, h); g.fillStyle = '#f4f4f4'; g.fillRect(w / 3, 0, w / 3, h); g.fillStyle = '#ef4135'; g.fillRect(2 * w / 3, 0, w / 3 + 1, h); });
  const plaster = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e6e0d2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const l = rand(-16, 10); g.fillStyle = `rgba(${210 + l | 0},${204 + l | 0},${188 + l | 0},.45)`; g.fillRect(Math.random() * w, Math.random() * h * 0.7, rand(1, 3), rand(1, 3)); }
    g.fillStyle = '#3d3228'; g.fillRect(0, h * 0.62, w, h * 0.38);
    for (const x of [w * 0.18, w * 0.62]) { g.fillStyle = '#241c16'; g.fillRect(x, h * 0.22, w * 0.16, h * 0.22); g.strokeStyle = '#8d7048'; g.strokeRect(x, h * 0.22, w * 0.16, h * 0.22); }
  });
  FRM = { L, deck: L(0xffffff, { map: deck }), sea: L(0xffffff, { map: sea }), hull: L(0x1a2433), stripe: L(0x9e2b2b), white: L(0xe7e2d6), wood: L(0x6b5340), woodD: L(0x3c2c20), gold: L(0xb08d45), iron: L(0x2c2e32), sail: L(0xd5d0c2), grass: L(0x6d7c48), sand: L(0xcbb892), stone: L(0x8a877e), plaster: L(0xffffff, { map: plaster }), roof: L(0x3e4450), beam: L(0x4a3828), bamboo: L(0xc6a15a), leaf: L(0x6a8744), tri: L(0xffffff, { map: tri, side: THREE.DoubleSide }), rope: new THREE.LineBasicMaterial({ color: 0x3a3128 }) };
  return FRM;
}
function frFloor(x0, x1, z0, z1, y) { const f = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y, fr: true }; floors.push(f); return f; }
function frSolid(x0, x1, z0, z1, y0, y1) { boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 }); }
function frBox(w, h, d, x, y, z, mat, ry) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; stageRoot.add(m); return m; }
function frCyl(r0, r1, h, x, y, z, mat, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg || 10), mat); m.position.set(x, y, z); m.castShadow = true; stageRoot.add(m); return m; }
function buildFrDeclare() {
  const M = frMats();
  FR.flags = [];
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), M.sea); sea.rotation.x = -Math.PI / 2; sea.position.y = 0; stageRoot.add(sea); FR.sea = sea;
  // 岸：桟橋と、その奥の土地
  frBox(38, 0.42, 23, 0, FR_QUAY - 0.21, 11.2, M.wood);
  frFloor(-18.6, 18.6, 0.05, 22.4, FR_QUAY);
  for (const x of [-16, -10, -4, 2, 8, 14]) for (const z of [2, 8, 14, 20]) frCyl(0.18, 0.22, 1.3, x, 0.15, z, M.woodD, 7);
  frBox(96, 0.5, 36, 0, FR_QUAY - 0.25, 39, M.grass);
  frFloor(-46, 46, 21.6, 54, FR_QUAY);
  frBox(120, 0.2, 28, 0, FR_QUAY - 0.05, 16, M.sand); // 砂の縁は桟橋の下に隠れ、両脇だけ見える
  for (const [x, z, sx, sy] of [[-80, 78, 70, 28], [20, 96, 90, 36], [110, 70, 60, 22]]) { const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), M.L(0x5d7354)); h.scale.set(sx, sy, 40); h.position.set(x, FR_QUAY + sy * 0.15, z); stageRoot.add(h); }
  // 家、竹束、帰りの幟
  const house = (x, z, w, d, hgt) => {
    frBox(w, hgt, d, x, FR_QUAY + hgt / 2, z, M.plaster);
    frBox(w + 0.8, 0.16, d + 0.8, x, FR_QUAY + hgt + 0.5, z, M.roof);
    frBox(0.3, 0.7, d + 0.9, x, FR_QUAY + hgt + 0.95, z, M.beam);
    frSolid(x - w / 2, x + w / 2, z - d / 2, z + d / 2, FR_QUAY, FR_QUAY + hgt);
  };
  house(-16, 38, 8, 6.5, 3.4); house(3.5, 42, 9, 7, 3.6); house(22, 36.5, 7.5, 6, 3.2);
  for (const [x, z] of [[-8.5, 29], [11.5, 28.2], [16, 30]]) {
    for (let i = 0; i < 7; i++) { const b = frCyl(0.07, 0.08, 2.3, x + (i - 3) * 0.16, FR_QUAY + 0.7, z, M.bamboo, 6); b.rotation.z = rand(-0.08, 0.08); }
    frCyl(0.55, 0.5, 0.35, x, FR_QUAY + 0.2, z, M.leaf, 8);
  }
  const nb = nobori(FR.banner[0], FR.banner[1], '#16233f', '#f3ecdc', '幕'); nb.position.y = FR_QUAY;
  // コルベット（船首 +x）。甲板の当たりは甲板より下で止める
  const hz = -8.5;
  frBox(26.5, 2.35, 5.7, 1.2, 0.95, hz, M.hull);
  frBox(24.8, 0.28, 5.85, 0.6, 1.95, hz, M.stripe);
  frBox(24.2, 0.22, 5.95, 0.5, 2.18, hz, M.white);
  const bow = frBox(4.2, 1.5, 2.4, 15.6, 1.15, hz, M.hull); bow.rotation.z = 0.15;
  frBox(24.6, 0.12, 5.15, 0.4, FR_DECK - 0.02, hz, M.deck);
  frFloor(-11.4, 13.4, hz - 2.35, hz + 2.6, FR_DECK);
  frSolid(-12.2, 14.2, hz - 2.7, hz + 2.7, 0, FR_DECK - 0.2);
  // 舷墙（舷梯の口は空ける）
  frBox(24, 0.85, 0.12, 0.2, FR_DECK + 0.42, hz - 2.45, M.woodD);
  frSolid(-11.6, 13.2, hz - 2.6, hz - 2.3, FR_DECK, FR_DECK + 0.9);
  frBox(10, 0.85, 0.12, -6.2, FR_DECK + 0.42, hz + 2.45, M.woodD);
  frBox(9, 0.85, 0.12, 6.6, FR_DECK + 0.42, hz + 2.45, M.woodD);
  frSolid(-11.4, -1.3, hz + 2.3, hz + 2.6, FR_DECK, FR_DECK + 0.9);
  frSolid(2.0, 11.2, hz + 2.3, hz + 2.6, FR_DECK, FR_DECK + 0.9);
  // 後甲板
  frBox(8.2, 1.15, 5.05, -7.4, FR_DECK + 0.52, hz, M.hull);
  frBox(8.0, 0.1, 4.7, -7.4, FR_QD, hz, M.deck);
  frFloor(-11.2, -3.5, hz - 2.15, hz + 2.15, FR_QD);
  for (let k = 0; k < 5; k++) {
    const y = FR_DECK + (k + 1) * ((FR_QD - FR_DECK) / 5);
    const z1 = hz + 1.15 - k * 0.42, z0 = z1 - 0.42;
    frBox(1.3, 0.08, 0.42, -3.15, y, (z0 + z1) / 2, M.wood);
    frFloor(-3.8, -2.5, z0, z1, y);
  }
  // 舷梯：甲板の口から桟橋へ。段差は 0.22m 以内
  { const n = 6, y0 = FR_QUAY, y1 = FR_DECK, zA = 0.15, zB = hz + 2.15;
    for (let k = 0; k < n; k++) {
      const y = y0 + (k + 1) * ((y1 - y0) / n);
      const z1 = zA + (k + 1) * ((zB - zA) / n), z0 = zA + k * ((zB - zA) / n);
      frBox(1.45, 0.08, Math.abs(z1 - z0) + 0.04, 0.15, y - 0.02, (z0 + z1) / 2, M.wood);
      frFloor(-0.55, 0.85, Math.min(z0, z1), Math.max(z0, z1), y);
    }
    for (const x of [-0.62, 0.92]) frBox(0.08, 0.7, 6.2, x, 1.7, -2.6, M.woodD);
  }
  // マスト、畳んだ帆、三色旗、砲（景色）
  for (const x of [5.5, -6.8]) {
    frCyl(0.16, 0.28, 8.5, x, FR_DECK + 4.2, hz, M.wood, 8);
    const yd = frCyl(0.08, 0.08, 4.2, x, FR_DECK + 7.2, hz, M.woodD, 6); yd.rotation.z = Math.PI / 2;
    const fur = frCyl(0.22, 0.22, 3.6, x, FR_DECK + 7.0, hz, M.sail, 8); fur.rotation.z = Math.PI / 2;
    frSolid(x - 0.35, x + 0.35, hz - 0.35, hz + 0.35, FR_DECK, FR_DECK + 2.2);
  }
  const flag = (x, y, z, w, h) => {
    const g = new THREE.PlaneGeometry(w, h, 8, 3); g.translate(w / 2, 0, 0);
    const m = new THREE.Mesh(g, M.tri); m.position.set(x, y, z); stageRoot.add(m);
    FR.flags.push({ m, base: g.attributes.position.array.slice() });
  };
  flag(5.5, FR_DECK + 8.8, hz, 1.8, 1.15);
  flag(-12.3, FR_QD + 3.4, hz, 2.2, 1.35);
  frCyl(0.06, 0.07, 3.2, -12.3, FR_QD + 1.7, hz, M.wood, 5);
  for (const s of [-1, 1]) for (const x of [-2.2, 3.4, 8.2]) {
    if (s > 0 && x > -1.2 && x < 2.2) continue;
    const gun = frCyl(0.09, 0.11, 1.15, x, 1.55, hz + s * 2.15, M.iron, 8); gun.rotation.x = Math.PI / 2 * s;
  }
  // 船尾の名
  { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#142033'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#e8d7a4'; g.font = 'bold 28px serif'; g.textAlign = 'center'; g.fillText('LIBERTÉ', 128, 42); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: t })); p.position.set(-12.55, 1.7, hz); p.rotation.y = -Math.PI / 2; stageRoot.add(p); }
  // 太鼓、樽、気球
  const drum = frCyl(0.28, 0.28, 0.42, -4.6, FR_DECK + 0.28, -7.0, M.stripe, 12); drum.rotation.x = 0.4;
  frCyl(0.32, 0.28, 0.7, 6.2, FR_DECK + 0.35, -6.6, M.wood, 10);
  frCyl(0.32, 0.28, 0.7, 6.5, FR_DECK + 0.35, -7.2, M.wood, 10);
  const bal = new THREE.Mesh(new THREE.SphereGeometry(1.55, 18, 12), M.tri); bal.scale.y = 1.2; bal.position.set(-15.5, FR.balloonY, 6.2); stageRoot.add(bal); FR.balloon = bal;
  frBox(0.7, 0.45, 0.7, -15.5, FR_QUAY + 0.3, 6.2, M.wood);
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-15.5, FR_QUAY + 0.5, 6.2, -15.5, FR.balloonY - 1.5, 6.2], 3)); stageRoot.add(new THREE.Line(g, M.rope)); FR.tether = g; }
  // 遠くの瑞鳳丸（乗れない）
  frBox(16, 3.2, 3.4, 62, 2.0, -42, M.white);
  frBox(4, 2.2, 2.2, 66, 4.4, -42, M.L(0xd9d3c6));
  frCyl(0.35, 0.45, 2.4, 67.2, 6.2, -42, M.L(0xc4553a), 8);
  frBox(2.2, 1.6, 0.15, 54.2, 3.2, -42, M.tri);
  // 桟橋の灯
  for (const x of [-12, 12]) { const Lgt = new THREE.PointLight(0xffc58a, 0.55, 14, 2); Lgt.position.set(x, 3.2, 6); stageRoot.add(Lgt); frCyl(0.08, 0.08, 1.6, x, FR_QUAY + 0.8, 6, M.woodD, 5); }
}
function frSpawnOne(girlId, x, z, y, team, info, extra) {
  if (!GIRLS[girlId]) { console.warn('fr photo missing', girlId); return null; }
  const e = spawnEnemy(x, z, 'mob', false, team, { girl: girlId, y, yari: -1, set: Object.assign({ special: true, ukNpc: true, state: 'idle', frInfo: info }, extra || {}) });
  if (!e) return null;
  Object.assign(e.prof, { name: info.name, pers: info.pers, cm: info.cm, vv: info.vv || 1 });
  e.P = PERS[info.pers] || e.P; e.figH = info.cm / 100;
  if (e.girl && e.girl.front) setFrame(e, e.girl.front, false);
  e.home = [x, z]; e.ukFace = info.face; e.s.rotation.y = e.face = info.face;
  e.ukPatrol = info.patrol ? info.patrol.map(q => q.slice()) : null; e.ukPi = 0; e.ukPT = rand(4, 8);
  e.speed = 1.05; e.mk.visible = false; e.baseY = y; e.frFloorY = y; e.onFloor = null;
  e.ukTag = info.en ? `${info.name}（${info.role}）` : `${info.name}（${info.role || '同席'}）`;
  return e;
}
function frSpawnAll() {
  FR.girls = []; FR.by = {}; FR.jp = []; FR.jpBy = {};
  for (const id in FR_PROF) {
    const G = FR_PROF[id];
    const e = frSpawnOne(id, G.at[0], G.at[1], G.y, 'orange', G, { frId: id });
    if (!e) continue;
    FR.girls.push(e); FR.by[id] = e;
  }
  for (const k in FR_JP) {
    const J = FR_JP[k], gid = J.girl();
    const e = frSpawnOne(gid, J.at[0], J.at[1], FR_QUAY, 'blue', J, { frJp: k });
    if (!e) continue;
    FR.jp.push(e); FR.jpBy[k] = e;
  }
}
function frOnFoot(x, z, y) { return floors.some(f => f.fr && x > f.x0 - 0.2 && x < f.x1 + 0.2 && z > f.z0 - 0.2 && z < f.z1 + 0.2 && f.y <= y + 0.48 && f.y >= y - 0.9); }
function frPlayerClamp() {
  const P = player.pos;
  if (P.y < 0.35 && FR.lastOk) { P.x = FR.lastOk[0]; P.z = FR.lastOk[1]; P.y = FR.lastOk[2] || FR_QUAY; player.vy = 0; return; }
  if (frOnFoot(P.x, P.z, P.y)) { FR.lastOk = [P.x, P.z, P.y]; return; }
  if (FR.lastOk) { P.x = FR.lastOk[0]; P.z = FR.lastOk[1]; if (FR.lastOk[2] != null && P.y < FR.lastOk[2] - 0.2) P.y = FR.lastOk[2]; }
}
function frReset() {
  FR.phase = 'open'; FR.t = 0; FR.talked = new Set(); FR.parleyDone = false; FR.pick = ''; FR.ended = false; FR.near = null; FR.goal = '';
  UK.dlg = null; ukChoiceOff(); if ($('ukdlg')) $('ukdlg').style.display = 'none';
  player.pos.set(0.1, FR_QUAY, 14.6); player.yaw = 0; player.pitch = 0.04; FR.lastOk = [0.1, 14.6, FR_QUAY];
}
function frRemember(k) { FR.pick = k; try { localStorage.setItem('onnaFrAct1', k); } catch (e) {} }
function frStart() {
  frSpawnAll();
  FR.phase = 'open'; FR.goal = '沖の船と、岸に下りた使者を見よ';
  if (VoicePack.ok && window.VOICE_FR) for (const k in window.VOICE_FR) { const L = window.VOICE_FR[k]; if (L.file) VoicePack.load(L.file, /^(sumi_open|fumi_open|ojou_open|eleanor_warn|chloe_hail|elise_|helene_1)/.test(k)); }
  showBanner('フランス人形編 第一幕「宣戦」', '三色の旗が、王の港に来た');
  ukDlg([
    { wait: 1.1 }, { say: 'sumi_open' }, { say: 'fumi_open' }, { say: 'ojou_open' }, { say: 'eleanor_warn' },
    { fn: () => { FR.phase = 'approach'; FR.goal = '岸の使者に近づけ（E で話す）'; popup('桟橋を進んで、使者に近づけ'); } },
  ]);
}
function frParley() {
  if (FR.parleyDone || FR.phase === 'parley' || UK.dlg) return;
  FR.phase = 'parley'; FR.goal = '使者エリーズと会見中';
  ukDlg([
    { say: 'chloe_hail' }, { say: 'elise_1' }, { say: 'elise_2' }, { say: 'elise_3' }, { say: 'helene_1' },
    { say: 'sumi_caution' }, { say: 'fumi_retort' }, { say: 'ojou_calm' },
    { choice: [
      { label: '「断る。侍女たちは俺の所有物ではない。自分の意志で、俺の側に立っている」', sub: '解放という名の要求を拒む', then: [{ fn: () => frRemember('refuse') }, { say: 'king_A' }, { say: 'elise_rA' }] },
      { label: '「解放とは、誰が決める。彼女たち自身の口から聞こう」', sub: '本人の意思を先に置く', then: [{ fn: () => frRemember('ask') }, { say: 'king_B' }, { say: 'elise_rB' }] },
      { label: '「戦は望まぬ。だが、この港と、この者たちは渡さん」', sub: '開戦は避ける、譲りはしない', then: [{ fn: () => frRemember('peace') }, { say: 'king_C' }, { say: 'elise_rC' }] },
    ] },
    { say: 'elise_close' }, { say: 'margaux_drum' },
    { fn: () => { FR.parleyDone = true; FR.phase = 'after'; FR.goal = '岸の奥の幟まで行き、この幕を終えよ（E）'; showBanner('言葉は尽きた', '幟は、家々の手前'); popup('フランスの娘たちとも話せる'); } },
  ]);
}
function frGirlTalk(e) {
  const id = e.frId; FR.talked.add(id);
  const menu = () => ({ choice: [
    { label: '「名と、役目を」', then: [{ say: id + '_who' }, { fn: () => UK.dlg && UK.dlg.q.unshift(menu()) }] },
    { label: '「誰のために戦う」', then: [{ say: id + '_why' }, { fn: () => UK.dlg && UK.dlg.q.unshift(menu()) }] },
    { label: '「……また会おう」', sub: '話を終える', then: [{ say: id + '_bye' }] },
  ] });
  ukDlg([{ say: id + '_intro' }, menu()]);
}
function frTalkNear() {
  if (UK.dlg || state !== 'play' || FR.phase === 'open' || FR.phase === 'end') return null;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best = null, bs = 1e9, near = null, nd = 1.7;
  for (const e of FR.girls.concat(FR.jp)) {
    if (!isUp(e) || Math.abs(player.pos.y - e.baseY) > 1.35) continue;
    const dx = e.s.position.x - player.pos.x, dz = e.s.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < nd) { nd = d; near = e; }
    if (d > 0.25 && d < 3.5) { const dot = (dx * fx + dz * fz) / d; if (dot > 0.42 && d < bs) { bs = d; best = e; } }
  }
  return best || near;
}
function frNearBanner() { return Math.hypot(player.pos.x - FR.banner[0], player.pos.z - FR.banner[1]) < 2.5 && player.pos.y < 2.2; }
function frUse() {
  if (UK.dlg) { ukDlgSkip(); return true; }
  if (FR.parleyDone && frNearBanner()) { frEnding(); return true; }
  const e = FR.near;
  if (!e) return false;
  if (e.frId === 'fr02' && !FR.parleyDone && (FR.phase === 'approach' || FR.phase === 'meet')) { frParley(); return true; }
  if (e.frId) { frGirlTalk(e); return true; }
  if (e.frJp) { ukDlg([{ say: e.frJp + '_talk' }]); return true; }
  return false;
}
function frEnding() {
  if (FR.ended) return; FR.ended = true; FR.phase = 'end';
  state = 'over'; player.drawing = false; $('banner').style.opacity = 0; bannerTimer = 0;
  if ($('ukdlg')) $('ukdlg').style.display = 'none'; UK.dlg = null; ukChoiceOff();
  const h1 = document.querySelector('#over h1'), h2 = document.querySelector('#over h2');
  const word = FR.pick === 'ask' ? '本人の意思を聞いた' : FR.pick === 'peace' ? '戦は望まぬと告げた' : '要求を退けた';
  if (h1) h1.textContent = '第一幕「宣戦」 完';
  if (h2) h2.textContent = 'フランス人形編 ― ' + word;
  $('result').innerHTML = '共和国は、侍女たちを「王の所有」と呼んだ。岸に立つ者たちは、自分の意志でここにいる。<br><b>次の幕は、上陸である。</b><br><span style="opacity:.8">選択は残してある（' + (FR.pick || 'refuse') + '）。太鼓は、もう鳴った。</span>';
  if (document.exitPointerLock) document.exitPointerLock();
  $('over').style.display = 'flex';
}
function frTargetHtml(t, pic) {
  const I = t.frInfo || {};
  const side = t.frJp === 'eleanor' ? '英国' : t.team === 'blue' ? '日本' : 'フランス共和国';
  return (pic ? `<img src="${pic}" alt="">` : '') + `<u style="color:${t.team === 'blue' ? '#7cc0ff' : '#ffb070'}">${side}</u><small class="sq">${I.role || ''}</small><b>${t.prof.name}</b><span>${I.en ? I.en + '・' : ''}${I.age ? I.age + '歳・' : ''}${I.cm || t.prof.cm}cm<br>${I.desc || ''}</span>`;
}
function updateFr(dt) {
  if (!FR.on) return;
  const M = frMats();
  if (M.sea.map) M.sea.map.offset.set((time * 0.004) % 1, (time * 0.0022) % 1);
  if (FR.balloon) { FR.balloon.position.y = FR.balloonY + Math.sin(time * 0.7) * 0.28; FR.balloon.rotation.y = Math.sin(time * 0.3) * 0.15; }
  for (const F of FR.flags) { const p = F.m.geometry.attributes.position, a = p.array, b = F.base; for (let i = 0; i < a.length; i += 3) { const u = Math.abs(b[i]) / 2.2; a[i + 2] = b[i + 2] + Math.sin(time * 3.4 + b[i] * 2.2) * 0.18 * u; } p.needsUpdate = true; }
  if (state !== 'play') return;
  ukSeaSound(dt);
  for (const e of FR.girls.concat(FR.jp)) if (isUp(e) && e.frFloorY != null) e.baseY = e.frFloorY;
  for (const e of FR.girls) {
    if (e.ukPatrol && FR.phase !== 'parley' && !(e.ukTalkT > time) && !(UK.dlg && FR.near === e)) { if ((e.ukPT -= dt) <= 0) { e.ukPi ^= 1; e.home = e.ukPatrol[e.ukPi].slice(); e.ukPT = rand(6, 11); } }
  }
  FR.t += dt;
  if (FR.phase === 'approach' && !UK.dlg && !FR.parleyDone && FR.by.fr02) {
    const e = FR.by.fr02;
    if (Math.hypot(player.pos.x - e.s.position.x, player.pos.z - e.s.position.z) < 3.3 && Math.abs(player.pos.y - e.baseY) < 0.8) frParley();
  }
  ukDlgTick(dt);
  FR.near = frTalkNear();
  for (const e of FR.girls.concat(FR.jp)) { const d = Math.hypot(e.s.position.x - camera.position.x, e.s.position.z - camera.position.z); e.s.visible = !(d < 0.75 && Math.abs(camera.position.y - e.baseY - 1.15) < 1.3); }
  document.documentElement.classList.toggle('ukdlgon', !!UK.dlg);
}
function frTalkHud() {
  const tk = $('talk'); if (!tk) return;
  let show = '', label = '';
  if (FR.parleyDone && !UK.dlg && frNearBanner()) { show = '1'; label = '岸の幟に触れ、この幕を終える（E）'; }
  else if (FR.near && !UK.dlg) { show = '1'; label = `${FR.near.ukTag || FR.near.prof.name} と話す（E）`; }
  tk.textContent = label; tk.style.opacity = show ? 1 : 0; document.documentElement.classList.toggle('cantalk', !!show);
}
if (TEST) window.__fr = { FR, use: () => frUse(), parley: () => frParley(), end: () => frEnding() };
