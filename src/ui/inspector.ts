// Properties of the selection, or of the presentation when nothing is selected. Only controls
// that mean something for the selected kind of object are shown.
import type { Editor } from '../editor';
import type { Item, Vec3 } from '../core/types';
import { FABRIC_COLORS, FABRIC_TEXTURES, GARNISH_LABELS, RISER_MAX_HEIGHT, SOLID_COLORS, SURFACE_TEXTURES } from '../core/catalog';
import { GLASSES, customGlasses, glassSize } from '../core/glassware';
import { openDrinkBuilder } from './drinkBuilder';
import { fabricCovers, overhang } from '../core/fabric';
import { gridRows, holdsLiquid, inventory } from '../core/scene';
import { button, fmtCm, h, menu, numberField, section, segmented, swatches, toggle } from './dom';
import { icon } from './icons';
import { kbd } from './platform';

const TYPE_LABEL: Record<string, string> = { table: 'Table', riser: 'Socle', fabric: 'Tissu', cocktail: 'Cocktail', glass: 'Verre vide', decor: 'Décor', model: 'Modèle importé' };
const TYPE_ICON: Record<string, string> = { table: 'table', riser: 'riser', fabric: 'fabric', cocktail: 'cocktail', glass: 'glass', decor: 'decor', model: 'cube3' };
const FINISHES = [{ value: 'matte', label: 'Mat' }, { value: 'satin', label: 'Satiné' }, { value: 'gloss', label: 'Brillant' }, { value: 'mirror', label: 'Miroir' }] as const;
const FINISH_VALUES: Record<string, { roughness: number; metalness: number }> = { matte: { roughness: 0.85, metalness: 0 }, satin: { roughness: 0.45, metalness: 0 }, gloss: { roughness: 0.15, metalness: 0 }, mirror: { roughness: 0.06, metalness: 1 } };
const finishOf = (f?: { roughness?: number; metalness?: number }) => (f?.metalness ?? 0) > 0.5 ? 'mirror' : (f?.roughness ?? 0.5) > 0.65 ? 'matte' : (f?.roughness ?? 0.5) > 0.3 ? 'satin' : 'gloss';
const PART_LABEL: Record<string, string> = { top: 'Plateau', legs: 'Piètement', main: 'Couleur', flowers: 'Fleurs', vase: 'Vase', stand: 'Support', liquid: 'Boisson', frame: 'Cadre', napkins: 'Serviettes', leaves: 'Feuillage', glass: 'Verre' };

const same = <T>(vals: T[]): T | null => (vals.length && vals.every(v => JSON.stringify(v) === JSON.stringify(vals[0])) ? vals[0] : null);

export class Inspector {
  readonly el = h('div', { class: 'scroll' });
  private refreshers: (() => void)[] = [];
  private signature = '';
  /** Id of the object whose grid editor is open. */
  private gridOpen = '';

  constructor(private ed: Editor) {
    ed.on(() => this.update());
    this.update();
  }

  /** Rebuild when the kind of selection changes; otherwise refresh values in place. */
  private update() {
    const sel = this.ed.selected;
    const sig = sel.map(i => i.id + i.type + i.ref + i.shape + (i.drink?.glass ?? '') + Object.keys(i.finish).join() + (i.finish.main?.texture ?? '') + (i.finish.top?.texture ?? '')).join('|') + (sel.length ? '' : 'scene:' + this.ed.state.items.length);
    if (sig !== this.signature) {
      this.signature = sig;
      this.build(sel);
    } else for (const r of this.refreshers) r();
  }

  private build(sel: Item[]) {
    this.refreshers = [];
    const parts: (HTMLElement | null)[] = sel.length ? this.selectionPanel(sel) : this.scenePanel();
    const scroll = this.el.scrollTop;
    this.el.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
    this.el.scrollTop = scroll;
  }

  private live(r: { el: HTMLElement; refresh: () => void }) { this.refreshers.push(r.refresh); return r.el; }

  // ------------------------------------------------------------------ nothing selected

