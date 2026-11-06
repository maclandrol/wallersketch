import { Viewport, type ViewName } from './render/viewport';
import { Editor, msg, type Native } from './editor';
import { parseProject } from './core/project';
import type { CameraView, Vec3 } from './core/types';
import { TEMPLATES } from './templates';
import { planSVG } from './plan';
import { LibraryPanel } from './ui/library';
import { OutlinePanel } from './ui/outline';
import { Inspector } from './ui/inspector';
import { button, h, isTyping, menu, modal, toast } from './ui/dom';
import { icon } from './ui/icons';
import { isMac, kbd, mod, platformClass } from './ui/platform';
import { AgentBridge } from './agent';
import { openAssistant } from './ui/assistant';
import { openDrinkBuilder } from './ui/drinkBuilder';

declare global { interface Window { native: Native; studio: unknown } }

const app = document.getElementById('app')!;
document.documentElement.classList.add(platformClass());

// ------------------------------------------------------------------ layout
const stage = h('main', { class: 'stage' });
const left = h('aside', { class: 'left' });
const right = h('aside', { class: 'right' });
const top = h('header', { class: 'top' });
app.append(top, left, stage, right);

let ed!: Editor;
const view = new Viewport(stage, {
  select: (ids, mode) => ed.select(ids, mode),
  move: (ids, delta, final, free) => ed.move(ids, delta, final, undefined, free),
  rotate: (ids, yaw, pivot, final) => ed.rotate(ids, yaw, pivot, final),
  surfacesChanged: ids => ed.surfacesChanged(ids),
  hover: () => {},
  drapeBusy: n => { busy.style.display = n ? '' : 'none'; },
  contextMenu: (id, x, y) => contextMenu(id, x, y),
});
ed = new Editor(view, window.native, (m, kind) => toast(m, kind));
const agent = new AgentBridge(ed);
window.native?.onAgentRequest((method, params) => agent.handle(method, params));
// Exposed for the end-to-end checks and debugging from the developer console.
window.studio = { ed, view, agent, templates: TEMPLATES, plan: planSVG, interchange: () => import('./render/interchange'), ready: false };

// ------------------------------------------------------------------ top bar
const title = h('input', { 'aria-label': 'Nom de la composition', spellcheck: false });
title.addEventListener('change', () => ed.rename(title.value));
title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') title.value = ed.state.name; title.blur(); } });
const saveState = h('span', { class: 'save-state' });
const undoBtn = button(null, { icon: 'undo', title: `Annuler (${kbd('Mod+Z')})`, onClick: () => action('undo') });
const redoBtn = button(null, { icon: 'redo', title: `Rétablir (${kbd(isMac ? 'Mod+Shift+Z' : 'Mod+Y')})`, onClick: () => action('redo') });
const moreBtn = button(null, { icon: 'more', title: 'Fichier', onClick: () => fileMenu(moreBtn) });
top.append(
  h('div', { class: 'brand' }, h('img', { class: 'mark', src: 'icon.png', alt: '' }), h('span', { class: 'word' }, 'WallerSketch')),
  h('div', { class: 'doc-title' }, title, saveState),
  h('div', { class: 'spacer' }),
  h('div', { class: 'top-group' }, undoBtn, redoBtn),
  h('div', { class: 'top-group' }, button('Assistant', { icon: 'sparkle', title: 'Créer des éléments avec Claude ou ChatGPT', onClick: () => openAssistant(ed) })),
  h('div', { class: 'top-group' }, button('Présenter', { icon: 'play', title: `Présenter (${kbd('Mod+Enter')})`, onClick: () => present(true) }), button('Exporter', { icon: 'export', class: 'primary', onClick: () => exportDialog() }), moreBtn),
);

