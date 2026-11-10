// Editing commands. Everything that changes the document goes through here, so every change
// is undoable and objects are always re-seated on the surfaces under them.
import type { Arrangement, CameraView, DocState, EmbeddedAsset, Finish, Item, SceneSettings, Vec3 } from './core/types';
import { Document, emptyState } from './core/document';
import { clampSize, createItem, duplicateItems, expandGroups, footprintContains, gridPositions, holdsLiquid, isSupport, newId, removeItems, selectionCentre, transformItems, withDescendants, type GridSpec } from './core/scene';
import { glassFromData, parseProject, serialise } from './core/project';
import { registerEntry, unregisterEntry, type CatalogEntry } from './core/catalog';
import { registerGlass, type GlassProfile } from './core/glassware';
import type { Compiled } from './core/recipes';
import type { Viewport, ViewName } from './render/viewport';

export interface Native {
  /** Browser / tablet build: no local agents, no CAD conversion, files through the share sheet. */
  web?: boolean;
  save(data: string, saveAs: boolean): Promise<{ path?: string; canceled?: boolean }>;
  open(): Promise<{ data?: string; path?: string; canceled?: boolean }>;
  loaded(path?: string): void;
  setDirty(dirty: boolean): void;
  autosave(data: string): Promise<void>;
  recover(): Promise<{ data: string; path?: string } | null>;
  discardRecovery(): Promise<void>;
  importFile(kind: 'model' | 'texture'): Promise<EmbeddedAsset | null>;
  exportFiles(files: { name: string; data: string }[], folder?: string): Promise<{ path?: string; canceled?: boolean; count?: number }>;
  reveal(path: string): Promise<void>;
  loadLibrary(): Promise<string | null>;
  saveLibrary(data: string): Promise<void>;
  onMenu(fn: (action: string) => void): void;
  copy(text: string): Promise<void>;
  paste(): Promise<string>;
  openExternal(url: string): Promise<void>;
  agentInfo(): Promise<AgentInfo>;
  agentEnable(on: boolean): Promise<boolean>;
  onAgentRequest(fn: (method: string, params: unknown) => Promise<unknown>): void;
  onAgentActivity(fn: (method: string) => void): void;
  assistantKeys(): Promise<Record<Provider, boolean> & { models: Record<Provider, string>; chosen: { provider?: Provider; model?: string } }>;
  assistantSetKey(provider: Provider, key: string): Promise<Record<Provider, boolean>>;
  convertCAD(base64: string, ext: string): Promise<CADMesh[]>;
  assistantAsk(r: { provider: string; model?: string; system: string; messages: { role: 'user' | 'assistant'; text: string; image?: string }[] }): Promise<string>;
}

export type Provider = 'anthropic' | 'openai' | 'deepseek';

export interface CADMesh { name: string; color: [number, number, number] | null; position: Float32Array; normal: Float32Array | null; index: Uint32Array }

export interface AgentInfo { enabled: boolean; command: string; args: string[]; claudeDesktop: string; claudeCode: string; codex: string }

export interface UserLibrary { arrangements: Arrangement[]; models: { item: Item; asset: EmbeddedAsset }[]; entries: CatalogEntry[]; glasses: GlassProfile[] }

type Listener = () => void;

export class Editor {
  readonly doc = new Document();
  selection: string[] = [];
  grid: (GridSpec & { active: boolean }) = { count: 12, columns: 4, gap: 0.02, active: false };
  library: UserLibrary = { arrangements: [], models: [], entries: [], glasses: [] };
  private listeners = new Set<Listener>();
  private dragKey = 0;
  private autosaveTimer?: number;

  constructor(readonly view: Viewport, readonly native: Native, readonly notify: (msg: string, kind?: 'error' | 'ok') => void) {
    this.doc.on((s, prev) => {
      view.setAssets(this.doc.assets);
      view.sync(s);
      if (s.items !== prev.items) {
        const ids = new Set(s.items.map(i => i.id));
        const kept = this.selection.filter(id => ids.has(id));
        if (kept.length !== this.selection.length) this.setSelection(kept, false);
      }
      native.setDirty(this.doc.dirty);
      this.scheduleAutosave();
      this.emit();
    });
  }

