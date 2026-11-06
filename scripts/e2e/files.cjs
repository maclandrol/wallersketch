// Native file workflow: model and texture import, save, reopen elsewhere, invalid files,
// PNG and batch export, autosave recovery.
const path = require('node:path'), fs = require('node:fs');

module.exports = async t => {
  const dir = path.join(t.userData, 'files');
  fs.mkdirSync(dir, { recursive: true });
  await t.eval(() => { window.studio.ed.newProject(); window.studio.ed.add('rect-120'); });

  // A GLB authored in centimetres arrives at 40 cm and rests on the table, even tilted.
  t.answer([path.join(__dirname, 'socle-cm.glb')]);
  await t.eval(() => window.studio.ed.importModel());
  await t.settled();
  const model = (await t.items()).find(i => i.type === 'model');
  t.check(model && Math.abs(model.size[0] - 0.4) < 1e-6 && Object.keys(model.finish).length === 2, 'GLB imported, scaled from cm, two editable materials');
  t.check(model && Math.abs(model.position[1] - 0.75) < 0.002, 'imported model rests on the table');
  await t.eval(id => window.studio.ed.patch([id], i => ({ tilt: [1, 0], size: [i.size[0], i.size[2], i.size[1]] })), model.id);
  await t.settled();
  const bottom = await t.eval(id => window.studio.view.contentBounds([id]).min.y, model.id);
  t.check(Math.abs(bottom - 0.75) < 0.003, 'tilted model is re-grounded on the table');

  // An image on a sign.
  await t.eval(() => window.studio.ed.add('sign-a5'));
  t.answer([path.resolve('resources/icon-square.png')]);
  await t.eval(() => { const { ed } = window.studio; return ed.importTexture([ed.state.items.find(i => i.ref === 'sign-a5').id], 'main'); });

  // Save embeds everything; reopening a copy from another folder needs no original file.
  const file = path.join(dir, 'Essai.wsketch');
  t.answer([file]);
  await t.eval(() => window.studio.ed.save(true));
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  t.check(saved.version === 2 && saved.assets.length === 2, 'project saved with the model and image embedded');
  t.check(!(await t.eval(() => window.studio.ed.doc.dirty)), 'clean after saving');
  await t.eval(() => window.studio.ed.add('cube-20'));
  t.check(await t.eval(() => window.studio.ed.doc.dirty), 'dirty after an edit');
  const copy = path.join(dir, 'ailleurs', 'Copie.wsketch');
  fs.mkdirSync(path.dirname(copy));
  fs.copyFileSync(file, copy);
  t.answer([copy]);
  await t.eval(() => window.studio.ed.open());
  await t.settled();
  const reopened = await t.items();
  t.check(reopened.length === saved.items.length, 'copy reopened with its objects');
  const meshes = await t.eval(() => { let n = 0; window.studio.view.scene.traverse(o => { if (o.isMesh && /^m\d/.test(o.userData.part ?? '')) n++; }); return n; });
  t.check(meshes >= 2, 'embedded model renders after reopening');

  // An invalid file is refused and the current project kept.
  const bad = path.join(dir, 'bad.wsketch');
  fs.writeFileSync(bad, '{"format":"wallersketch","version":2,"name":"x","items":[{"type":"table","position":[1,2],"size":[1,1,1]}]}');
  t.answer([bad]);
  await t.eval(() => window.studio.ed.open());
  t.check((await t.items()).length === reopened.length, 'invalid file refused, work kept');

  // Exports: one PNG at the requested size, then several files into a folder.
  const png = path.join(dir, 'vue.png');
  t.answer([png]);
  await t.eval(() => window.studio.ed.exportFiles([{ name: 'vue', data: window.studio.view.capture(1920, 1080) }]));
  const bytes = fs.readFileSync(png);
  t.check(bytes.readUInt32BE(16) === 1920 && bytes.readUInt32BE(20) === 1080, 'PNG exported at 1920 × 1080');
  fs.mkdirSync(path.join(dir, 'lot'));
  t.answer([path.join(dir, 'lot')]);
  await t.eval(() => { const { ed, view } = window.studio; ed.addView('Face'); return ed.exportFiles([{ name: 'A', data: view.capture(640, 400) }, { name: 'B', data: view.capture(640, 400, ed.state.views[0]) }, { name: 'Plan', data: window.studio.plan(ed.state) }], 'Essai'); });
  t.check(fs.readdirSync(path.join(dir, 'lot', 'Essai')).sort().join() === 'A.png,B.png,Plan.svg', 'views and plan exported to a folder');

  // Autosave writes recovery for this document; New clears it.
  await t.eval(() => window.studio.ed.add('cube-30'));
  const recovery = path.join(t.userData, 'recovery.wsketch');
  for (let k = 0; k < 40 && !fs.existsSync(recovery); k++) await new Promise(r => setTimeout(r, 250));
  t.check(fs.existsSync(recovery) && JSON.parse(JSON.parse(fs.readFileSync(recovery, 'utf8')).project).items.length === reopened.length + 1, 'unsaved work written to recovery');
  await t.eval(() => window.studio.ed.newProject());
  for (let k = 0; k < 20 && fs.existsSync(recovery); k++) await new Promise(r => setTimeout(r, 100));
  t.check(!fs.existsSync(recovery), 'New discards the old recovery');
};
