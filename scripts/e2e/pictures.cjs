// Images on objects, the logo on exports and in the presentation, and free rotation with the
// pointer, all through the interface with real input.
const path = require('node:path'), fs = require('node:fs');

module.exports = async t => {
  const { page } = t;
  const image = path.resolve('resources/web/icon-192.png');
  const wall = await t.eval(() => { const { ed, view } = window.studio; ed.newProject(); const w = ed.add('backdrop-wall', [0, 0, 0]); ed.select([w.id]); view.frame('front', undefined, true); return w.id; });
  const pictureMesh = () => t.eval(id => {
    let found = null;
    window.studio.view.entries.get(id).group.traverse(o => { if (o.userData.part === 'picture') found = { w: o.geometry.parameters?.width, h: o.geometry.parameters?.height, repeat: o.material.map?.repeat.x }; });
    return found;
  }, wall);

  // A picture centred on the wall, then repeated over it.
  await t.openProperties();
  t.answer([image]);
  await page.getByRole('button', { name: 'Ajouter une image…' }).click();
  await page.waitForFunction(id => !!window.studio.ed.item(id).picture, wall, { timeout: 10000 }).catch(() => {});
  const pic = (await t.items()).find(i => i.id === wall).picture;
  const centred = await pictureMesh();
  t.check(pic?.fit === 'center' && Math.abs(pic.aspect - 1) < 1e-6 && centred && Math.abs(centred.w - pic.width) < 1e-6 && Math.abs(centred.h - pic.width) < 1e-6, `square image centred on the wall, ${Math.round((pic?.width ?? 0) * 100)} cm wide`);
  await page.getByRole('radio', { name: 'Répétée' }).click();
  const width = page.locator('.num-field', { hasText: 'Largeur d’un motif' }).locator('input');
  await width.fill('50');
  await width.press('Enter');
  const tiled = await pictureMesh();
  t.check(tiled && Math.abs(tiled.w - 4) < 1e-6 && Math.abs(tiled.repeat - 8) < 1e-6, `tiles of 50 cm cover the 4 m wall (${tiled?.repeat} across)`);
  await t.shot('picture-wall');

  // Logo: stamped in the bottom-right corner of an exported image, and shown while presenting.
  await t.eval(() => window.studio.ed.setSelection([]));
  await t.openProperties();
  t.answer([image]);
  await page.getByRole('button', { name: 'Ajouter un logo…' }).click();
  await page.waitForFunction(() => !!window.studio.ed.state.scene.logo, null, { timeout: 10000 }).catch(() => {});
  t.check((await t.eval(() => window.studio.ed.state.scene.logo?.corner)) === 'br', 'logo added, bottom right');
  const png = path.join(t.userData, 'logo.png');
  t.answer([png]);
  await page.locator('.top-group').getByRole('button', { name: 'Exporter' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Exporter' }).click();
  for (let k = 0; k < 50 && !fs.existsSync(png); k++) await page.waitForTimeout(200);
  const stamped = fs.existsSync(png) && await t.eval(async b64 => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const img = await load('data:image/png;base64,' + b64), c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const { size } = window.studio.ed.state.scene.logo, w = c.width * size, m = c.width * 0.025;
    // Opaque pixels of the app icon inside the logo's box; the plain floor elsewhere.
    const inBox = g.getImageData(Math.round(c.width - m - w / 2), Math.round(c.height - m - w * 0.3), 1, 1).data;
    const outside = g.getImageData(Math.round(c.width / 2), Math.round(c.height - m - w * 0.3), 1, 1).data;
    return Math.abs(inBox[0] - outside[0]) + Math.abs(inBox[1] - outside[1]) + Math.abs(inBox[2] - outside[2]) > 60;
  }, fs.readFileSync(png).toString('base64'));
  t.check(stamped, 'the exported image carries the logo in its corner');
  await page.getByRole('button', { name: 'Présenter' }).click();
  t.check(await page.locator('.logo-overlay').isVisible(), 'the logo shows during the presentation');
  await page.keyboard.press('Escape');

  // Free rotation (on small screens the properties drawer covers the right of the scene: the
  // pointer stays on the left). T, move the pointer around the wall, click to keep; Escape puts it back.
  await t.eval(id => window.studio.ed.select([id]), wall);
  const box = await page.locator('main.stage canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.75;
  await page.mouse.move(cx - 200, cy);
  await page.locator('main.stage canvas').focus();
  await page.keyboard.press('t');
  await page.mouse.move(cx - 200, cy + 10);
  for (let k = 1; k <= 8; k++) await page.mouse.move(cx - 200 * Math.cos(k * 0.1), cy - 200 * Math.sin(k * 0.1));
  t.check(await page.locator('.spin-label').isVisible(), 'the angle follows the cursor');
  await page.mouse.down(); await page.mouse.up();
  const turned = (await t.items()).find(i => i.id === wall).rotation;
  const steps = turned / (Math.PI / 12);
  t.check(Math.abs(turned) > 0.1 && Math.abs(steps - Math.round(steps)) < 1e-6 && (await t.eval(() => window.studio.ed.selection.length)) === 1, `a click keeps the rotation (${Math.round(turned * 180 / Math.PI)}°, by 15° steps)`);
  await page.keyboard.press('t');
  for (let k = 1; k <= 6; k++) await page.mouse.move(cx - 200 * Math.cos(k * 0.15), cy + 200 * Math.sin(k * 0.15));
  await page.keyboard.press('Escape');
  const back = (await t.items()).find(i => i.id === wall).rotation;
  t.check(Math.abs(back - turned) < 1e-9 && !(await page.locator('.spin-label').isVisible()), 'Escape puts the rotation back');
};
