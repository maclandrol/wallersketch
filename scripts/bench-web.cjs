// Performance of the web build at iPad size and pixel density: start-up, cloth settling, cost of
// one frame (still and while moving, with and without a selection), draw calls, download size.
// Run: node build.mjs --web && node scripts/bench-web.cjs [webkit] [url]. With a URL (for example
// the published site) it measures that instead of the local build. Numbers depend on the machine.
const { chromium, webkit } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');

(async () => {
  const remote = process.argv.find(a => /^https?:/.test(a));
  const port = 4800 + Math.floor(Math.random() * 200);
  const server = remote ? null : spawn(process.execPath, [path.join(__dirname, 'serve.mjs'), 'dist-web', String(port)], { stdio: 'ignore' });
  if (!remote) await new Promise(r => setTimeout(r, 500));
  const engine = process.argv.includes('webkit') ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  let bytes = 0;
  page.on('response', async r => { try { bytes += (await r.body()).length; } catch { /* redirects */ } });
  await context.addInitScript(() => { window.__gaps = []; let last = performance.now(); const f = () => { const n = performance.now(); window.__gaps.push(n - last); last = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t0 = Date.now();
  await page.goto(remote ?? `http://localhost:${port}/`);
  await page.waitForFunction(() => window.studio?.ready, null, { timeout: 60000 });
  const ready = Date.now() - t0;
  await page.waitForFunction(() => !window.studio.view.busy, null, { timeout: 120000 });
  const settled = Date.now() - t0;
  const gpu = await page.evaluate(() => { const gl = window.studio.view.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  console.log(`${engine.name()} · ${gpu}`);
  await page.waitForTimeout(3000);
  const stalls = await page.evaluate(() => { const g = window.__gaps.slice(1); window.__gaps = []; return [Math.max(...g), g.filter(x => x > 50).length]; });
  console.log(`  ready ${ready} ms, cloth settled ${settled} ms, ${(bytes / 1024).toFixed(0)} KB downloaded`);
  console.log(`  start-up: longest freeze ${stalls[0].toFixed(0)} ms, ${stalls[1]} frames over 50 ms`);
  const lib = [];
  for (const cat of ['Cocktails', 'Verres', 'Socles', 'Tissus', 'Décor']) {
    await page.locator('.cat', { hasText: cat }).click();
    await page.waitForTimeout(1500);
    lib.push(cat + ' ' + (await page.evaluate(() => { const g = window.__gaps.slice(1); window.__gaps = []; return Math.max(...g); })).toFixed(0));
  }
  console.log(`  browsing the library, longest freeze per category (ms): ${lib.join(', ')}`);

  // Frame cost measured with a GPU sync (readPixels), so it counts the GPU work too.
  const frame = (label, ratio) => page.evaluate(([label, ratio]) => {
    const v = window.studio.view;
    v.renderer.setPixelRatio(ratio === 'move' ? v.moveRatio : v.fullRatio);
    const gl = v.renderer.getContext(), px = new Uint8Array(4), times = [];
    for (let k = 0; k < 40; k++) {
      const p = v.camera.position.clone().sub(v.controls.target).applyAxisAngle(v.camera.up, 0.01);
      v.camera.position.copy(v.controls.target).add(p);
      v.camera.updateMatrixWorld();
      const s = performance.now();
      v.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    const info = v.renderer.info.render;
    return `${label}: ${times[20].toFixed(1)} ms median, ${times[37].toFixed(1)} ms p95, ${info.calls} calls, ${(info.triangles / 1000).toFixed(0)}k triangles, ratio ${v.renderer.getPixelRatio()}`;
  }, [label, ratio]);
  const scene = async (label, build) => {
    await page.evaluate(build);
    await page.waitForFunction(() => !window.studio.view.busy, null, { timeout: 120000 });
    await page.evaluate(() => { window.studio.ed.setSelection([]); window.studio.view.frame('perspective', undefined, true); });
    console.log(label);
    console.log('  ' + await frame('still, full resolution', 'full'));
    console.log('  ' + await frame('moving, reduced resolution', 'move'));
    await page.evaluate(() => { const { ed } = window.studio; ed.setSelection([ed.state.items.find(i => i.type === 'cocktail')?.id].filter(Boolean)); });
    console.log('  ' + await frame('with a glass selected', 'full'));
    await page.evaluate(() => window.studio.ed.setSelection([]));
  };
  await scene('example bar (first launch)', () => {});
  await scene('3 dressed tables, 400 drinks', () => {
    const { ed } = window.studio;
    ed.newProject();
    for (let k = 0; k < 3; k++) { const tb = ed.add('rect-300', [k * 3.6, 0, 0]); ed.select([tb.id]); ed.add('cloth-400'); }
    const tables = ed.state.items.filter(i => i.type === 'table');
    for (const tb of tables) for (const r of ['cube-40', 'cube-30', 'taper-45', 'cyl-30']) { ed.select([tb.id]); ed.add(r); }
    for (const [k, ref] of [[0, 'blue-lagoon'], [1, 'sunrise-flute']]) { ed.select([tables[k].id]); const c = ed.add(ref); ed.select([c.id]); ed.previewGrid({ count: 200, columns: 25, gap: 0.005 }); ed.commitGrid(); }
  });
  const dragCost = await page.evaluate(() => {
    const { ed } = window.studio, ids = ed.state.items.filter(i => i.type === 'cocktail').slice(0, 1).map(i => i.id), t0 = performance.now();
    for (let k = 0; k < 60; k++) ed.move(ids, [0.002, 0, 0], k === 59, 'bench', false);
    return (performance.now() - t0) / 60;
  });
  console.log(`  one drag step on a glass: ${dragCost.toFixed(2)} ms`);
  // Second visit: everything comes from the offline copy on the device (when served over https).
  const t1 = Date.now();
  await page.reload();
  // Unsaved work brings up the recovery question: the app is loaded once it is on screen.
  await page.waitForFunction(() => window.studio?.ready || document.querySelector('.modal-back'), null, { timeout: 60000 });
  console.log(`  second visit: ready ${Date.now() - t1} ms`);
  await browser.close();
  server?.kill();
})().catch(e => { console.error(e); process.exit(1); });
