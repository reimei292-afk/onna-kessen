// ====================================================================
//  フランス人形編 第二幕「上陸」（?stage=frLand）
//  英国の港を、日本と降伏した英国勢で守る。共和国は数と縦隊と砲で取りに来る。
//  砲は人に直撃させない（着弾点は人から 2.6m 以上、赤い輪のあと破片だけ）。
//  第一幕の選択 localStorage onnaFrAct1（refuse / ask / peace）で口上と進み方が変わる。
//  フランス語＋日本語字幕、エレノアは英語、侍女は日本語。殿は字幕だけ。
// ====================================================================
var FR2 = { on: false, phase: 'off', t: 0, pt: 0, pick: 'none', by: {}, jpBy: {}, card: {}, list: [], boats: [], shells: [], flashes: [], houses: [], slots: [],
  said: {}, goal: '', ended: false, win: false, lastOk: null, sea: null, balloon: null, flags: [], muz: null, frontZ: 1.2, frontGo: false, didC: false, landAt: 0, fillI: 0, volT: 0, salvoT: 0 };
const FR2_WHO = { king: '殿', sumi: '秘書課 白瀬 澄', fumi: '秘書課 綾瀬 文乃', ojou: '秘書課 西園寺 すみれ', sec2: '秘書課 早瀬 ことね', eleanor: 'エレノア・アシュコム' };
const FR2_FILL = ['マリー・ルルー', 'アンヌ・ペルティエ', 'ルイーズ・ブラン', 'ジャンヌ・カレル', 'クレール・アンセル', 'ソフィ・メルシエ', 'ヴァランティーヌ・プリウール', 'アガト・ルノワール', 'コレット・ファヴル', 'ブリス・マッソン', 'オデット・カルパン', 'ニノン・ルガル', 'イレーヌ・バザン', 'セレスト・プリエ', 'ロール・アミオ', 'デジレ・バロン'];
const FR2_UKN = ['グレース・ターナー', 'ルーシー・ベル', 'ハンナ・プライス', 'ソフィー・ウォード'];
function fr2PickStore() { let v = ''; try { v = localStorage.getItem('onnaFrAct1') || ''; } catch (e) {} return (v === 'refuse' || v === 'ask' || v === 'peace') ? v : 'none'; }
function fr2GirlN(i) { const n = (i % 10) + 1; return 'fr' + (n < 10 ? '0' : '') + n; }
function fr2Unsquad(e) {
  if (!e || !e.sq) return;
  const s = e.sq, i = s.members ? s.members.indexOf(e) : -1;
  if (i >= 0) s.members.splice(i, 1);
  if (s.leader === e) s.leader = s.members && s.members.find(isUp) || null;
  e.sq = null;
}
function buildFrLand() {
  const M = frMats();
  FR2.houses = []; FR2.slots = []; FR2.flags = []; FR2.boats = [];
  BEACH.boats = [];
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 900), M.sea); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.16, -280); stageRoot.add(sea); FR2.sea = sea;
  const shal = new THREE.Mesh(new THREE.PlaneGeometry(220, 16), new THREE.MeshLambertMaterial({ color: 0x2f7ea4, transparent: true, opacity: 0.55, depthWrite: false }));
  shal.rotation.x = -Math.PI / 2; shal.position.set(0, -0.12, -6); shal.renderOrder = 1; stageRoot.add(shal);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(220, 1.3), new THREE.MeshBasicMaterial({ color: 0xe7f3f8, transparent: true, opacity: 0.55, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, -0.08, -0.6); foam.renderOrder = 2; stageRoot.add(foam); FR2.foam = foam;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(220, 22), M.sand); sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, 8); sand.receiveShadow = true; stageRoot.add(sand);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 80), M.grass); grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0.01, 48); grass.receiveShadow = true; stageRoot.add(grass);
  for (const [x, z, sx, sy, sz] of [[-90, 90, 70, 26, 40], [40, 110, 90, 32, 46], [120, 70, 50, 18, 36], [-140, -20, 40, 16, 60], [150, -10, 46, 18, 50]]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.L(0x5c734c)); h.scale.set(sx, sy, sz); h.position.set(x, sy * 0.15, z); stageRoot.add(h);
  }
  // 石の埠頭（英国の港）。低いので砂から上がれる
  frBox(7.2, 0.32, 22, -20, 0.16, -5, M.stone);
  frFloor(-23.5, -16.5, -15.6, 5.4, 0.32);
  for (const z of [-14, -8, -2, 4]) for (const x of [-23.2, -16.8]) frCyl(0.16, 0.2, 1.5, x, -0.4, z, M.woodD, 6);
  frBox(4.2, 0.9, 3.2, -20, 0.7, 3.2, M.wood); // 上屋
  const nb = nobori(-16.2, 4.2, '#1a2744', '#f4efe2', '港'); nb.position.y = 0.32;
  // 竹束（三つの道を残す）と土塁
  for (let x = -28; x <= 28.01; x += 2) {
    if (Math.abs(x) < 2.4 || Math.abs(x - 17) < 2.3 || Math.abs(x + 16) < 2.3) continue;
    bamboobundle(x, 13, rand(-0.05, 0.05), { hp: 4 });
    FR2.slots.push({ x, z: 14.6 });
  }
  const berm = (x0, x1) => {
    frBox(x1 - x0, 1.05, 1.5, (x0 + x1) / 2, 0.5, 17.6, M.L(0x6d5a40));
    for (let x = x0 + 0.8; x < x1; x += 1.5) colliders.push({ x, z: 17.6, r: 0.7 });
  };
  berm(-30, -8); berm(8, 30);
  // 煉瓦の町家
  const brick = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8d4d3a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? -16 : 0; x < w; x += 32) { g.fillStyle = `rgb(${150 + rand(-18, 12) | 0},${70 + rand(-10, 10) | 0},${52 + rand(-8, 8) | 0})`; g.fillRect(x + 1, y + 1, 30, 8); }
    g.strokeStyle = 'rgba(60,30,24,.45)'; for (let y = 0; y < h; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const brickM = M.L(0xffffff, { map: brick }), roofM = M.L(0x4a4038);
  const house = (x, z, w, d, hgt) => {
    frBox(w, hgt, d, x, hgt / 2, z, brickM);
    frBox(w + 0.7, 0.16, d + 0.8, x, hgt + 0.35, z, roofM);
    frBox(0.28, 1.1, 0.28, x + w * 0.28, hgt + 0.9, z - d * 0.2, M.L(0x6a5a50));
    const B = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: hgt + 0.6 };
    FR2.houses.push(B);
    frSolid(B.x0, B.x1, B.z0, B.z1, 0, hgt);
    for (let sx = B.x0 + 1; sx < B.x1 - 0.4; sx += 1.6) FR2.slots.push({ x: sx, z: B.z1 + 1.1 });
  };
  house(-26, 34, 8, 6, 3.3); house(-10, 38, 7.2, 5.6, 3.1); house(12, 36, 8.4, 6.2, 3.5); house(28, 33, 7, 5.4, 3.0);
  for (const [x, z] of [[-34, 46], [-18, 52], [6, 50], [24, 54], [36, 44]]) tree(x, z, rand(0.85, 1.15));
  buildMedPost(-6, 42, 'blue');
  nobori(1.2, 26, '#16233f', '#f3ecdc', '陣');
  // 沖のコルベット（乗れない）。砲口は浜の方
  fr2Ship(-2, -54);
  // 奪った英国のブリッグ（埠頭の脇、帆は畳む）
  fr2Prize(30, -16);
  // 偵察気球
  const bal = new THREE.Group();
  const envTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#d7b25a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d4e89'; g.fillRect(0, 0, w * 0.18, h); g.fillStyle = '#ef4135'; g.fillRect(w * 0.82, 0, w * 0.18, h); });
  const env = new THREE.Mesh(new THREE.SphereGeometry(2.3, 18, 14), M.L(0xffffff, { map: envTex })); env.scale.y = 1.15; bal.add(env);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.7), M.wood); basket.position.y = -2.7; bal.add(basket);
  for (const s of [-0.3, 0.3]) for (const t of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 4), M.rope); r.position.set(s, -2.05, t); bal.add(r); }
  bal.position.set(16, 18, -24); stageRoot.add(bal); FR2.balloon = bal;
  const fl = fr2Flag(16, 15.6, -24); FR2.flags.push(fl);
}
function fr2Flag(x, y, z) {
  const M = frMats(), g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 5), M.woodD); pole.position.y = 1.1; g.add(pole);
  const geo = new THREE.PlaneGeometry(1.5, 0.9, 6, 2); geo.translate(0.75, 0, 0);
  const m = new THREE.Mesh(geo, M.tri); m.position.set(0, 1.7, 0); g.add(m);
  g.position.set(x, y, z); stageRoot.add(g);
  return { m, base: geo.attributes.position.array.slice() };
}
function fr2Ship(x, z) {
  const M = frMats(), deckY = 2.15;
  frBox(22, 2.1, 5.2, x, 0.9, z, M.hull);
  frBox(20.5, 0.22, 5.35, x, 1.85, z, M.stripe);
  frBox(20, 0.16, 5.45, x, 2.05, z, M.white);
  frBox(20.2, 0.1, 4.6, x, deckY, z, M.deck);
  frBox(6.2, 1.0, 4.7, x - 6.2, deckY + 0.55, z, M.hull);
  for (const mx of [x + 4.2, x - 5.5]) {
    frCyl(0.14, 0.22, 7.2, mx, deckY + 3.5, z, M.wood, 8);
    const yd = frCyl(0.06, 0.06, 3.4, mx, deckY + 6.2, z, M.woodD, 5); yd.rotation.z = Math.PI / 2;
    const fur = frCyl(0.18, 0.18, 3.0, mx, deckY + 6.0, z, M.sail, 8); fur.rotation.z = Math.PI / 2;
  }
  // 浜側の砲
  for (const gx of [x - 3, x + 1, x + 5]) { const gun = frCyl(0.09, 0.11, 1.3, gx, deckY + 0.35, z + 2.15, M.iron, 8); gun.rotation.x = Math.PI / 2; }
  FR2.flags.push(fr2Flag(x - 8.2, deckY, z));
  FR2.flags.push(fr2Flag(x + 6.4, deckY + 6.4, z));
  const plate = canvasTex(256, 48, (g, w, h) => { g.fillStyle = '#1a2433'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2efe6'; g.font = 'bold 28px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LIBERTÉ', w / 2, h / 2); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), M.L(0xffffff, { map: plate })); sign.position.set(x + 9.2, 1.7, z + 2.55); stageRoot.add(sign);
  FR2.deck = { x, z, y: deckY + 0.15 };
  FR2.muz = new V3(x + 1, deckY + 0.5, z + 2.8);
  // 甲板に立つ使者の足場（当たりは船の中だけ。海へは落とさない）
  frFloor(x - 9, x + 8, z - 2.1, z + 2.1, deckY + 0.12);
}
function fr2Prize(x, z) {
  const M = frMats();
  frBox(14, 1.5, 3.6, x, 0.7, z, M.L(0x2a313c));
  frBox(12.5, 0.1, 3.2, x, 1.5, z, M.deck);
  frCyl(0.1, 0.16, 5.5, x + 1.5, 4.1, z, M.wood, 7);
  const fur = frCyl(0.16, 0.16, 2.4, x + 1.5, 6.2, z, M.sail, 7); fur.rotation.z = Math.PI / 2;
  // 降ろした白い旗（降伏のまま）
  const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), M.L(0xe8e6e0, { side: THREE.DoubleSide })); w.position.set(x + 1.5, 5.4, z); w.rotation.y = 0.4; stageRoot.add(w);
}
function fr2Spawn(id, x, z, team, opt) {
  opt = opt || {};
  const named = !!(id && typeof FR_PROF !== 'undefined' && FR_PROF[id]);
  const girl = named ? id : (opt.girl || fr2GirlN(FR2.fillI + 1));
  const e = spawnEnemy(x, z, opt.kind || 'mob', false, team, { girl: GIRLS[girl] ? girl : undefined, y: opt.y || 0, yari: opt.yari != null ? opt.yari : -1, set: opt.set || {} });
  if (!e) return null;
  if (named) {
    const G = FR_PROF[id];
    Object.assign(e.prof, { name: G.name, pers: G.pers, cm: G.cm, vv: G.vv });
    e.P = PERS[G.pers]; e.figH = G.cm / 100;
    e.frInfo = { role: G.role, en: G.en, age: G.age, cm: G.cm, desc: G.desc };
    e.frId = id; e.ukTag = G.name; FR2.by[id] = e;
    if (FR_PROF[id]) FR2.card[id] = FR_PROF[id];
  } else if (opt.jp) {
    const J = opt.jp;
    Object.assign(e.prof, { name: J.name, pers: J.pers, cm: J.cm, vv: J.vv || 1 });
    e.P = PERS[J.pers] || e.P; e.figH = J.cm / 100;
    e.frInfo = { role: J.role, en: J.en || '', cm: J.cm, desc: J.desc || '' };
    e.frJp = J.key; e.ukTag = J.name; FR2.jpBy[J.key] = e; FR2.card[J.key] = J;
  } else {
    const nm = opt.ukName || FR2_FILL[FR2.fillI % FR2_FILL.length]; FR2.fillI++;
    e.prof.name = nm; e.ukTag = nm;
    e.frInfo = { role: opt.role || '国民兵', en: opt.en || 'Volunteer', cm: e.prof.cm, desc: opt.desc || '自分の意志で銃を取った共和国の市民。練度より数で押す。' };
    e.frId = 'fill';
  }
  e.fr2 = true; e.hp = e.hpMax = opt.hp || (named ? 6 : 3); e.dmg = opt.dmg || (named ? 10 : 8);
  if (opt.gun) uk2Gun(e);
  if (opt.speed) e.speed *= opt.speed;
  if (opt.yari === 1 && e.spear) e.spear.scale.z = opt.lance ? 1.45 : 1;
  e.s.rotation.y = e.face = e.faceWant = team === 'blue' ? Math.PI : 0;
  e.fr2Post = [x, z];
  if (opt.aboard) { e.special = true; e.fr2Aboard = true; e.home = [x, z]; e.baseY = opt.y || 0; e.s.position.y = e.baseY; e.mk.visible = false; e.state = 'idle'; }
  fr2Unsquad(e);
  FR2.list.push(e);
  return e;
}
function fr2PlaceJp() {
  const J = [
    { key: 'ojou', girl: () => OJOU_ID, name: '秘書課 西園寺 すみれ', pers: '冷静', cm: 158, vv: 0, role: '侍大将・父方の遠縁', desc: '号令は出さない。正面の兵は、彼女の位置について動く。', at: [0.3, 19.5], yari: 1, hp: 8 },
    { key: 'fumi', girl: () => FUMI_ID, name: '秘書課 綾瀬 文乃', pers: '陽気', cm: 157, vv: 1, role: '側翼・母方のハトコ', desc: '岸の端を預かる。率直で、先に出る。', at: [18.2, 19.2], yari: 1, hp: 7 },
    { key: 'sumi', girl: () => SEC_ID, name: '秘書課 白瀬 澄', pers: '冷静', cm: 160, vv: 1, role: '秘書課', desc: '本陣で殿を諫める。血は繋がっていても、西園寺とは違う家。', at: [-1.6, 24.2], hp: 7 },
    { key: 'sec2', girl: () => SEC2_ID, name: '秘書課 早瀬 ことね', pers: '臆病', cm: 158, vv: 2, role: '秘書課・母方のハトコ', desc: '白瀬のそばにいる。', at: [2.0, 24.4], hp: 6 },
    { key: 'eleanor', girl: () => 'uk06', name: 'エレノア・アシュコム', en: 'Lady Eleanor Ashcombe', pers: '冷静', cm: 170, vv: 0, role: '英国隊の指揮官', desc: '降伏したあと、この港を日本と共に守っている。', at: [-15.2, 15.4], gun: true, hp: 7 },
  ];
  for (const o of J) {
    const gid = o.girl();
    const e = fr2Spawn(null, o.at[0], o.at[1], 'blue', { girl: gid, jp: o, hp: o.hp, yari: o.yari != null ? o.yari : -1, gun: o.gun, kind: 'mob' });
    if (e && o.gun) { e.fr2Shoot = true; e.frUk = o.key === 'eleanor'; }
  }
  for (let i = 0; i < 6; i++) {
    const e = fr2Spawn(null, -14 + i * 4.2, 15.2, 'blue', { kind: 'archer', yari: -1, hp: 3, role: '弓', desc: '竹束の陰から、縦隊の前を削る。' });
    if (e) e.fr2Post = [e.s.position.x, 15.2];
  }
  for (let i = 0; i < 4; i++) fr2Spawn(null, -4.5 + i * 3, 20.2, 'blue', { yari: 1, hp: 4, role: '長槍', desc: '西園寺の正面。声を待たず、列についている。' });
  for (let i = 0; i < 4; i++) fr2Spawn(null, 15 + i * 1.7, 20.4, 'blue', { yari: 1, hp: 4, role: '側翼の槍', desc: '綾瀬の側翼。回り込まれた列の脇を突く。' });
  for (let i = 0; i < 4; i++) {
    const id = ['uk01', 'uk02', 'uk05', 'uk08'][i];
    const e = fr2Spawn(null, -22 + i * 1.5, 16.2, 'blue', { girl: GIRLS[id] ? id : 'uk06', ukName: FR2_UKN[i], gun: true, hp: 3, yari: -1, role: '英国のマスケット', en: 'Musketeer', desc: '降伏のあと、エレノアとこの浜に残っている。' });
    if (e) { e.fr2Shoot = true; e.frUk = true; e.fr2Post = [e.s.position.x, 16.2]; }
  }
}
function fr2Aboard(id, x, z) {
  const y = FR2.deck ? FR2.deck.y : 2.3;
  return fr2Spawn(id, x, z, 'orange', { y, aboard: true, hp: id === 'fr02' ? 7 : 5, yari: -1 });
}
function fr2Drum(e) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 10), new THREE.MeshLambertMaterial({ color: 0x7a3424 }));
  shell.rotation.z = Math.PI / 2; g.add(shell);
  const skin = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), new THREE.MeshLambertMaterial({ color: 0xf3e6cc, side: THREE.DoubleSide }));
  skin.position.x = 0.12; skin.rotation.y = Math.PI / 2; g.add(skin);
  g.position.set(0.2, e.figH * 0.55, 0.08); e.tilt.add(g); e.fr2Drum = g;
}
function fr2Boat(name, x, z0) {
  const keep = BEACH.boats.slice();
  const B = makeBoat(80 + FR2.boats.length, x, z0, { sp: TEST ? 7.2 : 3.35, name });
  B.g.traverse(o => { if (o.isMesh && o.position.z < -3.2 && o.position.y > 0.5) o.visible = false; });
  for (const f of B.flags) f.visible = false;
  const M = frMats();
  const tri = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), M.tri); tri.position.set(0, 1.55, -4.15); B.g.add(tri); B.tri = tri;
  B.yaw = 0; B.st = 'go'; B.goal = -2.6; B.fr2 = true; B.wob = Math.random() * 6; B.row = 0; B.v = 0;
  FR2.boats.push(B);
  BEACH.boats = keep.concat([B]);
  return B;
}
function fr2Put(B, e, slot) {
  if (!e || !isUp(e)) return;
  e.special = false; e.fr2Aboard = false; e.mk.visible = true; e.onFloor = null;
  boardBoat(e, B, slot);
}
function fr2Launch(w) {
  if (FR2.launched && FR2.launched[w]) return;
  FR2.launched = FR2.launched || {}; FR2.launched[w] = true;
  if (w === 'A') {
    const B = fr2Boat('共和国の短艇', 0.4, -40);
    const col = [];
    col.push(fr2Spawn('fr01', B.x, B.z, 'orange', { gun: true, hp: 6, yari: -1 }));
    col.push(fr2Spawn('fr10', B.x, B.z, 'orange', { gun: true, hp: 6, yari: -1 }));
    for (let i = 0; i < 8; i++) col.push(fr2Spawn(null, B.x, B.z, 'orange', { gun: true, hp: 3, yari: -1, role: '縦隊の歩兵', desc: '太鼓に合わせて、縦に厚く進む。一人の練度より、止まらない列。' }));
    const drum = fr2Spawn('fr03', B.x, B.z, 'orange', { hp: 4, yari: -1 });
    if (drum) { fr2Drum(drum); drum.fr2Role = 'drum'; }
    let slot = 0;
    col.forEach((e, i) => {
      if (!e) return;
      e.fr2Role = 'column'; e.fr2File = i % 4; e.fr2Rank = (i / 4) | 0; e.fr2Form = true;
      if (FR2.pick === 'peace' && i >= 6) e.fr2Hes = true;
      fr2Put(B, e, slot++);
    });
    if (drum) fr2Put(B, drum, slot++);
    fr2Put(B, FR2.by.fr02, slot++);
    const el = FR2.by.fr02; if (el) { el.fr2Role = 'column'; el.fr2File = 1; el.fr2Rank = 3; el.fr2Form = true; el.hp = el.hpMax = 7; }
    FR2.col = col.filter(Boolean);
    if (drum) FR2.col.push(drum);
  } else if (w === 'B') {
    const B = fr2Boat('散兵の短艇', -16, -38);
    const s = [];
    s.push(fr2Spawn('fr04', B.x, B.z, 'orange', { gun: true, hp: 5, yari: -1 }));
    for (let i = 0; i < 5; i++) s.push(fr2Spawn(null, B.x, B.z, 'orange', { gun: true, hp: 3, yari: -1, role: '散兵', desc: '本隊の前にばらけ、物陰から隊長を狙う。' }));
    const med = fr2Spawn('fr05', B.x, B.z, 'orange', { hp: 5, yari: -1 });
    let slot = 0;
    s.forEach((e, i) => { if (!e) return; e.fr2Role = 'skirm'; e.fr2Form = true; e.fr2File = i; e.fr2Shoot = true; fr2Put(B, e, slot++); });
    if (med) { fr2Put(B, med, slot++); med.medic = true; med.special = true; med.role = 'nurse'; med.home = [-12, 4]; med.fr2Role = 'medic'; FR2.by.fr05 = med; }
  } else if (w === 'C') {
    const B = fr2Boat('胸甲騎兵の短艇', 12, -36);
    const s = [];
    s.push(fr2Spawn('fr06', B.x, B.z, 'orange', { yari: 1, lance: true, hp: 7, speed: 1.28, dmg: 12 }));
    s.push(fr2Spawn('fr08', B.x, B.z, 'orange', { yari: 1, lance: true, hp: 5, speed: 1.34, dmg: 10 }));
    for (let i = 0; i < 6; i++) s.push(fr2Spawn(null, B.x, B.z, 'orange', { yari: 1, lance: true, hp: 4, speed: 1.22, role: '胸甲騎兵', desc: '馬は浜に上げない。崩れた隙間へ、槍を揃えて走る。', dmg: 11 }));
    let slot = 0;
    s.forEach((e, i) => { if (!e) return; e.fr2Role = 'cav'; e.fr2Form = true; e.fr2File = i; fr2Put(B, e, slot++); });
  }
}
function fr2Beach(B) {
  let k = 0;
  for (const o of B.crew) if (isUp(o) && o.seated) { o.standAt = time + 0.15 + (k++) * 0.12; o.mk.visible = !o.medic || true; }
  B.st = 'beached';
  if (!FR2.frontGo && B === FR2.boats[0]) { FR2.frontGo = true; FR2.landAt = time; fr2Bark('margaux_drum'); fr2Bark('camille_land'); fr2Bark('severine_col'); if (FR2.pick === 'ask') fr2Bark('chloe_still'); fr2Bark('juliette_live'); fr2Bark('manon_bread'); }
  if (FR2.by.fr04 && B.crew.includes(FR2.by.fr04)) fr2Bark('ines_aim');
}
function fr2BoatTick(B, dt) {
  if (B.st === 'go') {
    const rem = B.goal - B.z, v = Math.min(B.sp, Math.sqrt(Math.max(0, 2 * 0.7 * Math.max(0, rem))) + 0.3);
    B.z += v * dt; B.row += dt * 2.8; B.v = v;
    if (B.z >= B.goal - 0.02) { B.z = B.goal; B.v = 0; fr2Beach(B); }
  } else if (B.st === 'leave') {
    B.v = Math.min(2.6, (B.v || 0) + dt * 0.7); B.z -= B.v * dt; B.row += dt * 2.4;
  }
  B.wob = (B.wob || 0) + dt;
  const moving = B.st === 'go' || B.st === 'leave';
  const bob = Math.sin(B.wob * 1.3 + B.i) * (B.st === 'beached' ? 0.01 : 0.035);
  B.g.position.set(B.x, BH.WATER + 0.04 + bob, B.z); B.g.rotation.set(0, B.yaw, moving ? Math.sin(B.wob * 0.9) * 0.02 : 0);
  for (const O of B.oars) { const a = moving ? Math.sin(B.row * 2 + O.ph) : 0.3; O.piv.rotation.set(0, O.s * a * 0.4, O.s * (moving ? Math.cos(B.row * 2 + O.ph) * 0.1 : 0.4)); }
  boatFloor(B); B.floor.y = B.g.position.y + BOAT_DECK;
  for (const o of B.crew) if (o.seated && o.seated.boat === B) { const [lx, lz] = BOAT_SEATS[o.boatSlot] || [0, 0], [wx, wz] = boatWorld(B, lx, lz); o.seated.x = wx; o.seated.z = wz; o.baseY = B.floor.y; o.s.rotation.y = B.yaw; }
}
function fr2SlotOf(e) {
  if (e.fr2Role === 'drum') return [-3.4, FR2.frontZ - 4.6];
  if (e.fr2Role === 'skirm') return [-20 + (e.fr2File || 0) * 1.35, 3.2];
  if (e.fr2Role === 'cav') return [8 + ((e.fr2File || 0) - 3) * 1.15, e.fr2Go ? 14 : 1.5];
  const f = e.fr2File || 0, r = e.fr2Rank || 0;
  return [(f - 1.5) * 1.2, FR2.frontZ - r * 1.2];
}
function fr2Release(role) {
  for (const e of enemies) if (e.fr2 && isUp(e) && (!role || e.fr2Role === role)) { e.fr2Form = false; e.fr2Free = true; e.passive = false; if (e.state === 'idle') e.state = 'approach'; }
}
function fr2NearFoe(e, r) {
  const p = e.s.position, team = e.team === 'blue' ? 'orange' : 'blue';
  if (e.team === 'orange' && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r) return true;
  for (const o of enemies) if (o.team === team && isUp(o) && !o.fr2Aboard && Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z) < r) return true;
  return false;
}
function fr2Blocked(ax, ay, az, bx, bz) {
  for (const b of FR2.houses) if (ay < b.h + 0.4 && segBox2(ax, az, bx, bz, b)) return true;
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  for (const c of covers) {
    const t = ((c.x - ax) * dx + (c.z - az) * dz) / L2; if (t <= 0.05 || t >= 0.98) continue;
    const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
    if (px * px + pz * pz < (c.r || 0.8) * (c.r || 0.8)) return true;
  }
  return false;
}
function fr2Flash(P, size, life) {
  if (FR2.flashes.length > 14) { const o = FR2.flashes.shift(); if (o && o.s) stageRoot.remove(o.s); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffe2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.position.copy(P); s.scale.setScalar(size); s.renderOrder = 6; stageRoot.add(s);
  FR2.flashes.push({ s, t: 0, life, size });
}
function fr2Shot(e, dt) {
  if (!e.uk2Gun || !isUp(e) || e.fr2Form && e.fr2Hes && time < FR2.landAt + 12) return;
  e.fr2ShotT = (e.fr2ShotT == null ? rand(0.4, 2.2) : e.fr2ShotT) - dt;
  if (e.fr2ShotT > 0) return;
  const p = e.s.position, foe = e.team === 'orange' ? 'blue' : 'orange';
  let best = null, bd = 48, tx = 0, tz = 0;
  for (const o of enemies) {
    if (o.team !== foe || !isUp(o) || o.fr2Aboard || o.seated) continue;
    const d = Math.hypot(o.s.position.x - p.x, o.s.position.z - p.z);
    if (d < bd) { bd = d; best = o; tx = o.s.position.x; tz = o.s.position.z; }
  }
  if (e.team === 'orange' && state === 'play') {
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < bd) { bd = d; best = PLAYER_T; tx = player.pos.x; tz = player.pos.z; }
  }
  if (!best || bd < 3.4 || bd > 46) return;
  e.fr2ShotT = e.fr2Role === 'skirm' ? rand(2.6, 4.0) : rand(7.0, 9.0);
  e.fr2AimUntil = time + 0.5;
  e.faceWant = Math.atan2(tx - p.x, tz - p.z);
  const face = e.faceWant, mz = new V3(p.x + Math.sin(face) * 1.15, e.baseY + e.figH * 0.78, p.z + Math.cos(face) * 1.15);
  puff(mz, 0xefeee8, 6, 0.4, 1.1, 1.8); fr2Flash(mz, 0.8, 0.06);
  const o = Sfx.at(mz, 180, 1.1); if (o) Sfx.noiseBurst(0.16, 'lowpass', 2400, 200, 0.7, 0.8, 0, o);
  if (fr2Blocked(mz.x, 1.3, mz.z, tx, tz)) return;
  if (Math.random() < 0.10) {
    if (best.isPlayer) { if (!player.god) { hurtPlayer(Math.round(rand(10, 16))); popup('マスケットの弾が当たった！'); } }
    else damageEnemy(best, 2, mz, false, null, e);
  }
}
function fr2Brain(e, dt) {
  if (!e.fr2) return false;
  if (e.medic) { if (e.fr2Drum) e.fr2Drum.visible = e.state !== 'down'; return false; }
  const p = e.s.position;
  if (e.fr2Aboard) {
    e.passive = true; e.state = 'idle'; e.tgt = null; e.baseY = FR2.deck ? FR2.deck.y : 2.3;
    if (e.home) { p.x = e.home[0]; p.z = e.home[1]; }
    e.faceWant = 0; e.knock.set(0, 0, 0); return true;
  }
  if (e.fr2Back) {
    e.passive = true; e.tgt = null; e.fr2Form = false;
    const tx = e.fr2Rx != null ? e.fr2Rx : 0, tz = -4;
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (d > 1.2) { steer(e, tx, tz, e.speed * 1.15, dt); e.state = 'approach'; e.faceWant = Math.atan2(tx - p.x, tz - p.z); }
    else e.state = 'idle';
    if (e.uk2Gun) uk2GunPose(e, false, dt, true);
    return true;
  }
  if (e.team === 'blue') {
    if (e.fr2Drum) e.fr2Drum.visible = true;
    if (FR2.phase === 'open' || FR2.phase === 'barrage') {
      e.passive = true; e.tgt = null; e.crouch = FR2.phase === 'barrage' ? 0.8 : 0.15;
      let slot = e.fr2Post || [p.x, p.z], bd = 1e9;
      if (FR2.phase === 'barrage') for (const s of FR2.slots) { const d = Math.hypot(s.x - (e.fr2Post ? e.fr2Post[0] : p.x), s.z - (e.fr2Post ? e.fr2Post[1] : p.z)); if (d < bd) { bd = d; slot = [s.x, s.z]; } }
      const d = Math.hypot(slot[0] - p.x, slot[1] - p.z);
      if (d > 0.8) { steer(e, slot[0], slot[1], e.speed * 0.9, dt); e.state = 'approach'; } else e.state = 'idle';
      e.faceWant = Math.PI;
      if (e.uk2Gun) uk2GunPose(e, false, dt, false);
      return true;
    }
    if (e.kind === 'archer' && !e.fr2Shoot) return false;
    if (e.frJp === 'sumi' || e.frJp === 'sec2') {
      if (fr2NearFoe(e, 8)) return false;
      e.passive = true; e.tgt = null;
      const h = e.fr2Post; const d = Math.hypot(h[0] - p.x, h[1] - p.z);
      if (d > 1.2) { steer(e, h[0], h[1], e.speed * 0.8, dt); e.state = 'approach'; } else e.state = 'idle';
      e.faceWant = Math.PI; return true;
    }
    if (fr2NearFoe(e, e.fr2Shoot ? 4.2 : 12)) { if (e.uk2Gun) uk2GunPose(e, false, dt, true); return false; }
    e.passive = true; e.tgt = null; e.crouch = 0.1;
    const h = e.fr2Post; const d = Math.hypot(h[0] - p.x, h[1] - p.z);
    if (d > 0.7) { steer(e, h[0], h[1], e.speed * 0.85, dt); e.state = 'approach'; } else e.state = 'idle';
    e.faceWant = Math.PI;
    if (e.fr2Shoot && (FR2.phase === 'land' || FR2.phase === 'march' || FR2.phase === 'fight' || FR2.phase === 'charge')) fr2Shot(e, dt);
    if (e.uk2Gun) uk2GunPose(e, !!(e.fr2AimUntil > time), dt, false);
    return true;
  }
  // 橙：上陸までは舟、そのあと縦隊・散兵・騎兵
  if (e.fr2Form && !e.fr2Free) {
    e.passive = true; e.tgt = null;
    if (e.fr2Role === 'cav' && !e.fr2Go) {
      const h = fr2SlotOf(e), d = Math.hypot(h[0] - p.x, h[1] - p.z);
      if (d > 0.6) { steer(e, h[0], h[1], e.speed * 0.8, dt); e.state = 'approach'; } else e.state = 'idle';
      e.faceWant = 0;
    } else if (fr2NearFoe(e, e.fr2Role === 'skirm' ? 3.0 : 2.5)) {
      e.fr2Form = false; e.fr2Free = true; e.passive = false; e.state = 'approach';
    } else {
      const h = fr2SlotOf(e);
      const slow = e.fr2Hes && FR2.frontZ < 8 ? 0.45 : 1;
      const sp = (e.fr2Role === 'cav' ? 1.35 : e.fr2Role === 'drum' ? 0.9 : 1) * slow;
      const d = Math.hypot(h[0] - p.x, h[1] - p.z);
      if (d > 0.35) { steer(e, h[0], h[1], e.speed * sp, dt); e.state = 'approach'; } else e.state = 'idle';
      e.faceWant = 0;
      if (e.fr2Shoot && e.fr2Role === 'skirm') fr2Shot(e, dt);
      else if (e.uk2Gun && e.fr2Role === 'column' && e.fr2Rank === 0 && FR2.frontGo) fr2Shot(e, dt);
    }
    if (e.fr2Drum) { e.fr2Drum.visible = true; e.fr2Drum.position.y = e.figH * 0.55 + Math.sin(time * (FR2.by.fr03 && FR2.by.fr03.state === 'down' ? 2 : 9)) * 0.03; }
    if (e.uk2Gun) uk2GunPose(e, !!(e.fr2AimUntil > time), dt, false);
    return true;
  }
  if (e.fr2Drum) e.fr2Drum.visible = e.state !== 'down';
  if (e.uk2Gun) uk2GunPose(e, false, dt, true);
  return false;
}
function fr2People() {
  const L = [];
  for (const e of enemies) if (isUp(e) && !e.seated && !e.fr2Aboard) L.push([e.s.position.x, e.s.position.z, e]);
  L.push([player.pos.x, player.pos.z, null]);
  return L;
}
function fr2PickShell() {
  const ppl = fr2People();
  for (let k = 0; k < 26; k++) {
    const x = rand(-26, 26), z = rand(8, 24);
    if (FR2.houses.some(b => x > b.x0 - 0.4 && x < b.x1 + 0.4 && z > b.z0 - 0.4 && z < b.z1 + 0.4)) continue;
    if (ppl.some(q => Math.hypot(q[0] - x, q[1] - z) < 2.6)) continue;
    return [x, z];
  }
  return null;
}
function fr2Fire(n) {
  for (let i = 0; i < n; i++) {
    const T = fr2PickShell(); if (!T) continue;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 28), new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(T[0], 0.06, T[1]); ring.renderOrder = 3; stageRoot.add(ring);
    FR2.shells.push({ x: T[0], z: T[1], y: Math.random() < 0.5 ? rand(2.8, 4.2) : 0.3, t: -i * rand(0.2, 0.4), T: rand(1.7, 2.2), ring, fired: false, whist: false });
  }
  if (FR2.muz) { puff(FR2.muz, 0xe9e6de, 8, 1.4, 2.2, 1.6); fr2Flash(FR2.muz, 3.2, 0.12); const o = Sfx.at(FR2.muz, 420, 1.3); if (o) { Sfx.noiseBurst(0.8, 'lowpass', 480, 40, 0.8, 0.7, 0, o); Sfx.tone('sine', 48, 24, 0.7, 0.6, 0, o); } }
}
function fr2Burst(S) {
  const P = new V3(S.x, Math.max(0.4, S.y), S.z);
  fr2Flash(P, S.y > 2 ? 4.5 : 3.4, 0.12);
  puff(P, 0xfff0c0, 4, 0.5, 6, 0.1); puff(P, 0x3a3630, 10, 1.3, 2, 2.6); puff(P, 0xcbb892, 12, 0.8, 4, 1.6);
  const o = Sfx.at(P, 280, 1.4); if (o) { Sfx.noiseBurst(0.7, 'lowpass', 1400, 50, 0.85, 0.7, 0, o); Sfx.tone('sine', 70, 28, 0.55, 0.8, 0, o); }
  const dP = Math.hypot(S.x - player.pos.x, S.z - player.pos.z);
  if (dP < 22) player.shake = Math.max(player.shake || 0, clamp(0.4 - dP * 0.016, 0.04, 0.35));
  const R = S.y > 2 ? 8.5 : 7;
  const hit = (tx, tz, low) => {
    const d = Math.hypot(tx - S.x, tz - S.z); if (d > R || d < 0.35) return 0;
    if (fr2Blocked(S.x, S.y, S.z, tx, tz)) return 0;
    const k = 1 - d / R; return Math.random() < (0.2 + 0.55 * k * k) * (low ? 0.5 : 1) ? k : 0;
  };
  for (const e of enemies.slice()) {
    if (!isUp(e) || e.team !== 'blue' || e.seated || e.fr2Aboard) continue;
    const k = hit(e.s.position.x, e.s.position.z, (e.crouch || 0) > 0.5);
    if (k > 0) damageEnemy(e, k > 0.75 ? 3 : k > 0.4 ? 2 : 1, P, false, null, null);
  }
  if (state === 'play' && !player.god) { const k = hit(player.pos.x, player.pos.z, false); if (k > 0) { hurtPlayer(Math.round(8 + 26 * k)); popup('破片を受けた！'); } }
  for (const c of covers.slice()) { const d = Math.hypot(c.x - S.x, c.z - S.z); if (d < 3 && c.breakable) { c.hp -= d < 1.5 ? 2 : 1; if (c.hp <= 0) breakBundle(c, 'quiet'); } }
}
function fr2ShellTick(dt) {
  for (const S of FR2.shells) {
    S.t += dt; if (S.t < 0) continue;
    if (!S.fired) { S.fired = true; S.ring.visible = true; }
    if (!S.whist && S.T - S.t < 1.2) { S.whist = true; const o = Sfx.at(new V3(S.x, 2, S.z), 60, 0.9); if (o) Sfx.tone('sine', 1500, 420, 1.0, 0.05, 0, o); }
    const k = clamp(S.t / S.T, 0, 1); S.ring.material.opacity = 0.25 + 0.5 * k; S.ring.scale.setScalar(1.7 - 0.6 * k);
    if (S.t >= S.T) { fr2Burst(S); stageRoot.remove(S.ring); S.done = true; }
  }
  FR2.shells = FR2.shells.filter(S => !S.done);
  for (const F of FR2.flashes) { F.t += dt; const k = F.t / F.life; F.s.material.opacity = Math.max(0, 1 - k); F.s.scale.setScalar(F.size * (0.7 + k)); if (F.t > F.life) F.s.visible = false; }
}
function fr2Bark(key) {
  if (!FR2.on || FR2.said[key]) return false;
  const L = (window.VOICE_FR2 || {})[key]; if (!L) return false;
  const e = (FR2.by && FR2.by[L.who]) || (FR2.jpBy && FR2.jpBy[L.who]) || null;
  if (e && e.state === 'down') return false;
  FR2.said[key] = time;
  const d = e ? Math.min(36, Math.hypot(e.s.position.x - player.pos.x, e.s.position.z - player.pos.z)) : 6;
  if (L.file) Talk.as(e, () => { if (!VoicePack.play(L.file, d, 1.95, 1)) { /* 字幕は出す。合成音声には落とさない */ } });
  const P = (typeof FR_PROF !== 'undefined' && FR_PROF[L.who]) || FR2.card[L.who];
  const nm = P ? String(P.name).split('・')[0] : (FR2_WHO[L.who] || '');
  const el = $('subtitle'); if (el) el.textContent = L.en ? (nm + '「' + L.en + '」　' + L.ja) : (nm + '「' + L.ja + '」');
  return true;
}
function fr2Counts() {
  let foe = 0, ally = 0;
  for (const e of enemies) {
    if (e.state === 'down') continue;
    if (e.team === 'orange' && e.fr2 && !e.fr2Aboard && !e.medic && !e.special) foe++;
    if (e.team === 'blue' && !e.fr2Aboard) ally++;
  }
  return { foe, ally };
}
function fr2PortLost() {
  let n = 0;
  for (const e of enemies) if (e.fr2 && e.team === 'orange' && !e.special && !e.medic && isUp(e) && !e.seated && e.s.position.z > 27) n++;
  return n >= 6;
}
function fr2Break() {
  if (FR2.phase === 'retreat' || FR2.phase === 'end') return;
  FR2.phase = 'retreat'; FR2.pt = 0; FR2.goal = 'フランスは生きている者を舟へ戻している';
  fr2Bark('elise_break');
  for (const e of enemies) if (e.fr2 && e.team === 'orange' && isUp(e) && !e.fr2Aboard && !e.medic) {
    e.fr2Back = true; e.fr2Form = false; e.fr2Free = false; e.passive = true; e.tgt = null; e.fr2Rx = clamp(e.s.position.x, -18, 16);
  }
}
function fr2Clamp() {
  const P = player.pos;
  const pier = P.x > -23.7 && P.x < -16.3 && P.z > -16 && P.z < 5.6;
  if ((P.z < -1.35 && !pier) || P.y < -0.25) {
    if (FR2.lastOk) { P.x = FR2.lastOk[0]; P.z = FR2.lastOk[1]; }
    else { P.x = 0; P.z = 20; }
    P.y = 0; player.vy = 0; return;
  }
  if (!pier && P.y < 0.15 && P.z > -1) FR2.lastOk = [P.x, P.z];
}
function fr2Reset() {
  player.pos.set(0.2, 0, 22); player.yaw = 0; player.pitch = -0.04;
  FR2.phase = 'off'; FR2.ended = false; FR2.lastOk = [0.2, 22];
}
function fr2Start() {
  Object.assign(FR2, { phase: 'open', t: 0, pt: 0, by: {}, jpBy: {}, list: [], boats: [], shells: [], flashes: [], said: {}, ended: false, win: false,
    goal: '沖のコルベットを見よ', frontZ: 1.2, frontGo: false, didC: false, landAt: 0, fillI: 0, volT: 2, salvoT: 1.2, launched: {} });
  FR2.pick = fr2PickStore();
  FR2.lastOk = [player.pos.x, player.pos.z];
  const deck = FR2.deck || { x: -2, z: -54, y: 2.3 };
  fr2Aboard('fr02', deck.x + 1.2, deck.z + 1.2);
  fr2Aboard('fr07', deck.x - 1.4, deck.z + 0.6);
  fr2Aboard('fr09', deck.x - 2.2, deck.z - 0.8);
  fr2PlaceJp();
  const eliseKey = FR2.pick === 'ask' ? 'elise_ask' : FR2.pick === 'peace' ? 'elise_peace' : FR2.pick === 'refuse' ? 'elise_refuse' : 'elise_default';
  if (VoicePack.ok && window.VOICE_FR2) for (const k in window.VOICE_FR2) { const L = window.VOICE_FR2[k]; if (L.file) VoicePack.load(L.file, /port|hayase|ayase|ojou_line|elise_/.test(k)); }
  showBanner('フランス人形編 第二幕「上陸」', '英国の港に、共和国の艦隊が錨を下ろした');
  ukDlg([{ wait: 0.6 }, { say: 'sumi_port' }, { say: 'hayase_stay' }, { say: 'eleanor_port' }, { say: 'ayase_flank' }, { say: 'ojou_line' }, { say: 'king_hold' }, { say: eliseKey }], () => {
    if (!FR2.on || FR2.phase === 'end') return;
    FR2.phase = 'barrage'; FR2.pt = 0; FR2.goal = '砲撃：赤い輪の外へ。直撃は来ない、破片が来る';
    showBanner('砲撃', '着弾の印は赤い輪。竹束と家の陰は、破片を止める');
  });
}
function fr2LivingOrange() {
  let n = 0, tot = 0;
  for (const e of enemies) if (e.fr2 && e.team === 'orange' && !e.special && !e.medic && !e.fr2Aboard) { tot++; if (isUp(e)) n++; }
  return { n, tot };
}
function updateFr2(dt) {
  if (!FR2.on) return;
  const M = frMats();
  if (M.sea && M.sea.map) M.sea.map.offset.set((time * 0.004) % 1, (time * 0.002) % 1);
  if (FR2.balloon) { FR2.balloon.position.y = 18 + Math.sin(time * 0.6) * 0.35; FR2.balloon.position.x = 16 + Math.sin(time * 0.15) * 1.4; }
  if (FR2.foam) FR2.foam.position.z = -0.6 + Math.sin(time * 0.8) * 0.25;
  for (const F of FR2.flags) { const p = F.m.geometry.attributes.position, a = p.array, b = F.base; for (let i = 0; i < a.length; i += 3) { const u = Math.abs(b[i]) / 1.6; a[i + 2] = b[i + 2] + Math.sin(time * 3.2 + b[i] * 3) * 0.12 * u; } p.needsUpdate = true; }
  if (state !== 'play') return;
  ukSeaSound(dt);
  FR2.t += dt; FR2.pt += dt;
  ukDlgTick(dt);
  for (const B of FR2.boats) if (!B.gone) fr2BoatTick(B, dt);
  fr2ShellTick(dt);
  if (FR2.phase === 'barrage' && !UK.dlg) {
    FR2.salvoT -= dt;
    if (FR2.salvoT <= 0 && FR2.pt < (TEST ? 3.2 : 11)) { FR2.salvoT = TEST ? 1.3 : 4.2; fr2Fire(TEST ? 2 : 3); }
    if (FR2.pt > (TEST ? 4 : 12) && FR2.shells.length === 0) {
      FR2.phase = 'land'; FR2.pt = 0; FR2.goal = '上陸：縦隊を正面で受け、岸の端は綾瀬';
      fr2Launch('A'); fr2Launch('B');
      showBanner('上陸', '太鼓が鳴ったら、列は止まらない');
    }
  }
  if ((FR2.phase === 'land' || FR2.phase === 'march') && FR2.frontGo) {
    const drum = FR2.by.fr03, kDrum = drum && drum.state === 'down' ? 0.55 : 1;
    const kPick = FR2.pick === 'peace' ? 0.7 : FR2.pick === 'refuse' ? 1.12 : 0.92;
    FR2.frontZ += 0.82 * kDrum * kPick * dt;
    if (FR2.phase === 'land') FR2.phase = 'march';
    if (!FR2.didC && FR2.frontZ > 6.5) { FR2.didC = true; FR2.phase = 'charge'; fr2Launch('C'); fr2Bark('helene_charge'); fr2Bark('lea_flank'); }
    if (FR2.frontZ > 11.2) { FR2.phase = 'fight'; fr2Release('column'); fr2Release('drum'); FR2.goal = '白兵：縦隊を崩せ。散兵は隊長を狙う'; }
  }
  if (FR2.phase === 'charge') {
    for (const e of enemies) if (e.fr2Role === 'cav' && e.fr2Form && !e.seated && isUp(e)) e.fr2Go = true;
    if (FR2.pt > 8) { /* 騎兵は接敵で崩れる */ }
    if (FR2.frontZ > 11.2) { FR2.phase = 'fight'; fr2Release('column'); }
  }
  if (FR2.phase === 'fight' || FR2.phase === 'charge' || FR2.phase === 'march') {
    const c = fr2LivingOrange();
    const drum = FR2.by.fr03;
    if (c.tot > 6 && (c.n <= Math.max(4, c.tot * 0.28) || (drum && drum.state === 'down' && c.n < c.tot * 0.5) || FR2.pt > 150)) fr2Break();
    if (fr2PortLost()) { FR2.win = false; fr2Ending(); }
  }
  if (FR2.phase === 'retreat') {
    if (FR2.pt > (TEST ? 2.5 : 8)) { FR2.win = true; fr2Ending(); }
  }
  document.documentElement.classList.toggle('ukdlgon', !!UK.dlg);
}
function fr2Ending() {
  if (FR2.ended) return; FR2.ended = true; FR2.phase = 'end';
  state = 'over'; player.drawing = false; $('banner').style.opacity = 0; bannerTimer = 0;
  if ($('ukdlg')) $('ukdlg').style.display = 'none'; UK.dlg = null; ukChoiceOff();
  const h1 = document.querySelector('#over h1'), h2 = document.querySelector('#over h2');
  const word = FR2.pick === 'ask' ? '問いを残したまま' : FR2.pick === 'peace' ? '和を口にしたあと' : FR2.pick === 'refuse' ? '要求を退けたあと' : '';
  if (h1) h1.textContent = FR2.win ? '第二幕「上陸」 完' : '港は抜かれた';
  if (h2) h2.textContent = FR2.win ? 'フランス人形編 ― 浜は守られた' : 'フランス人形編 ― 縦隊が町に入った';
  const c = fr2Counts();
  $('result').innerHTML = (FR2.win
    ? '砲の破片をくぐり、歌と太鼓の縦隊を浜で受け止めた。フランスの娘たちは、命じられたからではなく、自分の意志で銃を取り、自分の意志で舟へ戻った。<br>残ったフランスの兵 <b>' + c.foe + '</b>　味方 <b>' + c.ally + '</b>'
    : '縦隊が竹束を越え、町の通りまで入った。港は、今日は渡せなかったわけではない。')
    + (word ? '<br><span style="opacity:.8">第一幕の答えは、まだ残っている（' + FR2.pick + '・' + word + '）。</span>' : '')
    + (FR2.win ? '<br><b>次は野の縦隊。</b>' : '');
  if (FR2.win) { fr2Bark('sumi_hold'); fr2Bark('eleanor_after'); }
  if (document.exitPointerLock) document.exitPointerLock();
  $('over').style.display = 'flex';
}
if (TEST) window.__fr2 = { FR2, skip: () => ukDlgSkip(), land: () => { FR2.phase = 'land'; FR2.pt = 99; fr2Launch('A'); fr2Launch('B'); }, win: () => { FR2.win = true; fr2Break(); }, end: () => fr2Ending(), bark: fr2Bark };
