// Starting compositions, built from the library so they stay consistent with it. Heights are
// approximate here; the editor seats everything on its surfaces once the fabric has settled.
import type { DocState, Item, Vec3 } from './core/types';
import { createItem, gridPositions } from './core/scene';
import { emptyState } from './core/document';

interface Builder { items: Item[]; add(ref: string, pos: Vec3, rot?: number, patch?: Partial<Item>): Item; on(support: Item, ref: string, lx: number, lz: number, patch?: Partial<Item>): Item; grid(support: Item, ref: string, lx: number, lz: number, count: number, columns: number, gap?: number): Item[] }

function builder(): Builder {
  const items: Item[] = [];
  const b: Builder = {
    items,
    add(ref, pos, rot = 0, patch = {}) { const i = { ...createItem(ref, pos, rot), ...patch }; items.push(i); return i; },
    on(s, ref, lx, lz, patch = {}) {
      const c = Math.cos(s.rotation), sn = Math.sin(s.rotation);
      const i = b.add(ref, [s.position[0] + lx * c + lz * sn, s.position[1] + s.size[1], s.position[2] - lx * sn + lz * c], s.rotation, { parentId: s.id, ...patch });
      return i;
    },
    grid(s, ref, lx, lz, count, columns, gap = 0.015) {
      const proto = createItem(ref);
      const c = Math.cos(s.rotation), sn = Math.sin(s.rotation);
      const centre: Vec3 = [s.position[0] + lx * c + lz * sn, s.position[1] + s.size[1], s.position[2] - lx * sn + lz * c];
      return gridPositions({ count, columns, gap }, [proto.size[0], proto.size[2]], centre, s.rotation).map(p => b.add(ref, p, 0, { parentId: s.id }));
    },
  };
  return b;
}

const colour = (i: Item, part: string, color: string, extra: object = {}) => { i.finish[part] = { ...i.finish[part], color, ...extra }; return i; };

/** Black satin bar like the reference installation: four drinks, signs, dispenser and flowers. */
function cocktailBar(): DocState {
  const b = builder();
  b.add('backdrop-curtain', [0, 0, -0.75], 0);
  const t = b.add('rect-240', [0, 0, 0]);
  b.add('cloth-320', [0, 0, 0], 0, { parentId: t.id });
  const drinks = ['mojito', 'mojito-mango', 'sunrise', 'blue-lagoon'];
  drinks.forEach((ref, k) => {
    const lx = [-0.92, -0.5, 0.5, 0.92][k];
    b.grid(t, ref, lx, 0.12, 15, 5, 0.008);
    b.on(t, 'sign-a5', lx, -0.25);
  });
  const centre = b.on(t, 'cube-20', 0, -0.18);
  b.on(centre, 'dispenser', 0, 0);
  b.on(t, 'straw-holder', -0.1, 0.24);
  b.on(t, 'napkin-box', 0.1, 0.24);
  for (const [lx, ref] of [[-1.08, 'bouquet-peony'], [1.08, 'bouquet-rose']] as const) b.on(t, ref, lx, -0.28);
  b.on(t, 'gypsophila', -0.25, -0.28);
  b.on(t, 'gypsophila', 0.25, -0.28);
  return { ...emptyState('Bar à cocktails'), items: b.items, scene: { ambiance: 'warm', floor: '#e6ded3', background: '#efe7dd' } };
}

/** Stepped buffet on white risers over a fuchsia cloth, as in the reference videos. */
function steppedBuffet(): DocState {
  const b = builder();
  b.add('backdrop-wall', [0, 0, -0.8]);
  const t = b.add('rect-240', [0, 0, 0]);
  colour(b.add('cloth-240', [0, 0, 0], 0, { parentId: t.id }), 'main', '#d4245f', { texture: 'satin', roughness: 0.35 });
  const back = b.on(t, 'block-80', -0.55, -0.18, { size: [0.8, 0.3, 0.32] });
  const backR = b.on(t, 'block-80', 0.55, -0.18, { size: [0.8, 0.3, 0.32] });
  const midL = b.on(t, 'cube-20', -0.85, 0.18, { size: [0.45, 0.15, 0.3] });
  const midR = b.on(t, 'cube-20', 0.85, 0.18, { size: [0.45, 0.15, 0.3] });
  for (const r of [back, backR, midL, midR]) colour(r, 'main', '#fbfaf7', { glow: 0.35, roughness: 0.3 });
  b.grid(back, 'sunrise-flute', 0, 0, 10, 5, 0.012);
  b.grid(backR, 'blue-raspberry', 0, 0, 10, 5, 0.012);
  b.grid(midL, 'mojito-flute', 0, 0, 6, 3, 0.02);
  b.grid(midR, 'strawberry-passion', 0, 0, 6, 3, 0.012);
  b.grid(t, 'pink-litchi', 0, 0.2, 8, 4, 0.012);
  b.on(t, 'frame-a3', 0, -0.2);
  b.on(t, 'bouquet-hydrangea', -1.05, -0.2);
  b.on(t, 'bouquet-hydrangea', 1.05, -0.2);
  b.on(t, 'garland', 0, 0.34);
  return { ...emptyState('Buffet en escalier'), items: b.items, scene: { ambiance: 'studio', floor: '#e9e5de', background: '#f3f0eb' } };
}

