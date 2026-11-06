// Dimensioned overhead plan (SVG). Every number is computed from the stored scene geometry,
// in centimetres. The plan is seen from above with the front of the installation at the bottom.
import type { DocState, Item } from './core/types';
import { footprintCorners, holdsLiquid, inventory } from './core/scene';
import { TAPER_SCALE } from './core/catalog';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cm = (m: number) => Math.round(m * 100);

/** Position of `i` in the frame of `table`, from the table's back-left corner, in metres. */
export function inTableFrame(i: Item, table: Item): [number, number] {
  const c = Math.cos(table.rotation), s = Math.sin(table.rotation);
  const dx = i.position[0] - table.position[0], dz = i.position[2] - table.position[2];
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return [lx + table.size[0] / 2, lz + table.size[2] / 2];
}

export function planSVG(state: DocState, date = new Date()): string {
  const items = state.items.filter(i => !i.ref.startsWith('backdrop'));
  const solids = items.filter(i => i.type === 'table' || i.type === 'riser' || i.type === 'fabric' || i.type === 'decor' || i.type === 'model');
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const i of items) for (const [x, z] of footprintCorners(i)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  if (!Number.isFinite(x0)) { x0 = -1; x1 = 1; z0 = -0.5; z1 = 0.5; }
  const W = 1600, margin = 90, legendW = 520;
  const scale = Math.min((W - legendW - margin * 2) / Math.max(0.5, x1 - x0), 900 / Math.max(0.5, z1 - z0));
  const H = Math.max(720, (z1 - z0) * scale + margin * 2 + 60);
  const X = (x: number) => margin + (x - x0) * scale, Y = (z: number) => margin + 40 + (z - z0) * scale;
  const out: string[] = [];
  const poly = (pts: [number, number][], cls: string) => `<polygon class="${cls}" points="${pts.map(([x, z]) => X(x).toFixed(1) + ',' + Y(z).toFixed(1)).join(' ')}"/>`;
  const shape = (i: Item, cls: string, inset = 1) => {
    if (i.shape === 'round' || i.shape === 'highboy' || holdsLiquid(i)) return `<ellipse class="${cls}" cx="${X(i.position[0]).toFixed(1)}" cy="${Y(i.position[2]).toFixed(1)}" rx="${(i.size[0] / 2 * scale * inset).toFixed(1)}" ry="${(i.size[2] / 2 * scale * inset).toFixed(1)}"/>`;
    return poly(footprintCorners(i), cls);
  };

  // Fabrics first (underneath), then tables, risers, decor and glasses.
  for (const f of solids.filter(i => i.type === 'fabric')) out.push(shape(f, 'fabric'));
  const tables = solids.filter(i => i.type === 'table');
  for (const t of tables) {
    out.push(shape(t, 'table'));
    out.push(...tableRuler(t, X, Y, scale));
  }
  const numbered: { n: number; item: Item; table?: Item }[] = [];
  for (const r of solids.filter(i => i.type === 'riser' || i.type === 'model')) {
    out.push(shape(r, 'riser'));
    if (r.shape === 'taper') {
      const top = { ...r, size: [r.size[0] * TAPER_SCALE, r.size[1], r.size[2] * TAPER_SCALE] as Item['size'] };
      out.push(shape(top, 'riser-top'));
    }
    const n = numbered.length + 1;
    numbered.push({ n, item: r, table: tables.find(t => t.id === r.parentId) });
    out.push(`<circle class="tag" cx="${X(r.position[0])}" cy="${Y(r.position[2])}" r="11"/><text class="tag-t" x="${X(r.position[0])}" y="${Y(r.position[2]) + 4}">${n}</text>`);
  }
  for (const d of solids.filter(i => i.type === 'decor')) out.push(shape(d, 'decor'));
  for (const g of items.filter(holdsLiquid)) {
    const fill = g.drink?.layers.at(-1)?.color ?? '#ffffff';
    out.push(`<ellipse class="glass" style="fill:${fill}" cx="${X(g.position[0]).toFixed(1)}" cy="${Y(g.position[2]).toFixed(1)}" rx="${(g.size[0] / 2 * scale).toFixed(1)}" ry="${(g.size[2] / 2 * scale).toFixed(1)}"/>`);
  }

  // Overall extent dimension lines.
  out.push(dimLine(X(x0), Y(z1) + 34, X(x1), Y(z1) + 34, `${cm(x1 - x0)} cm`));
  out.push(dimLine(X(x0) - 34, Y(z0), X(x0) - 34, Y(z1), `${cm(z1 - z0)} cm`, true));

  // Scale bar: 50 cm.
  const sb = 0.5 * scale, sy = H - 40;
  out.push(`<g class="scale"><line x1="${margin}" y1="${sy}" x2="${margin + sb}" y2="${sy}"/><line x1="${margin}" y1="${sy - 5}" x2="${margin}" y2="${sy + 5}"/><line x1="${margin + sb}" y1="${sy - 5}" x2="${margin + sb}" y2="${sy + 5}"/><text x="${margin + sb + 10}" y="${sy + 4}">50 cm</text></g>`);

  // Legend: numbered risers with positions measured from their table's back-left corner.
  const lx = W - legendW + 20;
  let ly = margin + 40;
  const legend: string[] = [`<text class="h2" x="${lx}" y="${ly}">Socles</text>`];
  ly += 26;
  if (!numbered.length) { legend.push(`<text class="muted" x="${lx}" y="${ly}">Aucun socle</text>`); ly += 22; }
  for (const { n, item, table } of numbered) {
    const pos = table ? (() => { const [a, b] = inTableFrame(item, table); return `à ${cm(a)} cm du bord gauche, ${cm(b)} cm du fond`; })() : '';
    const size = item.shape === 'round' ? `Ø ${cm(item.size[0])} · h ${cm(item.size[1])}` : `${cm(item.size[0])} × ${cm(item.size[2])} · h ${cm(item.size[1])}`;
    legend.push(`<circle class="tag" cx="${lx + 10}" cy="${ly - 4}" r="10"/><text class="tag-t" x="${lx + 10}" y="${ly}">${n}</text><text x="${lx + 30}" y="${ly}">${esc(item.name)} : ${size} cm</text>`);
    if (pos) { ly += 18; legend.push(`<text class="muted" x="${lx + 30}" y="${ly}">${pos}</text>`); }
    ly += 26;
  }
  ly += 10;
  legend.push(`<text class="h2" x="${lx}" y="${ly}">À prévoir</text>`);
  ly += 26;
  const inv = inventory(state.items).filter(r => r.type !== 'riser');
  const order = ['table', 'fabric', 'cocktail', 'glass', 'decor', 'model'];
  for (const r of inv.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) {
    legend.push(`<text x="${lx}" y="${ly}"><tspan class="count">${r.count}</tspan>  ${esc(r.name)}</text>`);
    ly += 20;
  }

  const height = Math.max(H, ly + 40);
  const fmtDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="Helvetica, Arial, sans-serif">
<style>
text{font-size:13px;fill:#1c1a17}.muted{fill:#7b756c;font-size:12px}.h1{font-size:22px;font-weight:600}.h2{font-size:15px;font-weight:600}
.fabric{fill:#efe9df;stroke:#b8a990;stroke-width:1;stroke-dasharray:6 4}.table{fill:#ffffff;stroke:#1c1a17;stroke-width:1.6}
.riser{fill:#f3f1ec;stroke:#1c1a17;stroke-width:1.2}.riser-top{fill:none;stroke:#1c1a17;stroke-width:.8;stroke-dasharray:3 2}
.decor{fill:none;stroke:#8a847a;stroke-width:1}.glass{stroke:#1c1a17;stroke-width:.6;fill-opacity:.85}
.tick{stroke:#1c1a17;stroke-width:.8}.tick-t{font-size:10px;fill:#7b756c;text-anchor:middle}
.dim line{stroke:#1c1a17;stroke-width:1}.dim text{font-size:13px;text-anchor:middle;font-weight:600}
.tag{fill:#1c1a17}.tag-t{fill:#ffffff;font-size:11px;font-weight:700;text-anchor:middle}.count{font-weight:700}
.scale line{stroke:#1c1a17;stroke-width:1.5}
</style>
<rect width="100%" height="100%" fill="#ffffff"/>
<text class="h1" x="${margin}" y="48">${esc(state.name)}</text>
<text class="muted" x="${margin}" y="70">Plan vu de dessus · dimensions en centimètres · ${fmtDate} · avant de l’installation en bas</text>
${out.join('\n')}
<line x1="${W - legendW}" y1="${margin + 10}" x2="${W - legendW}" y2="${height - 40}" stroke="#e8e4dd"/>
${legend.join('\n')}
</svg>`;
}

/** Ticks every 10 cm along a table's front and left edges, labelled every 50 cm. */
function tableRuler(t: Item, X: (x: number) => number, Y: (z: number) => number, scale: number): string[] {
  const out: string[] = [];
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  const w = (lx: number, lz: number): [number, number] => [t.position[0] + lx * c + lz * s, t.position[2] - lx * s + lz * c];
  const [W, , D] = t.size;
  const round = t.shape === 'round' || t.shape === 'highboy';
  if (round) {
    out.push(dimLine(X(t.position[0] - W / 2), Y(t.position[2]), X(t.position[0] + W / 2), Y(t.position[2]), `Ø ${cm(W)} cm`));
    return out;
  }
  const tick = (a: [number, number], b: [number, number], label?: string, at?: [number, number]) => {
    out.push(`<line class="tick" x1="${X(a[0]).toFixed(1)}" y1="${Y(a[1]).toFixed(1)}" x2="${X(b[0]).toFixed(1)}" y2="${Y(b[1]).toFixed(1)}"/>`);
    if (label && at) out.push(`<text class="tick-t" x="${X(at[0]).toFixed(1)}" y="${(Y(at[1]) + 4).toFixed(1)}">${label}</text>`);
  };
  const len = 6 / scale;
  for (let d = 0; d <= W + 1e-6; d += 0.1) {
    const major = Math.round(d * 100) % 50 === 0;
    tick(w(d - W / 2, D / 2), w(d - W / 2, D / 2 + len * (major ? 2 : 1)), major ? String(Math.round(d * 100)) : undefined, w(d - W / 2, D / 2 + len * 4));
  }
  for (let d = 0; d <= D + 1e-6; d += 0.1) {
    const major = Math.round(d * 100) % 50 === 0;
    tick(w(-W / 2, d - D / 2), w(-W / 2 - len * (major ? 2 : 1), d - D / 2), major ? String(Math.round(d * 100)) : undefined, w(-W / 2 - len * 4.5, d - D / 2));
  }
  const a = w(-W / 2, -D / 2 - 0.12), b = w(W / 2, -D / 2 - 0.12);
  out.push(dimLine(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), `${cm(W)} × ${cm(D)} cm · h ${cm(t.size[1])}`));
  return out;
}

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, vertical = false): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const rot = vertical ? -90 : ang > 90 || ang < -90 ? ang + 180 : ang;
  const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1, k = 5 / l;
  return `<g class="dim"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>` +
    `<line x1="${(x1 - nx * k).toFixed(1)}" y1="${(y1 - ny * k).toFixed(1)}" x2="${(x1 + nx * k).toFixed(1)}" y2="${(y1 + ny * k).toFixed(1)}"/>` +
    `<line x1="${(x2 - nx * k).toFixed(1)}" y1="${(y2 - ny * k).toFixed(1)}" x2="${(x2 + nx * k).toFixed(1)}" y2="${(y2 + ny * k).toFixed(1)}"/>` +
    `<text transform="translate(${mx.toFixed(1)} ${(my - 7).toFixed(1)}) rotate(${rot.toFixed(1)})">${esc(label)}</text></g>`;
}
