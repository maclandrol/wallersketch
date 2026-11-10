import type { Editor } from '../editor';
import type { Item, ItemType } from '../core/types';
import { CATALOG, CATEGORIES, customEntries, type CatalogEntry } from '../core/catalog';
import { createItem } from '../core/scene';
import { glassProfile } from '../core/glassware';
import { thumbnail } from '../render/thumbnails';
import { button, dims, fmtCm, h } from './dom';
import { icon } from './icons';

const ICONS: Record<string, string> = { table: 'table', riser: 'riser', fabric: 'fabric', cocktail: 'cocktail', glass: 'glass', decor: 'decor', mine: 'mine' };

function subtitle(e: CatalogEntry): string {
  if (e.type === 'cocktail') return glassProfile(e.drink!.glass).name;
  if (e.type === 'glass') return `h ${fmtCm(e.size[1])} cm`;
  if (e.type === 'fabric') return e.shape === 'round' ? `Ø ${fmtCm(e.size[0])} cm` : `${fmtCm(e.size[0])} × ${fmtCm(e.size[2])} cm`;
  if (e.type === 'decor' && e.ref.startsWith('backdrop')) return `${fmtCm(e.size[0])} × ${fmtCm(e.size[1])} cm`;
  return dims(e.size, e.shape === 'round' || e.shape === 'highboy');
}

interface Entry { key: string; name: string; sub: string; family: string; preview: Item; add: (at?: [number, number, number]) => void; remove?: () => void; type: ItemType }

export class LibraryPanel {
  readonly el = h('div', { class: 'library', style: 'display:flex;flex-direction:column;min-height:0;flex:1' });
  private cat: string = 'table';
  private query = '';
  private list = h('div', { class: 'scroll' });
  private catsEl = h('div', { class: 'cats' });
  private searchInput = h('input', { type: 'search', placeholder: 'Rechercher', spellcheck: false });
  /** Narrow screens close the library drawer once something is added. */
  onAdded?: () => void;

