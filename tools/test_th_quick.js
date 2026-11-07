// 天鳳：階段の当たり判定込み往復＋各階の出口とエレベーター到着の写真 NODE_PATH=/workspace/pwt/node_modules node tools/test_th_quick.js
const { chromium } = require('playwright'); const BASE = process.env.BASE || 'http://localhost:8799', SH = process.env.SH || '1';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 720) } })).newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message)));
  await p.goto(`${BASE}/?stage=tenhou&n=${Date.now()}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game && window.__game.framesLoaded > 60, null, { timeout: 240000 });
  await p.evaluate(() => { const G = window.__game; if (G.state !== 'play') G.startGame(); }); await p.waitForTimeout(2000);
  console.log('perf', JSON.stringify(await p.evaluate(async () => { const t0 = performance.now(); let n = 0; await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return { fps: +(n / 3).toFixed(1), objs: window.__th.TH.deckObjs ? Object.values(window.__th.TH.deckObjs).reduce((a, b) => a + b.length, 0) : -1 }; })));
  console.log('stairwalk', JSON.stringify(await p.evaluate(() => window.__th.thStairWalk())));
  if (process.env.EXTRA) console.log('extra', JSON.stringify(await p.evaluate(new Function('return (' + process.env.EXTRA + ')()'))));
  if (SH === '1') for (const d of (process.env.DECKS || '4,5,6,7,8,13,15').split(',').map(Number)) {
    const tp = async (x, z, yaw, pitch, f) => { await p.evaluate(([x, d, z, yaw, pitch]) => { const P = window.__game.player; P.pos.set(x, window.__th.thY(d) + 0.05, z); P.yaw = yaw; P.pitch = pitch; }, [x, d, z, yaw, pitch]); await p.waitForTimeout(1800); await p.screenshot({ path: `/workspace/shots/${f}.png`, timeout: 120000 }).catch(() => console.log('shotfail', f)); };
    await tp(0, 6.6, Math.PI, 0, `thx_D${d}_out`); await tp(0, 11, 0, -0.1, `thx_D${d}_in`); await tp(7.6, -3, Math.PI / 2, 0, `thx_D${d}_ev`);
  }
  if (process.env.SHOTS) for (const [f, d, x, z, yaw, pitch] of JSON.parse(process.env.SHOTS)) { await p.evaluate(([x, d, z, yaw, pitch]) => { const P = window.__game.player; P.pos.set(x, window.__th.thY(d) + 0.05, z); P.yaw = yaw; P.pitch = pitch; }, [x, d, z, yaw, pitch]); await p.waitForTimeout(2200); await p.screenshot({ path: `/workspace/shots/${f}.png`, timeout: 120000 }).catch(e => console.log('shotfail', f)); console.log('shot', f, await p.evaluate(() => window.__th.thWhere())); }
  console.log('errors', errs.length, JSON.stringify(errs.slice(0, 4))); await b.close();
})();
