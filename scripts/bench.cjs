// Performance probe on representative scenes: frame interval while orbiting, edit cost,
// process memory. Run: npm run bench (development build). Numbers depend on the machine.
module.exports = async t => {
  const orbit = async label => {
    const r = await t.eval(() => new Promise(done => {
      const v = window.studio.view, times = [];
      let last = performance.now(), n = 0;
      const step = () => {
        const now = performance.now(); times.push(now - last); last = now;
        const p = v.camera.position.clone().sub(v.controls.target);
        p.applyAxisAngle(p.clone().set(0, 1, 0), 0.02);
        v.camera.position.copy(v.controls.target).add(p);
        v.invalidate();
        if (++n < 120) requestAnimationFrame(step);
        else { times.shift(); times.sort((a, b) => a - b); done({ mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], ...v.stats() }); }
      };
      requestAnimationFrame(step);
    }));
    console.log(`  ${label}: ${r.mean.toFixed(1)} ms mean, ${r.p95.toFixed(1)} ms p95, ${r.calls} draw calls, ${(r.triangles / 1000).toFixed(0)}k triangles`);
  };
  await t.eval(() => { const { ed, templates } = window.studio; ed.newProject(templates.find(x => x.id === 'bar').build()); });
  await t.settled();
  await t.eval(() => window.studio.view.frame('perspective', undefined, true));
  await orbit('example bar');
  const built = await t.eval(() => {
    const t0 = performance.now(), { ed } = window.studio;
    ed.newProject();
    for (let k = 0; k < 3; k++) { const tb = ed.add('rect-300', [k * 3.6, 0, 0]); ed.select([tb.id]); ed.add('cloth-400'); }
    const tables = ed.state.items.filter(i => i.type === 'table');
    for (const tb of tables) for (const r of ['cube-40', 'cube-30', 'taper-45', 'cyl-30']) { ed.select([tb.id]); ed.add(r); }
    for (const [k, ref] of [[0, 'blue-lagoon'], [1, 'sunrise-flute']]) { ed.select([tables[k].id]); const c = ed.add(ref); ed.select([c.id]); ed.previewGrid({ count: 200, columns: 25, gap: 0.005 }); ed.commitGrid(); }
    return performance.now() - t0;
  });
  await t.settled();
  await t.eval(() => window.studio.view.frame('perspective', undefined, true));
  console.log(`  dense scene built in ${built.toFixed(0)} ms`);
  await orbit('3 dressed tables, 12 risers, 400 drinks');
  const edit = await t.eval(() => {
    const { ed } = window.studio, ids = ed.state.items.filter(i => i.type === 'cocktail').slice(0, 5).map(i => i.id), t0 = performance.now();
    for (let k = 0; k < 300; k++) ed.move(ids, [0.001, 0, 0], true, 'bench' + k);
    return (performance.now() - t0) / 300;
  });
  console.log(`  edit with re-seating: ${edit.toFixed(2)} ms`);
  const mem = await t.app.evaluate(({ app }) => app.getAppMetrics().map(m => `${m.type} ${Math.round(m.memory.workingSetSize / 1024)} MB`).join(', '));
  console.log('  working sets: ' + mem);
};