  private scenePanel(): HTMLElement[] {
    const ed = this.ed;
    const amb = h('div', { class: 'ambiances' });
    const looks = [
      { id: 'studio', name: 'Studio', bg: 'linear-gradient(160deg,#fbfaf8,#e6e1d9)', background: '#f1eee9', floor: '#e9e5de' },
      { id: 'warm', name: 'Chaleureux', bg: 'linear-gradient(160deg,#f6e3cc,#c9a37b)', background: '#efe4d6', floor: '#e3d6c4' },
      { id: 'evening', name: 'Soirée', bg: 'linear-gradient(160deg,#3b3a45,#121116)', background: '#1b1a20', floor: '#2a2826' },
    ] as const;
    const ambRefresh = () => amb.querySelectorAll('.amb').forEach((b, k) => b.classList.toggle('on', ed.state.scene.ambiance === looks[k].id));
    for (const l of looks) amb.append(h('button', { type: 'button', class: 'amb', onClick: () => ed.setScene({ ambiance: l.id, background: l.background, floor: l.floor }) }, h('div', { class: 'sw', style: `background:${l.bg}` }), h('span', null, l.name)));
    ambRefresh();
    this.refreshers.push(ambRefresh);
    const bgColors = [{ name: 'Lin', color: '#f1eee9' }, { name: 'Blanc', color: '#ffffff' }, { name: 'Sable', color: '#efe4d6' }, { name: 'Rose', color: '#f4e4e2' }, { name: 'Sauge', color: '#e3e8df' }, { name: 'Gris', color: '#d9d9d6' }, { name: 'Nuit', color: '#1b1a20' }];
    const floorColors = [{ name: 'Lin', color: '#e9e5de' }, { name: 'Béton', color: '#c9c6c0' }, { name: 'Parquet clair', color: '#cdb391' }, { name: 'Parquet foncé', color: '#6f5440' }, { name: 'Marbre', color: '#f2f1ee' }, { name: 'Ardoise', color: '#2a2826' }];
    const out = [
      h('div', { class: 'insp-head' }, h('div', { class: 'badge' }, icon('sun')), h('div', { class: 'titles' }, h('div', { style: 'font-weight:600;font-size:14px' }, 'Présentation'), h('div', { class: 'sub' }, 'Lumière et fond des images'))),
      section('Ambiance', amb),
      section('Fond', this.live(swatches(bgColors, () => ed.state.scene.background, (c, live) => ed.setScene({ background: c }, live ? 'bg' : undefined)))),
      section('Sol', this.live(swatches(floorColors, () => ed.state.scene.floor, (c, live) => ed.setScene({ floor: c }, live ? 'floor' : undefined)))),
    ];
    const inv = inventory(ed.state.items);
    if (inv.length) {
      const groups: [string, string[]][] = [['Mobilier', ['table', 'riser']], ['Tissus', ['fabric']], ['Boissons', ['cocktail']], ['Verres vides', ['glass']], ['Décor', ['decor', 'model']]];
      const box = h('div');
      for (const [title, types] of groups) {
        const rows = inv.filter(r => types.includes(r.type));
        if (!rows.length) continue;
        const total = rows.reduce((n, r) => n + r.count, 0);
        box.append(h('div', { class: 'inv-group' }, h('h4', null, `${title} · ${total}`), ...rows.map(r => h('div', { class: 'stat' }, h('span', null, r.name), h('span', null, '× ' + r.count)))));
      }
      const glasses = ed.state.items.filter(holdsLiquid).length;
      out.push(section('À prévoir', glasses ? h('div', { class: 'note', style: 'margin:-4px 0 8px' }, `${glasses} verre${glasses > 1 ? 's' : ''} au total`) : null, box));
    } else out.push(h('div', { class: 'empty' }, h('strong', null, 'Composition vide'), 'Ajoutez une table depuis la bibliothèque, puis des socles, un tissu et des cocktails.'));
    return out;
  }

  // ------------------------------------------------------------------ selection

