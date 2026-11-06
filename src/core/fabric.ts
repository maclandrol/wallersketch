// Decide what each fabric piece drapes over, expressed in the fabric's own frame so a cloth that
// moves rigidly with its table keeps its settled shape (same key, no recalculation).
import type { Item } from './types';
import type { Collider, DrapeInput } from './drape';
import { TAPER_SCALE } from './catalog';
import { tierBoxes } from './scene';

/** Nappes cover the table only (risers then stand on the cloth); drapés also pass over the risers. */
export type Covers = 'tables' | 'all';
export const fabricCovers = (f: Item): Covers => f.covers ?? (f.ref.startsWith('drape') ? 'all' : 'tables');

function reach(f: Item) { return Math.hypot(f.size[0], f.size[2]) / 2; }

function toLocal(f: Item, x: number, z: number): [number, number] {
  const c = Math.cos(f.rotation), s = Math.sin(f.rotation), dx = x - f.position[0], dz = z - f.position[2];
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Solids under a fabric, in the fabric frame. */
export function fabricColliders(f: Item, items: readonly Item[]): Collider[] {
  const covers = fabricCovers(f), r = reach(f), out: Collider[] = [];
  for (const i of items) {
    if (i.id === f.id) continue;
    const kind = i.type === 'table' ? 'table' : i.type === 'riser' || (i.type === 'model' && i.support) ? 'riser' : null;
    if (!kind || (kind === 'riser' && covers === 'tables')) continue;
    const ir = Math.hypot(i.size[0], i.size[2]) / 2;
    if (Math.hypot(i.position[0] - f.position[0], i.position[2] - f.position[2]) > r + ir) continue;
    if (i.shape === 'tiers') {
      // One box per step, so a drape follows the staircase.
      const c = Math.cos(i.rotation), s = Math.sin(i.rotation);
      for (const b of tierBoxes(i.size, i.steps ?? 3)) {
        const [x, z] = toLocal(f, i.position[0] + b.x * c + b.z * s, i.position[2] - b.x * s + b.z * c);
        out.push({ kind: 'box', x, z, yaw: i.rotation - f.rotation, bottom: i.position[1], top: i.position[1] + b.h, hx: b.w / 2, hz: b.d / 2 });
      }
      continue;
    }
    const [x, z] = toLocal(f, i.position[0], i.position[2]);
    const round = i.shape === 'round' || i.shape === 'highboy';
    // Tables are solid down to the floor so cloth hangs straight from the edge.
    const bottom = kind === 'table' ? 0 : i.position[1];
    out.push({
      kind: round ? 'cylinder' : i.shape === 'taper' ? 'taper' : 'box',
      x, z, yaw: i.rotation - f.rotation, bottom, top: i.position[1] + i.size[1],
      hx: i.size[0] / 2, hz: i.size[2] / 2, topScale: i.shape === 'taper' ? TAPER_SCALE : undefined,
    });
  }
  return out;
}

/** Stacking order among fabrics that overlap this one. */
export function fabricLayer(f: Item, items: readonly Item[]): number {
  let n = 0;
  for (const o of items) {
    if (o === f) break;
    if (o.type === 'fabric' && Math.hypot(o.position[0] - f.position[0], o.position[2] - f.position[2]) < reach(o) + reach(f)) n++;
  }
  return f.layer ?? n;
}

export function drapeInput(f: Item, items: readonly Item[]): DrapeInput {
  return {
    shape: f.shape === 'round' ? 'round' : 'rect', width: f.size[0], depth: f.size[2], x: 0, z: 0, yaw: 0,
    colliders: fabricColliders(f, items), clearance: fabricLayer(f, items) * 0.0045,
  };
}

const r4 = (v: number) => Math.round(v * 2000) / 2000;
/** Cache key: changes only when the drape result would change. */
export function drapeKey(input: DrapeInput): string {
  return [input.shape, r4(input.width), r4(input.depth), r4(input.clearance ?? 0),
    ...input.colliders.map(c => [c.kind, r4(c.x), r4(c.z), r4(Math.atan2(Math.sin(c.yaw), Math.cos(c.yaw))), r4(c.bottom), r4(c.top), r4(c.hx), r4(c.hz)].join(','))].join('|');
}

/** Real drop of a fabric past a table edge, from dimensions (what installers measure). */
export function overhang(f: Item, table: Item): { sides: number; ends: number } | null {
  if (table.type !== 'table') return null;
  const round = table.shape === 'round' || table.shape === 'highboy';
  const yaw = Math.abs(Math.sin(f.rotation - table.rotation));
  const fw = yaw > 0.7 ? f.size[2] : f.size[0], fd = yaw > 0.7 ? f.size[0] : f.size[2];
  if (round) return { sides: (f.size[0] - table.size[0]) / 2, ends: (f.size[0] - table.size[0]) / 2 };
  return { ends: (fw - table.size[0]) / 2, sides: (fd - table.size[2]) / 2 };
}
