// Minimal DOM helpers and form controls. Controls keep their element while the operator edits,
// and refresh from the document only when they are not focused.
import { icon } from './icons';

type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function button(label: string | null, opts: { icon?: string; title?: string; onClick?: (e: MouseEvent) => void; class?: string; disabled?: boolean; kbd?: string } = {}) {
  // Icon-only buttons are named by their title; labelled buttons by their text.
  const b = h('button', { class: 'btn ' + (opts.class ?? '') + (label ? '' : ' icon-only'), title: opts.title, 'aria-label': label ? undefined : opts.title, type: 'button', disabled: opts.disabled, onClick: opts.onClick });
  if (opts.icon) b.append(icon(opts.icon));
  if (label) b.append(h('span', null, label));
  if (opts.kbd) b.append(h('kbd', null, opts.kbd));
  return b;
}

export const fmtCm = (m: number) => {
  const cm = m * 100;
  return Math.abs(cm - Math.round(cm)) < 0.05 ? String(Math.round(cm)) : cm.toFixed(1).replace('.', ',');
};

export function dims(size: [number, number, number], round?: boolean) {
  return round ? `Ø ${fmtCm(size[0])} · h ${fmtCm(size[1])} cm` : `${fmtCm(size[0])} × ${fmtCm(size[2])} · h ${fmtCm(size[1])} cm`;
}

/**
 * Numeric field in centimetres (stored in metres). Drag the label to scrub; arrow keys step
 * by 1 (Shift: 10). `onInput` fires live with a merge key so a scrub is one undo step.
 */
export function numberField(label: string, opts: { get: () => number | null; set: (v: number, live: boolean) => void; unit?: string; min?: number; max?: number; step?: number; scale?: number; hint?: string }) {
  const scale = opts.scale ?? 100, step = opts.step ?? 1;
  const input = h('input', { class: 'num', type: 'text', inputmode: 'decimal', spellcheck: false });
  const lab = h('label', { class: 'num-label', title: 'Glisser pour ajuster' }, label);
  const field = h('div', { class: 'field num-field' }, lab, h('div', { class: 'num-box' }, input, opts.unit !== '' ? h('span', { class: 'unit' }, opts.unit ?? 'cm') : null));
  if (opts.hint) field.append(h('div', { class: 'hint' }, opts.hint));
  const clamp = (v: number) => Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, v));
  const show = () => { const v = opts.get(); input.value = v === null ? '' : fmt(v * scale); input.placeholder = v === null ? 'Mixte' : ''; };
  const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)).replace('.', ',');
  const commit = (live = false) => {
    const v = parseFloat(input.value.replace(',', '.'));
    if (!Number.isFinite(v)) return show();
    opts.set(clamp(v) / scale, live);
    if (!live) show();
  };
  input.addEventListener('change', () => commit());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { commit(); input.blur(); }
    if (e.key === 'Escape') { show(); input.blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const v = parseFloat(input.value.replace(',', '.')) || 0, d = (e.shiftKey ? 10 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1);
      input.value = fmt(clamp(v + d)); commit(true);
    }
  });
  input.addEventListener('blur', () => show());
  // Scrub on the label.
  lab.addEventListener('pointerdown', e => {
    const v0 = opts.get();
    if (v0 === null) return;
    const x0 = e.clientX;
    lab.setPointerCapture(e.pointerId);
    document.body.classList.add('scrubbing');
    const mv = (ev: PointerEvent) => { const d = Math.round((ev.clientX - x0) / 3) * step * (ev.shiftKey ? 10 : 1); input.value = fmt(clamp(v0 * scale + d)); commit(true); };
    const up = () => { lab.removeEventListener('pointermove', mv); document.body.classList.remove('scrubbing'); commit(); };
    lab.addEventListener('pointermove', mv);
    lab.addEventListener('pointerup', up, { once: true });
  });
  show();
  return { el: field, refresh: () => { if (document.activeElement !== input) show(); } };
}

export function segmented<T extends string>(options: { value: T; label: string; icon?: string }[], get: () => T | null, set: (v: T) => void) {
  const el = h('div', { class: 'segmented', role: 'radiogroup' });
  const btns = options.map(o => {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', onClick: () => { set(o.value); refresh(); } }, o.icon ? icon(o.icon, 16) : null, o.label);
    el.append(b);
    return b;
  });
  const refresh = () => { const v = get(); btns.forEach((b, i) => { b.classList.toggle('on', options[i].value === v); b.setAttribute('aria-checked', String(options[i].value === v)); }); };
  refresh();
  return { el, refresh };
}

