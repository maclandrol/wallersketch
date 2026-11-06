// Project file (de)serialisation, validation and migration. A project is self-contained JSON:
// imported models and textures are embedded so the file opens on any computer.
import type { Arrangement, CameraView, DocState, EmbeddedAsset, Finish, Item, ItemType, ProjectFile, Vec3 } from './types';
import { DEFAULT_SCENE } from './document';
import { catalogEntry } from './catalog';
import { clampSize, newId } from './scene';
import { glassProfile, hasGlass, registerGlass, GLASSES, type GlassProfile } from './glassware';

export const LIMITS = { items: 5000, views: 60, arrangements: 100, assets: 200 };
const TYPES: ItemType[] = ['table', 'riser', 'glass', 'cocktail', 'fabric', 'decor', 'model'];

/** Asset ids referenced by items, arrangements and finishes. */
export function referencedAssets(state: DocState): Set<string> {
  const out = new Set<string>();
  const visit = (i: Item) => {
    if (i.type === 'model') out.add(i.ref);
    for (const f of Object.values(i.finish)) if (f.texture?.startsWith('asset:')) out.add(f.texture.slice(6));
  };
  state.items.forEach(visit);
  state.arrangements.forEach(a => a.items.forEach(visit));
  return out;
}

export function serialise(state: DocState, assets: Map<string, EmbeddedAsset>): string {
  const used = referencedAssets(state);
  // Custom glass profiles travel with the project.
  const glassIds = new Set<string>();
  for (const i of [...state.items, ...state.arrangements.flatMap(a => a.items)]) if (i.drink && !GLASSES.some(g => g.id === i.drink!.glass) && hasGlass(i.drink.glass)) glassIds.add(i.drink.glass);
  const file: ProjectFile = {
    format: 'wallersketch', version: 2, name: state.name, scene: state.scene,
    items: [...state.items], views: [...state.views], arrangements: [...state.arrangements],
    assets: [...assets.values()].filter(a => used.has(a.id)),
    glasses: [...glassIds].map(glassProfile),
  };
  return JSON.stringify(file);
}

class Invalid extends Error {}
const fail = (msg: string): never => { throw new Invalid(msg); };
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const vec = (v: unknown, what: string): Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every(isNum) && v.every(n => Math.abs(n) < 1000) ? [v[0], v[1], v[2]] : fail(`Coordonnées invalides (${what}).`);
const colour = (v: unknown, fallback = '#ffffff') => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

function finish(v: unknown): Record<string, Finish> {
  const out: Record<string, Finish> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [part, raw] of Object.entries(v as Record<string, any>).slice(0, 32)) {
    if (!raw || typeof raw !== 'object') continue;
    const f: Finish = { color: colour(raw.color) };
    if (isNum(raw.roughness)) f.roughness = Math.min(1, Math.max(0, raw.roughness));
    if (typeof raw.texture === 'string') f.texture = raw.texture.slice(0, 80);
    if (isNum(raw.textureScale)) f.textureScale = Math.min(20, Math.max(0.05, raw.textureScale));
    if (isNum(raw.textureRotation)) f.textureRotation = raw.textureRotation % 360;
    if (isNum(raw.glow)) f.glow = Math.min(1, Math.max(0, raw.glow));
    if (typeof raw.label === 'string') f.label = raw.label.slice(0, 60);
    if (isNum(raw.metalness)) f.metalness = Math.min(1, Math.max(0, raw.metalness));
    out[part.slice(0, 40)] = f;
  }
  return out;
}