function fileMenu(anchor: HTMLElement) {
  menu(anchor, [
    { label: 'Nouveau…', icon: 'plus', kbd: kbd('Mod+N'), run: () => action('new') },
    { label: 'Ouvrir…', icon: 'folder', kbd: kbd('Mod+O'), run: () => action('open') },
    { label: 'Enregistrer', icon: 'save', kbd: kbd('Mod+S'), run: () => action('save') },
    { label: 'Enregistrer sous…', icon: 'save', kbd: kbd('Mod+Shift+S'), run: () => action('saveAs') },
    'sep',
    { label: 'Importer un modèle 3D ou CAO…', icon: 'import', kbd: kbd('Mod+I'), run: () => action('importModel') },
    { label: 'Créer un cocktail…', icon: 'cocktail', run: () => openDrinkBuilder(ed) },
    'sep',
    { label: 'Vider la composition', icon: 'trash', danger: true, disabled: !ed.state.items.length, run: () => ed.clear() },
  ]);
}

// ------------------------------------------------------------------ side panels
const library = new LibraryPanel(ed, stage, () => openDrinkBuilder(ed));
const outline = new OutlinePanel(ed);
let leftTab: 'library' | 'scene' = 'library';
const tabs = h('div', { class: 'tabs', role: 'tablist' });
const leftBody = h('div', { style: 'display:flex;flex-direction:column;min-height:0;flex:1' });
function renderLeft() {
  tabs.replaceChildren(
    h('button', { type: 'button', role: 'tab', class: 'tab' + (leftTab === 'library' ? ' on' : ''), onClick: () => { leftTab = 'library'; renderLeft(); } }, 'Bibliothèque'),
    h('button', { type: 'button', role: 'tab', class: 'tab' + (leftTab === 'scene' ? ' on' : ''), onClick: () => { leftTab = 'scene'; renderLeft(); outline.render(); } }, `Scène${ed.state.items.length ? ' · ' + ed.state.items.length : ''}`));
  leftBody.replaceChildren(leftTab === 'library' ? library.el : outline.el);
}
left.append(tabs, leftBody);
renderLeft();
right.append(new Inspector(ed).el);

// ------------------------------------------------------------------ stage overlays
const busy = h('span', { class: 'pill', style: 'display:none' }, h('span', { class: 'dot' }), 'Drapé du tissu…');
const agentPill = h('span', { class: 'pill agent', style: 'display:none' }, icon('sparkle', 14), 'Assistant au travail');
let agentTimer = 0;
window.native?.onAgentActivity(() => { agentPill.style.display = ''; clearTimeout(agentTimer); agentTimer = window.setTimeout(() => (agentPill.style.display = 'none'), 3000); });
stage.append(h('div', { class: 'status' }, busy, agentPill), h('div', { class: 'drop-hint' }));
let activeView: ViewName | null = 'perspective';
const viewBtns: Record<string, HTMLButtonElement> = {};
const viewsBar = h('div', { class: 'float views-bar' });
for (const [name, label, ic, key] of [['perspective', '3/4', 'cube3', '1'], ['front', 'Face', 'front', '2'], ['top', 'Dessus', 'top', '3']] as const) {
  viewBtns[name] = button(label, { icon: ic, title: `${label} (${key})`, onClick: () => setView(name) });
  viewsBar.append(viewBtns[name]);
}
// Grid snapping: on by default, Alt drags freely.
const snapBtn = button('Grille', { icon: 'magnet', title: 'Magnétisme de la grille (Alt pendant le déplacement pour l’ignorer)' });
const snapLabel = () => { snapBtn.classList.toggle('on', view.snap.enabled); snapBtn.querySelector('span')!.textContent = view.snap.enabled ? `Grille ${Math.round(view.snap.step * 100)} cm` : 'Grille'; };
try { const saved = JSON.parse(localStorage.getItem('snap') ?? 'null'); if (saved) view.snap = saved; } catch { /* default */ }
snapBtn.addEventListener('click', () => menu(snapBtn, [
  ...[0.01, 0.05, 0.1].map(step => ({ label: `Grille ${step * 100} cm`, icon: view.snap.enabled && view.snap.step === step ? 'check' : undefined, run: () => { view.snap = { enabled: true, step }; persistSnap(); } })),
  'sep' as const, { label: 'Déplacement libre', icon: view.snap.enabled ? undefined : 'check', run: () => { view.snap = { ...view.snap, enabled: false }; persistSnap(); } },
]));
const persistSnap = () => { try { localStorage.setItem('snap', JSON.stringify(view.snap)); } catch { /* ignore */ } snapLabel(); view.invalidate(); };
snapLabel();
viewsBar.append(h('div', { class: 'sep' }), snapBtn, h('div', { class: 'sep' }), button('Cadrer', { icon: 'frame', title: 'Cadrer la sélection ou tout (F)', onClick: () => ed.frameView((activeView ?? 'perspective')) }));
stage.append(viewsBar);
function setView(name: ViewName) { activeView = name; ed.frameView(name); markViews(); }
function markViews() { for (const [k, b] of Object.entries(viewBtns)) b.classList.toggle('on', k === activeView); }
view.controls.addEventListener('start', () => { activeView = null; markViews(); });
markViews();

