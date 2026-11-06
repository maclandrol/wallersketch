// Asset recipes: the JSON format through which people and AI assistants describe new assets.
// Units in recipes are centimetres (glass outlines in millimetres) because that is how event
// staff and models talk about tables and glasses. Recipes compile to library entries.
import type { Arrangement, DrinkSpec, Finish, Item, Vec3 } from './types';
import { CATALOG, FABRIC_TEXTURES, GARNISH_LABELS, RISER_MAX_HEIGHT, catalogEntry, type CatalogEntry } from './catalog';
import { GLASSES, glassProfile, hasGlass, type GlassProfile } from './glassware';
import { createItem, newId } from './scene';

export const RECIPE_FORMAT = 'wallersketch-asset';

export interface Compiled {
  entries: CatalogEntry[];
  glasses: GlassProfile[];
  arrangement?: Arrangement;
}

export class RecipeError extends Error {
  constructor(public problems: string[]) { super(problems.join(' ')); }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const FINISHES: Record<string, Partial<Finish>> = { matte: { roughness: 0.85 }, satin: { roughness: 0.45 }, gloss: { roughness: 0.15 }, mirror: { roughness: 0.05, metalness: 1 }, brass: { roughness: 0.25, metalness: 1 } };

class Check {
  problems: string[] = [];
  constructor(private where: string) {}
  fail(msg: string) { this.problems.push(`${this.where}: ${msg}`); }
  num(v: unknown, name: string, min: number, max: number, fallback?: number): number {
    if (v === undefined && fallback !== undefined) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.fail(`« ${name} » doit être un nombre (${min}–${max}).`); return fallback ?? min; }
    if (v < min || v > max) this.fail(`« ${name} » = ${v} hors limites (${min}–${max}).`);
    return Math.min(max, Math.max(min, v));
  }
  color(v: unknown, name: string, fallback?: string): string {
    if (v === undefined && fallback) return fallback;
    if (typeof v !== 'string' || !HEX.test(v)) { this.fail(`« ${name} » doit être une couleur #rrggbb.`); return fallback ?? '#ffffff'; }
    return v.toLowerCase();
  }
  pick<T extends string>(v: unknown, name: string, allowed: readonly T[], fallback?: T): T {
    if (v === undefined && fallback) return fallback;
    if (!allowed.includes(v as T)) { this.fail(`« ${name} » doit valoir ${allowed.join(' | ')}.`); return fallback ?? allowed[0]; }
    return v as T;
  }
  text(v: unknown, name: string, fallback?: string): string {
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
    if (fallback !== undefined) return fallback;
    this.fail(`« ${name} » est requis.`);
    return 'Sans nom';
  }
}