  private selectionPanel(sel: Item[]): (HTMLElement | null)[] {
    const ed = this.ed, ids = sel.map(i => i.id), one = sel.length === 1 ? sel[0] : null;
    const types = new Set(sel.map(i => i.type)), type = types.size === 1 ? sel[0].type : null;
    const nameInput = h('input', { class: 'name', value: one ? one.name : '', spellcheck: false, 'aria-label': 'Nom' });
    nameInput.addEventListener('change', () => one && ed.patch([one.id], () => ({ name: nameInput.value.trim() || one.name })));
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') nameInput.blur(); });
    const counts = [...types].map(t => `${sel.filter(i => i.type === t).length} ${TYPE_LABEL[t].toLowerCase()}${sel.filter(i => i.type === t).length > 1 ? 's' : ''}`).join(', ');
    const subtitle = one ? TYPE_LABEL[one.type] + (one.parentId ? ' · sur ' + (ed.item(one.parentId)?.name ?? '') : '') : counts;
    const head = h('div', { class: 'insp-head' }, h('div', { class: 'badge' }, icon(TYPE_ICON[type ?? 'cube3'] ?? 'cube3')),
      h('div', { class: 'titles' }, one ? nameInput : h('div', { style: 'font-weight:600;font-size:14px' }, `${sel.length} objets`), h('div', { class: 'sub' }, subtitle)));
    const grouped = sel.some(i => i.groupId), locked = sel.every(i => i.locked);
    const actions = h('div', { class: 'actions-bar' },
      button(null, { icon: 'duplicate', title: `Dupliquer (${kbd('Mod+D')})`, onClick: () => ed.duplicate() }),
      button(null, { icon: 'rotate', title: 'Pivoter de 90°', onClick: () => ed.rotate(ids, -Math.PI / 2) }),
      sel.length > 1 || grouped ? button(null, { icon: 'group', title: grouped ? `Dégrouper (${kbd('Mod+Shift+G')})` : `Grouper (${kbd('Mod+G')})`, onClick: () => (grouped ? ed.ungroup() : ed.group()) }) : null,
      button(null, { icon: locked ? 'lock' : 'unlock', title: locked ? 'Déverrouiller' : 'Verrouiller la position', onClick: () => ed.toggleLock() }),
      button(null, { icon: 'mine', title: 'Enregistrer dans Mes objets', onClick: () => this.saveArrangement() }),
      h('span', { style: 'flex:1' }),
      button(null, { icon: 'trash', title: 'Supprimer (Suppr)', class: 'danger', onClick: () => ed.remove() }));
    const out: (HTMLElement | null)[] = [head, actions];
    // Order by how often each control is used for this kind of object.
    if (type === 'cocktail' || type === 'glass') {
      if (one) out.push(this.repeat(one));
      out.push(...this.drink(sel), this.placement(sel));
      return out;
    }
    if (type) out.push(this.dimensions(sel, type));
    if (type === 'fabric') out.push(this.fabricLook(ids));
    else if (type) out.push(...this.parts(sel));
    out.push(this.placement(sel));
    return out;
  }

  private saveArrangement() {
    const sel = this.ed.selected;
    const root = sel.find(i => i.type === 'table') ?? sel[0];
    const name = sel.length === 1 ? root.name : `${root.name} et ${sel.length - 1} objet${sel.length > 2 ? 's' : ''}`;
    this.ed.saveArrangement(name);
  }

