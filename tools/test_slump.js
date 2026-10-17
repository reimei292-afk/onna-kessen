const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.stack));
  await p.goto('http://localhost:8799/?test=1&slump=1&stage=' + (process.env.ST || 'castle'));
  await p.waitForFunction(() => window.__GIRLS && window.__game && window.__game.state === 'play', null, { timeout: 120000 });
  await p.waitForTimeout(+(process.env.W || 30000)); console.log(await p.evaluate(() => JSON.stringify(window.__game.enemies.filter(e => e.perch).map(e => e.team + ":" + Object.keys(e.perch).filter(k => e.perch[k] === true || (k === "seiran" && e.perch[k])).join("+")))));
  const r = await p.evaluate(async (fake) => {
    const G = window.__game;
    if (fake) {   // テスト用の仮の slump 写真（横の写真を流用）
      for (const k in window.__GIRLS) { const g = window.__GIRLS[k]; const s = g.side || g.front; g.slump = Object.assign({}, s, { ry: 0.55, rx: 0.45 }); }
    }
    const cand = G.enemies.filter(e => e.team === 'blue' && e.state !== 'down' && e.perch && (e.perch.gt || e.perch.seiran || e.perch.slit));
    const out = [];
    for (const e of cand.slice(0, 4)) { G.damageEnemy(e, 999, null, false, null, null); out.push({ perch: e.perch.gt ? 'gt' : e.perch.seiran ? 'seiran' : 'slit', lean: e.lean && e.lean.kind, x: e.s.position.x, y: e.baseY, z: e.s.position.z }); }
    return out;
  }, process.env.FAKE !== '0');
  console.log(JSON.stringify(r));
  if (r[0]) {
    const t = r[0];
    await p.evaluate(t => { window.__cam = { p: [t.x + 2.5, t.y + 1.6, t.z + 3.5], t: [t.x, t.y + 0.9, t.z] }; window.__camPre = c => { c.position.set(...window.__cam.p); c.lookAt(...window.__cam.t); }; }, t);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: '/workspace/slump_' + (process.env.ST || 'castle') + (process.env.FAKE === '0' ? '_nofr' : '') + '.png' });
  }
  console.log('errors', errs.length, errs.slice(0, 3));
  await b.close();
})();
