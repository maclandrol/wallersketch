import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, duplicateItems, gridOffsets, gridPositions, removeItems, transformItems, withDescendants, clampSize } from '../src/core/scene';
import { Document, emptyState } from '../src/core/document';
import { parseProject, serialise, isInvalidProject } from '../src/core/project';
import { drapeInput, drapeKey, overhang } from '../src/core/fabric';
import { CATALOG, RISER_MAX_HEIGHT } from '../src/core/catalog';
import type { Item, Vec3 } from '../src/core/types';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

function scene() {
  const table = createItem('rect-180', [1, 0, 2], 0.3);
  const riser = { ...createItem('cube-30', [1.2, 0.75, 2.1]), parentId: table.id };
  const glass = { ...createItem('blue-lagoon', [1.2, 1.05, 2.1]), parentId: riser.id };
  const free = createItem('glass-flute', [5, 0, 5]);
  return [table, riser, glass, free];
}

test('the four menu cocktails exist and every riser respects 50 cm', () => {
  for (const name of ['Blue Lagoon', 'Sunrise', 'Mojito mangue', 'Mojito classique']) assert.ok(CATALOG.some(e => e.name === name), name);
  assert.ok(CATALOG.filter(e => e.type === 'riser').every(r => r.size[1] <= RISER_MAX_HEIGHT));
});

test('risers are capped at 50 cm everywhere', () => {
  const r = createItem('cube-50');
  assert.equal(clampSize(r, [0.5, 0.9, 0.5])[1], 0.5);
  const text = JSON.stringify({ format: 'wallersketch', version: 2, name: 'x', items: [{ ...r, size: [0.5, 2, 0.5] }], views: [], arrangements: [], assets: [] });
  assert.equal(parseProject(text).state.items[0].size[1], 0.5);
});

test('moving a table moves everything resting on it, rigidly', () => {
  const items = scene();
  const moved = transformItems(items, [items[0].id], [0.5, 0, -0.25]);
  for (let k = 0; k < 3; k++) { near(moved[k].position[0] - items[k].position[0], 0.5); near(moved[k].position[2] - items[k].position[2], -0.25); }
  assert.equal(moved[3], items[3], 'unrelated object untouched (same reference)');
});

test('rotation turns supported objects around the pivot with Three.js yaw', () => {
  const items = scene();
  const t = items[0];
  const out = transformItems(items, [t.id], [0, 0, 0], Math.PI / 2, t.position);
  // Three.js: a point at +x turns to -z for +90° yaw.
  const dx = items[1].position[0] - t.position[0], dz = items[1].position[2] - t.position[2];
  near(out[1].position[0] - t.position[0], dz, 1e-9);
  near(out[1].position[2] - t.position[2], -dx, 1e-9);
  near(out[1].rotation, items[1].rotation + Math.PI / 2, 1e-9);
  // Distances preserved.
  near(Math.hypot(out[2].position[0] - out[0].position[0], out[2].position[2] - out[0].position[2]), Math.hypot(items[2].position[0] - items[0].position[0], items[2].position[2] - items[0].position[2]), 1e-9);
});

test('delete takes supported objects, duplicate remaps links', () => {
  const items = scene();
  assert.deepEqual([...withDescendants(items, [items[0].id])].sort(), [items[0].id, items[1].id, items[2].id].sort());
  assert.equal(removeItems(items, [items[0].id]).length, 1);
  const copies = duplicateItems(items, [items[0].id], [3, 0, 0]);
  assert.equal(copies.length, 3);
  const ids = new Set(copies.map(c => c.id));
  assert.ok(copies.every(c => !items.some(i => i.id === c.id)));
  assert.ok(copies.filter(c => c.parentId).every(c => ids.has(c.parentId!)), 'children point at the copies');
});

test('grids: exact count, partial last row centred, gap is clear space', () => {
  const g = gridOffsets({ count: 10, columns: 3, gap: 0.02 }, [0.08, 0.08]);
  assert.equal(g.length, 10);
  const rows = new Set(g.map(p => p[1].toFixed(6)));
  assert.equal(rows.size, 4);
  const last = g.slice(9);
  near(last[0][0], 0, 1e-12);
  near(g[1][0] - g[0][0], 0.1, 1e-12);
  // Rotated support: grid turns with it.
  const p = gridPositions({ count: 2, columns: 2, gap: 0 }, [0.1, 0.1], [0, 0, 0] as Vec3, Math.PI / 2);
  near(p[0][0], 0, 1e-12); near(Math.abs(p[0][2]), 0.05, 1e-12);
});

test('history: merged drags, undo to saved state is clean, edits during save stay dirty', () => {
  const d = new Document();
  const a = createItem('cube-20');
  d.update(s => ({ ...s, items: [a] }));
  for (let k = 1; k <= 5; k++) d.update(s => ({ ...s, items: transformItems(s.items, [a.id], [0.01, 0, 0]) }), 'drag');
  d.seal();
  d.undo();
  assert.equal(d.state.items[0].position[0], 0, 'five drag moves are one step');
  d.redo();
  const snapshot = d.state, gen = d.generation;
  d.update(s => ({ ...s, name: 'pendant la sauvegarde' }));
  d.markSaved(snapshot, gen, '/tmp/x.cocktail');
  assert.ok(d.dirty, 'edit made during the save is still unsaved');
  d.undo();
  assert.ok(!d.dirty, 'undo back to the saved content is clean');
  // A save that finishes after New must not adopt the new document.
  d.replace(emptyState('Nouveau'), []);
  assert.equal(d.markSaved(snapshot, gen, '/tmp/old.cocktail'), false);
  assert.equal(d.filePath, undefined);
});