// Saved camera views with thumbnails: the client proposal is made of these.
const shots = h('div', { class: 'float shots' });
const shotList = h('div', { class: 'list' });
shots.append(shotList, h('button', { type: 'button', class: 'btn add', title: 'Mémoriser ce point de vue', onClick: () => { const v = ed.addView(); toast(`« ${v.name} » mémorisée`); } }, icon('camera', 18), 'Vue'));
stage.append(shots);
const thumbs = new Map<string, string>();
let thumbTimer = 0, thumbItems: unknown = null, thumbScene: unknown = null;
function renderShots() {
  const views = ed.state.views;
  shotList.replaceChildren(...views.map(v => {
    const img = thumbs.get(thumbKey(v));
    const b = h('button', { type: 'button', class: 'shot', title: `${v.name} — clic droit pour gérer`, onClick: () => { activeView = null; markViews(); ed.showView(v); } },
      img ? h('img', { src: img, alt: '' }) : h('div', { class: 'noimg' }), h('span', null, v.name));
    b.addEventListener('contextmenu', e => { e.preventDefault(); shotMenu(v, b); });
    return b;
  }));
  shots.style.paddingLeft = views.length ? '' : '3px';
  // Refresh thumbnails after the scene stops changing.
  const look = ed.state.items as unknown as object, scene = ed.state.scene;
  if (thumbItems !== look || thumbScene !== scene || views.some(v => !thumbs.has(thumbKey(v)))) {
    clearTimeout(thumbTimer);
    thumbTimer = window.setTimeout(() => {
      if (view.busy) { renderShots(); return; }
      thumbItems = ed.state.items; thumbScene = ed.state.scene;
      thumbs.clear();
      for (const v of ed.state.views) thumbs.set(thumbKey(v), view.capture(288, 176, v));
      renderShots();
    }, 900);
  }
}
const thumbKey = (v: CameraView) => v.id + v.position.join() + v.target.join() + v.fov;
function shotMenu(v: CameraView, anchor: HTMLElement) {
  menu(anchor, [
    { label: 'Afficher', icon: 'eye', run: () => ed.showView(v) },
    { label: 'Remplacer par la vue actuelle', icon: 'camera', run: () => ed.updateView(v.id) },
    { label: 'Renommer…', icon: 'pencil', run: () => renameView(v) },
    'sep',
    { label: 'Supprimer', icon: 'trash', danger: true, run: () => ed.removeView(v.id) },
  ]);
}
function renameView(v: CameraView) {
  const input = h('input', { class: 'select', value: v.name, style: 'width:100%' });
  const close = modal('Renommer la vue', input, [button('Annuler', { onClick: () => close() }), button('Renommer', { class: 'primary', onClick: () => { ed.renameView(v.id, input.value); close(); } })]);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { ed.renameView(v.id, input.value); close(); } });
  setTimeout(() => { input.focus(); input.select(); });
}