function item(raw: any): Item {
  if (!raw || typeof raw !== 'object') fail('Objet de scène invalide.');
  if (!TYPES.includes(raw.type)) fail('Type d’objet inconnu.');
  const i: Item = {
    id: str(raw.id, 64) || newId(), type: raw.type, ref: str(raw.ref, 80), name: str(raw.name, 120) || 'Objet',
    position: vec(raw.position, 'position'), rotation: isNum(raw.rotation) ? raw.rotation : 0,
    size: vec(raw.size, 'dimensions'), finish: finish(raw.finish),
  };
  if (typeof raw.shape === 'string') i.shape = raw.shape.slice(0, 20);
  i.size = clampSize(i, i.size);
  for (const k of ['parentId', 'groupId'] as const) if (typeof raw[k] === 'string') i[k] = raw[k].slice(0, 64);
  if (isNum(raw.layer)) i.layer = raw.layer;
  if (raw.locked === true) i.locked = true;
  if (raw.covers === 'all' || raw.covers === 'tables') i.covers = raw.covers;
  if (raw.support === true) i.support = true;
  if (isNum(raw.steps)) i.steps = Math.min(8, Math.max(2, raw.steps | 0));
  if (Array.isArray(raw.tilt) && raw.tilt.length === 2 && raw.tilt.every(isNum)) i.tilt = [raw.tilt[0] | 0, raw.tilt[1] | 0];
  if (raw.drink && typeof raw.drink === 'object') {
    const d = raw.drink;
    i.drink = {
      glass: str(d.glass, 40) || 'highball', fill: isNum(d.fill) ? Math.min(1, Math.max(0, d.fill)) : 0.85,
      layers: Array.isArray(d.layers) ? d.layers.slice(0, 12).map((l: any) => ({ color: colour(l?.color), at: isNum(l?.at) ? Math.min(1, Math.max(0, l.at)) : 0 })) : [],
      garnish: Array.isArray(d.garnish) ? d.garnish.filter((g: unknown) => typeof g === 'string').slice(0, 16) : [],
    };
    if (d.layered === true) i.drink.layered = true;
    if (isNum(d.ice)) i.drink.ice = Math.min(8, Math.max(0, d.ice | 0));
  }
  if (i.type !== 'model' && !catalogEntry(i.ref) && !i.ref.startsWith('custom:')) i.ref = 'custom:' + i.ref;
  return i;
}

/** Drop dangling or cyclic support links instead of rejecting the whole project. */
function repairLinks(items: Item[]): Item[] {
  const ids = new Set(items.map(i => i.id));
  if (ids.size !== items.length) fail('Identifiants d’objets en double.');
  const byId = new Map(items.map(i => [i.id, i]));
  for (const i of items) {
    if (i.parentId && !ids.has(i.parentId)) delete i.parentId;
    const seen = new Set([i.id]);
    for (let p = i.parentId; p; p = byId.get(p)?.parentId) {
      if (seen.has(p)) { delete i.parentId; break; }
      seen.add(p);
    }
  }
  return items;
}

function view(raw: any): CameraView {
  return { id: str(raw?.id, 64) || newId(), name: str(raw?.name, 60) || 'Vue', position: vec(raw?.position, 'vue'), target: vec(raw?.target, 'vue'), fov: isNum(raw?.fov) ? Math.min(90, Math.max(10, raw.fov)) : 35 };
}

function asset(raw: any): EmbeddedAsset {
  const ok = raw && typeof raw.id === 'string' && (raw.type === 'model' || raw.type === 'texture') && typeof raw.mime === 'string' && typeof raw.data === 'string';
  if (!ok) fail('Ressource intégrée invalide.');
  return { id: raw.id.slice(0, 64), name: str(raw.name, 120), type: raw.type, mime: raw.mime, data: raw.data };
}

export interface LoadedProject { state: DocState; assets: EmbeddedAsset[] }

export function parseProject(text: string): LoadedProject {
  let raw: any;
  try { raw = JSON.parse(text); } catch { fail('Le fichier est illisible.'); }
  if (raw?.format !== 'wallersketch' && raw?.format !== 'cocktail-studio') fail('Ce fichier n’est pas un projet WallerSketch.');
  if (raw.version === 1) return migrateV1(raw);
  if (raw.version !== 2) fail('Ce projet vient d’une version plus récente de WallerSketch.');
  for (const g of Array.isArray(raw.glasses) ? raw.glasses.slice(0, 50) : []) { const p = glassFromData(g); if (p) registerGlass(p); }
  const list = (v: unknown, limit: number, what: string) => (Array.isArray(v) ? (v.length <= limit ? v : fail(`Trop de ${what}.`)) : []);
  const items = repairLinks(list(raw.items, LIMITS.items, 'objets').map(item));
  const arrangements: Arrangement[] = list(raw.arrangements, LIMITS.arrangements, 'compositions').map((a: any) => ({
    id: str(a?.id, 64) || newId(), name: str(a?.name, 80) || 'Composition', items: repairLinks((Array.isArray(a?.items) ? a.items : []).map(item)),
  }));
  const s = raw.scene ?? {};
  return {
    state: {
      name: str(raw.name, 120) || 'Sans titre', items, arrangements,
      views: list(raw.views, LIMITS.views, 'vues').map(view),
      scene: { ambiance: ['studio', 'warm', 'evening'].includes(s.ambiance) ? s.ambiance : 'studio', floor: colour(s.floor, DEFAULT_SCENE.floor), background: colour(s.background, DEFAULT_SCENE.background) },
    },
    assets: list(raw.assets, LIMITS.assets, 'ressources').map(asset),
  };
}

