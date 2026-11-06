// Line icons drawn for this app on a 20 × 20 grid (1.5 px strokes, round caps).
const P: Record<string, string> = {
  table: 'M3 7h14M5 7v8M15 7v8M3 7l1.5-2.5h11L17 7',
  riser: 'M4 16V9h5v7M9 16V5h7v11M2.5 16h15',
  fabric: 'M3 5c2 1.2 4 1.2 7 0s5-1.2 7 0v9c-2-1.2-4-1.2-7 0s-5 1.2-7 0z',
  cocktail: 'M5 4h10l-5 6zM10 10v6M7 16h6M12.5 4l2-2.5',
  glass: 'M6.5 3h7l-.8 13.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8z',
  decor: 'M10 17V9M10 9c-3 0-4.5-2-4.5-4.5C8 4.5 10 6 10 9zM10 11c3 0 4.5-2 4.5-4.5C12 6.5 10 8 10 11z',
  mine: 'M10 2.8l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z',
  undo: 'M7.5 5L4 8.5 7.5 12M4.5 8.5H12a4 4 0 0 1 0 8h-2',
  redo: 'M12.5 5L16 8.5 12.5 12M15.5 8.5H8a4 4 0 0 0 0 8h2',
  play: 'M7 5l8 5-8 5z',
  export: 'M10 3v10M6 7l4-4 4 4M4 13v3h12v-3',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  search: 'M8.5 14a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM12.5 12.5L17 17',
  close: 'M5 5l10 10M15 5L5 15',
  plus: 'M10 4v12M4 10h12',
  duplicate: 'M7 7h9v9H7zM4 13V4h9',
  trash: 'M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10',
  grid: 'M4 4h4v4H4zM12 4h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4z',
  rotate: 'M15.5 9.5A5.5 5.5 0 1 1 13.8 5.6M14 2.5v3.5h-3.5',
  lock: 'M6 9V6.5a4 4 0 0 1 8 0V9M5 9h10v8H5z',
  unlock: 'M6 9V6.5a4 4 0 0 1 7.6-1.7M5 9h10v8H5z',
  group: 'M3 3h6v6H3zM11 11h6v6h-6zM9 6h4v5',
  frame: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4',
  camera: 'M3 6.5h3l1.5-2h5l1.5 2h3v9H3zM10 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cube3: 'M10 2.5l6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2zM3.5 6.2L10 10l6.5-3.8M10 10v7.5',
  front: 'M4 4h12v12H4zM4 12h12',
  top: 'M4 4h12v12H4zM10 4v12M4 10h12',
  sun: 'M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4',
  folder: 'M3 5.5h5l1.5 2H17v8.5H3z',
  save: 'M4 3h9.5L16 5.5V17H4zM7 3v4h6V3M7 17v-5h6v5',
  image: 'M3 4h14v12H3zM3 13l4-4 4 4 2-2 4 4M13 8h.01',
  plan: 'M3 4h14v12H3zM3 9h6v7M9 9h8',
  import: 'M10 13V3M6 9l4 4 4-4M4 13v3h12v-3',
  eye: 'M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10zM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  chevron: 'M7 8l3 3 3-3',
  chevronRight: 'M8 6l4 4-4 4',
  left: 'M12 5l-5 5 5 5',
  right: 'M8 5l5 5-5 5',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  layers: 'M10 3l7 4-7 4-7-4zM3 11l7 4 7-4',
  pencil: 'M13 3.5l3.5 3.5L7 16.5H3.5V13z',
  texture: 'M3 3h14v14H3zM3 9l6-6M3 15L15 3M9 17l8-8M15 17l2-2',
  ruler: 'M2.5 12.5l10-10 5 5-10 10zM6 9l1.5 1.5M8.5 6.5L10 8M11 4l1.5 1.5',
  bulb: 'M7 14h6M8 17h4M10 2.5a5 5 0 0 0-3 9V14h6v-2.5a5 5 0 0 0-3-9z',
  bar: 'M3 17h14M5 17v-5h3v5M8.5 17V8h3v9M12 17v-7h3v7',
  sparkle: 'M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  magnet: 'M5 3v7a5 5 0 0 0 10 0V3h-3.5v7a1.5 1.5 0 0 1-3 0V3zM5 6.5h3.5M11.5 6.5H15',
  cube: 'M10 2.5l6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2z',
};

export function icon(name: string, size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', P[name] ?? P.cube3);
  svg.appendChild(path);
  return svg;
}