function contextMenu(id: string | null, x: number, y: number) {
  if (id && !ed.selection.includes(id)) ed.select([id]);
  const has = ed.selection.length > 0;
  menu({ x, y }, has ? [
    { label: 'Dupliquer', icon: 'duplicate', kbd: kbd('Mod+D'), run: () => ed.duplicate() },
    { label: 'Pivoter de 90°', icon: 'rotate', kbd: 'R', run: () => ed.rotate(ed.selection, -Math.PI / 2) },
    { label: ed.selected.some(i => i.groupId) ? 'Dégrouper' : 'Grouper', icon: 'group', disabled: ed.selection.length < 2 && !ed.selected.some(i => i.groupId), run: () => (ed.selected.some(i => i.groupId) ? ed.ungroup() : ed.group()) },
    { label: ed.selected.every(i => i.locked) ? 'Déverrouiller' : 'Verrouiller', icon: 'lock', run: () => ed.toggleLock() },
    { label: 'Cadrer', icon: 'frame', kbd: 'F', run: () => ed.frameView(activeView ?? 'perspective') },
    'sep',
    { label: 'Supprimer', icon: 'trash', danger: true, kbd: isMac ? '⌫' : 'Suppr', run: () => ed.remove() },
  ] : [
    { label: 'Mémoriser ce point de vue', icon: 'camera', run: () => ed.addView() },
    { label: 'Tout cadrer', icon: 'frame', kbd: 'F', run: () => view.frame(activeView ?? 'perspective') },
  ]);
}

// ------------------------------------------------------------------ document reflection
ed.on(() => {
  const s = ed.state;
  if (document.activeElement !== title) title.value = s.name;
  saveState.textContent = ed.doc.dirty ? (ed.doc.filePath ? 'Modifié' : 'Non enregistré') : 'Enregistré';
  saveState.classList.toggle('dirty', ed.doc.dirty);
  undoBtn.disabled = !ed.doc.canUndo;
  redoBtn.disabled = !ed.doc.canRedo;
  renderLeft();
  renderShots();
  document.title = s.name + ' — WallerSketch';
});

// ------------------------------------------------------------------ actions
let lastAction = { name: '', at: 0 };
async function action(name: string) {
  // The same shortcut can arrive from the native menu and the page; run it once.
  const now = performance.now();
  if (lastAction.name === name && now - lastAction.at < 120) return;
  lastAction = { name, at: now };
  const typing = isTyping();
  switch (name) {
    case 'undo': return typing ? document.execCommand('undo') : ed.undo();
    case 'redo': return typing ? document.execCommand('redo') : ed.redo();
    case 'selectAll': return typing ? (document.activeElement as HTMLInputElement).select?.() : ed.select(ed.state.items.map(i => i.id), 'single');
    case 'new': return newDialog();
    case 'open': if (await confirmDiscard()) await ed.open(); return;
    case 'save': return ed.save(false);
    case 'saveAs': return ed.save(true);
    case 'importModel': return ed.importModel();
    case 'export': return exportDialog();
    case 'duplicate': return typing ? undefined : ed.duplicate();
    case 'group': return ed.group();
    case 'ungroup': return ed.ungroup();
    case 'present': return present(!app.classList.contains('presenting'));
    case 'frame': return ed.frameView(activeView ?? 'perspective');
    default: if (name.startsWith('view:')) setView(name.slice(5) as ViewName);
  }
}
window.native?.onMenu(action);

function confirmDiscard(): Promise<boolean> {
  if (!ed.doc.dirty || !ed.state.items.length) return Promise.resolve(true);
  return new Promise(resolve => {
    const close = modal('Modifications non enregistrées', h('p', { style: 'margin:0;color:var(--muted)' }, `« ${ed.state.name} » contient des modifications non enregistrées.`), [
      button('Annuler', { onClick: () => { close(); resolve(false); } }),
      button('Ne pas enregistrer', { class: 'outline', onClick: () => { close(); resolve(true); } }),
      button('Enregistrer', { class: 'primary', onClick: async () => { close(); resolve(await ed.save(false)); } }),
    ]);
  });
}

