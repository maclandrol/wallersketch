// Scene list: what stands on what. Identical objects on the same support collapse into one row
// ("Blue Lagoon × 15"), which is how an installer thinks about a table.
import type { Editor } from '../editor';
import type { Item } from '../core/types';
import { button, h } from './dom';
import { icon } from './icons';

const TYPE_ICON: Record<string, string> = { table: 'table', riser: 'riser', fabric: 'fabric', cocktail: 'cocktail', glass: 'glass', decor: 'decor', model: 'cube3' };
const ORDER: Record<string, number> = { table: 0, fabric: 1, riser: 2, model: 3, decor: 4, cocktail: 5, glass: 6 };

export class OutlinePanel {
  readonly el = h('div', { class: 'scroll' });
  private closed = new Set<string>();
  private pending = 0;

  constructor(private ed: Editor) {
    ed.on(() => { cancelAnimationFrame(this.pending); this.pending = requestAnimationFrame(() => this.render()); });
    this.render();
  }

  render() {
    if (!this.el.isConnected && this.el.childNodes.length) return;
    const items = this.ed.state.items;
    const sel = new Set(this.ed.selection);
    const kids = new Map<string, Item[]>();
    const roots: Item[] = [];
    const ids = new Set(items.map(i => i.id));
    for (const i of items) (i.parentId && ids.has(i.parentId) ? (kids.get(i.parentId) ?? kids.set(i.parentId, []).get(i.parentId)!) : roots).push(i);
    const list = h('div', { class: 'outline-list' });
    if (!items.length) {
      this.el.replaceChildren(h('div', { class: 'empty' }, h('strong', null, 'Scène vide'), 'Ajoutez une table depuis la bibliothèque pour commencer.'));
      return;
    }
    const sortKey = (i: Item) => ORDER[i.type] ?? 9;
    const walk = (nodes: Item[], depth: number) => {
      const sorted = [...nodes].sort((a, b) => sortKey(a) - sortKey(b));
      // Collapse identical leaves.
      const groups: Item[][] = [];
      for (const i of sorted) {
        const last = groups[groups.length - 1];
        const leaf = !kids.has(i.id);
        if (last && leaf && !kids.has(last[0].id) && last[0].ref === i.ref && last[0].name === i.name && JSON.stringify(last[0].drink) === JSON.stringify(i.drink)) last.push(i);
        else groups.push([i]);
      }
      for (const g of groups) {
        const first = g[0], children = kids.get(first.id);
        const on = g.every(i => sel.has(i.id));
        const open = !this.closed.has(first.id);
        const twist = h('span', { class: 'twist' + (open ? '' : ' closed') }, children?.length ? icon('chevron', 14) : null);
        if (children?.length) twist.addEventListener('click', e => { e.stopPropagation(); open ? this.closed.add(first.id) : this.closed.delete(first.id); this.render(); });
        const lock = button(null, { icon: first.locked ? 'lock' : 'unlock', title: first.locked ? 'Déverrouiller' : 'Verrouiller', class: 'lock' + (first.locked ? ' on' : ''), onClick: e => { e.stopPropagation(); this.ed.patch(g.map(i => i.id), () => ({ locked: first.locked ? undefined : true })); } });
        const row = h('div', { class: 'row' + (on ? ' on' : ''), style: `padding-left:${8 + depth * 16}px`, role: 'treeitem', 'aria-selected': String(on) },
          twist, icon(TYPE_ICON[first.type] ?? 'cube3', 16), h('span', { class: 'label' }, first.name),
          g.length > 1 ? h('span', { class: 'count' }, '× ' + g.length) : null, lock);
        row.addEventListener('click', e => this.ed.select(g.map(i => i.id), e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'single'));
        row.addEventListener('dblclick', () => this.ed.view.frame('perspective', g.map(i => i.id)));
        list.append(row);
        if (children?.length && open) walk(children, depth + 1);
      }
    };
    walk(roots, 0);
    const scroll = this.el.scrollTop;
    this.el.replaceChildren(list);
    this.el.scrollTop = scroll;
  }
}