  private dimensions(sel: Item[], type: Item['type']): HTMLElement {
    const ed = this.ed, ids = sel.map(i => i.id);
    const round = sel.every(i => i.shape === 'round' || i.shape === 'highboy');
    const get = (axis: number) => () => same(ed.selected.map(i => i.size[axis]));
    const set = (axis: number) => (v: number, live: boolean) => ed.patch(ids, i => { const s = [...i.size] as Vec3; s[axis] = v; if (round && axis === 0) s[2] = v; return { size: s }; }, live ? 'size' + axis : undefined);
    const fields: HTMLElement[] = [];
    if (type === 'fabric') {
      if (round) fields.push(this.live(numberField('Diamètre', { get: get(0), set: set(0), min: 20, max: 600 })));
      else fields.push(this.live(numberField('Longueur', { get: get(0), set: set(0), min: 20, max: 1000 })), this.live(numberField('Largeur', { get: get(2), set: set(2), min: 20, max: 600 })));
    } else {
      if (round) fields.push(this.live(numberField('Diamètre', { get: get(0), set: set(0), min: 2, max: 400 })));
      else fields.push(this.live(numberField(type === 'decor' ? 'Largeur' : 'Longueur', { get: get(0), set: set(0), min: 2, max: 600 })), this.live(numberField('Profondeur', { get: get(2), set: set(2), min: 2, max: 400 })));
      fields.push(this.live(numberField('Hauteur', { get: get(1), set: set(1), min: 2, max: type === 'riser' ? RISER_MAX_HEIGHT * 100 : type === 'table' ? 130 : 400 })));
    }
    const s = section(type === 'fabric' ? 'Taille du tissu' : 'Dimensions', h('div', { class: 'fields' + (fields.length === 2 ? ' two' : '') }, ...fields));
    // Stepped presentoirs and champagne towers: number of levels.
    if (sel.every(i => i.steps)) {
      const tower = sel[0].ref.startsWith('tower');
      s.append(h('div', { class: 'fields two', style: 'margin-top:8px' }, this.live(numberField(tower ? 'Étages' : 'Niveaux', { unit: '', scale: 1, min: 2, max: tower ? 7 : 6, get: () => same(ed.selected.map(i => i.steps ?? 3)), set: v => {
        const n = Math.round(v);
        ed.patch(ids, () => (tower ? { steps: n, size: [n * 0.113, n * 0.128 + 0.01, n * 0.113] } : { steps: n }));
      } }))));
      if (tower) s.append(h('div', { class: 'note' }, `${Array.from({ length: sel[0].steps ?? 4 }, (_, k) => (k + 1) ** 2).reduce((a, b) => a + b, 0)} coupes.`));
    }
    if (type === 'riser') s.append(h('div', { class: 'note' }, '50 cm maximum par socle.'));
    if (type === 'fabric' && sel.length === 1) {
      const note = h('div', { class: 'note' });
      const refresh = () => {
        const f = ed.selected[0];
        const table = f && ed.state.items.find(t => t.id === f.parentId);
        const o = f && table ? overhang(f, table) : null;
        note.textContent = o ? (o.sides < 0 || o.ends < 0 ? 'Plus petit que la table.' : o.sides === o.ends ? `Retombée : ${fmtCm(o.sides)} cm tout autour` : `Retombée : ${fmtCm(o.sides)} cm devant et derrière, ${fmtCm(o.ends)} cm aux extrémités`) + (table ? ` · table h ${fmtCm(table.size[1])} cm` : '') : 'Posez le tissu sur une table.';
      };
      refresh();
      this.refreshers.push(refresh);
      s.append(note);
      s.append(this.live(toggle('Recouvre aussi les socles', () => fabricCovers(ed.selected[0] ?? sel[0]) === 'all', v => ed.patch(ids, () => ({ covers: v ? 'all' : 'tables' })))));
    }
    return s;
  }

  private placement(sel: Item[]): HTMLElement {
    const ed = this.ed, ids = sel.map(i => i.id);
    const centre = (axis: 0 | 2) => () => { const s = ed.selected; return s.length ? s.reduce((a, i) => a + i.position[axis], 0) / s.length : null; };
    const fields = [
      this.live(numberField('X', { get: centre(0), set: (v, live) => ed.setPosition(ids, 0, v, live ? 'posx' : undefined) })),
      this.live(numberField('Z', { get: centre(2), set: (v, live) => ed.setPosition(ids, 2, v, live ? 'posz' : undefined) })),
    ];
    if (sel.length === 1) fields.push(this.live(numberField('Rotation', { unit: '°', scale: 1, get: () => { const i = ed.selected[0]; return i ? Math.round(((i.rotation * 180 / Math.PI) % 360 + 360) % 360 * 10) / 10 : null; }, set: v => ed.setRotation(ids, v) })));
    const s = section('Position', h('div', { class: 'fields' + (fields.length === 2 ? ' two' : '') }, ...fields));
    const alt = h('div', { class: 'note' });
    const refresh = () => {
      const i = ed.selected[0];
      alt.textContent = sel.length === 1 && i && i.type !== 'table' && i.type !== 'fabric' ? `Posé à ${fmtCm(i.position[1])} cm du sol` : '';
      alt.style.display = alt.textContent ? '' : 'none';
    };
    refresh(); this.refreshers.push(refresh);
    s.append(alt);
    return s;
  }

