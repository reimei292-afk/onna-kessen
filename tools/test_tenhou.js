// 天鳳の最小確認: NODE_PATH=/workspace/pwt/node_modules node tools/test_tenhou.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8799';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h] of [[844, 390], [1280, 720]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message)));
    await p.goto(`${BASE}/?stage=tenhou&n=${Date.now()}`, { timeout: 180000 });
    await p.waitForFunction(() => window.__game && window.__game.framesLoaded > 60, null, { timeout: 240000 });
    await p.click('#startBtn', { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => { const G = window.__game; if (G.state !== 'play') G.startGame(); });
    await p.waitForTimeout(2500);
    if (w === 1280) {
      const S = await p.evaluate(() => { const H = window.__th; return { y13: H.thY(13), y15: H.thY(15), y7: H.thY(7), SH: H.TH_SH, v: H.thVerify() }; });
      console.log('verify', JSON.stringify(S.v));
      console.log('stairs', JSON.stringify(await p.evaluate(() => [window.__th.thStairCheck(4, 8), window.__th.thStairCheck(8, 13), window.__th.thStairCheck(4, 15)])));
      const tp = async (x, d, z, yaw, pitch, f) => { await p.evaluate(([x, d, z, yaw, pitch]) => { const P = window.__game.player; P.pos.set(x, window.__th.thY(d) + 0.05, z); P.yaw = yaw; P.pitch = pitch; }, [x, d, z, yaw, pitch]); await p.waitForTimeout(f ? 2000 : 600); const w = await p.evaluate(() => window.__th.thWhere()); console.log(f, w); if (f) await p.screenshot({ path: '/workspace/shots/' + f + '.png' }); };
      await tp(-2, 5, 7.6, 0, 0.3, 'tenhou_stair');
      await tp(-6, 6, -12, -0.4, 0.0, 'tenhou_gallery'); await tp(0, 5, -30, -1.1, 0.0, 'tenhou_promenade');
      await tp(0, 8, -9.2, 0, -0.02, 'tenhou_corridor'); await tp(1.8, 8, -11, -Math.PI / 2, -0.1, 'tenhou_cabin6'); await tp(-1.8, 8, -10.2, Math.PI / 2, -0.1, '');
      await tp(1.8, 4, -12.8, -Math.PI / 2, -0.05, 'tenhou_hospital'); await tp(-1.8, 4, -33, Math.PI / 2 + 0.3, -0.05, 'tenhou_morgue');
      for (const [x, d, z] of [[0, 15, -50], [7, 13, -30], [0, 7, -14], [0, 7, 30], [3, 8, -15.5], [-9, 6, 8], [-9, 8, 8]]) await tp(x, d, z, 0, 0, '');
      for (const d of [4, 5, 6, 8, 15]) { await p.evaluate(d => window.__th.thGoDeck(d, 0), d); await p.waitForTimeout(2000); console.log('elev', d, JSON.stringify(await p.evaluate(() => { const P = window.__game.player.pos; return [+P.x.toFixed(1), +P.y.toFixed(2)]; }))); }
      await p.waitForTimeout(3000); console.log('banner', await p.evaluate(() => document.getElementById('banner').style.opacity));
      console.log('log', JSON.stringify(await p.evaluate(() => window.__th.TH.log.filter(s => !s.startsWith('talk')))));
      await p.evaluate(() => { window.__camOverride = c => { c.position.set(240, 80, -240); c.lookAt(0, 25, 20); }; }); await p.waitForTimeout(2500);
      await p.screenshot({ path: '/workspace/shots/tenhou_exterior.png' });
    } else await p.screenshot({ path: '/workspace/shots/tenhou_844.png' });
    console.log(w, 'errors', errs.length, JSON.stringify(errs.slice(0, 5)));
    await p.close();
  }
  await b.close();
})();
