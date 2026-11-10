// Keyboard and mouse reference, opened with ? or from the menus.
import { h, modal } from './dom';
import { isMac, kbd } from './platform';

const DEL = isMac ? '⌫' : 'Suppr';

const SECTIONS: [string, [string, string][]][] = [
  ['Caméra', [
    ['Tourner autour', 'Glisser dans le vide'],
    ['Déplacer la vue', 'Espace + glisser, clic droit + glisser'],
    ['Zoomer', 'Molette, pincement, + et −'],
    ['Tourner, incliner', '← → ↑ ↓ (Alt si une sélection)'],
    ['Faire glisser', `${kbd('Shift+')}← → ↑ ↓`],
    ['Vue 3/4, face, dessus', '1, 2, 3'],
    ['Cadrer la sélection', 'F, double-clic'],
    ['Tout cadrer', '0 ou H'],
  ]],
  ['Sélection', [
    ['Ajouter ou retirer', `${kbd('Shift+')}clic`],
    ['Sélectionner une zone', `${kbd('Shift+')}glisser depuis le vide`],
    ['Tout sélectionner', kbd('Mod+A')],
    ['Désélectionner', 'Échap'],
  ]],
  ['Objets', [
    ['Déplacer', 'Glisser l’objet'],
    ['Déplacer sans aimant', `${kbd('Alt+')}glisser`],
    ['Décaler de 1 cm, 10 cm', `← → ↑ ↓, ${kbd('Shift+')}flèches`],
    ['Pivoter de 15°', 'R, Maj+R'],
    ['Copier, couper, coller', `${kbd('Mod+C')}, ${kbd('Mod+X')}, ${kbd('Mod+V')}`],
    ['Dupliquer', kbd('Mod+D')],
    ['Grouper, dégrouper', `${kbd('Mod+G')}, ${kbd('Mod+Shift+G')}`],
    ['Supprimer', DEL],
  ]],
  ['Document', [
    ['Annuler, rétablir', `${kbd('Mod+Z')}, ${kbd(isMac ? 'Mod+Shift+Z' : 'Mod+Y')}`],
    ['Enregistrer', kbd('Mod+S')],
    ['Ouvrir', kbd('Mod+O')],
    ['Exporter', kbd('Mod+E')],
    ['Présenter', kbd('Mod+Enter')],
    ['Cette aide', '?'],
  ]],
];

export function shortcutsSheet() {
  if (document.querySelector('.shortcuts')) return;
  const body = h('div', { class: 'shortcuts' }, ...SECTIONS.map(([title, rows]) => h('section', null,
    h('h3', null, title),
    h('dl', null, ...rows.flatMap(([what, keys]) => [h('dt', null, what), h('dd', null, keys)])))));
  modal('Raccourcis', body, [], { wide: true });
}