  private colourRow(ids: string[], part: string, palette = SOLID_COLORS) {
    return this.live(swatches(palette, () => same(this.ed.selected.map(i => i.finish[part]?.color ?? '')), (c, live) => this.ed.setFinish(ids, part, { color: c }, live ? 'color-' + part : undefined)));
  }

  private fabricLook(ids: string[]): HTMLElement {
    const ed = this.ed;
    const tex = this.live(segmented(FABRIC_TEXTURES.map(t => ({ value: t.id, label: t.name })), () => same(ed.selected.map(i => i.finish.main?.texture ?? 'cotton')) as string | null, v => ed.setFinish(ids, 'main', { texture: v, roughness: FABRIC_TEXTURES.find(t => t.id === v)!.roughness })));
    const image = ed.selected[0]?.finish.main?.texture?.startsWith('asset:');
    return section('Tissu', h('div', { class: 'stack' }, tex, this.colourRow(ids, 'main', FABRIC_COLORS),
      h('div', { style: 'display:flex;gap:6px' }, button(image ? 'Changer le motif' : 'Motif depuis une image…', { icon: 'texture', class: 'outline small', onClick: () => ed.importTexture(ids, 'main') }),
        image ? button('Retirer', { class: 'small', onClick: () => ed.setFinish(ids, 'main', { texture: 'satin', color: '#f4f2ee' }) }) : null)));
  }

