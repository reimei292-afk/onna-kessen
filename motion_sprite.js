// motion_sprite.js — 動画から作ったスプライト・アトラス（atlas.json + webp）を、既存のビルボード板に貼るローダー。
// 依存：グローバルの THREE（lib/three.min.js）。ES モジュールではない普通のスクリプト。window.MotionSprite を作る。
//
//   MotionSprite.load('mob01', 'assets/motion/mob01/', { lite: LITE })  -> Promise（失敗しても reject せず null）
//   MotionSprite.ready('mob01')                                          -> bool
//   MotionSprite.update(e, st)                                           -> bool（false なら従来の setFrame を使う）
//
//   e  : { bb: THREE.Mesh(ビルボード板), mat: そのマテリアル, figH: 身長(m) }（ゲームの NPC オブジェクトをそのまま渡せる）
//   st : { id, facing, x, z, camX, camZ, state, speed, stepT, bow:{stage,u}, fallT }
//        state  : 'idle' | 'walk' | 'bow' | 'fall' | 'down'
//        facing : 向き（ラジアン。ゲームの e.s.rotation.y と同じ：前 = (sin f, cos f)）
//        stepT  : 歩きの位相（ゲームの e.stepT。π で一歩、0 = 左足が前で接地）。無ければ dt と speed から内部で進める
//        dt     : stepT を渡さないときだけ使う
//        bow    : { stage: 'set'|'draw'|'kai'|'hanare'|'zanshin', u: 0..1 }（弓を引く。stage 内の進み具合 u）
//        fallT  : 倒れ始めてからの秒数（'fall'）。'down' は最後のコマ
(function () {
  'use strict';
  var TAU = Math.PI * 2, DEG = 180 / Math.PI;
  var atlases = {};   // id -> { meta, tex, ok, p }
  var FALL_FPS = 12;

  function wrap360(d) { d %= 360; return d < 0 ? d + 360 : d; }

  function load(id, base, opt) {
    opt = opt || {};
    if (atlases[id]) return atlases[id].p;
    var A = atlases[id] = { meta: null, tex: null, ok: false, failed: false, p: null };
    var json = base + (opt.lite ? 'atlas_lite.json' : 'atlas.json') + (opt.v ? '?v=' + opt.v : '');
    A.p = fetch(json).then(function (r) { if (!r.ok) throw new Error('atlas.json ' + r.status); return r.json(); })
      .then(function (meta) {
        return new Promise(function (res, rej) {
          new THREE.TextureLoader().load(base + meta.image + (opt.v ? '?v=' + opt.v : ''), function (t) {
            t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
            t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
            A.meta = meta; A.tex = t; A.ok = true; res(A);
          }, undefined, function (err) { rej(err || new Error('atlas image')); });
        });
      })
      .catch(function (err) { A.failed = true; if (window.console) console.warn('MotionSprite: ' + id + ' を使わない（従来の写真に戻す）', err); return null; });
    return A.p;
  }
  function ready(id) { var A = atlases[id]; return !!(A && A.ok); }
  function failed(id) { var A = atlases[id]; return !!(A && A.failed); }

  // 視点の角度：カメラが娘の左側に回るほど正（0 = 正面、90 = 娘の左側から、180 = 後ろ）
  function viewDeg(st) { return wrap360((Math.atan2(st.camX - st.x, st.camZ - st.z) - st.facing) * DEG); }

  // 1 コマを選ぶ：[シーケンス名, コマ番号, 左右反転]
  function pick(meta, st, e) {
    var S = meta.seq, a = viewDeg(st), n, k;
    switch (st.state) {
      case 'walk': {
        var sec = Math.round(a / 45) % 8, w = meta.walk8[sec], q = S[w[0]].f, N = q.length;
        var t = st.stepT;
        if (t == null) { e._msT = (e._msT || 0) + (st.dt || 0) * (st.speed || 1.2) * (meta.stepsPerMeter || 1.6) * Math.PI; t = e._msT; }
        var u = t / TAU; u -= Math.floor(u);
        k = Math.floor(u * N) % N;
        if (w[1]) k = (k + (N >> 1)) % N;   // 反転すると左右の足が入れ替わる：半周ずらして同じ足を前に
        return [w[0], k, !!w[1]];
      }
      case 'bow': {
        var B = meta.bow, b = st.bow || { stage: 'kai', u: 0 }, r = B.stages[b.stage] || B.stages.kai;
        var uu = Math.max(0, Math.min(0.999, b.u || 0));
        k = r[0] + Math.floor(uu * (r[1] - r[0] + 1));
        // 射の方向（= facing）が画面の右なら元のまま、左なら反転。弓のコマは「体はカメラ向き・矢は画面右へ」
        return ['bow', k, a < 180];
      }
      case 'fall': n = S.fall.f.length; k = Math.min(n - 1, Math.floor((st.fallT || 0) * FALL_FPS)); return ['fall', k, a < 180];
      case 'down': n = S.fall.f.length; return ['fall', n - 1, a < 180];
      default: k = Math.round(a / 22.5) % 16; return ['turn', k, false];
    }
  }

  function update(e, st) {
    var A = atlases[st.id];
    if (!A || !A.ok || !e || !e.bb || !e.mat) return false;
    var meta = A.meta, sel = pick(meta, st, e), fr = meta.seq[sel[0]] && meta.seq[sel[0]].f[sel[1]];
    if (!fr) return false;
    // 娘ごとに複製したテクスチャ（画像と GPU 上のテクスチャは共有される）
    var t = e._msTex;
    if (!t || t._msId !== st.id) { t = e._msTex = A.tex.clone(); t._msId = st.id; t.needsUpdate = true; }
    var W = meta.size[0], H = meta.size[1];
    if (e.mat.map !== t) {
      e.mat.map = t; e.fr = null;   // ゲームの setFrame に「別の絵になった」と知らせる
      if (e.mat.userData && e.mat.userData.uTexel) e.mat.userData.uTexel.value.set(1 / W, 1 / H);
      e.mat.needsUpdate = true;
    }
    var x = fr[0], y = fr[1], w = fr[2], h = fr[3], ox = fr[4], oy = fr[5];
    t.repeat.set(w / W, h / H);
    t.offset.set(x / W, 1 - (y + h) / H);   // flipY（TextureLoader の既定）
    var pxm = e.figH / meta.stand, ww = w * pxm, hh = h * pxm, sg = sel[2] ? -1 : 1;
    e.bb.scale.set(ww * sg, hh, 1);
    e.bb.position.x = (ox + w / 2) * pxm * sg;   // 足元の中心（胴の中心）を立ち位置に
    if (oy || e._msOy) { e.bb.position.y = oy * pxm; e._msOy = oy; }
    e._msSel = sel;
    return true;
  }
  // 使うのをやめるとき（従来の写真に戻す）：次の setFrame が map を戻せるように
  function detach(e) { if (e) { e.fr = null; if (e._msOy) { e.bb.position.y = 0; e._msOy = 0; } } }

  window.MotionSprite = { load: load, ready: ready, failed: failed, update: update, detach: detach, viewDeg: viewDeg };
})();