async function newDialog() {
  if (!(await confirmDiscard())) return;
  const grid = h('div', { class: 'templates' });
  const close = modal('Nouvelle composition', grid, [], { wide: true });
  const art: Record<string, string> = { empty: 'plus', dressed: 'fabric', bar: 'cocktail', stepped: 'riser', round: 'table', champagne: 'sparkle' };
  for (const t of TEMPLATES) grid.append(h('button', { type: 'button', class: 'tpl', onClick: () => { close(); ed.newProject(t.build()); settleTemplate(); } }, h('div', { class: 'art' }, icon(art[t.id], 30)), h('strong', null, t.name), h('span', null, t.note)));
}

/**
 * Templates are authored with approximate heights: seat everything once fabrics have settled,
 * then add the usual proposal viewpoints so presenting and exporting work straight away.
 */
function settleTemplate() {
  const gen = ed.doc.generation;
  ed.surfacesChanged([]);
  const finish = () => {
    if (gen !== ed.doc.generation || !ed.state.items.length) return;
    if (view.busy) { setTimeout(finish, 200); return; }
    ed.surfacesChanged([]);
    const views: CameraView[] = [];
    for (const [name, dir] of [['Ensemble', 'perspective'], ['Face', 'front'], ['Dessus', 'top']] as const) {
      view.frame(dir, undefined, true);
      views.push({ id: crypto.randomUUID(), name, ...view.currentView() });
    }
    view.frame('perspective', undefined, true);
    ed.doc.amend(s => ({ ...s, views }));
  };
  setTimeout(finish, 300);
}

// ------------------------------------------------------------------ export
function exportDialog() {
  const views = [{ id: 'current', name: 'Vue actuelle', ...view.currentView() }, ...ed.state.views];
  const chosen = new Set<string>(ed.state.views.length ? ed.state.views.map(v => v.id) : ['current']);
  const formats = [{ id: '16:9', label: 'Paysage 16:9', r: 16 / 9 }, { id: '4:3', label: 'Paysage 4:3', r: 4 / 3 }, { id: '1:1', label: 'Carré', r: 1 }, { id: '4:5', label: 'Portrait 4:5', r: 4 / 5 }, { id: '9:16', label: 'Story 9:16', r: 9 / 16 }];
  let format = '16:9', quality = 1920;
  try { format = localStorage.getItem('export-format') || format; quality = +(localStorage.getItem('export-quality') || quality); } catch { /* defaults */ }
  const grid = h('div', { class: 'export-views' });
  for (const v of views) {
    const img = h('img', { alt: '', src: view.capture(300, 188, v) });
    const card = h('button', { type: 'button', class: 'xv' + (chosen.has(v.id) ? ' on' : ''), onClick: () => { chosen.has(v.id) ? chosen.delete(v.id) : chosen.add(v.id); card.classList.toggle('on'); count(); } }, img, h('span', null, v.name), h('span', { class: 'tick' }, icon('check', 14)));
    grid.append(card);
  }
  const fmtSel = h('select', { class: 'select' }, ...formats.map(f => h('option', { value: f.id, selected: f.id === format }, f.label)));
  const qSel = h('select', { class: 'select' }, h('option', { value: '1920', selected: quality === 1920 }, 'HD · 1920 px'), h('option', { value: '2880', selected: quality === 2880 }, 'Haute · 2880 px'), h('option', { value: '3840', selected: quality === 3840 }, '4K · 3840 px'));
  const planBox = h('input', { type: 'checkbox', class: 'switch' });
  const threeD = h('div', { style: 'display:flex;gap:6px' });
  async function export3D(format: 'glb' | 'obj' | 'usdz') {
    try {
      const { exportScene } = await import('./render/interchange');
      const data = await exportScene(view.exportObject(ed.selection.length ? ed.selection : undefined), format);
      close();
      await ed.exportFiles([{ name: ed.state.name, data }]);
    } catch (e) { toast(msg(e), 'error'); }
  }
  const summary = h('span', { class: 'left' });
  const go = button('Exporter', { class: 'primary', onClick: () => run() });
  const count = () => { const n = chosen.size + (planBox.checked ? 1 : 0); summary.textContent = n ? `${n} fichier${n > 1 ? 's' : ''}` : 'Rien à exporter'; go.disabled = !n; };
  planBox.addEventListener('change', count);
  const body = h('div', null,
    h('div', { class: 'label-row' }, h('span', null, 'Points de vue'), ed.state.views.length ? null : h('span', null, 'Mémorisez des vues avec le bouton « Vue »')),
    grid,
    h('div', { class: 'export-opts' }, h('div', { class: 'opt' }, h('h4', null, 'Format'), fmtSel), h('div', { class: 'opt' }, h('h4', null, 'Définition'), qSel)),
    h('label', { class: 'plan-opt' }, icon('plan', 22), h('div', { class: 'txt' }, h('strong', null, 'Plan coté'), h('span', null, 'Vue de dessus en centimètres avec la position des socles et la liste du matériel (SVG).')), planBox),
    h('div', { class: 'plan-opt' }, icon('cube', 22), h('div', { class: 'txt' }, h('strong', null, 'Scène 3D'), h('span', null, ed.selection.length ? 'La sélection, avec ses matières et tissus drapés.' : 'Toute la composition, avec ses matières et tissus drapés.')), threeD));
  function threeDButtons() { return (['glb', 'obj', 'usdz'] as const).map(f => button({ glb: 'GLB', obj: 'OBJ', usdz: 'USDZ (AR iPhone)' }[f], { class: 'small outline', title: { glb: 'Blender, logiciels de CAO, visionneuses 3D', obj: 'Format simple, sans matières', usdz: 'S’ouvre en réalité augmentée sur iPhone et iPad' }[f], onClick: () => export3D(f) })); }
  const close = modal('Exporter', body, [summary, button('Annuler', { onClick: () => close() }), go], { wide: true });
  threeD.append(...threeDButtons());
  count();
  async function run() {
    format = fmtSel.value; quality = +qSel.value;
    try { localStorage.setItem('export-format', format); localStorage.setItem('export-quality', String(quality)); } catch { /* ignore */ }
    const r = formats.find(f => f.id === format)!.r;
    const w = r >= 1 ? quality : Math.round(quality * r), hgt = r >= 1 ? Math.round(quality / r) : quality;
    const files: { name: string; data: string }[] = [];
    go.disabled = true;
    try {
      for (const v of views) if (chosen.has(v.id)) files.push({ name: `${ed.state.name} - ${v.name}`, data: view.capture(w, hgt, v) });
      if (planBox.checked) files.push({ name: `${ed.state.name} - Plan coté`, data: planSVG(ed.state) });
    } catch (e) { toast(msg(e), 'error'); go.disabled = false; return; }
    close();
    await ed.exportFiles(files, files.length > 1 ? ed.state.name : undefined);
  }
}

