// Pure scene operations: hierarchy, transforms, grids and item creation. No rendering here.
import type { Item, Vec3 } from './types';
import { RISER_MAX_HEIGHT, catalogEntry } from './catalog';

let counter = 0;
export const newId = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

const clone = <T>(v: T): T => structuredClone(v);

export function createItem(ref: string, position: Vec3 = [0, 0, 0], rotation = 0): Item {
  const e = catalogEntry(ref);
  if (!e) throw new Error('Objet inconnu : ' + ref);
  const item: Item = { id: newId(), type: e.type, ref, name: e.name, position: [...position], rotation, size: [...e.size], finish: clone(e.finish) };
  if (e.shape) item.shape = e.shape;
  if (e.drink) item.drink = clone(e.drink);
  if (e.steps) item.steps = e.steps;
  return item;
}

export function clampSize(item: Item, size: Vec3): Vec3 {
  const min = item.type === 'fabric' ? 0.2 : 0.02;
  const s = size.map(v => Math.max(min, Math.min(10, Number.isFinite(v) ? v : min))) as Vec3;
  if (item.type === 'riser') s[1] = Math.min(s[1], RISER_MAX_HEIGHT);
  if (item.type === 'table') s[1] = Math.max(0.3, Math.min(1.3, s[1]));
  if (item.type === 'fabric') s[1] = 0.003;
  if ((item.shape === 'round' || item.shape === 'highboy') && item.type !== 'fabric') s[2] = s[0];
  if (item.type === 'fabric' && item.shape === 'round') s[2] = s[0];
  return s;
}

export function childrenOf(items: readonly Item[], id: string): Item[] {
  return items.filter(i => i.parentId === id);
}

/** The ids plus every object resting on them, recursively. */
export function withDescendants(items: readonly Item[], ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  const byParent = new Map<string, string[]>();
  for (const i of items) if (i.parentId) (byParent.get(i.parentId) ?? byParent.set(i.parentId, []).get(i.parentId)!).push(i.id);
  const stack = [...out];
  while (stack.length) for (const c of byParent.get(stack.pop()!) ?? []) if (!out.has(c)) { out.add(c); stack.push(c); }
  return out;
}

/** Expand a selection to whole groups. */
export function expandGroups(items: readonly Item[], ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const groups = new Set(items.filter(i => set.has(i.id) && i.groupId).map(i => i.groupId));
  for (const i of items) if (i.groupId && groups.has(i.groupId)) set.add(i.id);
  return [...set];
}

export function selectionCentre(items: readonly Item[], ids: Iterable<string>): Vec3 {
  const set = new Set(ids);
  let x = 0, y = Infinity, z = 0, n = 0;
  for (const i of items) if (set.has(i.id)) { x += i.position[0]; z += i.position[2]; y = Math.min(y, i.position[1]); n++; }
  return n ? [x / n, y, z / n] : [0, 0, 0];
}

/**
 * Rigidly move a set of objects and everything resting on them. The yaw turn is applied
 * around `pivot` in world space, so groups and supported arrangements keep their layout.
 */
export function transformItems(items: readonly Item[], ids: Iterable<string>, delta: Vec3, yaw = 0, pivot?: Vec3): Item[] {
  const moving = withDescendants(items, ids);
  const p = pivot ?? selectionCentre(items, ids);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return items.map(i => {
    if (!moving.has(i.id)) return i;
    let [x, y, z] = i.position;
    if (yaw) {
      const dx = x - p[0], dz = z - p[2];
      // Three.js yaw: +x turns towards -z for positive angles.
      x = p[0] + dx * c + dz * s;
      z = p[2] - dx * s + dz * c;
    }
    return { ...i, position: [x + delta[0], y + delta[1], z + delta[2]], rotation: normaliseAngle(i.rotation + yaw) };
  });
}

export const normaliseAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Remove objects; anything resting on them loses its support but stays in place. */
export function removeItems(items: readonly Item[], ids: Iterable<string>, withChildren = true): Item[] {
  const gone = withChildren ? withDescendants(items, ids) : new Set(ids);
  return items.filter(i => !gone.has(i.id)).map(i => (i.parentId && gone.has(i.parentId) ? { ...i, parentId: undefined } : i));
}

