const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.stack));
  await p.goto('http://localhost:8799/?test=1&slump=1&stage=' + (process.env.ST || 'castle') + (process.env.Q || ''));
  await p.waitForFunction(() => window.__GIRLS && window.__game && window.__game.state === 'play', null, { timeout: 120000 });
  await p.waitForTimeout(+(process.env.W || 30000)); console.log(await p.evaluate(() => JSON.stringify(window.__game.enemies.filter(e => e.perch).map(e => e.team + ":" + Object.keys(e.perch).filter(k => e.perch[k] === true || (k === "seiran" && e.perch[k])).join("+")))));
  const r = await p.evaluate(async (fake) => {
    const G = window.__game;
    if (fake.fake) {   // テスト用の仮の slump 写真（横の写真を流用）
      for (const k in window.__GIRLS) { const g = window.__GIRLS[k]; const s = g.side || g.front; g.slump = Object.assign({}, s, { ry: 0.55, rx: 0.45 }); }
    }
    const want = fake.want; const cand = G.enemies.filter(e => e.state !== 'down' && e.perch && want.some(k => e.perch[k])).sort((a, b) => (want.indexOf(Object.keys(a.perch).find(k => want.includes(k) && a.perch[k]))) - (want.indexOf(Object.keys(b.perch).find(k => want.includes(k) && b.perch[k]))));
    const ids = ['mob01', 'mob02', 'mob04', 'mob05']; cand.forEach((e, i) => { e.girl = window.__GIRLS[ids[i % 4]]; });
    const out = [];
    for (const e of cand.slice(0, 6)) { G.damageEnemy(e, 999, null, false, null, null); out.push({ id: e.girl.id, perch: Object.keys(e.perch).filter(k => e.perch[k] && ['gt','gh','seiran','slit'].includes(k)).join('+'), lean: e.lean && e.lean.kind, x: e.s.position.x, y: e.baseY, z: e.s.position.z }); }
    return out;
  }, { fake: process.env.FAKE === '1', want: (process.env.WANT || 'gt,gh,seiran,slit').split(',') });
  console.log(JSON.stringify(r));
  if (r[0]) {
    const t = r[0];
    await p.evaluate(t => { window.__cam = { p: [t.x + 2.5, t.y + 1.6, t.z + 3.5], t: [t.x, t.y + 0.9, t.z] }; window.__camPre = c => { c.position.set(...window.__cam.p); c.lookAt(...window.__cam.t); }; }, t);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: '/workspace/slump_' + (process.env.ST || 'castle') + '_' + (process.env.TAG || 'a') + '.png' });
  }
  console.log('errors', errs.length, errs.slice(0, 3));
  await b.close();
})();
