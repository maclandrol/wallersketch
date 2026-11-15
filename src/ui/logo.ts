// The operator's logo in a corner: stamped onto exported images and shown over the presentation.
import type { Editor } from '../editor';
import type { Logo } from '../core/types';
import { h } from './dom';

const assetUrl = (ed: Editor, logo: Logo) => { const a = ed.doc.assets.get(logo.asset); return a ? `data:${a.mime};base64,${a.data}` : null; };

/** Margin from the image edges, as a fraction of the image width. */
const MARGIN = 0.025;

/** The exported image with the logo drawn in its corner (unchanged without a logo). */
export async function stampLogo(ed: Editor, dataUrl: string): Promise<string> {
  const logo = ed.state.scene.logo, url = logo && assetUrl(ed, logo);
  if (!logo || !url) return dataUrl;
  const [shot, mark] = await Promise.all([dataUrl, url].map(async src => { const i = new Image(); i.src = src; await i.decode(); return i; }));
  const c = document.createElement('canvas');
  c.width = shot.naturalWidth; c.height = shot.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(shot, 0, 0);
  const w = c.width * logo.size, hgt = w / logo.aspect, m = c.width * MARGIN;
  const x = logo.corner.endsWith('l') ? m : c.width - w - m, y = logo.corner.startsWith('t') ? m : c.height - hgt - m;
  g.drawImage(mark, x, y, w, hgt);
  return c.toDataURL('image/png');
}

/** An image element kept in the stage's corner during the presentation. */
export function logoOverlay(ed: Editor): HTMLImageElement {
  const img = h('img', { class: 'logo-overlay', alt: '' });
  let shown = '';
  const refresh = () => {
    const logo = ed.state.scene.logo, url = logo && assetUrl(ed, logo);
    img.style.display = url ? '' : 'none';
    if (!logo || !url) return;
    if (shown !== logo.asset) { img.src = url; shown = logo.asset; }
    const m = MARGIN * 100 + '%';
    Object.assign(img.style, { width: logo.size * 100 + '%', top: logo.corner.startsWith('t') ? m : 'auto', bottom: logo.corner.startsWith('b') ? m : 'auto', left: logo.corner.endsWith('l') ? m : 'auto', right: logo.corner.endsWith('r') ? m : 'auto' });
  };
  ed.on(refresh);
  refresh();
  return img;
}
