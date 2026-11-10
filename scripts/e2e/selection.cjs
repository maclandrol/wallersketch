// Working on several objects at once with real pointer input: box selection, the selection
// bar (align, distribute, replace, select similar), alignment guides while dragging, and
// emptying the composition behind a confirmation.
module.exports = async t => {
  const { page } = t;
  const bar = page.locator('.sel-bar');
  const pick = async (button, item) => { await bar.getByRole('button', { name: button }).click(); await page.getByRole('menuitem', { name: item }).click(); };
  const screen = p => t.eval(p => {
    const { view } = window.studio, r = view.renderer.domElement.getBoundingClientRect();
    const v = view.camera.position.clone().set(p[0], p[1], p[2]).project(view.camera);
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }, p);
  const byRef = async ref => (await t.items()).find(i => i.ref === ref);

  // Three presentoirs on a banquet table, seen from above.
  await t.eval(() => {
    const { ed, view } = window.studio;
    ed.newProject();
    const table = ed.add('rect-240');
    const at = { 'cube-30': [-0.8, 0], 'cube-20': [-0.1, 0.12], 'cube-40': [0.75, 0] };
    for (const ref of Object.keys(at)) { ed.select([table.id]); ed.add(ref); }
    ed.patch(ed.state.items.filter(i => i.type === 'riser').map(i => i.id), i => ({ position: [at[i.ref][0], i.position[1], at[i.ref][1]], parentId: table.id }));
    ed.setSelection([]);
    view.frame('top', undefined, true);
  });
  await t.settled();

  // Box selection with the Sélection tool takes the cubes, not the table they stand on.
  const corners = [];
  for (const i of (await t.items()).filter(i => i.type === 'riser')) {
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) corners.push(await screen([i.position[0] + dx * i.size[0] / 2, i.position[1] + i.size[1], i.position[2] + dz * i.size[2] / 2]));
  }
  const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
  await page.getByRole('button', { name: 'Sélection', exact: true }).click();
  await page.mouse.move(Math.min(...xs) - 12, Math.min(...ys) - 12);
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 12, Math.max(...ys) + 12, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Sélection', exact: true }).click();
  let selected = await t.eval(() => window.studio.ed.selected.map(i => i.type));
  t.check(selected.length === 3 && selected.every(x => x === 'riser'), `box selects the three cubes (${selected.join(', ')})`);
  t.check((await bar.locator('.sel-label').textContent()) === '3 socles', 'selection bar names what is selected');

  // Align the backs, then spread them with equal gaps: both from the bar, as one undo step each.
  await pick('Aligner et répartir', 'Aligner au fond');
  const backs = (await t.items()).filter(i => i.type === 'riser').map(i => i.position[2] - i.size[2] / 2);
  t.check(Math.max(...backs) - Math.min(...backs) < 1e-6, 'backs aligned');
  await pick('Aligner et répartir', 'Répartir de gauche à droite');
  const row = (await t.items()).filter(i => i.type === 'riser').sort((a, b) => a.position[0] - b.position[0]);
  const gaps = [0, 1].map(k => (row[k + 1].position[0] - row[k + 1].size[0] / 2) - (row[k].position[0] + row[k].size[0] / 2));
  t.check(Math.abs(gaps[0] - gaps[1]) < 1e-6 && (await t.eval(() => window.studio.ed.selection.length)) === 3, `equal gaps (${gaps.map(g => (g * 100).toFixed(1)).join(' / ')} cm), selection kept`);
  await t.eval(() => window.studio.ed.undo());
  const undone = (await t.items()).filter(i => i.type === 'riser').map(i => i.position[0]);
  t.check(undone.includes(-0.1), 'one undo reverts the distribution');
  await t.eval(() => window.studio.ed.redo());

  // Guides: dragged near a neighbour's centre line, a cube lands exactly on it, not on the grid.
  const c30 = await byRef('cube-30'), c20 = await byRef('cube-20');
  await t.eval(([id, dz]) => window.studio.ed.move([id], [0, 0, dz], true, undefined, false), [c20.id, c30.position[2] - c20.position[2] + 0.012]);
  t.check(Math.abs((await byRef('cube-20')).position[2] - c30.position[2]) < 1e-9, 'drag snaps to the neighbour’s centre line');

  // Cocktails: select similar, then replace them all in place.
  await t.eval(id => { const { ed } = window.studio; ed.select([id]); ed.add('mojito'); ed.select([id]); ed.add('mojito'); ed.select([id]); ed.add('sunrise'); }, c30.id);
  const first = (await t.items()).find(i => i.ref === 'mojito');
  await t.eval(id => window.studio.ed.select([id]), first.id);
  await pick('Étendre la sélection', 'Sélectionner les mêmes');
  t.check((await t.eval(() => window.studio.ed.selection.length)) === 2, 'select similar finds both mojitos, not the sunrise');
  const places = (await t.items()).filter(i => i.ref === 'mojito').map(i => i.position.join());
  await pick('Remplacer par un autre cocktail ou verre', 'Blue Lagoon');
  const swapped = (await t.items()).filter(i => i.ref === 'blue-lagoon');
  t.check(swapped.length === 2 && swapped.every(i => places.includes(i.position.join())), 'replace swaps both drinks in place');
  await t.shot('selection');

  // Arrange: the two blue lagoons and the sunrise in one row, then a grid of two per row.
  await t.eval(() => { const { ed } = window.studio; ed.select(ed.state.items.filter(i => i.type === 'cocktail').map(i => i.id), 'single'); });
  await pick('Ranger en ligne ou en grille', 'Ranger en ligne');
  let drinks = (await t.items()).filter(i => i.type === 'cocktail');
  t.check(new Set(drinks.map(i => i.position[2].toFixed(4))).size === 1, 'arranged in one row');
  await pick('Ranger en ligne ou en grille', 'Ranger en grille…');
  const perRow = page.locator('.arrange-pop .num-field', { hasText: 'Par rangée' }).locator('input');
  await perRow.fill('2');
  await perRow.press('Enter');
  drinks = (await t.items()).filter(i => i.type === 'cocktail');
  t.check(new Set(drinks.map(i => i.position[2].toFixed(4))).size === 2 && new Set(drinks.map(i => i.position[0].toFixed(4))).size === 2, 'grid of two per row');
  await page.getByRole('button', { name: 'Terminé' }).click();

  // Grabbing a glass by its rim: it stays under the pointer while dragged.
  await t.eval(() => { const { ed, view } = window.studio; ed.setSelection([]); view.frame('perspective', undefined, true); });
  await t.settled();
  const glass = drinks[0];
  const rim = await screen([glass.position[0], glass.position[1] + glass.size[1] * 0.85, glass.position[2]]);
  t.check((await t.eval(([x, y]) => window.studio.view.itemAt(x, y), rim)) === glass.id, 'a click on the glass picks that glass');
  await page.mouse.move(rim[0], rim[1]);
  await page.mouse.down();
  await page.mouse.move(rim[0] + 30, rim[1] - 6, { steps: 6 });
  const moved = await t.eval(id => window.studio.ed.item(id), glass.id);
  const now = await screen([moved.position[0], moved.position[1] + moved.size[1] * 0.85, moved.position[2]]);
  await page.mouse.up();
  t.check(Math.hypot(now[0] - rim[0] - 30, now[1] - rim[1] + 6) < 8, `the dragged glass stays under the pointer (${Math.round(Math.hypot(now[0] - rim[0] - 30, now[1] - rim[1] + 6))} px)`);

  // A selection moves together, even with the Sélection tool on or Shift still held.
  const sel4 = (await t.items()).filter(i => i.type === 'cocktail').map(i => i.id);
  for (const [label, setup] of [['with the Sélection tool on', 'tool'], ['with Shift held', 'shift']]) {
    await t.eval(ids => window.studio.ed.select(ids, 'single'), sel4);
    if (setup === 'tool') await page.getByRole('button', { name: 'Sélection', exact: true }).click();
    const lead = (await t.items()).find(i => i.id === sel4[1]);
    const at = await screen([lead.position[0], lead.position[1] + lead.size[1] * 0.6, lead.position[2]]);
    const x0 = (await t.items()).filter(i => sel4.includes(i.id)).map(i => i.position[0]);
    if (setup === 'shift') await page.keyboard.down('Shift');
    await page.mouse.move(at[0], at[1]); await page.mouse.down(); await page.mouse.move(at[0] + 40, at[1], { steps: 6 }); await page.mouse.up();
    if (setup === 'shift') await page.keyboard.up('Shift');
    if (setup === 'tool') await page.getByRole('button', { name: 'Sélection', exact: true }).click();
    const dx = (await t.items()).filter(i => sel4.includes(i.id)).map((i, k) => i.position[0] - x0[k]);
    t.check(dx.every(d => Math.abs(d - dx[0]) < 1e-6 && Math.abs(d) > 0.01) && (await t.eval(() => window.studio.ed.selection.length)) === sel4.length, `the selection moves together ${label}`);
  }

  // Copy and paste with the usual shortcuts, onto a presentoir.
  await page.locator('main.stage canvas').focus();
  await t.eval(ids => { const { ed } = window.studio; ed.select(ids, 'single'); ed.startArrange(); ed.arrange(2, 0.01); }, sel4);
  await page.keyboard.press('ControlOrMeta+c');
  await t.eval(id => window.studio.ed.select([id]), c30.id);
  await page.keyboard.press('ControlOrMeta+v');
  const pasted = (await t.items()).filter(i => i.type === 'cocktail' && !sel4.includes(i.id));
  t.check(pasted.length === sel4.length && pasted.every(i => i.parentId === c30.id), `pasted ${pasted.length} drinks onto the selected cube`);

  // An empty glass is filled from the properties, then gets a third colour, reordered and removed.
  const empty = await t.eval(id => { const { ed } = window.studio; ed.select([id]); return ed.add('glass-coupe').id; }, c30.id);
  await t.openProperties();
  await page.getByRole('button', { name: 'Remplir ce verre' }).click();
  const filled = await t.eval(id => window.studio.ed.item(id), empty);
  t.check(filled.type === 'cocktail' && filled.drink.layers.length === 2 && filled.drink.fill > 0.5, 'the empty coupe is filled');
  await page.getByRole('button', { name: 'Ajouter une couleur' }).click();
  t.check((await t.eval(id => window.studio.ed.item(id).drink.layers.length, empty)) === 3, 'a third colour is added');
  const colours = () => t.eval(id => window.studio.ed.item(id).drink.layers.map(l => l.color), empty);
  await t.eval(id => window.studio.ed.patch([id], i => ({ drink: { ...i.drink, layers: i.drink.layers.map((l, k) => ({ ...l, color: ['#ff0000', '#00ff00', '#0000ff'][k] })) } })), empty);
  await page.locator('.layer').first().getByRole('button', { name: 'Descendre' }).click();
  t.check((await colours()).join() === '#ff0000,#0000ff,#00ff00', 'the surface colour moves down one place');
  await page.locator('.layer').last().getByRole('button', { name: 'Retirer cette couleur' }).click();
  t.check((await colours()).join() === '#0000ff,#00ff00', 'the bottom colour is removed');

  // Camera from the keyboard, and the shortcuts sheet.
  await page.locator('main.stage canvas').focus();
  const dist = () => t.eval(() => { const v = window.studio.view; return v.camera.position.distanceTo(v.controls.target); });
  const d0 = await dist();
  await page.keyboard.press('-');
  await page.waitForTimeout(400);
  t.check(await dist() > d0 * 1.2, 'minus zooms out');
  await page.keyboard.press('?');
  t.check(await page.locator('.shortcuts').isVisible(), '? opens the shortcuts');
  await page.keyboard.press('Escape');

  // Emptying asks first, and can be undone.
  const count = (await t.items()).length;
  await t.eval(() => window.studio.ed.setSelection([]));
  await page.locator('main.stage canvas').click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Vider la composition…' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Annuler' }).click();
  t.check((await t.items()).length === count, 'cancelling keeps everything');
  await page.locator('main.stage canvas').click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Vider la composition…' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Vider' }).click();
  t.check((await t.items()).length === 0, 'composition emptied after confirmation');
  await t.eval(() => window.studio.ed.undo());
  t.check((await t.items()).length === count, 'undo brings it all back');
};
