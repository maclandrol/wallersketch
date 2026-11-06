// Commands an AI assistant can run against the open composition. The same functions serve
// MCP clients (Claude Desktop, Claude Code, Codex) through the desktop bridge, the in-app
// assistant, and tests. Every change is a normal undoable edit.
import type { Editor } from './editor';
import type { Vec3 } from './core/types';
import { catalogEntry } from './core/catalog';
import { compileRecipe, RecipeError, recipeGuide, type Compiled } from './core/recipes';
import { holdsLiquid, withDescendants } from './core/scene';
import type { ViewName } from './render/viewport';

const cm = (m: number) => Math.round(m * 1000) / 10;

/** Compact, model-friendly description of the scene. */
export function sceneSummary(ed: Editor) {
  const s = ed.state;
  return {
    name: s.name,
    ambiance: s.scene.ambiance,
    items: s.items.map(i => ({
      id: i.id, type: i.type, ref: i.ref, name: i.name,
      x_cm: cm(i.position[0]), z_cm: cm(i.position[2]), bottom_cm: cm(i.position[1]), rotation_deg: Math.round((i.rotation * 180) / Math.PI),
      size_cm: i.size.map(cm), on: i.parentId ?? null,
      ...(i.drink?.layers.length ? { drink: { glass: i.drink.glass, colors: i.drink.layers.map(l => l.color), garnish: i.drink.garnish } } : {}),
      ...(i.type === 'fabric' ? { color: i.finish.main?.color, material: i.finish.main?.texture } : {}),
    })),
    views: s.views.map(v => v.name),
  };
}

export class AgentBridge {
  constructor(private ed: Editor) {}

  /** Compile recipes, reporting every problem instead of failing the whole batch. */
  private compile(recipes: unknown[]): { ok: Compiled[]; errors: string[] } {
    const ok: Compiled[] = [], errors: string[] = [];
    for (const r of recipes) {
      try { ok.push(compileRecipe(r)); }
      catch (e) { errors.push(...(e instanceof RecipeError ? e.problems : [String(e)])); }
    }
    return { ok, errors };
  }

  async handle(method: string, p: any = {}): Promise<unknown> {
    const ed = this.ed;
    switch (method) {
      case 'context':
        return { guide: recipeGuide(), scene: sceneSummary(ed), library: ed.library.entries.map(e => ({ ref: e.ref, name: e.name, type: e.type })) };
      case 'scene':
        return sceneSummary(ed);
      case 'create_assets': {
        const { ok, errors } = this.compile(Array.isArray(p.recipes) ? p.recipes : [p.recipes]);
        for (const c of ok) await ed.addToLibrary(c);
        return { created: ok.flatMap(c => [...c.entries.map(e => ({ ref: e.ref, name: e.name, type: e.type })), ...(c.arrangement ? [{ arrangement: c.arrangement.id, name: c.arrangement.name }] : [])]), errors };
      }
      case 'add': {
        // Either a library/catalogue ref or a saved arrangement id.
        const arrangement = ed.library.arrangements.find(a => a.id === p.asset);
        const at: Vec3 | undefined = p.x_cm !== undefined || p.z_cm !== undefined ? [(p.x_cm ?? 0) / 100, 0, (p.z_cm ?? 0) / 100] : undefined;
        if (arrangement) { ed.addArrangement(arrangement, at); return { added: ed.selection }; }
        if (!catalogEntry(p.asset)) throw new Error(`Unknown asset "${p.asset}". Use a ref from context.guide or create_assets.`);
        if (p.on) { if (!ed.item(p.on)) throw new Error(`No item with id "${p.on}".`); ed.setSelection([p.on]); }
        else ed.setSelection([]);
        const item = ed.add(p.asset, p.on ? undefined : at);
        if (!item) throw new Error('Could not add the asset.');
        if (p.on && at) ed.move([item.id], [at[0] - item.position[0], 0, at[2] - item.position[2]]);
        if (p.rotation_deg) ed.setRotation([item.id], p.rotation_deg);
        // Grids of glasses: one undo step, exact count.
        if (holdsLiquid(item) && p.count > 1) {
          ed.setSelection([item.id]);
          ed.previewGrid({ count: Math.min(400, p.count | 0), columns: Math.max(1, (p.columns ?? Math.ceil(Math.sqrt(p.count))) | 0), gap: (p.gap_cm ?? 1) / 100 });
          ed.commitGrid();
        }
        return { added: ed.selection };
      }
      case 'update': {
        const ids: string[] = (p.ids ?? []).filter((id: string) => ed.item(id));
        if (!ids.length) throw new Error('No matching item ids.');
        if (p.size_cm) ed.patch(ids, i => ({ size: (p.size_cm as number[]).map((v, k) => (Number.isFinite(v) ? v / 100 : i.size[k])) as Vec3 }));
        if (p.color) for (const id of ids) { const i = ed.item(id)!; const part = i.type === 'table' ? 'top' : i.drink?.layers.length ? null : Object.keys(i.finish)[0]; if (part) ed.setFinish([id], part, { color: p.color }); }
        if (p.colors) ed.patch(ids.filter(id => ed.item(id)?.drink?.layers.length), i => ({ drink: { ...i.drink!, layers: (p.colors as string[]).map((c, k, a) => ({ color: c, at: a.length === 1 ? 0 : k / (a.length - 1) })) } }));
        if (p.name && ids.length === 1) ed.patch(ids, () => ({ name: String(p.name).slice(0, 80) }));
        if (p.x_cm !== undefined) ed.setPosition(ids, 0, p.x_cm / 100);
        if (p.z_cm !== undefined) ed.setPosition(ids, 2, p.z_cm / 100);
        if (p.rotation_deg !== undefined && ids.length === 1) ed.setRotation(ids, p.rotation_deg);
        return { updated: ids };
      }
      case 'remove': {
        const ids = (p.ids ?? []).filter((id: string) => ed.item(id));
        const n = withDescendants(ed.state.items, ids).size;
        ed.remove(ids);
        return { removed: n };
      }
      case 'render': {
        await ed.view.whenSettled();
        const v = ed.state.views.find(x => x.name === p.view);
        if (!v) ed.view.frame((['perspective', 'front', 'top', 'side'].includes(p.view) ? p.view : 'perspective') as ViewName, undefined, true);
        const w = Math.min(1600, p.width ?? 1024), h = Math.min(1600, p.height ?? 640);
        return { png: ed.view.capture(w, h, v).split(',')[1] };
      }
      case 'new_scene':
        ed.newProject();
        if (p.name) ed.rename(p.name);
        return { ok: true };
      case 'undo': ed.undo(); return { ok: true };
    }
    throw new Error('Unknown command: ' + method);
  }
}