  get state(): DocState { return this.doc.state; }
  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const l of this.listeners) l(); }
  item(id: string) { return this.state.items.find(i => i.id === id); }
  get selected(): Item[] { const s = new Set(this.selection); return this.state.items.filter(i => s.has(i.id)); }

  setSelection(ids: string[], emit = true) {
    this.selection = ids;
    this.view.setSelection(ids);
    if (this.grid.active) this.cancelGrid();
    if (emit) this.emit();
  }

  select(ids: string[], mode: 'replace' | 'toggle' | 'single' = 'replace') {
    const items = this.state.items;
    const expanded = mode === 'single' ? ids : expandGroups(items, ids);
    if (mode === 'toggle') {
      const cur = new Set(this.selection), all = expanded.every(id => cur.has(id));
      for (const id of expanded) all ? cur.delete(id) : cur.add(id);
      this.setSelection([...cur]);
    } else this.setSelection(expanded);
  }

  // ------------------------------------------------------------------ settling

  /** Seat objects on whatever is under them, parents before children, and update support links. */
  private settle(items: Item[], ids: Iterable<string>): Item[] {
    const byId = new Map(items.map(i => [i.id, i]));
    const depth = (i: Item) => { let d = 0; for (let p = i.parentId; p && d < 50; p = byId.get(p)?.parentId) d++; return d; };
    const todo = [...new Set(ids)].map(id => byId.get(id)).filter((i): i is Item => !!i && i.type !== 'fabric').sort((a, b) => depth(a) - depth(b));
    let current = items;
    let level = -1;
    for (const it of todo) {
      const i = current.find(x => x.id === it.id)!;
      const d = depth(i);
      if (d !== level) { level = d; this.view.sync({ ...this.state, items: current }, true); }
      const exclude = withDescendants(current, [i.id]);
      const rest = this.view.restingHeight(i, i.position[0], i.position[2], exclude);
      const dy = rest.y - i.position[1];
      const parentId = i.type === 'table' || i.ref.startsWith('backdrop') ? undefined : rest.support && !exclude.has(rest.support) ? rest.support : undefined;
      if (Math.abs(dy) > 0.0003) current = transformItems(current, [i.id], [0, dy, 0]);
      if (parentId !== i.parentId) current = current.map(x => (x.id === i.id ? { ...x, parentId } : x));
    }
    // Fabrics follow the table under their centre.
    for (const f of current) {
      if (f.type !== 'fabric') continue;
      const table = current.find(t => t.type === 'table' && footprintContains(t, f.position[0], f.position[2]));
      if ((table?.id) !== f.parentId) current = current.map(x => (x.id === f.id ? { ...x, parentId: table?.id } : x));
    }
    return current;
  }

  /** After a fabric settles, objects resting over it may need a new height. */
  surfacesChanged(fabricIds: string[]) {
    const fabrics = this.state.items.filter(i => fabricIds.includes(i.id));
    const affected = this.state.items.filter(i => i.type !== 'fabric' && i.type !== 'table' && (!fabrics.length || fabrics.some(f => Math.hypot(f.position[0] - i.position[0], f.position[2] - i.position[2]) < Math.hypot(f.size[0], f.size[2]) / 2 + 0.3)));
    if (!affected.length) return;
    const next = this.settle([...this.state.items], affected.map(i => i.id));
    if (next.some((n, k) => n !== this.state.items[k])) this.doc.amend(s => ({ ...s, items: next }));
  }

  // ------------------------------------------------------------------ adding

  private freeSpot(item: Item, support?: Item): Vec3 {
    const items = this.state.items;
    if (!support) {
      if (item.type === 'table') {
        const tables = items.filter(i => i.type === 'table');
        if (!tables.length) return [0, 0, 0];
        const right = Math.max(...tables.map(t => t.position[0] + t.size[0] / 2));
        return [right + item.size[0] / 2 + 0.6, 0, tables[0].position[2]];
      }
      if (item.ref.startsWith('backdrop')) {
        const b = this.view.contentBounds();
        return [b.isEmpty() ? 0 : (b.min.x + b.max.x) / 2, 0, b.isEmpty() ? -1 : b.min.z - 0.6];
      }
      return [0, 0, 0];
    }
    // Scan the support's top for the first spot clear of objects already on it.
    const siblings = items.filter(i => i.parentId === support.id && i.type !== 'fabric');
    const r = Math.hypot(item.size[0], item.size[2]) / 2;
    const step = Math.max(item.size[0], item.size[2]) + 0.02;
    const c = Math.cos(support.rotation), s = Math.sin(support.rotation);
    const nx = Math.max(1, Math.floor((support.size[0] - 0.04) / step)), nz = Math.max(1, Math.floor((support.size[2] - 0.04) / step));
    const candidates: [number, number][] = [];
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) candidates.push([(k - (nx - 1) / 2) * step, (j - (nz - 1) / 2) * step]);
    candidates.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [lx, lz] of candidates) {
      const x = support.position[0] + lx * c + lz * s, z = support.position[2] - lx * s + lz * c;
      if (!footprintContains(support, x, z)) continue;
      if (siblings.every(o => Math.hypot(o.position[0] - x, o.position[2] - z) > r + Math.hypot(o.size[0], o.size[2]) / 2 - 0.01)) return [x, 0, z];
    }
    return [support.position[0], 0, support.position[2]];
  }

  /** Where a new object goes by default: the selected support, else the first table. */
  private defaultSupport(item: Item): Item | undefined {
    if (item.type === 'table' || item.ref.startsWith('backdrop')) return undefined;
    const sel = this.selected;
    const items = this.state.items;
    if (item.type === 'fabric') return sel.find(i => i.type === 'table') ?? (sel[0]?.parentId ? items.find(i => i.id === sel[0].parentId && i.type === 'table') : undefined) ?? items.find(i => i.type === 'table');
    return sel.find(i => isSupport(i)) ?? items.find(i => i.type === 'table');
  }

  add(ref: string, at?: Vec3) {
    let item = this.instantiate(ref);
    if (!item) return;
    const support = at ? undefined : this.defaultSupport(item);
    const pos = at ?? this.freeSpot(item, support);
    item = { ...item, position: pos, rotation: support && item.type !== 'glass' && item.type !== 'cocktail' ? support.rotation : 0 };
    if (item.type === 'fabric' && support) item.position = [support.position[0], 0, support.position[2]];
    if (item.type === 'table' && at) item.position = [at[0], 0, at[2]];
    const inserted = item;
    this.doc.update(s => ({ ...s, items: this.settle([...s.items, inserted], [inserted.id]) }));
    this.setSelection([item.id]);
    return item;
  }

  private instantiate(ref: string): Item | undefined {
    if (ref.startsWith('model:')) {
      const m = this.library.models.find(x => x.item.ref === ref.slice(6));
      if (!m) return;
      if (!this.doc.assets.has(m.asset.id)) this.doc.assets.set(m.asset.id, m.asset);
      this.view.setAssets(this.doc.assets);
      return { ...structuredClone(m.item), id: newId() };
    }
    return createItem(ref);
  }

  /** Insert a saved arrangement centred at a point (default: on the first table or origin). */
  addArrangement(a: Arrangement, at?: Vec3) {
    const items = this.state.items;
    const table = items.find(i => i.type === 'table');
    const c: Vec3 = at ?? (table && !a.items.some(i => i.type === 'table') ? [table.position[0], 0, table.position[2]] : [0, 0, 0]);
    const copies = duplicateItems(a.items, a.items.map(i => i.id), c);
    for (const m of this.library.models) if (copies.some(i => i.type === 'model' && i.ref === m.asset.id)) this.doc.assets.set(m.asset.id, m.asset);
    this.doc.update(s => ({ ...s, items: this.settle([...s.items, ...copies], copies.filter(i => !i.parentId).map(i => i.id)) }));
    this.setSelection(copies.filter(i => !i.parentId || !copies.some(o => o.id === i.parentId)).map(i => i.id));
  }

  // ------------------------------------------------------------------ editing

  /** Snap a position to the grid of the surface it rests on (or the floor), in that surface's frame. */
  snapped(i: Item, target: Vec3): Vec3 {
    const step = this.view.snap.step;
    const s = i.parentId ? this.item(i.parentId) : undefined;
    if (!s) return [Math.round(target[0] / step) * step, target[1], Math.round(target[2] / step) * step];
    const c = Math.cos(s.rotation), sn = Math.sin(s.rotation);
    const dx = target[0] - s.position[0], dz = target[2] - s.position[2];
    // Grid lines start at the support's back-left corner so spacing matches its edges.
    const lx = Math.round((dx * c - dz * sn + s.size[0] / 2) / step) * step - s.size[0] / 2;
    const lz = Math.round((dx * sn + dz * c + s.size[2] / 2) / step) * step - s.size[2] / 2;
    return [s.position[0] + lx * c + lz * sn, target[1], s.position[2] - lx * sn + lz * c];
  }

  /** Rigid move from a drag or nudge. Live drags merge into one undo step; `free` skips snapping. */
  move(ids: string[], delta: Vec3, final = true, merge?: string, free = true) {
    const roots = this.roots(ids);
    if (!roots.length) return;
    if (!free && this.view.snap.enabled) {
      const p = this.item(roots[0])!, t = this.snapped(p, [p.position[0] + delta[0], p.position[1], p.position[2] + delta[2]]);
      delta = [t[0] - p.position[0], delta[1], t[2] - p.position[2]];
      if (!final && Math.abs(delta[0]) + Math.abs(delta[2]) < 1e-9) return;
    }
    const key = merge ?? 'drag' + this.dragKey;
    this.doc.update(s => ({ ...s, items: this.settle(transformItems(s.items, roots, delta), roots) }), key);
    if (final) { this.dragKey++; this.doc.seal(); }
  }

  rotate(ids: string[], yaw: number, pivot?: Vec3, final = true) {
    const roots = this.roots(ids);
    if (!roots.length) return;
    const p = pivot ?? selectionCentre(this.state.items, roots);
    if (yaw) this.doc.update(s => ({ ...s, items: this.settle(transformItems(s.items, roots, [0, 0, 0], yaw, p), roots) }), 'rot' + this.dragKey);
    if (final) { this.dragKey++; this.doc.seal(); }
  }

  /** Selected objects that are not resting on another selected object. */
  private roots(ids: string[]) {
    const set = new Set(ids), items = this.state.items;
    const byId = new Map(items.map(i => [i.id, i]));
    return ids.filter(id => {
      const i = byId.get(id);
      if (!i || i.locked) return false;
      for (let p = i.parentId; p; p = byId.get(p)?.parentId) if (set.has(p)) return false;
      return true;
    });
  }

  /** Set a world position coordinate for the selection (inspector fields). */
  setPosition(ids: string[], axis: 0 | 2, value: number, merge?: string) {
    const roots = this.roots(ids);
    const c = selectionCentre(this.state.items, roots);
    const delta: Vec3 = [0, 0, 0];
    delta[axis] = value - c[axis];
    if (Math.abs(delta[axis]) > 1e-6) this.move(roots, delta, true, merge);
  }

  setRotation(ids: string[], degrees: number) {
    const roots = this.roots(ids);
    if (roots.length !== 1) return;
    const i = this.item(roots[0])!;
    this.rotate(roots, (degrees * Math.PI) / 180 - i.rotation, [i.position[0], i.position[1], i.position[2]]);
  }

  /** Change properties of objects; geometry changes re-seat them and what rests on them. */
  patch(ids: string[], fn: (i: Item) => Partial<Item>, merge?: string) {
    const set = new Set(ids);
    this.doc.update(s => {
      let changed = false, geometry = false;
      const items = s.items.map(i => {
        if (!set.has(i.id)) return i;
        const p = fn(i);
        if (!Object.keys(p).length) return i;
        changed = true;
        if (p.size || p.drink || p.shape || p.tilt) geometry = true;
        const n = { ...i, ...p };
        if (p.size) n.size = clampSize(n, p.size);
        return n;
      });
      if (!changed) return s;
      return { ...s, items: geometry ? this.settle(items, [...withDescendants(items, ids)]) : items };
    }, merge);
  }

  setSize(ids: string[], size: Vec3, merge?: string) { this.patch(ids, () => ({ size }), merge); }

  setFinish(ids: string[], part: string, f: Partial<Finish>, merge?: string) {
    this.patch(ids, i => (i.finish[part] || f.color ? { finish: { ...i.finish, [part]: { ...(i.finish[part] ?? { color: '#ffffff' }), ...f } } } : {}), merge);
  }

  remove(ids = this.selection) {
    if (!ids.length) return;
    const n = withDescendants(this.state.items, ids).size;
    this.doc.update(s => ({ ...s, items: removeItems(s.items, ids) }));
    this.setSelection([]);
    this.notify(n > 1 ? `${n} objets supprimés` : 'Objet supprimé');
  }

  duplicate(ids = this.selection) {
    // As when dragging: a cloth lying on a table stands for the whole dressed table.
    ids = [...new Set(ids.map(id => { const i = this.item(id); return i?.type === 'fabric' && i.parentId && this.item(i.parentId)?.type === 'table' ? i.parentId : id; }))];
    const roots = this.roots(ids);
    if (!roots.length) return;
    const b = this.view.contentBounds(roots);
    const items = this.state.items;
    // Copies go beside the originals on the same surface, along the support's long side.
    const width = b.isEmpty() ? 0.3 : b.max.x - b.min.x;
    const first = this.item(roots[0])!, tables = first.type === 'table';
    const offset: Vec3 = tables ? [width + 0.6, 0, 0] : [Math.min(width + 0.03, 1), 0, 0];
    const copies = duplicateItems(items, roots, offset);
    this.doc.update(s => ({ ...s, items: this.settle([...s.items, ...copies], copies.map(c => c.id)) }));
    const copyRoots = copies.filter(c => !c.parentId || !copies.some(o => o.id === c.parentId));
    this.setSelection(copyRoots.map(c => c.id));
  }

  clear() {
    if (!this.state.items.length) return;
    this.doc.update(s => ({ ...s, items: [] }));
    this.setSelection([]);
    this.notify('Composition vidée. Annuler pour la retrouver.');
  }

  group(ids = this.selection) {
    if (ids.length < 2) return;
    const g = newId();
    this.patch(ids, () => ({ groupId: g }));
    this.notify('Groupe créé');
  }
  ungroup(ids = this.selection) { this.patch(ids, i => (i.groupId ? { groupId: undefined } : {})); }
  toggleLock(ids = this.selection) { const lock = !this.selected.every(i => i.locked); this.patch(ids, () => ({ locked: lock || undefined })); }

  undo() { this.doc.undo(); this.view.setSelection(this.selection); }
  redo() { this.doc.redo(); }

  // ------------------------------------------------------------------ grids

  /** Preview a grid of the selected glass or cocktail around its current position. */
  previewGrid(spec: Partial<GridSpec>) {
    Object.assign(this.grid, spec, { active: true });
    const src = this.selected[0];
    if (!src || !holdsLiquid(src)) return;
    const ghosts = this.gridItems(src).map(p => ({ ...src, id: 'ghost', position: p }));
    this.view.showGhosts(ghosts);
    this.emit();
  }

  private gridItems(src: Item): Vec3[] {
    const support = src.parentId ? this.item(src.parentId) : undefined;
    const yaw = support?.rotation ?? 0;
    const exclude = new Set([src.id]);
    return gridPositions(this.grid, [src.size[0], src.size[2]], src.position, yaw).map(([x, , z]) => [x, this.view.restingHeight(src, x, z, exclude).y, z]);
  }

  cancelGrid() { this.grid.active = false; this.view.clearGhosts(); }

  /** Replace the selected object by the grid: one undo step removes the whole arrangement. */
  commitGrid() {
    const src = this.selected[0];
    if (!src || !holdsLiquid(src)) return;
    const positions = this.gridItems(src);
    const copies = positions.map(p => ({ ...structuredClone(src), id: newId(), position: p, groupId: undefined }));
    this.cancelGrid();
    this.doc.update(s => ({ ...s, items: this.settle([...s.items.filter(i => i.id !== src.id), ...copies], copies.map(c => c.id)) }));
    this.setSelection(copies.map(c => c.id));
    this.notify(`${copies.length} ${src.type === 'cocktail' ? 'cocktails' : 'verres'} placés`, 'ok');
  }

  // ------------------------------------------------------------------ views

  addView(name?: string) {
    const v: CameraView = { id: newId(), name: name ?? `Vue ${this.state.views.length + 1}`, ...this.view.currentView() };
    this.doc.update(s => ({ ...s, views: [...s.views, v] }));
    return v;
  }
  updateView(id: string) { const cur = this.view.currentView(); this.doc.update(s => ({ ...s, views: s.views.map(v => (v.id === id ? { ...v, ...cur } : v)) })); this.notify('Vue mise à jour'); }
  renameView(id: string, name: string) { this.doc.update(s => ({ ...s, views: s.views.map(v => (v.id === id ? { ...v, name: name.trim() || v.name } : v)) })); }
  removeView(id: string) { this.doc.update(s => ({ ...s, views: s.views.filter(v => v.id !== id) })); }
  showView(v: CameraView) { this.view.applyView(v); }
  frameView(name: ViewName) { this.view.frame(name, this.selection.length ? this.selection : undefined); }

  setScene(patch: Partial<SceneSettings>, merge?: string) { this.doc.update(s => ({ ...s, scene: { ...s.scene, ...patch } }), merge); }
  rename(name: string) { const n = name.trim(); if (n && n !== this.state.name) this.doc.update(s => ({ ...s, name: n })); }

  // ------------------------------------------------------------------ reusable arrangements

  /** Save the selection (with what rests on it) to the personal library, usable in any project. */
  async saveArrangement(name: string) {
    const ids = [...withDescendants(this.state.items, this.selection)];
    if (!ids.length) return;
    const items = this.state.items.filter(i => ids.includes(i.id));
    const c = selectionCentre(items, this.roots(this.selection));
    const rel = items.map(i => ({ ...structuredClone(i), position: [i.position[0] - c[0], i.position[1], i.position[2] - c[2]] as Vec3, parentId: i.parentId && ids.includes(i.parentId) ? i.parentId : undefined }));
    this.library.arrangements = [...this.library.arrangements, { id: newId(), name: name.trim() || 'Composition', items: rel }];
    // Models used by the arrangement travel with it.
    for (const i of rel) if (i.type === 'model' && !this.library.models.some(m => m.asset.id === i.ref)) {
      const asset = this.doc.assets.get(i.ref);
      if (asset) this.library.models.push({ item: { ...i, position: [0, 0, 0], parentId: undefined }, asset });
    }
    await this.persistLibrary();
    this.notify('Ajouté à « Mes compositions »', 'ok');
  }

  /** Add compiled recipes (drink builder, assistants) to the personal library. */
  async addToLibrary(c: Compiled) {
    for (const g of c.glasses) { registerGlass(g); this.library.glasses = [...this.library.glasses.filter(x => x.id !== g.id), g]; }
    for (const e of c.entries) { registerEntry(e); this.library.entries = [...this.library.entries.filter(x => x.ref !== e.ref), e]; }
    if (c.arrangement) this.library.arrangements = [...this.library.arrangements, c.arrangement];
    await this.persistLibrary();
  }

  async removeFromLibrary(kind: 'arrangement' | 'model' | 'entry', id: string) {
    if (kind === 'entry') { unregisterEntry(id); this.library.entries = this.library.entries.filter(e => e.ref !== id); }
    else if (kind === 'arrangement') this.library.arrangements = this.library.arrangements.filter(a => a.id !== id);
    else this.library.models = this.library.models.filter(m => m.item.ref !== id);
    await this.persistLibrary();
  }

  async loadLibrary() {
    try {
      const raw = await this.native.loadLibrary();
      if (!raw) return;
      const lib = JSON.parse(raw);
      this.library = { arrangements: Array.isArray(lib.arrangements) ? lib.arrangements : [], models: Array.isArray(lib.models) ? lib.models : [], entries: [], glasses: [] };
      for (const m of this.library.models) this.doc.assets.set(m.asset.id, m.asset);
      for (const g of Array.isArray(lib.glasses) ? lib.glasses : []) { const p = glassFromData(g); if (p) { registerGlass(p); this.library.glasses.push(p); } }
      for (const e of Array.isArray(lib.entries) ? lib.entries : []) if (e && typeof e.ref === 'string' && e.ref.startsWith('custom:') && Array.isArray(e.size)) { registerEntry(e); this.library.entries.push(e); }
    } catch { this.notify('Bibliothèque personnelle illisible', 'error'); }
  }

  private async persistLibrary() {
    try { await this.native.saveLibrary(JSON.stringify(this.library)); this.emit(); }
    catch (e) { this.notify(msg(e), 'error'); }
  }

  // ------------------------------------------------------------------ imports

  async importModel() {
    try {
      const picked = await this.native.importFile('model');
      if (!picked) return;
      let asset = picked, exact = false;
      // Every format other than glTF becomes GLB once, here; projects embed only GLB.
      const ext = picked.name.split('.').pop()!.toLowerCase();
      if (ext !== 'glb' && ext !== 'gltf') {
        this.notify('Conversion du modèle…');
        const { convertToGLB } = await import('./render/interchange');
        const bin = Uint8Array.from(atob(picked.data), c => c.charCodeAt(0));
        const r = await convertToGLB(bin, ext, ext.match(/^(step|stp|iges|igs)$/) ? () => this.native.convertCAD(picked.data, ext) : undefined);
        let s = ''; for (let k = 0; k < r.glb.length; k += 0x8000) s += String.fromCharCode(...r.glb.subarray(k, k + 0x8000));
        asset = { ...picked, mime: 'model/gltf-binary', data: btoa(s) };
        exact = r.units === 'm';
      }
      const info = await this.view.inspectModel(asset);
      let size = info.size, note = '';
      // Mesh formats carry no units: files authored in centimetres or millimetres arrive huge.
      const max = Math.max(...size);
      if (!exact && max > 20) { const k = max > 2000 ? 0.001 : 0.01; size = size.map(v => v * k) as Vec3; note = k === 0.01 ? ' (lu en centimètres)' : ' (lu en millimètres)'; }
      this.doc.assets.set(asset.id, asset);
      const name = asset.name.replace(/\.[a-z0-9]+$/i, '');
      const item: Item = { id: newId(), type: 'model', ref: asset.id, name, position: [0, 0, 0], rotation: 0, size, finish: Object.fromEntries(info.materials.map(m => [m.part, { color: m.color, label: m.name }])) };
      this.library.models.push({ item: { ...item, id: 'tpl' }, asset });
      await this.persistLibrary();
      this.addModel(item);
      this.notify(`« ${name} » importé${note}`, 'ok');
    } catch (e) { this.notify(msg(e), 'error'); }
  }

  private addModel(item: Item) {
    const support = this.defaultSupport(item);
    const pos = this.freeSpot(item, support);
    const placed = { ...item, position: pos };
    this.doc.update(s => ({ ...s, items: this.settle([...s.items, placed], [placed.id]) }));
    this.setSelection([placed.id]);
  }

  async importTexture(ids: string[], part: string) {
    try {
      const asset = await this.native.importFile('texture');
      if (!asset) return;
      this.doc.assets.set(asset.id, asset);
      this.view.setAssets(this.doc.assets);
      this.setFinish(ids, part, { texture: 'asset:' + asset.id, color: '#ffffff' });
    } catch (e) { this.notify(msg(e), 'error'); }
  }

  // ------------------------------------------------------------------ files

  async save(saveAs = false) {
    const snapshot = this.state, gen = this.doc.generation;
    try {
      const r = await this.native.save(serialise(snapshot, this.doc.assets), saveAs);
      if (r.canceled) return false;
      if (this.doc.markSaved(snapshot, gen, r.path)) { this.native.setDirty(this.doc.dirty); this.notify('Enregistré', 'ok'); }
      return true;
    } catch (e) { this.notify(msg(e), 'error'); return false; }
  }

  load(state: DocState, assets: EmbeddedAsset[], path?: string, clean = true) {
    this.setSelection([], false);
    this.doc.replace(state, assets, path, clean);
    for (const m of this.library.models) if (!this.doc.assets.has(m.asset.id)) this.doc.assets.set(m.asset.id, m.asset);
    this.native.loaded(path);
    if (!clean) this.native.setDirty(true);
    this.view.frame('perspective', undefined, true);
    this.emit();
  }

  newProject(state: DocState = emptyState()) { this.load(state, []); }

  async open() {
    try {
      const r = await this.native.open();
      if (r.canceled || !r.data) return;
      const p = parseProject(r.data);
      this.load(p.state, p.assets, r.path);
      this.notify(`« ${p.state.name} » ouvert`);
    } catch (e) { this.notify(msg(e), 'error'); }
  }

  private scheduleAutosave() {
    clearTimeout(this.autosaveTimer);
    if (!this.doc.dirty) return;
    const gen = this.doc.generation;
    this.autosaveTimer = window.setTimeout(() => {
      if (gen !== this.doc.generation || !this.doc.dirty) return;
      this.native.autosave(serialise(this.state, this.doc.assets)).catch(() => {});
    }, 4000);
  }

  // ------------------------------------------------------------------ export

  async exportFiles(files: { name: string; data: string }[], folder?: string) {
    try {
      const r = await this.native.exportFiles(files, folder);
      if (r.canceled) return;
      this.notify(r.count === 1 ? 'Exporté' : `${r.count} fichiers exportés`, 'ok');
      if (r.path) this.native.reveal(r.path);
    } catch (e) { this.notify(msg(e), 'error'); }
  }
}

export const msg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
