// Floating bar over the scene while something is selected: what is selected, and what can be
// done to all of it at once. Also the main editing surface on tablets, where the properties
// panel is a drawer.
import type { Editor } from '../editor';
import { CATALOG, customEntries } from '../core/catalog';
import { holdsLiquid } from '../core/scene';
import { button, h, menu } from './dom';
import { kbd } from './platform';

const TYPE_NAMES: Record<string, [string, string]> = {
  table: ['table', 'tables'], riser: ['socle', 'socles'], fabric: ['tissu', 'tissus'], cocktail: ['cocktail', 'cocktails'],
  glass: ['verre', 'verres'], decor: ['décor', 'décors'], model: ['modèle', 'modèles'],
};

/** "Blue Lagoon", "12 Blue Lagoon", "3 socles, 12 cocktails". */
export function describeSelection(ed: Editor): string {
  const sel = ed.selected;
  if (sel.length === 1) return sel[0].name;
  const names = new Set(sel.map(i => i.name));
  if (names.size === 1) return `${sel.length} × ${sel[0].name}`;
  const counts = new Map<string, number>();
  for (const i of sel) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n} ${TYPE_NAMES[t][n > 1 ? 1 : 0]}`).join(', ');
}

export function selectionBar(ed: Editor, frame: () => void): HTMLElement {
  const label = h('span', { class: 'sel-label' });
  const bar = h('div', { class: 'float sel-bar', role: 'toolbar', 'aria-label': 'Sélection' });
  const alignBtn = button(null, { icon: 'align', title: 'Aligner et répartir' });
  alignBtn.addEventListener('click', () => menu(alignBtn, [
    { label: 'Aligner à gauche', run: () => ed.align(0, 'min') },
    { label: 'Centrer horizontalement', run: () => ed.align(0, 'center') },
    { label: 'Aligner à droite', run: () => ed.align(0, 'max') },
    'sep',
    { label: 'Aligner au fond', run: () => ed.align(1, 'min') },
    { label: 'Centrer en profondeur', run: () => ed.align(1, 'center') },
    { label: 'Aligner devant', run: () => ed.align(1, 'max') },
    'sep',
    { label: 'Répartir de gauche à droite', disabled: ed.selection.length < 3, run: () => ed.distribute(0) },
    { label: 'Répartir du fond vers l’avant', disabled: ed.selection.length < 3, run: () => ed.distribute(1) },
  ]));
  const swapBtn = button(null, { icon: 'swap', title: 'Remplacer par un autre cocktail ou verre' });
  swapBtn.addEventListener('click', () => {
    const all = [...customEntries(), ...CATALOG];
    const current = new Set(ed.selected.map(i => i.ref));
    const item = (e: (typeof all)[number], prefix = '') => ({ label: prefix + e.name, icon: current.has(e.ref) ? 'check' : undefined, run: () => ed.replaceWith(e.ref) });
    menu(swapBtn, [...all.filter(e => e.type === 'cocktail').map(e => item(e)), 'sep', ...all.filter(e => e.type === 'glass').map(e => item(e, 'Verre vide : '))]);
  });
  const selectBtn = button(null, { icon: 'select', title: 'Étendre la sélection' });
  selectBtn.addEventListener('click', () => menu(selectBtn, [
    { label: 'Sélectionner les mêmes', run: () => ed.selectSimilar() },
    { label: 'Ajouter ce qui est posé dessus', run: () => ed.selectSupported() },
    { label: 'Tout sélectionner', kbd: kbd('Mod+A'), run: () => ed.select(ed.state.items.map(i => i.id), 'single') },
  ]));
  const groupBtn = button(null, { icon: 'group', title: 'Grouper' });
  groupBtn.addEventListener('click', () => (ed.selected.some(i => i.groupId) ? ed.ungroup() : ed.group()));
  const lockBtn = button(null, { icon: 'lock', title: 'Verrouiller' });
  lockBtn.addEventListener('click', () => ed.toggleLock());
  bar.append(
    label,
    h('div', { class: 'sep' }),
    button(null, { icon: 'duplicate', title: `Dupliquer (${kbd('Mod+D')})`, onClick: () => ed.duplicate() }),
    button(null, { icon: 'rotate', title: 'Pivoter de 90° (R : 15°)', onClick: () => ed.rotate(ed.selection, -Math.PI / 2) }),
    alignBtn, swapBtn, selectBtn, groupBtn, lockBtn,
    button(null, { icon: 'frame', title: 'Cadrer (F)', onClick: frame }),
    h('div', { class: 'sep' }),
    button(null, { icon: 'trash', title: 'Supprimer', class: 'danger', onClick: () => ed.remove() }),
    button(null, { icon: 'close', title: 'Désélectionner (Échap)', onClick: () => ed.setSelection([]) }),
  );
  const refresh = () => {
    const sel = ed.selected;
    bar.style.display = sel.length ? '' : 'none';
    if (!sel.length) return;
    label.textContent = describeSelection(ed);
    alignBtn.style.display = sel.filter(i => i.type !== 'fabric').length > 1 ? '' : 'none';
    swapBtn.style.display = sel.every(holdsLiquid) ? '' : 'none';
    const grouped = sel.some(i => i.groupId);
    groupBtn.style.display = sel.length > 1 || grouped ? '' : 'none';
    groupBtn.title = grouped ? `Dégrouper (${kbd('Mod+Shift+G')})` : `Grouper (${kbd('Mod+G')})`;
    groupBtn.setAttribute('aria-label', groupBtn.title);
    const locked = sel.every(i => i.locked);
    lockBtn.title = locked ? 'Déverrouiller' : 'Verrouiller la position';
    lockBtn.setAttribute('aria-label', lockBtn.title);
    lockBtn.classList.toggle('on', locked);
  };
  ed.on(refresh);
  refresh();
  return bar;
}