// ------------------------------------------------------------------ presentation
const presentBar = h('div', { class: 'present-bar' });
document.body.append(presentBar);
let presentIndex = -1, idleTimer = 0;
function present(on: boolean) {
  app.classList.toggle('presenting', on);
  document.body.classList.toggle('presenting', on);
  view.helpersVisible = !on;
  viewsBar.style.display = shots.style.display = on ? 'none' : '';
  if (on) { ed.setSelection([]); presentIndex = -1; renderPresentBar(); if (ed.state.views.length) goto(0); else view.frame('perspective'); }
  view.invalidate();
}
function goto(k: number) {
  const v = ed.state.views;
  if (!v.length) return;
  presentIndex = (k + v.length) % v.length;
  view.applyView(v[presentIndex]);
  renderPresentBar();
}
function renderPresentBar() {
  const v = ed.state.views;
  presentBar.replaceChildren(...[
    v.length > 1 ? button(null, { icon: 'left', title: 'Vue précédente (←)', onClick: () => goto(presentIndex - 1) }) : null,
    ...v.map((x, k) => button(x.name, { class: k === presentIndex ? 'on' : '', onClick: () => goto(k) })),
    v.length > 1 ? button(null, { icon: 'right', title: 'Vue suivante (→)', onClick: () => goto(presentIndex + 1) }) : null,
    button('Quitter', { icon: 'close', title: 'Quitter la présentation (Échap)', onClick: () => present(false) }),
  ].filter((b): b is HTMLButtonElement => !!b));
}
addEventListener('pointermove', () => {
  if (!app.classList.contains('presenting')) return;
  presentBar.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => presentBar.classList.add('idle'), 2500);
});

