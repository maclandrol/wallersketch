// Presentation features and assistant bridge: grid snapping, stepped presentoir under a
// drape, champagne tower, STEP import, 3D export, drink builder, recipes, and an MCP client
// driving the running app through desktop/mcp.cjs.
const path = require('node:path'), fs = require('node:fs'), { spawn } = require('node:child_process');

module.exports = async t => {
  await t.eval(() => window.studio.ed.newProject());
  const table = await t.eval(() => window.studio.ed.add('rect-240').id);

  // Snapping: a drag snaps the riser to the 5 cm grid of the table, measured from its corner.
  const riser = await t.eval(id => { const { ed } = window.studio; ed.select([id]); return ed.add('tiers-3').id; }, table);
  await t.eval(id => window.studio.ed.move([id], [0.123, 0, 0.031], true, undefined, false), riser);
  const r = (await t.items()).find(i => i.id === riser);
  const fromCorner = (r.position[0] + 1.2) * 100;
  t.check(Math.abs(fromCorner - Math.round(fromCorner / 5) * 5) < 1e-6, `snapped to the 5 cm grid (${fromCorner.toFixed(2)} cm from the edge)`);
  await t.eval(id => window.studio.ed.move([id], [0.013, 0, 0], true, undefined, true), riser);
  t.check(Math.abs((await t.items()).find(i => i.id === riser).position[0] - r.position[0] - 0.013) < 1e-9, 'Alt-drag moves freely');

  // A drapé over the stepped presentoir follows its steps.
  await t.eval(id => { const { ed } = window.studio; ed.select([id]); const f = ed.add('drape-150'); ed.patch([f.id], () => ({ position: [ed.item(id).position[0], 0, ed.item(id).position[2]] })); }, table);
  await t.settled();
  const top = await t.eval(id => { const { view, ed } = window.studio, i = ed.item(id); return view.probe(i.position[0], i.position[2] - i.size[2] / 2 + 0.05, new Set()).y; }, riser);
  const front = await t.eval(id => { const { view, ed } = window.studio, i = ed.item(id); return view.probe(i.position[0], i.position[2] + i.size[2] / 2 - 0.05, new Set()).y; }, riser);
  t.check(top - front > 0.15, `drape follows the steps (back ${top.toFixed(3)} m, front ${front.toFixed(3)} m)`);

  // Champagne tower: 55 coupes in a handful of draw calls.
  const tower = await t.eval(id => { const { ed } = window.studio; ed.select([id]); return ed.add('tower-5').id; }, table);
  const calls = await t.eval(id => { let n = 0; window.studio.view.exportObject([id]).traverse(o => { if (o.isMesh) n++; }); return n; }, tower);
  t.check(calls <= 4, `tower of 55 coupes is ${calls} meshes`);

  // STEP from a CAD tool arrives in real units: a 10 mm cube is 1 cm.
  t.answer([path.join(__dirname, 'cube-10mm.stp')]);
  await t.eval(() => window.studio.ed.importModel());
  const cube = (await t.items()).find(i => i.type === 'model');
  t.check(cube && cube.size.every(v => Math.abs(v - 0.01) < 1e-4), 'STEP imported in real units (10 mm cube)');

  // 3D export: a valid GLB of the whole composition.
  const glbPath = path.join(t.userData, 'scene.glb');
  t.answer([glbPath]);
  await t.eval(async () => { const { exportScene } = await window.studio.interchange(); return window.studio.ed.exportFiles([{ name: 'scene', data: await exportScene(window.studio.view.exportObject(), 'glb') }]); });
  t.check(fs.existsSync(glbPath) && fs.readFileSync(glbPath).toString('ascii', 0, 4) === 'glTF', 'composition exported as GLB');

  // Drink builder.
  await t.category('Cocktails');
  await t.page.getByRole('button', { name: 'Créer un cocktail…' }).click();
  await t.page.locator('.modal input.select').fill('Rose impériale');
  await t.page.getByRole('button', { name: 'Enregistrer et placer' }).click();
  await t.page.waitForFunction(() => window.studio.ed.state.items.some(i => i.name === 'Rose impériale'), null, { timeout: 10000 }).catch(() => {});
  await t.category('Cocktails');
  const placed = (await t.items()).filter(i => i.name === 'Rose impériale');
  t.check(placed.length === 1, 'drink builder creates and places a cocktail' + (placed.length ? '' : ': ' + await t.eval(() => document.querySelector('.toast')?.textContent)));
  t.check(await t.page.locator('.card', { hasText: 'Rose impériale' }).count() === 1, 'the new cocktail is in the library');

  // ChatGPT / DeepSeek in a browser: the answer comes back through the clipboard.
  await t.page.getByRole('button', { name: 'Assistant' }).click();
  await t.page.getByRole('button', { name: 'ChatGPT, DeepSeek…' }).click();
  await t.eval(() => window.native.copy('Voici les recettes :\n```json\n{ "recipes": [{ "kind": "fabric", "name": "Velours bordeaux", "shape": "rect", "width_cm": 300, "depth_cm": 180, "color": "#5b1424", "material": "velvet" }, { "kind": "cocktail", "name": "Mauvais", "glass": "chope", "colors": ["#ff0000"] }] }\n```'));
  await t.page.getByRole('button', { name: 'Coller la réponse' }).click();
  t.check(await t.page.locator('.recipe-results .card', { hasText: 'Velours bordeaux' }).count() === 1, 'chat answer pasted from the clipboard is previewed');
  t.check(await t.page.getByRole('button', { name: 'Copier les corrections pour l’assistant' }).count() === 1, 'invalid recipes offer a correction message for the chat');
  await t.page.getByRole('button', { name: 'Garder dans la bibliothèque' }).click();
  await t.page.waitForFunction(() => window.studio.ed.library.entries.some(e => e.name === 'Velours bordeaux'), null, { timeout: 10000 }).catch(() => {});
  t.check(await t.eval(() => window.studio.ed.library.entries.some(e => e.name === 'Velours bordeaux')), 'pasted fabric kept in the library');

  // MCP: a client process talks JSON-RPC to desktop/mcp.cjs, which drives this window.
  await t.eval(() => window.native.agentEnable(true));
  const mcp = spawn(process.execPath, [path.resolve('desktop/mcp.cjs'), '--user-data', t.userData], { stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map(); let buf = '';
  mcp.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); replies.get(m.id)?.(m); } });
  let seq = 0;
  const rpc = (method, params) => new Promise(res => { const id = ++seq; replies.set(id, res); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).result;
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  const tools = (await rpc('tools/list')).result.tools.map(x => x.name);
  t.check(['get_context', 'create_assets', 'add_to_scene', 'render_view'].every(n => tools.includes(n)), 'MCP lists the WallerSketch tools');
  const ctx = JSON.parse((await call('get_context')).content[0].text);
  t.check(ctx.guide.includes('presentoir') && ctx.scene.items.length > 0, 'MCP context has the recipe guide and the scene');
  const created = JSON.parse((await call('create_assets', { recipes: [
    { kind: 'cocktail', name: 'Lagon or', glass: 'coupe', colors: ['#0b6fd0', '#7fd3ff'], garnish: ['gold-rim'], fill: 0.8 },
    { kind: 'presentoir', name: 'Trop haut', shape: 'rect', width_cm: 40, depth_cm: 40, height_cm: 90 },
  ] })).content[0].text);
  t.check(created.created.length === 1 && created.errors.some(e => e.includes('height_cm')), 'MCP creates valid assets and explains invalid ones');
  const added = JSON.parse((await call('add_to_scene', { asset: created.created[0].ref, on: table, count: 6, columns: 3 })).content[0].text);
  t.check(added.added.length === 6, 'MCP places a grid of 6 on the table');
  const shot = await call('render_view', { view: 'perspective', width: 320, height: 200 });
  t.check(shot.content[0].type === 'image' && shot.content[0].data.length > 1000, 'MCP renders the view as an image');
  mcp.kill();
  await t.eval(() => window.native.agentEnable(false));
  await t.shot('features');
};