/** Copy objects with their supported children, remapping ids, support links and groups. */
export function duplicateItems(items: readonly Item[], ids: Iterable<string>, offset: Vec3): Item[] {
  const set = withDescendants(items, ids);
  const idMap = new Map<string, string>(), groupMap = new Map<string, string>();
  for (const id of set) idMap.set(id, newId());
  return items.filter(i => set.has(i.id)).map(i => {
    const copy = clone(i) as Item;
    copy.id = idMap.get(i.id)!;
    copy.position = [i.position[0] + offset[0], i.position[1] + offset[1], i.position[2] + offset[2]];
    if (i.parentId) copy.parentId = idMap.get(i.parentId) ?? i.parentId;
    if (i.groupId) copy.groupId = groupMap.get(i.groupId) ?? groupMap.set(i.groupId, newId()).get(i.groupId);
    return copy;
  });
}

// ---------------------------------------------------------------- grids

export interface GridSpec { count: number; columns: number; gap: number }

/**
 * Cell centres for `count` objects in rows of `columns`, centred on the origin, in the grid's
 * local frame (x across, z towards the viewer). `gap` is the clear space between footprints.
 * The last row is centred when it is incomplete.
 */
export function gridOffsets(spec: GridSpec, footprint: [number, number]): [number, number][] {
  const count = Math.max(1, Math.min(400, Math.floor(spec.count)));
  const cols = Math.max(1, Math.min(count, Math.floor(spec.columns)));
  const rows = Math.ceil(count / cols);
  const px = footprint[0] + spec.gap, pz = footprint[1] + spec.gap;
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, count - r * cols);
    for (let c = 0; c < inRow; c++) out.push([(c - (inRow - 1) / 2) * px, (r - (rows - 1) / 2) * pz]);
  }
  return out;
}

export function gridRows(spec: GridSpec) { return Math.ceil(Math.max(1, spec.count) / Math.max(1, Math.min(spec.count, spec.columns))); }

/** World positions for a grid centred on `centre` and turned by `yaw`. */
export function gridPositions(spec: GridSpec, footprint: [number, number], centre: Vec3, yaw: number): Vec3[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return gridOffsets(spec, footprint).map(([x, z]) => [centre[0] + x * c + z * s, centre[1], centre[2] - x * s + z * c]);
}

// ---------------------------------------------------------------- footprints

/** 2D footprint corners (x, z) of an object after rotation, for plans and bounds. */
export function footprintCorners(i: Item): [number, number][] {
  const [w, , d] = i.size, c = Math.cos(i.rotation), s = Math.sin(i.rotation);
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as [number, number][])
    .map(([x, z]) => [i.position[0] + x * c + z * s, i.position[2] - x * s + z * c]);
}

/** Point in an object's footprint (used to find supports without the renderer). */
export function footprintContains(i: Item, x: number, z: number, margin = 0): boolean {
  const c = Math.cos(i.rotation), s = Math.sin(i.rotation), dx = x - i.position[0], dz = z - i.position[2];
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (i.shape === 'round' || i.shape === 'highboy') return Math.hypot(lx / (i.size[0] / 2 + margin), lz / (i.size[2] / 2 + margin)) <= 1;
  return Math.abs(lx) <= i.size[0] / 2 + margin && Math.abs(lz) <= i.size[2] / 2 + margin;
}

export const isSupport = (i: Item) => i.type === 'table' || i.type === 'riser' || i.type === 'model';
export const holdsLiquid = (i: Item) => i.type === 'glass' || i.type === 'cocktail';

/** Inventory for installation prep: what to bring, grouped by kind. */
export function inventory(items: readonly Item[]) {
  const rows = new Map<string, { type: Item['type']; name: string; count: number }>();
  for (const i of items) {
    const name = i.type === 'riser' || i.type === 'table' ? `${i.name}` : i.name;
    const key = i.type + '|' + name + (i.type === 'riser' || i.type === 'table' ? '|' + i.size.map(v => Math.round(v * 100)).join('x') : '');
    const row = rows.get(key) ?? rows.set(key, { type: i.type, name, count: 0 }).get(key)!;
    row.count++;
  }
  return [...rows.values()];
}


/** Steps of a stepped presentoir, front (towards guests, +z) lowest, in the object's frame. */
export function tierBoxes(size: Vec3, steps: number): { x: number; z: number; w: number; h: number; d: number }[] {
  const [w, h, d] = size, n = Math.max(2, Math.min(8, steps)), sd = d / n;
  return Array.from({ length: n }, (_, k) => ({ x: 0, z: d / 2 - (k + 0.5) * sd, w, h: (h * (k + 1)) / n, d: sd }));
}