// ------------------------------------------------------------------ keyboard
addEventListener('keydown', e => {
  if (document.querySelector('.modal-back')) return;
  const presenting = app.classList.contains('presenting');
  if (mod(e)) {
    // Fallback for shortcuts when the native menu does not intercept them.
    const k = e.key.toLowerCase();
    const map: Record<string, string> = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: e.shiftKey ? 'saveAs' : 'save', o: 'open', n: 'new', d: 'duplicate', g: e.shiftKey ? 'ungroup' : 'group', e: 'export', i: 'importModel', enter: 'present', a: 'selectAll' };
    if (map[k] && !(isTyping() && ['z', 'y', 'a'].includes(k))) { e.preventDefault(); action(map[k]); }
    return;
  }
  if (isTyping()) return;
  if (presenting) {
    if (e.key === 'Escape') present(false);
    if (e.key === 'ArrowRight' || e.key === ' ') goto(presentIndex + 1);
    if (e.key === 'ArrowLeft') goto(presentIndex - 1);
    return;
  }
  const sel = ed.selection;
  switch (e.key) {
    case 'Delete': case 'Backspace': if (sel.length) { e.preventDefault(); ed.remove(); } break;
    case 'Escape': if (ed.grid.active) { ed.cancelGrid(); ed.emit(); } else ed.setSelection([]); break;
    case '1': setView('perspective'); break;
    case '2': setView('front'); break;
    case '3': setView('top'); break;
    case 'f': case 'F': ed.frameView(activeView ?? 'perspective'); break;
    case 'r': case 'R': if (sel.length) ed.rotate(sel, (e.shiftKey ? 1 : -1) * Math.PI / 12); break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
      if (!sel.length) return;
      e.preventDefault();
      // Nudge relative to the camera, so "right" is right on screen.
      const step = e.shiftKey ? 0.1 : 0.01;
      const az = Math.atan2(view.camera.position.x - view.controls.target.x, view.camera.position.z - view.controls.target.z);
      const sx = Math.round(Math.cos(az)), sz = Math.round(-Math.sin(az));
      const fx = -sz, fz = sx;
      const d: Vec3 = e.key === 'ArrowRight' ? [sx * step, 0, sz * step] : e.key === 'ArrowLeft' ? [-sx * step, 0, -sz * step] : e.key === 'ArrowUp' ? [-fx * step, 0, -fz * step] : [fx * step, 0, fz * step];
      ed.move(sel, d, true, 'nudge');
      break;
    }
  }
});
addEventListener('keyup', e => { if (e.key.startsWith('Arrow')) ed.doc.seal(); });

// ------------------------------------------------------------------ start
(async function start() {
  await ed.loadLibrary();
  library.render();
  const recovered = await window.native?.recover().catch(() => null);
  if (recovered) {
    try {
      const p = parseProject(recovered.data);
      const close = modal('Reprendre votre travail ?', h('p', { style: 'margin:0;color:var(--muted)' }, `« ${p.state.name} » n’avait pas été enregistrée lors de la dernière fermeture.`), [
        button('Ignorer', { onClick: () => { close(); window.native.discardRecovery(); boot(); } }),
        button('Reprendre', { class: 'primary', onClick: () => { close(); ed.load(p.state, p.assets, recovered.path, false); (window.studio as { ready: boolean }).ready = true; } }),
      ]);
      return;
    } catch { /* unreadable recovery: start normally */ }
  }
  boot();
})();

function boot() {
  let seen = false;
  try { seen = !!localStorage.getItem('launched'); localStorage.setItem('launched', '1'); } catch { /* first run */ }
  if (!seen) { ed.newProject(TEMPLATES.find(t => t.id === 'bar')!.build()); settleTemplate(); }
  else { ed.newProject(); newDialog(); }
  view.prepare();
  (window.studio as { ready: boolean }).ready = true;
}
