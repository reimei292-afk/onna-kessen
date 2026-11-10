// 決戦2：読み込み・エラー・人数・景色の写真  NODE_PATH=/workspace/pwt/node_modules node tools/test_ks2.js
const { chromium } = require('playwright'); const BASE = process.env.BASE || 'http://localhost:8799', VW = +(process.env.VW || 1280), VH = +(process.env.VH || 720), SHOT = process.env.SHOT;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: VW, height: VH }, isMobile: !!process.env.MOB, hasTouch: !!process.env.MOB })).newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message)));
  try {
  await p.goto(`${BASE}/?stage=kessen2${process.env.Q || ''}&n=${Date.now()}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game && window.__game.framesLoaded > 60, null, { timeout: 240000 });
  await p.evaluate(() => { const G = window.__game; if (G.state !== 'play') G.startGame(); }); await p.waitForTimeout(3000);
  const info = () => p.evaluate(() => { const G = window.__game, K = G.KS2, c = G.ks2Counts(); return { ph: K.ph, t: +K.t.toFixed(1), c, realA: K.atkReal0, realD: K.defReal0, px: K.px.length, enemies: G.enemies.length, bodies: G.bodies.length, dc: G.drawCalls, tris: G.tris, H: [Math.round(K.U.H.ax), Math.round(K.U.H.az)], N: [Math.round(K.U.N.ax), Math.round(K.U.N.az)], gates: Object.values(K.gates).map(g => g.s + ':' + Math.round(g.hp) + (g.open ? 'O' : '')).join(' '), log: K.log.slice(-6) }; });
  console.log('start', JSON.stringify(await info()));
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(+(n / 3).toFixed(1)); }; requestAnimationFrame(f); }));
  console.log('fps(swiftshader)', fps);
  console.log('pxg', JSON.stringify(await p.evaluate(() => { const K = window.__game.KS2, o = {}; for (const k in K.pxg) o[k] = K.pxg[k] ? K.pxg[k].list.length : 'NULL'; return o; })));
  const clean = () => p.evaluate(() => { const st = document.createElement('style'); st.textContent = '#wcanvas{display:none!important}'; document.head.appendChild(st); for (const id of ['hud', 'banner', 'subtitle', 'popup', 'wcanvas', 'weapons']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } window.__game.camera.children.forEach(c => c.visible = false); });
  if (SHOT) { await p.evaluate(() => { const P = window.__game.player; P.pos.set(-6, 2.2, 262); P.yaw = 0.03; P.pitch = -0.02; }); await clean(); await p.waitForTimeout(2500); await p.screenshot({ path: SHOT + '/ks2_1_march.png' }); }
  if (process.env.AUDIO) { await p.mouse.click(300, 300).catch(() => {}); await p.waitForTimeout(500); const st = () => p.evaluate(() => { const VP = window.__game.VoicePack; return { ok: VP.ok, ctx: window.__game.Sfx.ctx && window.__game.Sfx.ctx.state, stats: Object.assign({}, VP.stats) }; });
    console.log('a0', JSON.stringify(await st())); await p.evaluate(() => { const G = window.__game; for (let i = 0; i < 450; i++) { G.updateKs2(0.1); if (i % 2) G.updateEnemies(0.1); } }); await p.waitForTimeout(6000); console.log('a1', JSON.stringify(await st())); }
  const sim = (sec) => p.evaluate((sec) => { const G = window.__game; for (let i = 0; i < sec * 10; i++) { G.updateKs2(0.1); G.updateEnemies(0.1); } }, sec);
  for (let k = 0; k < +(process.env.STEPS || 0); k++) { await sim(+(process.env.SEC || 20)); console.log('sim', JSON.stringify(await info())); if (process.env.GO && (await p.evaluate(() => window.__game.KS2.ph)) === 'deploy') await p.evaluate(() => window.__game.ks2Go()); }
  if (SHOT) { await p.evaluate(() => { const G = window.__game, P = G.player; G.player.god = true; P.pos.set(70, 95, 215); P.yaw = 0.32; P.pitch = -0.5; }); await clean(); await p.waitForTimeout(3000); await p.screenshot({ path: SHOT + '/ks2_2_castle_high.png' }); }
  } catch (e) { console.log('ERR', e.message); }
  console.log('errors', errs.length, JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