/** A round table dressed with a floor-length cloth and a drapé over three risers. */
function roundTable(): DocState {
  const b = builder();
  const t = b.add('round-150', [0, 0, 0]);
  b.add('cloth-round-280', [0, 0, 0], 0, { parentId: t.id });
  const r1 = b.on(t, 'cyl-40', 0, -0.2);
  const r2 = b.on(t, 'cyl-30', -0.32, 0.12);
  const r3 = b.on(t, 'cube-20', 0.34, 0.1);
  b.add('drape-150', [0, 0, 0], 0.5, { parentId: t.id, finish: { main: { color: '#dcc7a1', texture: 'satin', roughness: 0.32 } } });
  b.on(r1, 'bouquet-hydrangea', 0, 0);
  b.grid(r2, 'aperol-spritz', 0, 0, 3, 3, 0.01);
  b.grid(r3, 'cosmopolitan', 0, 0, 2, 2, 0.006);
  b.grid(t, 'strawberry-daiquiri', 0, 0.48, 5, 5, 0.01);
  return { ...emptyState('Table ronde drapée'), items: b.items };
}

/** Gold and ivory champagne bar: sequin cloth, lit steps of kir royal, a coupe tower. */
function champagneBar(): DocState {
  const b = builder();
  colour(b.add('backdrop-curtain', [0, 0, -0.8]), 'main', '#efe6d6');
  const t = b.add('rect-240', [0, 0, 0]);
  b.add('cloth-sequin-320', [0, 0, 0], 0, { parentId: t.id });
  const steps = b.on(t, 'tiers-4-lit', -0.6, -0.05, { size: [1.0, 0.48, 0.6] });
  b.grid(steps, 'kir-royal', 0, 0.2, 9, 9, 0.012);
  b.grid(steps, 'kir-royal', 0, 0.05, 8, 8, 0.016);
  b.grid(steps, 'champagne', 0, -0.1, 7, 7, 0.01);
  b.on(t, 'tower-5', 0.55, 0.02);
  b.on(t, 'candelabra', 1.02, -0.22);
  b.on(t, 'ice-bucket', 1.02, 0.2);
  return { ...emptyState('Bar à champagne'), items: b.items, scene: { ambiance: 'warm', floor: '#e3d6c4', background: '#efe4d6' } };
}

function dressedTable(): DocState {
  const b = builder();
  const t = b.add('rect-180', [0, 0, 0]);
  b.add('cloth-320', [0, 0, 0], 0, { parentId: t.id });
  return { ...emptyState('Table nappée'), items: b.items };
}

export const TEMPLATES: { id: string; name: string; note: string; build: () => DocState }[] = [
  { id: 'empty', name: 'Vide', note: 'Partir de zéro', build: () => emptyState() },
  { id: 'dressed', name: 'Table nappée', note: '180 × 75, nappe noire', build: dressedTable },
  { id: 'bar', name: 'Bar à cocktails', note: '4 cocktails, fontaine, fleurs', build: cocktailBar },
  { id: 'stepped', name: 'Buffet en escalier', note: 'Socles lumineux, flûtes', build: steppedBuffet },
  { id: 'round', name: 'Table ronde drapée', note: 'Nappe et drapé sur socles', build: roundTable },
  { id: 'champagne', name: 'Bar à champagne', note: 'Paillettes, gradins, pyramide', build: champagneBar },
];
