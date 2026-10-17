// 席で事切れる見え方の確認: BASE=… ST=plane|plains|beach [CTX=kei|car|plane|boat] [WHO=girl26] [D=距離 HG=高さ] NODE_PATH=…/node_modules node tools/test_seatdown.js（/workspace/sq/seat_<stage>_{0,1,2}.png）
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8799', st = process.env.ST || 'plane', WHO = process.env.WHO || '';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); if (process.env.CTX) await p.addInitScript(c => { window.__ctx = c; }, process.env.CTX); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message)));
  await p.goto(`${BASE}/?stage=${st}&n=${Date.now()}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game && window.__game.framesLoaded > 100, null, { timeout: 240000 });
  await p.waitForTimeout(1000); await p.click('#startBtn', { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => { const G = window.__game; if (G.state !== 'play') G.startGame(); try { G.toggleGod(); } catch (_) {} });
  let v = null;
  for (let i = 0; i < 60 && !v; i++) { await p.waitForTimeout(2000);
    v = await p.evaluate((WHO) => { const G = window.__game, ids = WHO ? WHO.split(',') : null;
      const C = G.enemies.filter(e => G.isUp(e) && e.seated && e.girl && (!ids || ids.includes(e.girl.id)) && (window.__ctx ? G.seatCtxOf(e) === window.__ctx : true));
      if (!C.length) return null; const e = C[0]; window.__v = e; const ctx = G.seatCtxOf(e);
      const P = G.player, q = e.s.position, a = e.s.rotation.y; P.pos.x = q.x + Math.sin(a) * 2.6 + 0.8; P.pos.z = q.z + Math.cos(a) * 2.6; P.yaw = Math.atan2(-(q.x - P.pos.x), -(q.z - P.pos.z)); P.pitch = -0.25;
      return [e.girl.id, ctx, e.team, !!e.girl.seatdown]; }, WHO); }
  console.log(st, 'victim', JSON.stringify(v)); if (!v) { await b.close(); return; }
  await p.evaluate(() => { const G = window.__game, e = window.__v, P = G.player; window.__put = setInterval(() => { const q = e.s.position, a = (e.seatDown ? e.seatDown.yaw : e.s.rotation.y); P.pos.x = q.x + Math.sin(a) * 2.4 + Math.cos(a) * 0.9; P.pos.z = q.z + Math.cos(a) * 2.4 - Math.sin(a) * 0.9; P.yaw = Math.atan2(-(q.x - P.pos.x), -(q.z - P.pos.z)); P.pitch = -0.3; }, 16);
    for (const id of ['hud', 'aiminfo']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } });
  await p.keyboard.press('Digit2').catch(() => {});
  await p.waitForTimeout(800); await p.screenshot({ path: `/workspace/sq/seat_${st}_0.png` });
  const dbg = () => p.evaluate(() => { const e = window.__v, S = e.seated || e._seat0; return { p: [e.s.position.x, e.s.position.z].map(v => +v.toFixed(2)), seat: S ? [S.x, S.z] : null, ty: +e.tilt.position.y.toFixed(2), crouch: +(e.crouch || 0).toFixed(2), figH: +e.figH.toFixed(2), knock: e.knock && [e.knock.x, e.knock.z].map(v => +v.toFixed(2)) }; });
  await p.evaluate(() => { window.__v._seat0 = window.__v.seated; });
  console.log('pre', JSON.stringify(await dbg()));
  await p.evaluate(() => { const G = window.__game; G.damageEnemy(window.__v, 999, null); });
  await p.waitForTimeout(300); console.log('d0.3', JSON.stringify(await dbg()));
  const shot = async (tag, ang, d, hgt) => { await p.evaluate(([ang, d, hgt]) => { const e = window.__v; window.__camOverride = (c) => { const q = e.s.position, a = (e.seatDown ? (e.keiDead && e.keiDead.yaw != null ? e.keiDead.yaw : e.seatDown.yaw) : e.s.rotation.y) + ang; c.position.set(q.x + Math.sin(a) * d, q.y + hgt, q.z + Math.cos(a) * d); c.lookAt(q.x, q.y + 0.75, q.z); }; }, [ang, d, hgt]); await p.waitForTimeout(400); await p.screenshot({ path: `/workspace/sq/seat_${st}_${tag}.png` }); };
  await p.waitForTimeout(3000);
  const D = +(process.env.D || 2.2), HG = +(process.env.HG || 1.3); await shot('1', 0.3, D, HG); await shot('2', -0.8, D, HG);
  const r = await p.evaluate(() => { const e = window.__v; return { st: e.state, slump: e.slump, sd: e.seatDown && { ctx: e.seatDown.ctx, belt: e.seatDown.belt }, belt: !!e.belt, frSeat: e.girl.seatdown ? e.fr === e.girl.seatdown : null, inBodies: window.__game.bodies.includes(e), y: +e.s.position.y.toFixed(2) }; });
  console.log(st, 'after', JSON.stringify(r)); console.log('d4', JSON.stringify(await dbg()));
  console.log(st, 'errors', errs.length, JSON.stringify(errs.slice(0, 4)));
  await b.close();
})();
