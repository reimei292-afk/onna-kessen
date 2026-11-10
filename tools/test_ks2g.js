const { chromium } = require('playwright'); const BASE = 'http://localhost:8799', VW = +(process.env.VW || 1280), VH = +(process.env.VH || 720), SHOT = process.env.SHOT;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: VW, height: VH }, isMobile: !!process.env.MOB, hasTouch: !!process.env.MOB })).newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message)));
  try {
  await p.goto(`${BASE}/?stage=kessen2&n=${Date.now()}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game && window.__game.framesLoaded > 60, null, { timeout: 240000 });
  await p.evaluate(() => { const G = window.__game; if (G.state !== 'play') G.startGame(); }); await p.waitForTimeout(2500);
  const info = () => p.evaluate(() => { const G = window.__game, K = G.KS2, c = G.ks2Counts(); const sq = (K.sq || []).map(Q => Q.U.k + Q.k[0] + (Q.up||0) + '/' + Q.n0 + (Q.ret ? 'R' : '') + '@' + Math.round(Q.d||0)).join(' ');
    const wk = {}; for (const e of K.all) wk[e.ks2Wk || (e.spear ? 'yari' : '-')] = (wk[e.ks2Wk || (e.spear ? 'yari' : '-')] || 0) + 1;
    return { lad: (K.ladders||[]).map(L => L.ph + ':' + Math.round(L.cx) + '/' + L.car.length).join(' '), tw: Math.round(K.tower.z) + (K.tower.at ? 'AT' : ''), ram: Math.round(K.ram.z), ph: K.ph, t: +K.t.toFixed(1), a: c.a, d: c.d, dc: G.drawCalls, hp: G.HPS.n, tags: G.tagNear.length, stk: K.stk ? K.stk.n : 0, stkB: K.stkB, supp: K.supp, vol: K.volN, sq, wk, gates: Object.values(K.gates).map(g => g.s + ':' + Math.round(g.hp) + (g.open ? 'O' : '')).join(' ') }; });
  console.log('start', JSON.stringify(await info()));
  const sim = (sec) => p.evaluate((sec) => { const G = window.__game; for (let i = 0; i < sec * 10; i++) { G.updateKs2(0.1); G.updateEnemies(0.1); } }, sec);
  if (process.env.MARCH) { for (let k = 0; k < 16; k++) { await sim(10); if ((await p.evaluate(() => window.__game.KS2.ph)) === 'deploy') break; } console.log('march', JSON.stringify(await info())); await sim(3); } else await sim(5);
  await p.evaluate(() => { const K = window.__game.KS2; K.ph = 'deploy'; window.__game.ks2Go(); });
  for (let k = 0; k < +(process.env.STEPS || 3); k++) { await sim(+(process.env.SEC || 15)); console.log('sim', JSON.stringify(await info())); }
  if (SHOT) { for (const [i, q] of (process.env.SHOTS ? JSON.parse(process.env.SHOTS) : [[1, [10, 1.7, 122, 3.1, -0.05]], [2, [-90, 1.7, 30, -1.4, -0.05]], [3, [4, 1.7, 232, 0, -0.1]]])) { await p.evaluate(q => { const P = window.__game.player; P.god = true; P.pos.set(q[0], q[1], q[2]); P.yaw = q[3]; P.pitch = q[4]; }, q); await p.evaluate(() => { for (const id of ['banner', 'subtitle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } window.__game.camera.children.forEach(c => c.visible = false); }); await p.waitForTimeout(2000); await p.screenshot({ path: SHOT + '/g' + i + '.png' }); console.log('shot', i, JSON.stringify(await info())); } }
  } catch (e) { console.log('ERR', e.message); }
  console.log('errors', errs.length, JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
