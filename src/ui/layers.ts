// Liquid colours of a drink, listed as they sit in the glass: surface at the top, bottom of the
// glass last. Each colour can be changed, moved up or down, or removed; colours can be added.
import type { DrinkSpec, LiquidLayer } from '../core/types';
import { button, h } from './dom';

const MAX = 6;

/** Colour stops spread evenly from the bottom (0) to the surface (1). */
export const respace = (layers: LiquidLayer[]): LiquidLayer[] => layers.map((l, k, a) => ({ ...l, at: a.length === 1 ? 0 : k / (a.length - 1) }));

const name = (k: number, n: number) => (n === 1 ? 'Couleur' : k === n - 1 ? 'Surface' : k === 0 ? 'Fond du verre' : 'Milieu');

/**
 * `get` returns the drink shown; `set` applies a change (`live` while a colour picker is open,
 * so a drag through the picker is one undo step); `done` ends that live change.
 */
export function layerEditor(get: () => DrinkSpec | undefined, set: (fn: (d: DrinkSpec) => DrinkSpec, live?: string) => void, done: () => void = () => {}) {
  const list = h('div', { class: 'layers' });
  const layered = h('input', { type: 'checkbox', class: 'switch' });
  layered.addEventListener('change', () => set(d => ({ ...d, layered: layered.checked || undefined })));
  const change = (fn: (l: LiquidLayer[]) => LiquidLayer[]) => set(d => ({ ...d, layers: respace(fn([...d.layers])) }));
  const render = () => {
    const d = get();
    if (!d) return;
    const n = d.layers.length;
    layered.checked = !!d.layered;
    const rows = d.layers.map((l, k) => {
      const input = h('input', { type: 'color', value: l.color, 'aria-label': `Couleur : ${name(k, n)}` });
      input.addEventListener('input', () => { input.parentElement!.style.setProperty('--c', input.value); set(x => ({ ...x, layers: x.layers.map((y, j) => (j === k ? { ...y, color: input.value } : y)) }), 'layer' + k); });
      input.addEventListener('change', done);
      const swap = (j: number) => change(a => { [a[k], a[j]] = [a[j], a[k]]; return a; });
      return h('div', { class: 'layer' },
        h('label', { class: 'custom-wrap', style: `--c:${l.color}` }, input),
        h('span', { class: 'layer-name' }, name(k, n)),
        button(null, { icon: 'chevronUp', title: 'Monter', class: 'small ghost', disabled: k === n - 1, onClick: () => swap(k + 1) }),
        button(null, { icon: 'chevron', title: 'Descendre', class: 'small ghost', disabled: k === 0, onClick: () => swap(k - 1) }),
        button(null, { icon: 'close', title: 'Retirer cette couleur', class: 'small ghost', disabled: n === 1, onClick: () => change(a => a.filter((_, j) => j !== k)) }));
    }).reverse();
    const add = button('Ajouter une couleur', { icon: 'plus', class: 'small ghost', disabled: n >= MAX, onClick: () => change(a => [...a, { color: a.at(-1)?.color ?? '#f2a516', at: 1 }]) });
    list.replaceChildren(...rows, add);
  };
  render();
  const el = h('div', { class: 'stack' }, list, h('label', { class: 'toggle' }, h('span', null, 'Couches nettes (sinon dégradé)'), layered));
  return { el, refresh: () => { if (!list.contains(document.activeElement) || !(document.activeElement instanceof HTMLInputElement)) render(); } };
}