  private parts(sel: Item[]): HTMLElement[] {
    const ed = this.ed, ids = sel.map(i => i.id), first = sel[0];
    const keys = Object.keys(first.finish).filter(k => sel.every(i => i.finish[k]));
    const out: HTMLElement[] = [];
    for (const part of keys) {
      const body = h('div', { class: 'stack' });
      const isSign = (first.ref === 'sign-a5' || first.ref === 'frame-a3') && part === 'main';
      if (isSign) {
        const has = !!first.finish.main?.texture;
        body.append(h('div', { class: 'note', style: 'margin:0' }, has ? 'Image de votre carte affichée.' : 'Affichez votre carte ou votre menu (PNG, JPEG, WebP).'),
          h('div', { style: 'display:flex;gap:6px' }, button(has ? 'Changer l’image' : 'Choisir une image…', { icon: 'image', class: 'outline small', onClick: () => ed.importTexture(ids, 'main') }), has ? button('Retirer', { class: 'small', onClick: () => ed.patch(ids, i => ({ finish: { ...i.finish, main: { color: '#f7f6f3', roughness: 0.6 } } })) }) : null));
        out.push(section('Carte', body));
        continue;
      }
      body.append(this.colourRow(ids, part, first.type === 'decor' && part === 'flowers' ? [...FABRIC_COLORS.slice(0, 8), { name: 'Jaune', color: '#f3c932' }] : SOLID_COLORS));
      if (first.type === 'table' && part === 'top' || first.type === 'riser' || (first.type === 'decor' && first.ref.startsWith('backdrop-wall'))) {
        body.append(this.live(segmented(SURFACE_TEXTURES.map(t => ({ value: t.id || 'none', label: t.name })), () => { const t = same(ed.selected.map(i => i.finish[part]?.texture ?? '')); return t === null ? null : (t || 'none'); }, v => ed.setFinish(ids, part, { texture: v === 'none' ? undefined : v }))));
      }
      if (first.type !== 'model' && part !== 'liquid' && part !== 'flowers' && part !== 'leaves') body.append(this.live(segmented([...FINISHES], () => same(ed.selected.map(i => finishOf(i.finish[part]))), v => ed.setFinish(ids, part, FINISH_VALUES[v]))));
      if (first.type === 'riser') body.append(this.live(toggle('Éclairé de l’intérieur', () => ed.selected.every(i => (i.finish.main?.glow ?? 0) > 0), v => ed.setFinish(ids, 'main', { glow: v ? 0.45 : 0 }))));
      out.push(section(first.type === 'model' ? partName(first, part) : PART_LABEL[part] ?? part, body));
    }
    if (first.type === 'model' && sel.length === 1) {
      out.push(section('Orientation', h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        button('Basculer avant', { class: 'outline small', onClick: () => ed.patch(ids, i => ({ tilt: [((i.tilt?.[0] ?? 0) + 1) % 4, i.tilt?.[1] ?? 0], size: [i.size[0], i.size[2], i.size[1]] as Vec3 })) }),
        button('Basculer côté', { class: 'outline small', onClick: () => ed.patch(ids, i => ({ tilt: [i.tilt?.[0] ?? 0, ((i.tilt?.[1] ?? 0) + 1) % 4], size: [i.size[1], i.size[0], i.size[2]] as Vec3 })) })),
        this.live(toggle('Peut porter des objets', () => !!ed.selected[0]?.support, v => ed.patch(ids, () => ({ support: v || undefined }))))));
    }
    return out;
  }

  private drink(sel: Item[]): HTMLElement[] {
    const ed = this.ed, ids = sel.map(i => i.id), first = sel[0];
    const glassSel = h('select', { class: 'select', 'aria-label': 'Verre' }, ...[...GLASSES, ...customGlasses()].map(g => h('option', { value: g.id }, g.name)));
    glassSel.value = same(sel.map(i => i.drink?.glass)) ?? '';
    glassSel.addEventListener('change', () => ed.patch(ids, i => ({ drink: { ...i.drink!, glass: glassSel.value }, size: glassSize(glassSel.value) })));
    const crystal = this.live(toggle('Cristal taillé', () => ed.selected.every(i => i.finish.glass?.texture === 'cut'), v => ed.setFinish(ids, 'glass', { texture: v ? 'cut' : undefined })));
    const out = [section('Verre', h('div', { class: 'stack' }, glassSel, crystal))];
    if (first.type !== 'cocktail') return out;
    // Liquid colours from bottom to top; each layer is one colour stop.
    const layers = h('div', { class: 'stack' });
    const renderLayers = () => {
      const d = ed.selected[0]?.drink;
      if (!d) return;
      layers.replaceChildren(...d.layers.map((l, k) => {
        const input = h('input', { type: 'color', value: l.color, class: 'layer-color', title: 'Couleur' });
        input.addEventListener('input', () => ed.patch(ids, i => ({ drink: { ...i.drink!, layers: i.drink!.layers.map((x, j) => (j === k ? { ...x, color: input.value } : x)) } }), 'layer' + k));
        input.addEventListener('change', () => ed.doc.seal());
        return h('label', { class: 'toggle' }, h('span', null, d.layers.length === 1 ? 'Couleur' : k === 0 ? 'Fond du verre' : k === d.layers.length - 1 ? 'Surface' : 'Milieu'), h('span', { class: 'custom-wrap', style: `--c:${l.color}` }, input));
      }));
    };
    renderLayers();
    this.refreshers.push(() => { if (!layers.contains(document.activeElement)) renderLayers(); });
    const fill = h('input', { type: 'range', class: 'slider', min: '20', max: '100', step: '1', value: String(Math.round((first.drink?.fill ?? 0.8) * 100)), 'aria-label': 'Remplissage' });
    fill.addEventListener('input', () => ed.patch(ids, i => ({ drink: { ...i.drink!, fill: +fill.value / 100 } }), 'fill'));
    fill.addEventListener('change', () => ed.doc.seal());
    this.refreshers.push(() => { if (document.activeElement !== fill) fill.value = String(Math.round((ed.selected[0]?.drink?.fill ?? 0.8) * 100)); });
    const garnish = h('div', { class: 'chips' });
    const allGarnish = Object.keys(GARNISH_LABELS);
    const setGarnish = (fn: (g: string[]) => string[]) => ed.patch(ids, i => ({ drink: { ...i.drink!, garnish: fn(i.drink!.garnish) } }));
    const renderGarnish = () => {
      const d = ed.selected[0]?.drink;
      if (!d) return;
      const add = h('button', { type: 'button', class: 'chip add' }, '+ Ajouter');
      add.addEventListener('click', () => menu(add, allGarnish.filter(g => !d.garnish.includes(g)).map(g => ({ label: GARNISH_LABELS[g], run: () => setGarnish(x => [...x, g]) }))));
      garnish.replaceChildren(...d.garnish.map(g => h('button', { type: 'button', class: 'chip on', title: 'Retirer', onClick: () => setGarnish(x => x.filter(y => y !== g)) }, GARNISH_LABELS[g] ?? g, h('span', { class: 'x' }, '×'))), add);
    };
    renderGarnish();
    this.refreshers.push(renderGarnish);
    const ice = this.live(numberField('Glaçons', { unit: '', scale: 1, min: 0, max: 8, get: () => same(ed.selected.map(i => i.drink?.ice ?? 0)), set: (v, live) => ed.patch(ids, i => ({ drink: { ...i.drink!, ice: Math.round(v) } }), live ? 'ice' : undefined) }));
    out.push(section('Boisson', layers, h('div', { class: 'fill-row' }, h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Remplissage'), fill), ice)));
    out.push(section('Garniture', garnish));
    if (sel.length === 1) out.push(h('div', { class: 'panel-section' }, button('Enregistrer comme cocktail…', { icon: 'mine', class: 'outline wide', onClick: () => openDrinkBuilder(ed, ed.selected[0]) })));
    return out;
  }

  private repeat(src: Item): HTMLElement {
    const ed = this.ed;
    const body = h('div');
    const s = section('Répéter', body);
    if (this.gridOpen !== src.id || !ed.grid.active) {
      body.append(h('div', { class: 'note', style: 'margin:0 0 8px' }, 'Placez une rangée ou une grille de ce verre, centrée sur lui.'),
        button('Disposer en grille…', { icon: 'grid', class: 'outline wide', onClick: () => { this.gridOpen = src.id; ed.previewGrid({}); this.build(ed.selected); this.el.scrollTop = 0; } }));
      return s;
    }
    const g = ed.grid;
    const mini = h('div', { class: 'mini' });
    const summary = h('span');
    const place = button(`Placer ${g.count}`, { class: 'primary', onClick: () => { this.gridOpen = ''; ed.commitGrid(); } });
    const draw = () => {
      place.querySelector('span')!.textContent = `Placer ${g.count}`;
      const cols = Math.max(1, Math.min(g.count, g.columns)), rows = gridRows(g);
      mini.style.gridTemplateColumns = `repeat(${Math.min(cols, 12)}, 6px)`;
      mini.replaceChildren(...Array.from({ length: Math.min(g.count, 72) }, () => h('i')));
      const w = cols * src.size[0] + (cols - 1) * g.gap, d = rows * src.size[2] + (rows - 1) * g.gap;
      summary.textContent = `${rows} rangée${rows > 1 ? 's' : ''} de ${cols} · ${fmtCm(w)} × ${fmtCm(d)} cm`;
    };
    const fields = h('div', { class: 'fields' },
      numberField('Quantité', { unit: '', scale: 1, min: 1, max: 400, get: () => g.count, set: v => { ed.previewGrid({ count: Math.round(v) }); draw(); } }).el,
      numberField('Par rangée', { unit: '', scale: 1, min: 1, max: 40, get: () => g.columns, set: v => { ed.previewGrid({ columns: Math.round(v) }); draw(); } }).el,
      numberField('Écart', { min: 0, max: 50, step: 0.5, get: () => g.gap, set: v => { ed.previewGrid({ gap: v }); draw(); } }).el);
    const quick = h('div', { class: 'chips', style: 'margin-top:8px' }, ...([[6, 6, 'Rangée de 6'], [4, 2, '2 × 2'], [9, 3, '3 × 3'], [16, 4, '4 × 4'], [24, 6, '4 × 6']] as const).map(([n, c, label]) =>
      h('button', { type: 'button', class: 'chip', onClick: () => { ed.previewGrid({ count: n, columns: c }); this.build(ed.selected); } }, label)));
    draw();
    body.append(fields, quick, h('div', { class: 'grid-preview' }, mini, summary),
      h('div', { style: 'display:flex;gap:6px;margin-top:10px' },
        place,
        button('Annuler', { onClick: () => { this.gridOpen = ''; ed.cancelGrid(); this.build(ed.selected); } })),
      h('div', { class: 'note' }, 'Écart : espace libre entre deux verres.'));
    return s;
  }
}

function partName(i: Item, part: string) {
  return i.finish[part]?.label ?? 'Matière ' + (parseInt(part.slice(1)) + 1);
}
