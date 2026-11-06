// Composition with real pointer and keyboard input: library drop, surface seating, cloth,
// grids, moving a dressed table, rotation, delete/undo, field input safety, riser limit.
module.exports = async t => {
  const { page } = t;
  await t.eval(() => window.studio.ed.newProject());

  // Drag a table from the library onto the stage.
  await page.locator('.cat', { hasText: 'Tables' }).click();
  const card = await page.locator('.card', { hasText: 'Table 180 × 75' }).boundingBox();
  const stage = await page.locator('main.stage').boundingBox();
  await page.mouse.move(card.x + 40, card.y + 40);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2, { steps: 12 });
  await page.mouse.up();
  let items = await t.items();
  t.check(items.length === 1 && items[0].type === 'table' && items[0].position[1] === 0, 'table dropped from the library');
  const table = items[0];

  // Click-add a riser: it lands on the selected table.
  await page.locator('.cat', { hasText: 'Socles' }).click();
  await page.locator('.card', { hasText: 'Cube 30' }).click();
  let riser = (await t.items()).find(i => i.type === 'riser');
  t.check(riser?.parentId === table.id && Math.abs(riser.position[1] - 0.75) < 0.002, 'riser placed on the table top');

  // A tablecloth: once settled, the riser stands on the cloth.
  await t.eval(id => window.studio.ed.select([id]), table.id);
  await page.locator('.cat', { hasText: 'Tissus' }).click();
  await page.locator('.card', { hasText: 'Nappe 320 × 180' }).click();
  await t.settled();
  riser = (await t.items()).find(i => i.type === 'riser');
  t.check(riser.position[1] > 0.752 && riser.position[1] < 0.765, `riser re-seated on the cloth (${riser.position[1].toFixed(4)} m)`);

  // A cocktail on the selected riser, then a grid of 10 in rows of 4.
  await t.eval(id => window.studio.ed.select([id]), riser.id);
  await page.locator('.cat', { hasText: 'Cocktails' }).click();
  await page.locator('.card', { hasText: 'Blue Lagoon' }).click();
  const drink = (await t.items()).find(i => i.type === 'cocktail');
  t.check(drink.parentId === riser.id && Math.abs(drink.position[1] - (riser.position[1] + riser.size[1])) < 0.003, 'cocktail on the riser top');
  await page.getByText('Disposer en grille…').click();
  for (const [label, value] of [['Quantité', '10'], ['Par rangée', '4']]) {
    const input = page.locator('.num-field', { hasText: label }).locator('input');
    await input.fill(value);
    await input.press('Enter');
  }
  await page.getByRole('button', { name: 'Placer 10' }).click();
  t.check((await t.items()).filter(i => i.type === 'cocktail').length === 10, 'grid places exactly 10');
  await t.eval(() => window.studio.ed.undo());
  t.check((await t.items()).filter(i => i.type === 'cocktail').length === 1, 'one undo removes the whole grid');
  await t.eval(() => window.studio.ed.redo());
  await t.shot('editing-grid');

  // Drag the cloth: the whole dressed table moves rigidly, as one undo step.
  await t.eval(() => { window.studio.ed.setSelection([]); window.studio.view.frame('perspective', undefined, true); });
  await t.settled();
  const before = await t.items();
  const [px, py] = await t.eval(() => {
    const { view, ed } = window.studio, tb = ed.state.items.find(i => i.type === 'table');
    const v = view.camera.position.clone().set(tb.position[0] + 0.3, 0.55, tb.position[2] + 0.45).project(view.camera);
    const r = view.renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  });
  t.check((await t.eval(([x, y]) => window.studio.view.itemAt(x, y), [px, py])) !== null, 'pointer hits the dressed table');
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 120, py + 10, { steps: 10 });
  await page.mouse.up();
  await t.settled();
  const after = await t.items();
  const dx = after.map(a => a.position[0] - before.find(b => b.id === a.id).position[0]);
  t.check(Math.abs(dx[0]) > 0.05 && Math.max(...dx) - Math.min(...dx) < 1e-6, 'everything on the table moved together');
  const undone = await t.eval(() => { const d = window.studio.ed.doc; d.undo(); const x = d.state.items[0].position[0]; d.redo(); return x; });
  t.check(undone === before[0].position[0], 'the drag is one undo step');

  // Rotation keeps the layout.
  await t.eval(id => { const { ed } = window.studio; ed.select([id]); ed.rotate([id], Math.PI / 2); }, table.id);
  await t.settled();
  const rot = await t.items();
  const dist = list => { const a = list.find(i => i.type === 'table'), b = list.find(i => i.type === 'riser'); return Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]); };
  t.check(Math.abs(dist(rot) - dist(before)) < 1e-6, 'rotation keeps distances to the table centre');

  // Delete cascades and undoes; typing in a field never deletes objects.
  await page.locator('main.stage canvas').focus();
  await page.keyboard.press('Delete');
  t.check((await t.items()).length === 0, 'Delete removes the table and what is on it');
  await t.eval(() => window.studio.ed.undo());
  t.check((await t.items()).length === rot.length, 'undo restores the whole arrangement');
  await t.eval(id => window.studio.ed.select([id]), table.id);
  const length = page.locator('.num-field', { hasText: 'Longueur' }).locator('input');
  await length.click();
  await page.keyboard.press('Backspace');
  t.check((await t.items()).length === rot.length, 'Backspace inside a field keeps the objects');
  await length.fill('200');
  await length.press('Enter');
  t.check((await t.items()).find(i => i.type === 'table').size[0] === 2, 'table length set to 200 cm');

  // Risers never exceed 50 cm.
  await t.eval(() => { const { ed } = window.studio; ed.select([ed.state.items.find(i => i.type === 'riser').id]); });
  const height = page.locator('.num-field', { hasText: 'Hauteur' }).locator('input');
  await height.fill('80');
  await height.press('Enter');
  t.check((await t.items()).find(i => i.type === 'riser').size[1] === 0.5, 'riser height capped at 50 cm');
  await t.settled();
  await t.shot('editing-final');
};