/** Palette of named colours plus a custom picker. */
export function swatches(colors: { name: string; color: string }[], get: () => string | null, set: (c: string, live: boolean) => void) {
  const el = h('div', { class: 'swatches' });
  const items = colors.map(c => {
    const b = h('button', { type: 'button', class: 'swatch', title: c.name, 'aria-label': c.name, style: `--c:${c.color}`, onClick: () => { set(c.color, false); refresh(); } });
    el.append(b);
    return b;
  });
  const custom = h('input', { type: 'color', class: 'swatch custom', title: 'Autre couleur' });
  custom.addEventListener('input', () => set(custom.value, true));
  custom.addEventListener('change', () => { set(custom.value, false); refresh(); });
  el.append(h('label', { class: 'swatch custom-wrap', title: 'Autre couleur' }, custom));
  const refresh = () => {
    const v = get()?.toLowerCase() ?? '';
    let found = false;
    items.forEach((b, i) => { const on = colors[i].color.toLowerCase() === v; found ||= on; b.classList.toggle('on', on); });
    custom.parentElement!.classList.toggle('on', !found && !!v);
    if (v && document.activeElement !== custom) custom.value = v;
    custom.parentElement!.setAttribute('style', !found && v ? `--c:${v}` : '');
  };
  refresh();
  return { el, refresh };
}

export function section(title: string, ...children: (Child | Child[])[]) {
  return h('section', { class: 'panel-section' }, h('h3', null, title), ...children);
}

export function toggle(label: string, get: () => boolean, set: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox', class: 'switch' });
  input.addEventListener('change', () => set(input.checked));
  const el = h('label', { class: 'toggle' }, h('span', null, label), input);
  const refresh = () => { input.checked = get(); };
  refresh();
  return { el, refresh };
}

export function menu(anchor: HTMLElement | { x: number; y: number }, items: ({ label: string; icon?: string; kbd?: string; danger?: boolean; disabled?: boolean; run: () => void } | 'sep')[]) {
  document.querySelector('.menu-pop')?.remove();
  const pop = h('div', { class: 'menu-pop', role: 'menu' });
  for (const it of items) {
    if (it === 'sep') { pop.append(h('div', { class: 'menu-sep' })); continue; }
    pop.append(h('button', { type: 'button', role: 'menuitem', class: 'menu-item' + (it.danger ? ' danger' : ''), disabled: it.disabled, onClick: () => { pop.remove(); it.run(); } }, it.icon ? icon(it.icon, 16) : h('span', { class: 'icon-space' }), h('span', null, it.label), it.kbd ? h('kbd', null, it.kbd) : null));
  }
  document.body.append(pop);
  const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, right: anchor.x, top: anchor.y };
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = anchor instanceof HTMLElement ? r.right - pw : r.left, y = r.bottom + 6;
  if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
  x = Math.max(8, Math.min(x, innerWidth - pw - 8));
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  const close = (e: Event) => { if (!pop.contains(e.target as Node)) { pop.remove(); removeEventListener('pointerdown', close, true); removeEventListener('keydown', esc, true); } };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { pop.remove(); removeEventListener('pointerdown', close, true); } };
  setTimeout(() => { addEventListener('pointerdown', close, true); addEventListener('keydown', esc, true); });
  (pop.querySelector('button:not([disabled])') as HTMLElement | null)?.focus({ preventScroll: true });
}

export function modal(title: string, body: Node, actions: HTMLElement[], opts: { wide?: boolean } = {}) {
  const close = () => { back.remove(); removeEventListener('keydown', esc, true); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const back = h('div', { class: 'modal-back', onPointerdown: (e: Event) => { if (e.target === back) close(); } },
    h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', null, h('h2', null, title), button(null, { icon: 'close', title: 'Fermer', onClick: close, class: 'ghost' })),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('footer', null, ...actions) : null));
  document.body.append(back);
  addEventListener('keydown', esc, true);
  return close;
}

let toastTimer = 0;
export function toast(text: string, kind: 'error' | 'ok' | 'info' = 'info') {
  let el = document.querySelector('.toast') as HTMLElement | null;
  if (!el) { el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = text;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), kind === 'error' ? 6000 : 2600);
}

export const isTyping = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); };