function surface(c: Check, s: any, fallback: Finish): Finish {
  if (s === undefined) return fallback;
  if (!s || typeof s !== 'object') { c.fail('une surface doit être un objet { color, finish?, texture? }.'); return fallback; }
  const f: Finish = { color: c.color(s.color, 'color', fallback.color), roughness: 0.45 };
  Object.assign(f, FINISHES[c.pick(s.finish, 'finish', ['matte', 'satin', 'gloss', 'mirror', 'brass'] as const, 'satin')]);
  if (s.texture !== undefined) f.texture = c.pick(s.texture, 'texture', ['wood', 'marble'] as const);
  if (s.lit) f.glow = 0.45;
  return f;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';
const refFor = (kind: string, name: string) => `custom:${kind}-${slug(name)}-${newId().slice(-5)}`;

function glassRecipe(c: Check, r: any): GlassProfile {
  const name = c.text(r.name, 'name');
  const pts = Array.isArray(r.profile_mm) ? r.profile_mm : [];
  if (pts.length < 3 || pts.length > 40) c.fail('« profile_mm » : 3 à 40 points [rayon, hauteur] en mm, du centre du pied jusqu’au bord.');
  const outline: [number, number][] = [];
  let lastY = -1;
  for (const p of pts) {
    if (!Array.isArray(p) || p.length !== 2) { c.fail('chaque point de « profile_mm » est [rayon_mm, hauteur_mm].'); continue; }
    const rr = c.num(p[0], 'rayon', 0, 120), y = c.num(p[1], 'hauteur', 0, 400);
    if (y < lastY) c.fail('les hauteurs de « profile_mm » doivent croître du pied vers le bord.');
    lastY = y;
    outline.push([rr / 1000, y / 1000]);
  }
  if (outline.length && outline[0][0] !== 0) outline.unshift([0, outline[0][1]]);
  const top = outline.at(-1)?.[1] ?? 0.1;
  const bowl = c.num(r.bowl_mm, 'bowl_mm', 0, top * 1000 - 5, Math.max(2, (outline[2]?.[1] ?? 0.01) * 1000)) / 1000;
  return { id: 'custom-' + slug(name) + '-' + newId().slice(-4), name, outline, bowl, wall: c.num(r.wall_mm, 'wall_mm', 0.6, 6, 2) / 1000, plastic: r.plastic === true };
}

function drinkSpec(c: Check, r: any, glassId: string): DrinkSpec {
  const colors = Array.isArray(r.colors) ? r.colors : [];
  if (!colors.length || colors.length > 8) c.fail('« colors » : 1 à 8 couleurs #rrggbb, du fond du verre vers la surface.');
  const layers = colors.map((col: unknown, k: number) => ({ color: c.color(col, 'colors'), at: colors.length === 1 ? 0 : k / (colors.length - 1) }));
  const garnish = (Array.isArray(r.garnish) ? r.garnish : []).filter((g: unknown) => {
    if (typeof g === 'string' && g in GARNISH_LABELS) return true;
    c.fail(`garniture inconnue « ${String(g)} ». Valeurs : ${Object.keys(GARNISH_LABELS).join(', ')}.`);
    return false;
  });
  return { glass: glassId, fill: c.num(r.fill, 'fill', 0.2, 1, 0.85), layers, layered: r.layered === true || undefined, garnish, ice: Math.round(c.num(r.ice, 'ice', 0, 8, 0)) };
}

/** Compile one recipe (or a composition) into library content. Throws RecipeError with every problem found. */
export function compileRecipe(r: any, depth = 0): Compiled {
  const kind = r?.kind;
  const c = new Check(`${kind ?? 'recette'}${r?.name ? ' « ' + r.name + ' »' : ''}`);
  const out: Compiled = { entries: [], glasses: [] };
  if (!r || typeof r !== 'object') throw new RecipeError(['La recette doit être un objet JSON.']);
  const name = () => c.text(r.name, 'name');
  switch (kind) {
    case 'table': {
      const shape = c.pick(r.shape, 'shape', ['rect', 'round', 'highboy'] as const, 'rect');
      const w = c.num(r.width_cm, 'width_cm', 40, 600) / 100, h = c.num(r.height_cm, 'height_cm', 30, 130, shape === 'highboy' ? 110 : 75) / 100;
      const d = shape === 'rect' ? c.num(r.depth_cm, 'depth_cm', 30, 300) / 100 : w;
      out.entries.push({ ref: refFor('table', r.name ?? 'table'), type: 'table', name: name(), family: 'Mes tables', shape, size: [w, h, d],
        finish: { top: surface(c, r.top, { color: '#efece6', roughness: 0.7 }), legs: surface(c, r.legs, { color: '#2b2b2d', roughness: 0.45 }) } });
      break;
    }
    case 'presentoir': {
      const shape = c.pick(r.shape, 'shape', ['rect', 'round', 'taper', 'tiers'] as const, 'rect');
      const w = c.num(r.width_cm, 'width_cm', 5, 300) / 100, h = c.num(r.height_cm, 'height_cm', 1, RISER_MAX_HEIGHT * 100) / 100;
      const d = shape === 'round' ? w : c.num(r.depth_cm, 'depth_cm', 5, 200) / 100;
      const e: CatalogEntry = { ref: refFor('presentoir', r.name ?? 'presentoir'), type: 'riser', name: name(), family: 'Mes présentoirs', shape, size: [w, h, d], finish: { main: surface(c, r.surface, { color: '#f7f6f3', roughness: 0.35 }) } };
      if (shape === 'tiers') e.steps = Math.round(c.num(r.steps, 'steps', 2, 6, 3));
      out.entries.push(e);
      break;
    }
    case 'fabric': {
      const shape = c.pick(r.shape, 'shape', ['rect', 'round'] as const, 'rect');
      const w = c.num(r.width_cm, 'width_cm', 20, 1000) / 100, d = shape === 'round' ? w : c.num(r.depth_cm, 'depth_cm', 20, 600) / 100;
      const tex = c.pick(r.material, 'material', FABRIC_TEXTURES.map(t => t.id) as readonly string[], 'satin');
      const e: CatalogEntry = { ref: refFor('fabric', r.name ?? 'tissu'), type: 'fabric', name: name(), family: 'Mes tissus', shape, size: [w, 0.003, d],
        finish: { main: { color: c.color(r.color, 'color'), texture: tex, roughness: FABRIC_TEXTURES.find(t => t.id === tex)!.roughness } } };
      out.entries.push(e);
      break;
    }
    case 'glass': {
      const g = glassRecipe(c, r);
      out.glasses.push(g);
      out.entries.push({ ref: 'custom:glass-' + g.id, type: 'glass', name: g.name, family: 'Mes verres', size: sizeOf(g), finish: { glass: { color: '#ffffff', roughness: 0.03 } }, drink: { glass: g.id, fill: 0, layers: [], garnish: [] } });
      break;
    }
    case 'cocktail': {
      let glassId = 'highball';
      if (typeof r.glass === 'string') {
        if (hasGlass(r.glass)) glassId = r.glass;
        else c.fail(`verre inconnu « ${r.glass} ». Verres : ${GLASSES.map(g => g.id).join(', ')}, ou un objet verre complet.`);
      } else if (r.glass && typeof r.glass === 'object') {
        const g = glassRecipe(new Check('verre'), { ...r.glass, name: r.glass.name ?? (r.name ?? 'Verre') + ' (verre)' });
        out.glasses.push(g);
        glassId = g.id;
      }
      const profile = out.glasses.find(g => g.id === glassId) ?? glassProfile(glassId);
      out.entries.push({ ref: refFor('cocktail', r.name ?? 'cocktail'), type: 'cocktail', name: name(), family: 'Mes cocktails', size: sizeOf(profile),
        finish: { glass: { color: '#ffffff', roughness: 0.03, ...(r.crystal ? { texture: 'cut' } : {}) } }, drink: drinkSpec(c, r, glassId) });
      break;
    }
    case 'decor': {
      const base = catalogEntry(r.base);
      if (!base || base.type !== 'decor') { c.fail(`« base » doit être un décor du catalogue : ${CATALOG.filter(e => e.type === 'decor').map(e => e.ref).join(', ')}.`); break; }
      const finish = structuredClone(base.finish);
      for (const [part, col] of Object.entries(r.colors ?? {})) if (finish[part]) finish[part].color = c.color(col, `colors.${part}`); else c.fail(`partie inconnue « ${part} » (parties : ${Object.keys(finish).join(', ')}).`);
      const size: Vec3 = r.size_cm ? [c.num(r.size_cm.width, 'size_cm.width', 2, 600) / 100, c.num(r.size_cm.height, 'size_cm.height', 2, 400) / 100, c.num(r.size_cm.depth ?? r.size_cm.width, 'size_cm.depth', 1, 600) / 100] : [...base.size];
      out.entries.push({ ...base, ref: refFor('decor', r.name ?? base.name), name: c.text(r.name, 'name', base.name), family: 'Mes décors', size, finish });
      break;
    }
    case 'composition': {
      if (depth > 0) { c.fail('une composition ne peut pas contenir une autre composition.'); break; }
      const list = Array.isArray(r.items) ? r.items : [];
      if (!list.length || list.length > 600) c.fail('« items » : 1 à 600 éléments.');
      const items: Item[] = [];
      list.forEach((it: any, k: number) => {
        const ic = new Check(`items[${k}]`);
        let ref: string | undefined = typeof it?.asset === 'string' ? it.asset : undefined;
        if (it?.asset && typeof it.asset === 'object') {
          try { const sub = compileRecipe(it.asset, depth + 1); out.entries.push(...sub.entries); out.glasses.push(...sub.glasses); ref = sub.entries[0]?.ref; }
          catch (e) { if (e instanceof RecipeError) c.problems.push(...e.problems); return; }
        }
        const entry = ref ? out.entries.find(e => e.ref === ref) ?? catalogEntry(ref) : undefined;
        if (!entry) { ic.fail(`« asset » inconnu « ${String(it?.asset)} ».`); c.problems.push(...ic.problems); return; }
        const x = ic.num(it.x_cm, 'x_cm', -2000, 2000, 0) / 100, z = ic.num(it.z_cm, 'z_cm', -2000, 2000, 0) / 100;
        const item = { ...itemFrom(entry), position: [x, 0, z] as Vec3, rotation: (ic.num(it.rotation_deg, 'rotation_deg', -360, 360, 0) * Math.PI) / 180 };
        if (typeof it.on === 'number') { if (items[it.on]) item.parentId = items[it.on].id; else ic.fail('« on » doit désigner un élément précédent de la liste.'); }
        c.problems.push(...ic.problems);
        items.push(item);
      });
      out.arrangement = { id: newId(), name: name(), items };
      break;
    }
    default:
      c.fail(`« kind » doit valoir table | presentoir | fabric | glass | cocktail | decor | composition.`);
  }
  if (c.problems.length) throw new RecipeError(c.problems);
  return out;
}

function sizeOf(g: GlassProfile): Vec3 {
  const r = Math.max(...g.outline.map(p => p[0])) * 2;
  return [r, g.outline.at(-1)![1], r];
}

/** Item for an entry that may not be registered yet (compiled in the same recipe, or a preview). */
export function previewItem(e: CatalogEntry): Item { return itemFrom(e); }
function itemFrom(e: CatalogEntry): Item {
  if (catalogEntry(e.ref)) return createItem(e.ref);
  const i: Item = { id: newId(), type: e.type, ref: e.ref, name: e.name, position: [0, 0, 0], rotation: 0, size: [...e.size], finish: structuredClone(e.finish) };
  if (e.shape) i.shape = e.shape;
  if (e.drink) i.drink = structuredClone(e.drink);
  if (e.steps) i.steps = e.steps;
  return i;
}

/** Accept one recipe, a list, or { recipes: [...] }; also finds JSON inside a chat answer. */
export function parseRecipes(text: string): any[] {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]);
  const start = text.search(/[[{]/);
  const candidates = fenced.length ? fenced : start >= 0 ? [text.slice(start)] : [];
  const out: any[] = [];
  for (const c of candidates) {
    let v: any;
    try { v = JSON.parse(c.trim()); } catch { continue; }
    if (Array.isArray(v)) out.push(...v);
    else if (Array.isArray(v?.recipes)) out.push(...v.recipes);
    else out.push(v);
  }
  if (!out.length) throw new RecipeError(['Aucune recette JSON lisible dans la réponse.']);
  return out;
}

/** The reference given to assistants: format, allowed values and the current library. */
export function recipeGuide(): string {
  const byType = (t: string) => CATALOG.filter(e => e.type === t).map(e => `${e.ref} (${e.name})`).join(', ');
  return `# WallerSketch asset recipes (format "${RECIPE_FORMAT}" v1)

WallerSketch composes cocktail-table installations in 3D: tables, presentoirs (risers), fabrics that drape automatically, glasses, prepared cocktails and decor. You create assets by writing JSON recipes. Lengths are in centimetres, glass outlines in millimetres, colours are "#rrggbb". Reply with a JSON object { "recipes": [ ... ] } inside a \`\`\`json block. Every recipe needs "kind" and "name".

## Kinds
- table: { kind:"table", name, shape:"rect"|"round"|"highboy", width_cm, depth_cm (rect only), height_cm (30–130, default 75), top?:Surface, legs?:Surface }
- presentoir: a riser or display stand that glasses stand on; maximum height ${RISER_MAX_HEIGHT * 100} cm. { kind:"presentoir", name, shape:"rect"|"round"|"taper"|"tiers", width_cm, depth_cm, height_cm, steps? (tiers: 2–6 stepped levels, front lowest), surface?:Surface }
- fabric: { kind:"fabric", name, shape:"rect"|"round", width_cm, depth_cm, color, material:${FABRIC_TEXTURES.map(t => `"${t.id}"`).join('|')} }. Fabrics drape by physics over the table (and optionally risers) where they are placed; size decides the drop.
- glass: { kind:"glass", name, profile_mm:[[radius,height],...] outer outline from the centre of the foot (height 0) up to the rim, heights increasing; bowl_mm: height of the inner bottom where liquid starts; wall_mm?: 0.6–6; plastic?: boolean }
- cocktail: { kind:"cocktail", name, glass: one of ${GLASSES.map(g => `"${g.id}"`).join(', ')} or a full glass object, colors:[bottom…surface] (gradient; set layered:true for distinct bands), fill: 0.2–1, ice: 0–8, garnish:[…], crystal?: boolean (cut-crystal glass) }
  garnish values: ${Object.entries(GARNISH_LABELS).map(([k, v]) => `${k} (${v})`).join(', ')}
- decor: recolour or resize a catalogue decor piece. { kind:"decor", name, base:<decor ref>, colors?:{part:color}, size_cm?:{width,height,depth} }
- composition: a ready arrangement. { kind:"composition", name, items:[{ asset:<catalogue ref or an inline recipe>, x_cm, z_cm, rotation_deg?, on?:<index of an earlier item it stands on> }] }. x to the right, z towards the guests; heights are computed (objects sit on what is under them).

Surface = { color, finish?:"matte"|"satin"|"gloss"|"mirror"|"brass", texture?:"wood"|"marble", lit?:boolean (lit acrylic) }

## Catalogue refs
- tables: ${byType('table')}
- presentoirs: ${byType('riser')}
- fabrics: ${byType('fabric')}
- cocktails: ${byType('cocktail')}
- empty glasses: ${byType('glass')}
- decor: ${byType('decor')}

## Example
\`\`\`json
{ "recipes": [
  { "kind": "cocktail", "name": "Passion rose", "glass": "coupe", "colors": ["#d8336a", "#f7b2c4"], "fill": 0.85, "garnish": ["gold-rim", "raspberries"] },
  { "kind": "presentoir", "name": "Gradins miroir", "shape": "tiers", "steps": 3, "width_cm": 80, "depth_cm": 45, "height_cm": 36, "surface": { "color": "#d9dcdf", "finish": "mirror" } }
] }
\`\`\``;
}
