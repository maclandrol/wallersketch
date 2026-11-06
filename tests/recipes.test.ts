import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRecipe, parseRecipes, RecipeError } from '../src/core/recipes';

test('recipes compile to library entries in metres', () => {
  const t = compileRecipe({ kind: 'table', name: 'Bar marbre', shape: 'rect', width_cm: 200, depth_cm: 60, height_cm: 105, top: { color: '#f2f1ee', texture: 'marble', finish: 'gloss' } });
  assert.deepEqual(t.entries[0].size, [2, 1.05, 0.6]);
  assert.equal(t.entries[0].finish.top.texture, 'marble');
  const p = compileRecipe({ kind: 'presentoir', name: 'Gradins', shape: 'tiers', steps: 4, width_cm: 100, depth_cm: 50, height_cm: 48 });
  assert.equal(p.entries[0].steps, 4);
});

test('a cocktail with its own glass embeds the profile', () => {
  const r = compileRecipe({ kind: 'cocktail', name: 'Tiki', glass: { name: 'Tiki', profile_mm: [[0, 0], [36, 0], [40, 60], [44, 160]], bowl_mm: 8 }, colors: ['#e8581f', '#f7b733'], garnish: ['pineapple', 'cherry'], ice: 3 });
  assert.equal(r.glasses.length, 1);
  assert.equal(r.entries[0].drink!.glass, r.glasses[0].id);
  assert.ok(Math.abs(r.entries[0].size[1] - 0.16) < 1e-9);
});

test('invalid recipes report every problem, with allowed values', () => {
  assert.throws(() => compileRecipe({ kind: 'presentoir', name: 'Trop haut', width_cm: 40, depth_cm: 40, height_cm: 80 }), (e: unknown) => e instanceof RecipeError && /height_cm/.test(e.message));
  assert.throws(() => compileRecipe({ kind: 'cocktail', name: 'X', glass: 'chope', colors: ['red'], garnish: ['parapluie'] }), (e: unknown) => e instanceof RecipeError && e.problems.length === 3);
});

test('compositions reference catalogue and inline assets', () => {
  const r = compileRecipe({ kind: 'composition', name: 'Bar', items: [
    { asset: 'rect-180', x_cm: 0, z_cm: 0 },
    { asset: { kind: 'presentoir', name: 'Cube or', shape: 'rect', width_cm: 30, depth_cm: 30, height_cm: 30, surface: { color: '#c9a45c', finish: 'brass' } }, x_cm: 40, z_cm: 0, on: 0 },
    { asset: 'champagne', x_cm: 40, z_cm: 0, on: 1 },
  ] });
  assert.equal(r.arrangement!.items.length, 3);
  assert.equal(r.arrangement!.items[2].parentId, r.arrangement!.items[1].id);
  assert.equal(r.entries.length, 1);
});

test('recipes are found inside an assistant answer', () => {
  const answer = 'Voici :\n```json\n{ "recipes": [{ "kind": "fabric", "name": "Velours", "shape": "rect", "width_cm": 300, "depth_cm": 180, "color": "#5b1424", "material": "velvet" }] }\n```';
  assert.equal(parseRecipes(answer).length, 1);
});
