const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.stack));
  await p.goto('http://localhost:8799/?test=1&stage=' + (process.env.ST || 'plains'));
  await p.waitForFunction(() => window.__ojouDbg && window.__ojouDbg(), null, { timeout: 120000 });
  await p.waitForTimeout(3000); await p.evaluate(() => { const e = window.__ojou.e; e.hp = e.hpMax = 99999; });
  console.log('init', JSON.stringify(await p.evaluate(() => window.__ojouDbg())));
  const shots = [['front', 0, 0, 0], ['front_diag', 0.75, 0, 0], ['side', 1.57, 0, 0], ['back_diag', 2.4, 0, 0], ['back', 3.14, 0, 0], ['top', 0.3, 9, 0], ['low', 0.3, -2.6, 0]];
  for (const [name, a, up, lift] of shots) {
    await p.evaluate(([a, up, lift]) => {
      window.__tick = null;
      const G = window.__game, e = window.__ojou.e; const f0 = e.s.rotation.y, x0 = -16, z0 = -14, y0 = window.__baseY0 ?? (window.__baseY0 = e.baseY);
      window.__tick = () => {
        e.face = e.faceWant = f0; e.s.rotation.y = f0; e.passive = true; e.s.position.x = x0; e.s.position.z = z0; e.baseY = y0 + lift; e.s.position.y = y0 + lift;
        const d = up ? 3 : 5, P = G.player; P.pos.x = x0 + Math.sin(f0 + a) * d; P.pos.z = z0 + Math.cos(f0 + a) * d; if (up > 0) { P.pos.y = up; P.vy = 0; } const cp = { p: [P.pos.x, up < 0 ? up : (up || 1.5), P.pos.z], t: [x0, y0 + 0.85, z0] }; window.__cam = cp; window.__camPre = cam => { cam.position.set(cp.p[0], cp.p[1], cp.p[2]); cam.lookAt(cp.t[0], cp.t[1], cp.t[2]); };
        const dx = x0 - P.pos.x, dz = z0 - P.pos.z; P.yaw = Math.atan2(-dx, -dz);
        const ey = (P.pos.y + 1.5), ty = y0 + lift + 0.9; P.pitch = -Math.atan2(ty - ey, Math.hypot(dx, dz));
      };
    }, [a, up, lift]);
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => window.__ojouDbg());
    await p.evaluate(() => { for (const id of ['hud','aiminfo','subtitle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } }); await p.screenshot({ path: `/workspace/ojou_${name}.png` });
    console.log(name, r.key, r.view2, "c", r.c, "el", r.el, JSON.stringify(await p.evaluate(() => [window.__game.player.pos.x.toFixed(1), window.__game.player.pos.y.toFixed(1), window.__game.player.pos.z.toFixed(1)])));
  }
  for (const [name, a] of [['front', 0], ['front_diag', 0.75], ['side', 1.57], ['back_diag', 2.4], ['back', 3.14]]) {
    await p.evaluate((a) => {
      window.__tick = null; window.__cam = null; window.__camPre = null; const G = window.__game, e = window.__ojou.e; e.baseY = window.__baseY0; e.s.position.y = window.__baseY0; e.hp = e.hpMax = 9999;
      const x0 = -16, z0 = -14, f0 = Math.PI / 2; let t0 = performance.now();
      window.__tick = () => {
        const t = (performance.now() - t0) / 1000, ox = ((t * 1.3) % 6) - 3;
        e.s.position.x = x0 + ox; e.s.position.z = z0; e.face = e.faceWant = f0; e.s.rotation.y = f0; e.passive = true;
        const P = G.player; P.pos.x = x0 + Math.sin(f0 + a) * 6; P.pos.z = z0 + Math.cos(f0 + a) * 6;
        const dx = e.s.position.x - P.pos.x, dz = z0 - P.pos.z; P.yaw = Math.atan2(-dx, -dz); const cp = { p: [P.pos.x, 1.5, P.pos.z], t: [e.s.position.x, 0.85, z0] }; window.__cam = cp; window.__camPre = cam => { cam.position.set(cp.p[0], cp.p[1], cp.p[2]); cam.lookAt(cp.t[0], cp.t[1], cp.t[2]); };
      };
    }, a);
    const seen = {};
    for (let i = 0; i < 10; i++) { await p.waitForTimeout(300); const r = await p.evaluate(() => window.__ojouDbg()); seen[r.key + "/" + r.view2 + "@" + r.c + (r.moving?"m":"s")] = 1; if (i === 6) await p.evaluate(() => { for (const id of ['hud','aiminfo','subtitle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } }); await p.screenshot({ path: `/workspace/ojou_walk_${name}.png` }); }
    console.log('walk', name, Object.keys(seen).join(' '));
  }
  console.log('errors', errs.length, errs.slice(0, 3));
  await b.close();
})();