test('project round trip keeps everything and embedded assets; prunes unused ones', () => {
  const items = scene();
  items.push({ id: 'm1', type: 'model', ref: 'asset-1', name: 'Vase importé', position: [0, 0, 0], rotation: 0, size: [0.2, 0.3, 0.2], finish: { m0: { color: '#ff0000' } }, tilt: [1, 0] });
  const state = { ...emptyState('Mariage'), items, views: [{ id: 'v', name: 'Face', position: [0, 1, 3] as Vec3, target: [0, 1, 0] as Vec3, fov: 35 }] };
  const assets = new Map([['asset-1', { id: 'asset-1', name: 'vase.glb', type: 'model' as const, mime: 'model/gltf-binary', data: 'AAAA' }], ['unused', { id: 'unused', name: 'x.png', type: 'texture' as const, mime: 'image/png', data: 'AAAA' }]]);
  const back = parseProject(serialise(state, assets));
  assert.deepEqual(back.state.items, state.items);
  assert.deepEqual(back.state.views, state.views);
  assert.deepEqual(back.assets.map(a => a.id), ['asset-1']);
});

test('invalid projects are rejected with a clear error; links repaired', () => {
  assert.throws(() => parseProject('{'), e => isInvalidProject(e));
  assert.throws(() => parseProject(JSON.stringify({ format: 'other' })), /pas un projet/);
  assert.throws(() => parseProject(JSON.stringify({ format: 'cocktail-studio', version: 9 })), /plus récente/);
  assert.throws(() => parseProject(JSON.stringify({ format: 'wallersketch', version: 2, name: 'x', items: [{ type: 'table', position: [NaN, 0, 0], size: [1, 1, 1] }] })));
  const a = createItem('cube-20'), b = createItem('cube-20');
  const cyc = [{ ...a, parentId: b.id }, { ...b, parentId: a.id }, { ...createItem('cube-20'), parentId: 'missing' }];
  const p = parseProject(JSON.stringify({ format: 'wallersketch', version: 2, name: 'x', items: cyc }));
  assert.ok(p.state.items.filter(i => i.parentId).length <= 1, 'cycle broken');
  assert.equal(p.state.items[2].parentId, undefined, 'dangling link removed');
});

test('version 1 prototype projects open', () => {
  const v1 = { format: 'cocktail-studio', version: 1, name: 'Ancien', items: [{ id: 't', kind: 'table', shape: 'box', size: [1.8, 0.76, 0.8], position: [0, 0, 0], rotation: 0, color: '#383d37' }, { id: 'c', kind: 'cloth', shape: 'box', size: [3, 0.01, 2], position: [0, 0.8, 0], rotation: 0, color: '#ffffff' }, { id: 'g', kind: 'cocktail', profile: 'flute', liquid: '#ff8800', size: [0.07, 0.23, 0.07], position: [0, 0.76, 0], rotation: 0, color: '#fff', parentId: 't' }], assets: [], views: [], presets: [] };
  const p = parseProject(JSON.stringify(v1));
  assert.deepEqual(p.state.items.map(i => i.type), ['table', 'fabric', 'cocktail']);
  assert.equal(p.state.items[2].drink?.glass, 'flute');
});

test('fabric drape key ignores rigid moves, changes with supports', () => {
  const t = createItem('rect-180', [0, 0, 0]);
  const f = { ...createItem('drape-150', [0, 0, 0]), parentId: t.id };
  const r = { ...createItem('cube-30', [0.3, 0.75, 0]), parentId: t.id };
  const items: Item[] = [t, f, r];
  const k0 = drapeKey(drapeInput(f, items));
  const moved = transformItems(items, [t.id], [1, 0, 2], 0.7, t.position);
  assert.equal(drapeKey(drapeInput(moved[1], moved)), k0, 'same shape after moving the table with its cloth');
  const raised = items.map(i => (i.id === r.id ? { ...i, size: [0.3, 0.45, 0.3] as Vec3 } : i));
  assert.notEqual(drapeKey(drapeInput(f, raised)), k0);
  // A nappe ignores risers; a drapé covers them.
  const nappe = { ...createItem('cloth-320', [0, 0, 0]) };
  assert.equal(drapeInput(nappe, [t, nappe, r]).colliders.length, 1);
  assert.equal(drapeInput(f, items).colliders.length, 2);
});

test('overhang is computed from the real dimensions', () => {
  const t = createItem('rect-180'); // 180 × 75
  const f = createItem('cloth-320'); // 320 × 180
  const o = overhang(f, t)!;
  near(o.ends, 0.7, 1e-9); near(o.sides, 0.525, 1e-9);
});