export const isInvalidProject = (e: unknown) => e instanceof Invalid;

// Version 1 (prototype) projects: map what has a clear equivalent and keep the rest as plain shapes.
const V1_TYPES: Record<string, ItemType> = { table: 'table', riser: 'riser', glass: 'glass', cocktail: 'cocktail', cloth: 'fabric', decor: 'decor', import: 'model' };
function migrateV1(raw: any): LoadedProject {
  const items: Item[] = [];
  for (const r of Array.isArray(raw.items) ? raw.items : []) {
    const type = V1_TYPES[r?.kind];
    if (!type || type === 'model') continue;
    const shape = r.shape === 'cylinder' ? 'round' : r.shape === 'trapezoid' ? 'taper' : 'rect';
    const base: Item = {
      id: str(r.id, 64) || newId(), type, ref: 'custom:' + str(r.assetId, 60), name: str(r.name, 120) || 'Objet',
      position: vec(r.position, 'position'), rotation: isNum(r.rotation) ? r.rotation : 0, size: vec(r.size, 'dimensions'),
      finish: { main: { color: colour(r.color), roughness: isNum(r.roughness) ? r.roughness : 0.5 } }, shape,
    };
    if (type === 'table') base.finish = { top: base.finish.main, legs: { color: '#2b2b2d', roughness: 0.45 } };
    if (type === 'glass' || type === 'cocktail') {
      const profile = str(r.profile, 30) || 'highball';
      base.drink = { glass: profile, fill: type === 'cocktail' ? 0.85 : 0, layers: type === 'cocktail' ? [{ color: colour(r.liquid, '#f5a623'), at: 0 }] : [], garnish: [] };
      base.finish = { glass: { color: '#ffffff', roughness: 0.04 } };
    }
    if (typeof r.parentId === 'string') base.parentId = r.parentId;
    base.size = clampSize(base, base.size);
    items.push(base);
  }
  return { state: { name: str(raw.name, 120) || 'Projet importé', items: repairLinks(items), views: (Array.isArray(raw.views) ? raw.views : []).slice(0, LIMITS.views).map(view), arrangements: [], scene: { ...DEFAULT_SCENE } }, assets: [] };
}

/** Validate a glass profile from a file or an assistant (radii and heights in metres). */
export function glassFromData(g: any): GlassProfile | null {
  if (!g || typeof g.id !== 'string' || !Array.isArray(g.outline) || g.outline.length < 2 || g.outline.length > 64) return null;
  const outline = g.outline.map((p: unknown) => (Array.isArray(p) && p.length === 2 && p.every(isNum) ? [Math.min(0.3, Math.max(0, p[0])), Math.min(0.6, Math.max(0, p[1]))] : null));
  if (outline.some((p: unknown) => !p)) return null;
  for (let k = 1; k < outline.length; k++) if (outline[k][1] < outline[k - 1][1]) return null;
  const top = outline[outline.length - 1][1];
  if (!(top > 0.02)) return null;
  return { id: g.id.slice(0, 64), name: str(g.name, 60) || 'Verre', outline, bowl: isNum(g.bowl) ? Math.min(top - 0.01, Math.max(0, g.bowl)) : outline[1][1], wall: isNum(g.wall) ? Math.min(0.006, Math.max(0.0006, g.wall)) : 0.002, plastic: g.plastic === true };
}
