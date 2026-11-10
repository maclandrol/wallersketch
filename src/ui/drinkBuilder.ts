// Quick drink builder: name, glass, colours, fill, ice and garnish, with a live 3D preview.
// The result is a reusable cocktail in "Mes cocktails", available in every project.
import type { Editor } from '../editor';
import type { DrinkSpec, Item } from '../core/types';
import { GARNISH_LABELS, type CatalogEntry } from '../core/catalog';
import { GLASSES, glassProfile, glassSize } from '../core/glassware';
import { newId } from '../core/scene';
import { thumbnail } from '../render/thumbnails';
import { button, h, menu, modal, toast } from './dom';
import { layerEditor } from './layers';

export function openDrinkBuilder(ed: Editor, from?: Item) {
  const spec: DrinkSpec = structuredClone(from?.drink?.layers.length ? from.drink : { glass: 'coupe', fill: 0.85, layers: [{ color: '#f2a516', at: 0 }, { color: '#f7c74a', at: 1 }], garnish: ['orange-wheel'], ice: 0 });
  let crystal = from?.finish.glass?.texture === 'cut';
  const name = h('input', { class: 'select', value: from ? from.name + ' (variante)' : '', placeholder: 'Nom du cocktail', spellcheck: false });
  const preview = h('div', { class: 'drink-preview' }, h('div', { class: 'ph' }));
  const controls = h('div', { class: 'stack' });
  let seq = 0;
  const redraw = () => {
    const n = ++seq;
    const item: Item = { id: 'preview', type: 'cocktail', ref: 'preview', name: '', position: [0, 0, 0], rotation: 0, size: glassSize(spec.glass), finish: { glass: { color: '#ffffff', roughness: 0.03, ...(crystal ? { texture: 'cut' } : {}) } }, drink: spec };
    thumbnail('builder:' + n, item, false).then(url => { if (n === seq) preview.replaceChildren(h('img', { src: url, alt: 'Aperçu' })); });
  };
  const render = () => {
    const glass = h('select', { class: 'select' }, ...GLASSES.map(g => h('option', { value: g.id, selected: g.id === spec.glass }, g.name)));
    if (!GLASSES.some(g => g.id === spec.glass)) glass.prepend(h('option', { value: spec.glass, selected: true }, glassProfile(spec.glass).name));
    glass.addEventListener('change', () => { spec.glass = glass.value; redraw(); });
    // Colours as they sit in the glass, surface first.
    const colors = layerEditor(() => spec, fn => { Object.assign(spec, fn(spec)); colors.refresh(); redraw(); });
    const fill = h('input', { type: 'range', class: 'slider', min: '20', max: '100', value: String(Math.round(spec.fill * 100)) });
    fill.addEventListener('input', () => { spec.fill = +fill.value / 100; redraw(); });
    const ice = h('input', { type: 'range', class: 'slider', min: '0', max: '8', value: String(spec.ice ?? 0) });
    ice.addEventListener('input', () => { spec.ice = +ice.value; redraw(); });
    const cut = h('input', { type: 'checkbox', class: 'switch', checked: crystal });
    cut.addEventListener('change', () => { crystal = cut.checked; redraw(); });
    const add = h('button', { type: 'button', class: 'chip add' }, '+ Ajouter');
    add.addEventListener('click', () => menu(add, Object.keys(GARNISH_LABELS).filter(g => !spec.garnish.includes(g)).map(g => ({ label: GARNISH_LABELS[g], run: () => { spec.garnish.push(g); render(); redraw(); } }))));
    controls.replaceChildren(
      name,
      h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Verre'), glass),
      h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Couleurs'), colors.el),
      h('div', { class: 'fields two' }, h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Remplissage'), fill), h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Glaçons'), ice)),
      h('label', { class: 'toggle' }, h('span', null, 'Verre en cristal taillé'), cut),
      h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Garniture'), h('div', { class: 'chips' }, ...spec.garnish.map(g => h('button', { type: 'button', class: 'chip on', onClick: () => { spec.garnish = spec.garnish.filter(x => x !== g); render(); redraw(); } }, GARNISH_LABELS[g] ?? g, h('span', { class: 'x' }, '×'))), add)));
  };
  render();
  redraw();
  const save = async (place: boolean) => {
    const label = name.value.trim();
    if (!label) { toast('Donnez un nom au cocktail', 'error'); name.focus(); return; }
    const entry: CatalogEntry = { ref: 'custom:cocktail-' + newId(), type: 'cocktail', name: label, family: 'Mes cocktails', size: glassSize(spec.glass), finish: { glass: { color: '#ffffff', roughness: 0.03, ...(crystal ? { texture: 'cut' } : {}) } }, drink: structuredClone(spec) };
    try {
      await ed.addToLibrary({ entries: [entry], glasses: [] });
      close();
      if (place) ed.add(entry.ref);
    } catch (e) { toast(String((e as Error).message ?? e), 'error'); return; }
    toast(`« ${label} » ajouté à Mes cocktails`, 'ok');
  };
  const close = modal('Nouveau cocktail', h('div', { class: 'builder' }, preview, controls), [
    button('Annuler', { onClick: () => close() }),
    button('Enregistrer', { class: 'outline', onClick: () => save(false) }),
    button('Enregistrer et placer', { class: 'primary', onClick: () => save(true) }),
  ], { wide: true });
  setTimeout(() => name.focus());
}
