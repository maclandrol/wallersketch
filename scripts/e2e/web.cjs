// The tablet / web build in WebKit (Safari's engine) with iPad emulation: touch, screen size,
// drawers, files through the browser, storage, offline files. Run: npm run e2e:web
const { webkit, devices } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');

const shots = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
let failed = 0;
const check = (cond, label) => { console.log(`  ${cond ? '✔' : '✖'} ${label}`); if (!cond) failed++; };

(async () => {
  const port = 4300 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'serve.mjs'), 'dist-web', String(port)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await webkit.launch();
  const url = `http://localhost:${port}/`;
  try {
    for (const [label, device] of [['iPad Pro 11, landscape', devices['iPad Pro 11 landscape']], ['iPad Pro 11, portrait', devices['iPad Pro 11']]]) {
      console.log(label);
      const context = await browser.newContext({ ...device, acceptDownloads: true });
      // The iPad share sheet cannot be driven headless: record what would be shared.
      await context.addInitScript(() => { navigator.canShare = () => true; navigator.share = async d => { window.__shared = (d.files ?? []).map(f => f.name); }; });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => { errors.push(e.message); if (process.env.TRACE) console.log('TRACE', e.stack); });
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(url);
      await page.waitForFunction(() => window.studio?.ready, null, { timeout: 60000 });
      const items = () => page.evaluate(() => window.studio.ed.state.items);
      const settled = () => page.waitForFunction(() => !window.studio.view.busy, null, { timeout: 120000 });
      check((await items()).length > 50, 'first launch shows the example bar');
      await settled();
      await page.waitForFunction(() => document.querySelectorAll('.shot img').length >= 3, null, { timeout: 20000 }).catch(() => {});
      check(await page.locator('.shot img').count() >= 3, 'saved views show their thumbnails');
      check(await page.evaluate(() => window.studio.view.stats().calls > 0), 'WebGL renders the scene');
      const shot = n => shots && page.screenshot({ path: path.join(shots, n + '.png') });
      fs.mkdirSync(shots ?? os.tmpdir(), { recursive: true });
      await shot(label.includes('portrait') ? 'ipad-portrait' : 'ipad-landscape');
      const portrait = label.includes('portrait');

      // New empty project, then add a table by tapping a library card.
      await page.evaluate(() => window.studio.ed.newProject());
      if (portrait) {
        check(!(await page.locator('aside.left').isVisible()), 'portrait: the library is a closed drawer');
        await page.getByRole('button', { name: 'Bibliothèque et scène' }).tap();
        await page.waitForTimeout(300);
      }
      await page.locator('.cat', { hasText: 'Tables' }).tap();
      await page.locator('.card', { hasText: 'Table 180 × 75' }).tap();
      check((await items()).some(i => i.type === 'table'), 'tapping a card adds a table');
      if (portrait) {
        await page.waitForTimeout(300);
        check(!(await page.locator('aside.left').isVisible()), 'portrait: the drawer closes after adding');
        await page.getByRole('button', { name: 'Bibliothèque et scène' }).tap();
      }
      await page.locator('.cat', { hasText: 'Tissus' }).tap();
      await page.locator('.card', { hasText: 'Nappe 320 × 180' }).tap();
      await settled();
      check((await items()).some(i => i.type === 'fabric'), 'a cloth drapes on the tablet too');

      // Long press on the table opens the context menu.
      const [x, y] = await page.evaluate(() => {
        const { view, ed } = window.studio, tb = ed.state.items.find(i => i.type === 'table');
        view.frame('perspective', undefined, true);
        const v = view.camera.position.clone().set(tb.position[0], 0.6, tb.position[2] + 0.5).project(view.camera);
        const r = view.renderer.domElement.getBoundingClientRect();
        return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
      });
      // Playwright cannot hold a real touch in WebKit, so the long press is synthesised. Its fake
      // pointer id makes the camera controls' pointer capture throw; that error is a test artefact.
      const before = errors.length;
      await page.evaluate(([x, y]) => window.studio.view.renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 7 })), [x, y]);
      errors.splice(before, errors.length - before, ...errors.slice(before).filter(m => !/can not be found here/.test(m)));
      await page.waitForTimeout(800);
      check(await page.locator('.menu-pop').isVisible(), 'long press opens the context menu');
      await page.evaluate(([x, y]) => window.studio.view.renderer.domElement.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, pointerId: 7 })), [x, y]);
      await page.locator('.menu-pop .menu-item', { hasText: 'Dupliquer' }).tap();
      check((await items()).filter(i => i.type === 'table').length === 2, 'the context menu duplicates the dressed table');

      if (!portrait) {
        // Save goes through the browser (a download, or the share sheet on the iPad).
        const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.studio.ed.save(true))]);
        const file = path.join(os.tmpdir(), 'ws-web-' + Date.now() + '.wsketch');
        await download.saveAs(file);
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        check(saved.format === 'wallersketch' && saved.items.length === (await items()).length, 'save delivers a complete .wsketch file');
        // Open it again through the file picker.
        await page.evaluate(() => window.studio.ed.newProject());
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => { window.studio.ed.open(); })]);
        await chooser.setFiles(file);
        await page.waitForFunction(n => window.studio.ed.state.items.length === n, saved.items.length, { timeout: 15000 });
        check(true, 'the file picker reopens the project');
        // Recovery and the personal library live in IndexedDB.
        await page.evaluate(() => window.studio.ed.add('cube-30'));
        await page.waitForTimeout(4800);
        check(await page.evaluate(async () => !!(await window.native.recover())), 'unsaved work is kept for recovery on the device');
        const lib = await page.evaluate(async () => { await window.studio.ed.addToLibrary({ entries: [{ ref: 'custom:test-cube', type: 'riser', name: 'Cube test', family: 'Mes présentoirs', size: [0.3, 0.3, 0.3], shape: 'rect', finish: { main: { color: '#ffffff' } } }], glasses: [] }); return window.native.loadLibrary(); });
        check(!!lib && lib.includes('Cube test'), 'the personal library is stored on the device');
        // Image export downloads a PNG.
        await page.evaluate(() => window.studio.ed.exportFiles([{ name: 'vue', data: window.studio.view.capture(1200, 800) }, { name: 'Plan', data: window.studio.plan(window.studio.ed.state) }]));
        check(JSON.stringify(await page.evaluate(() => window.__shared)) === '["vue.png","Plan.svg"]', 'image and plan export open the share sheet');
        // Assistant: no local-agents tab on the tablet; a pasted chat answer is read.
        await page.getByRole('button', { name: 'Assistant' }).tap();
        check(await page.getByRole('button', { name: 'Agents locaux' }).count() === 0, 'the assistant hides desktop-only local agents');
        await page.locator('.modal textarea.prompt').nth(1).fill('```json\n{ "recipes": [{ "kind": "presentoir", "name": "Gradins or", "shape": "tiers", "steps": 3, "width_cm": 80, "depth_cm": 40, "height_cm": 36, "surface": { "color": "#c9a45c", "finish": "brass" } }] }\n```');
        await page.getByRole('button', { name: 'Lire le texte ci-dessous' }).tap();
        check(await page.locator('.recipe-results .card', { hasText: 'Gradins or' }).count() === 1, 'a chat answer is previewed on the tablet');
        await page.locator('.modal header .btn').tap();
        // Every file the app needs is precached for offline use.
        const sw = fs.readFileSync('dist-web/sw.js', 'utf8');
        check(['./app.js', './drape.worker.js', './style.css', './manifest.webmanifest'].every(f => sw.includes(`"${f}"`)), 'the service worker precaches the app');
      } else {
        await page.evaluate(() => { const { ed } = window.studio; ed.select([ed.state.items.find(i => i.type === 'table').id]); });
        await page.getByRole('button', { name: 'Propriétés' }).tap();
        await page.waitForTimeout(300);
        check(await page.locator('aside.right').isVisible() && await page.locator('.num-field', { hasText: 'Longueur' }).isVisible(), 'portrait: properties open in a drawer');
        await shot('ipad-portrait-properties');
      }
      check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }
  } catch (e) {
    console.log('  ✖ ' + String(e.stack || e).split('\n').slice(0, 3).join(' '));
    failed++;
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
