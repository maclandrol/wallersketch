// One line at the bottom of the scene saying what can be done right now, in plain words, for
// people who have never used a 3D program. It follows the selection and can be turned off.
import type { Editor } from '../editor';
import { holdsLiquid, isSupport } from '../core/scene';
import { button, h } from './dom';

const touch = matchMedia('(pointer: coarse)').matches;
const click = touch ? 'Touchez' : 'Cliquez';

function hint(ed: Editor): string {
  const items = ed.state.items, sel = ed.selected;
  if (!items.length) return `Commencez par une table : ${click.toLowerCase()} une carte de la bibliothèque.`;
  if (!sel.length) return touch ? `Touchez un objet pour le modifier. Un doigt tourne la vue, deux doigts zooment.` : `Cliquez un objet pour le modifier. Glissez dans le vide pour tourner, molette pour zoomer.`;
  if (sel.length > 1) return 'Glissez l’un d’eux pour tout déplacer. Aligner et ranger : barre du haut.';
  const i = sel[0];
  if (i.locked) return 'Objet verrouillé : déverrouillez-le dans la barre du haut pour le déplacer.';
  if (i.type === 'table') return `${click} un socle, un tissu ou un cocktail : il se pose sur cette table.`;
  if (isSupport(i)) return `${click} un cocktail ou un décor dans la bibliothèque : il se pose dessus.`;
  if (i.type === 'fabric') return 'Glisser le tissu déplace toute la table habillée.';
  if (i.type === 'glass') return 'Verre vide : « Remplir ce verre » dans les propriétés.';
  if (holdsLiquid(i)) return touch ? 'Glissez pour déplacer. Couleurs et rangées dans les propriétés.' : 'Glissez pour déplacer, R pour pivoter. Couleurs et rangées dans les propriétés.';
  return touch ? 'Glissez pour déplacer, la pastille bleue pour pivoter.' : 'Glissez pour déplacer, R ou la pastille bleue pour pivoter.';
}

export function hintBar(ed: Editor): HTMLElement & { setHints: (on: boolean) => void; hintsOn: () => boolean } {
  let off = false;
  try { off = localStorage.getItem('hints') === 'off'; } catch { /* default on */ }
  const text = h('span');
  const close = button(null, { icon: 'close', title: 'Masquer les aides (menu … pour les retrouver)', class: 'small ghost', onClick: () => set(false) });
  const bar = h('div', { class: 'hint-bar', role: 'status' }, text, close);
  const refresh = () => { bar.style.display = off ? 'none' : ''; if (!off) text.textContent = hint(ed); };
  const set = (on: boolean) => { off = !on; try { localStorage.setItem('hints', off ? 'off' : 'on'); } catch { /* ignore */ } refresh(); };
  ed.on(refresh);
  refresh();
  return Object.assign(bar, { setHints: set, hintsOn: () => !off });
}