  constructor(private ed: Editor, private stage: HTMLElement, private newDrink: () => void) {
    try { this.cat = localStorage.getItem('library-cat') || 'table'; } catch { /* default */ }
    this.searchInput.addEventListener('input', () => { this.query = this.searchInput.value.trim().toLowerCase(); this.render(); });
    this.searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { this.searchInput.value = ''; this.query = ''; this.render(); this.searchInput.blur(); } });
    const foot = h('div', { class: 'lib-foot' }, button('Importer un modèle 3D…', { icon: 'import', class: 'outline wide', onClick: () => ed.importModel() }));
    this.el.append(this.catsEl, h('div', { class: 'search' }, icon('search', 16), this.searchInput), this.list, foot);
    // Re-render when the personal library changes (new cocktails, imports, assistant assets).
    let seen = '';
    ed.on(() => { const v = `${customEntries().length}/${ed.library.arrangements.length}/${ed.library.models.length}`; if (v !== seen) { seen = v; this.renderSoon(); } });
    this.render();
  }

  private pending = 0;
  private renderSoon() { cancelAnimationFrame(this.pending); this.pending = requestAnimationFrame(() => this.render()); }

  private entries(): Entry[] {
    const out: Entry[] = [];
    if (this.query || this.cat !== 'mine') for (const e of [...customEntries(), ...CATALOG]) {
      if (!this.query && e.type !== this.cat) continue;
      const custom = e.ref.startsWith('custom:');
      out.push({ key: e.ref + (custom ? JSON.stringify(e.finish) + JSON.stringify(e.drink ?? '') : ''), name: e.name, sub: subtitle(e), family: this.query ? CATEGORIES.find(c => c.type === e.type)!.label : e.family, preview: createItem(e.ref), add: at => this.ed.add(e.ref, at), type: e.type, remove: custom ? () => this.ed.removeFromLibrary('entry', e.ref) : undefined });
    }
    if (this.query || this.cat === 'mine') {
      for (const a of this.ed.library.arrangements) {
        const root = a.items.find(i => !i.parentId) ?? a.items[0];
        out.push({ key: 'arr:' + a.id, name: a.name, sub: `${a.items.length} objet${a.items.length > 1 ? 's' : ''}`, family: 'Mes compositions', preview: root, add: at => this.ed.addArrangement(a, at), remove: () => this.ed.removeFromLibrary('arrangement', a.id), type: root?.type ?? 'decor' });
      }
      for (const m of this.ed.library.models) {
        out.push({ key: 'model:' + m.item.ref, name: m.item.name, sub: dims(m.item.size), family: 'Modèles importés', preview: m.item, add: at => this.ed.add('model:' + m.item.ref, at), remove: () => this.ed.removeFromLibrary('model', m.item.ref), type: 'model' });
      }
    }
    return this.query ? out.filter(e => (e.name + ' ' + e.sub + ' ' + e.family).toLowerCase().includes(this.query)) : out;
  }

  render() {
    this.catsEl.replaceChildren(...[...CATEGORIES, { type: 'mine', label: 'Mes objets' }].map(c =>
      h('button', { type: 'button', class: 'cat' + (c.type === this.cat && !this.query ? ' on' : ''), onClick: () => { this.cat = c.type; try { localStorage.setItem('library-cat', c.type); } catch { /* ignore */ } this.searchInput.value = ''; this.query = ''; this.render(); } }, icon(ICONS[c.type], 20), c.label)));
    const entries = this.entries();
    const scroll = this.list.scrollTop;
    this.list.replaceChildren();
    if (!entries.length) {
      this.list.append(this.query
        ? h('div', { class: 'empty' }, h('strong', null, 'Aucun résultat'), `Rien ne correspond à « ${this.searchInput.value} ».`)
        : h('div', { class: 'empty' }, h('strong', null, 'Vos objets'), 'Enregistrez une sélection depuis le panneau de droite, ou importez un modèle GLB.', button('Importer un modèle 3D…', { icon: 'import', class: 'outline', onClick: () => this.ed.importModel() })));
      return;
    }
    if (this.cat === 'cocktail' && !this.query) this.list.append(h('div', { style: 'padding:10px 10px 2px' }, button('Créer un cocktail…', { icon: 'plus', class: 'outline wide', onClick: this.newDrink })));
    let family = '', grid: HTMLElement | null = null;
    for (const e of entries) {
      if (e.family !== family || !grid) {
        family = e.family;
        grid = h('div', { class: 'cards' });
        this.list.append(h('div', { class: 'family' }, family), grid);
      }
      grid.append(this.card(e));
    }
    this.list.scrollTop = scroll;
  }

  private card(e: Entry) {
    const thumb = h('div', { class: 'thumb' }, h('div', { class: 'ph' }));
    const el = h('button', { type: 'button', class: 'card', title: `${e.name} : cliquer pour ajouter, ou glisser dans la scène` },
      thumb, h('div', { class: 'meta' }, h('div', { class: 'name' }, e.name), h('div', { class: 'sub' }, e.sub)));
    if (e.remove) el.append(button(null, { icon: 'trash', title: 'Retirer de mes objets', class: 'remove', onClick: ev => { ev.stopPropagation(); e.remove!(); } }));
    if (e.preview) thumbnail(e.key, e.preview).then(url => thumb.replaceChildren(h('img', { src: url, alt: '' }))).catch(() => thumb.replaceChildren(icon(ICONS[e.type] ?? 'cube3', 28)));
    this.bindDrag(el, e);
    return el;
  }

  /** Click adds at the default spot; dragging onto the scene places it under the cursor. */
  private bindDrag(el: HTMLElement, e: Entry) {
    el.addEventListener('pointerdown', down => {
      if (down.button !== 0 || (down.target as HTMLElement).closest('.remove')) return;
      let dragging = false, ghost: HTMLElement | null = null, over = false;
      const preview = { ...e.preview };
      const move = (ev: PointerEvent) => {
        if (!dragging && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) > 6) {
          dragging = true;
          ghost = h('div', { class: 'drag-ghost' }, (el.querySelector('img')?.cloneNode() as HTMLElement) ?? '');
          document.body.append(ghost);
        }
        if (!dragging || !ghost) return;
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        const r = this.stage.getBoundingClientRect();
        over = ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom;
        this.stage.classList.toggle('dragging', over);
        ghost.style.opacity = over ? '0' : '1';
        if (over && !e.key.startsWith('arr:')) {
          const p = this.ed.view.dropPoint(ev.clientX, ev.clientY, e.type).point;
          this.ed.view.showGhosts([{ ...preview, position: [p.x, e.type === 'table' || e.type === 'fabric' ? 0 : p.y, p.z] }]);
        } else this.ed.view.clearGhosts();
      };
      const up = (ev: PointerEvent) => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        // The browser took over the gesture (a scroll on a touch screen): neither add nor drop.
        if (ev.type === 'pointercancel') { ghost?.remove(); this.stage.classList.remove('dragging'); this.ed.view.clearGhosts(); return; }
        ghost?.remove();
        this.stage.classList.remove('dragging');
        this.ed.view.clearGhosts();
        if (!dragging) { e.add(); this.onAdded?.(); return; }
        if (over) { const p = this.ed.view.dropPoint(ev.clientX, ev.clientY, e.type).point; e.add([p.x, 0, p.z]); this.onAdded?.(); }
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
  }
}
