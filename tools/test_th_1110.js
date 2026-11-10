// 20261110a：螺旋階段を実際のキー入力で上り下り・空襲の波と死傷・吹雪の隊列 NODE_PATH=/workspace/pwt/node_modules node tools/test_th_1110.js
const { chromium } = require('playwright'); const BASE = process.env.BASE || 'http://localhost:8799', MODE = process.env.MODE || 'spiral';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 720) } })).newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message)));
  const st = MODE === 'fb' ? 'fubuki' : 'tenhou';
  await p.goto(`${BASE}/?stage=${st}${MODE === 'fb' ? '&lite=1' : ''}&n=${Date.now()}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game && window.__game.framesLoaded > 60, null, { timeout: 240000 });
  await p.evaluate(() => { const G = window.__game; if (G.state !== 'play') G.startGame(); }); await p.waitForTimeout(2500);
  if (MODE === 'spiral') {
    console.log('spiral', process.env.INPUT || 'key', JSON.stringify(await p.evaluate((INP) => { const out = []; const P = window.__game.player, K = window.__th.keys, T = window.__game.touch, TOUCH = INP === 'touch', updatePlayer = window.__th.updatePlayer; const keys = new Proxy({}, { set(o, k, v) { if (TOUCH) T.jy = v ? -1 : 0; else K[k] = v; return true; } }); for (const [i, S] of window.__th.TH.spirals.entries()) {
      const q = S.pts[0]; P.pos.set(q[0], S.y0 + 0.02, q[1]); P.vy = 0; P.yaw = Math.atan2(-(S.cx - q[0]), -(S.cz - q[1])); keys.KeyW = true; let up = null, k = 0, maxDy = 0, py = P.pos.y;
      for (; k < 600; k++) { updatePlayer(1 / 30); maxDy = Math.max(maxDy, Math.abs(P.pos.y - py)); py = P.pos.y; if (P.pos.y > S.y1 - 0.05 && Math.hypot(P.pos.x - S.cx, P.pos.z - S.cz) > 1.3) { up = +(k / 30).toFixed(1); break; } }
      const yt = P.pos.y; for (let m = 0; m < 20; m++) updatePlayer(1 / 30); const yt2 = P.pos.y; keys.KeyW = false;
      P.pos.set(S.cx, S.y1 + 0.02, S.cz + 1.5); P.vy = 0; P.yaw = 0; keys.KeyW = true; let dn = null; py = P.pos.y; let maxDn = 0;   // 上の踊り場から艫向き（+z の逆＝螺旋へ）に歩く
      for (k = 0; k < 600; k++) { updatePlayer(1 / 30); maxDn = Math.max(maxDn, py - P.pos.y); py = P.pos.y; if (P.pos.y < S.y0 + 0.05 && Math.hypot(P.pos.x - S.cx, P.pos.z - S.cz) > 1.3) { dn = +(k / 30).toFixed(1); break; } } keys.KeyW = false;
      out.push({ i, h: +(S.y1 - S.y0).toFixed(2), up, yTop: +yt.toFixed(2), after: +yt2.toFixed(2), maxStepUp: +maxDy.toFixed(2), dn, maxStepDown: +maxDn.toFixed(2), endY: +P.pos.y.toFixed(2) }); } return out; }, process.env.INPUT || 'key')));
    console.log('stairwalk', JSON.stringify(await p.evaluate(() => window.__th.thStairWalk())).slice(0, 300));
    console.log('roomwalk', JSON.stringify(await p.evaluate(() => { const r = window.__th.thRoomWalk(); return { n: r.n, bad: r.bad.map(b => b.k) }; })));
    console.log('gunroad', JSON.stringify(await p.evaluate(() => { const r = window.__th.thGunRoadWalk(); return { R: r.R.ok, L: r.L.ok, A: r.A.ok, up: r.up.ok }; })));
  }
  if (MODE === 'raid') {   // 描画を待たずに空襲を刻んで進める（0.1 秒刻み）
    await p.evaluate(() => { window.__game.player.pos.set(0, window.__th.thY(13) + 0.05, 0); window.__th.thRaidStart('air', true); });
    const stat = () => p.evaluate(() => { const TH = window.__th.TH, R = TH.raid; const kinds = {}; for (const P of R.planes) { const t = P.strafe ? 'f' : P.torp ? 't' : P.level ? 'l' : 'd'; kinds[t] = (kinds[t] || 0) + 1; } const st = Object.values(TH.stat || {}); const cz = {}; for (const x of st) if (x.st === '死亡') cz[x.cause] = (cz[x.cause] || 0) + 1;
      return { t: Math.round(R.t), wave: R.wave, ph: R.ph, kinds, st: R.st, rosDead: st.filter(s => s.st === '死亡').length, rosHurt: st.filter(s => s.st === '負傷').length, deadBy: cz, mg: (TH.mgs || []).filter(G => G.wreck).length + '/' + (TH.mgs || []).length, flood: +(TH.dmg.flood || 0).toFixed(2), sp: (TH.seaplanes || []).map(S => S.ph).join(','), torps: (R.torps || []).length }; });
    for (let k = 0; k < 14; k++) { await p.evaluate(() => { for (let i = 0; i < 400; i++) { window.__th.thRaidTick(0.1); if (i % 4 === 0) window.__th.updateEnemies(0.1); } }); const s = await stat(); console.log('raid', JSON.stringify(s)); if (s.ph === 'after') break; }
    if (process.env.EVAC) { await p.evaluate(() => { const TH = window.__th.TH; TH.dmg.flood = 1.2; window.__th.thEvacStart(); });
      for (let k = 0; k < 8; k++) { await p.evaluate(() => { for (let i = 0; i < 300; i++) { window.__th.thRaidTick(0.1); window.__th.thEvacTick(0.1); window.__th.thGirlCull(0.1); window.__th.updateEnemies(0.1); } });
        console.log('evac', JSON.stringify(await p.evaluate(() => { const TH = window.__th.TH, V = TH.ev, st = Object.values(TH.stat || {}), cz = {}; for (const x of st) if (x.st === '死亡') cz[x.cause] = (cz[x.cause] || 0) + 1; const phs = {}; for (const e of TH.girls) if (e.thEv) { const k = e.state === 'down' ? 'down' : e.thEv.ph; phs[k] = (phs[k] || 0) + 1; } return { phs, total: V.total, here: V.here, t: Math.round(V.t), ph: V.ph, L: +(V.L || 0).toFixed(3), fl: +(V.fl || 0).toFixed(1), sea: +TH.sea.position.y.toFixed(1), aboard: V.aboard, slip: (V.float || []).length, ex: V.ex, deadBy: cz, boats: V.boats.map(B => B.ph[0]).join('') }; }))); }
      console.log('kingboat', JSON.stringify(await p.evaluate(() => { const TH = window.__th.TH, player = window.__game.player, updatePlayer = window.__th.updatePlayer; player.pos.set(0, window.__th.thY(16) + 0.05, -48); const ok = window.__th.thKingBoard ? window.__th.thKingBoard() : thKingBoard(); for (let i = 0; i < 900; i++) { window.__th.thEvacTick(0.1); updatePlayer(0.1); } return { ok, ph: TH.ev.kingB && TH.ev.kingB.ph, p: [player.pos.x, player.pos.y, player.pos.z].map(v => +v.toFixed(1)), done: TH.ev.kingDone, log: TH.log.slice(-4) }; })));
    }
  }
  if (MODE === 'fb') {   // 描画を待たずに刻む：総指揮が進める。殿が一人で先へ出ると近衛だけが追う
    const sim = (sec, kv) => p.evaluate(([sec, kv]) => { const G = window.__game, P = G.player, H = window.__th; for (let i = 0; i < sec * 20; i++) { if (kv) P.pos.z -= kv / 20; H.updateEnemies(0.05); G.updateFb ? G.updateFb(0.05) : 0; } }, [sec, kv]);
    const snap = () => p.evaluate(() => { const G = window.__game, P = G.player.pos, F = G.FB; const L = (F.col || []).filter(e => e.state !== 'down'); const by = {}; for (const e of L) { const r = e.fbNamed ? 'n_' + e.fbNamed : e.fbRole || '?'; (by[r] = by[r] || []).push(e.s.position.z - P.z); } const o = {}; for (const k in by) { const a = by[k].sort((x, y) => x - y); o[k] = a.length > 1 ? [a.length, +a[0].toFixed(1), +a[a.length >> 1].toFixed(1), +a[a.length - 1].toFixed(1)] : +a[0].toFixed(1); } return { kz: +P.z.toFixed(1), A: F.form && [+F.form.z.toFixed(1), F.form.go, F.form.why], ph: F.ph, o }; });
    await p.evaluate(() => { const F = window.__game.FB; F.ph = 'march'; });
    console.log('fb0', JSON.stringify(await snap())); await sim(4, 0); console.log('fb4s', JSON.stringify(await snap())); await sim(16, 0); console.log('fb20s', JSON.stringify(await snap()));
    await sim(6, 3.5); console.log('king ran ahead 21m', JSON.stringify(await snap())); await sim(6, 0); console.log('+6s', JSON.stringify(await snap()));
  }
  if (MODE === 'audio') {   // 声が実際に鳴るか（描画が遅い試験環境なので刻みは手で進める）：話しかけ・空襲の掛け声・被弾の声が VoicePack で再生されるか
    await p.mouse.click(200, 200).catch(() => {}); await p.keyboard.press('KeyW').catch(() => {}); await p.waitForTimeout(800);
    const st = () => p.evaluate(() => { const G = window.__game, VP = G.VoicePack; return { ctx: G.Sfx && G.Sfx.ctx && G.Sfx.ctx.state, ok: VP.ok, stats: Object.assign({}, VP.stats), vN: window.__th.TH.vN || 0, act: VP.active.length }; });
    console.log('a0', JSON.stringify(await st()));
    await p.evaluate(() => { const P = window.__game.player, H = window.__th; const g = H.TH.girls.filter(e => e.state !== 'down' && !e.thFar && Math.abs(e.thY - H.thY(16)) < 0.5)[0] || H.TH.girls[0]; P.pos.set(g.s.position.x + 1, g.thY + 0.05, g.s.position.z + 1); H.thRaidStart('air', true); window.__g0 = g; H.thTalk(g, true); });
    await p.waitForFunction(() => { const VP = window.__game.VoicePack, M = window.VOICE_TH.byText; return Object.keys(M).filter(t => M[t].some(x => VP.buf[x.file])).length >= 30; }, null, { timeout: 300000, polling: 2000 }).catch(() => console.log('preload slow'));
    await p.evaluate(() => { const H = window.__th; H.thTalk(window.__g0, true); for (let i = 0; i < 400; i++) { H.thRaidTick(0.05); if (i % 3 === 0) H.updateEnemies(0.05); H.TH.rcT = Math.min(H.TH.rcT || 0, i % 60 ? 9 : 0); H.thRaidChat(0.05); } });
    await p.waitForTimeout(3000); console.log('after', JSON.stringify(await st()));
  }
  console.log('errors', errs.length, JSON.stringify(errs.slice(0, 4))); await b.close();
})();
