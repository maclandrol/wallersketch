// Procedural textures, generated once at startup and shared. Everything is local: no downloads.
import * as THREE from 'three';

function canvas(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  return c;
}

/** Deterministic pseudo-random numbers so textures look the same on every launch. */
export function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Convert a greyscale height canvas into a tangent-space normal map. */
function normalFromHeight(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const s = src.width, h = src.getContext('2d')!.getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const g = out.getContext('2d')!, img = g.createImageData(s, s);
  const at = (x: number, y: number) => h[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), k = (y * s + x) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

function repeatTexture(c: HTMLCanvasElement, colour = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cache = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture) => cache.get(key) ?? cache.set(key, make()).get(key)!;

/** Fabric weave normal maps. UVs are in metres, so `repeat` is threads per metre / tile. */
export function fabricNormal(kind: string): THREE.Texture {
  return once('fabric-' + kind, () => {
    const r = rng(kind.length * 977);
    const height = canvas(256, (g, s) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
      if (kind === 'linen' || kind === 'cotton') {
        const step = kind === 'linen' ? 4 : 2;
        for (let i = 0; i < s; i += step) {
          g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`; g.fillRect(i, 0, step / 2, s);
          g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.3})`; g.fillRect(0, i, s, step / 2);
        }
        // Slubs: irregular thicker threads typical of linen.
        for (let n = 0; n < (kind === 'linen' ? 40 : 10); n++) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, r() * s, s, 1 + r() * 2); }
      } else if (kind === 'velvet') {
        for (let n = 0; n < 9000; n++) { const v = 100 + r() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * s, r() * s, 2, 2); }
      } else {
        for (let i = 0; i < s; i += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.06})`; g.fillRect(i, 0, 1, s); }
      }
    });
    const t = repeatTexture(normalFromHeight(height, kind === 'satin' ? 0.6 : 2.2));
    const tile = kind === 'linen' ? 0.06 : kind === 'cotton' ? 0.03 : kind === 'velvet' ? 0.12 : 0.05;
    t.repeat.set(1 / tile, 1 / tile);
    return t;
  });
}

/** Sequin cloth: overlapping discs with random tilt, as a normal map. */
export function sequinNormal(): THREE.Texture {
  return once('sequins', () => {
    const r = rng(31), s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!, img = g.createImageData(s, s);
    for (let k = 0; k < img.data.length; k += 4) { img.data[k] = 128; img.data[k + 1] = 128; img.data[k + 2] = 255; img.data[k + 3] = 255; }
    const step = 16;
    for (let y = 0; y < s; y += step * 0.8) for (let x = ((y / (step * 0.8)) % 2) * step / 2; x < s + step; x += step) {
      const nx = (r() - 0.5) * 1.4, ny = (r() - 0.5) * 1.4, nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        if (dx * dx + dy * dy > 49) continue;
        const px = (Math.round(x + dx) + s) % s, py = (Math.round(y + dy) + s) % s, k = (py * s + px) * 4;
        img.data[k] = (nx * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * 0.5 + 0.5) * 255; img.data[k + 2] = nz * 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = repeatTexture(c); t.repeat.set(20, 20); return t;
  });
}

/** Cut crystal: vertical facets and a diamond band, tiled around the glass. */
export function crystalNormal(): THREE.Texture {
  return once('crystal', () => {
    const h = canvas(256, (g, s) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#303030'); gr.addColorStop(0.5, '#e0e0e0'); gr.addColorStop(1, '#303030'); g.fillStyle = gr; g.fillRect(x, 0, 16, s * 0.6); }
      g.strokeStyle = '#f0f0f0'; g.lineWidth = 3;
      for (let x = -s; x < s * 2; x += 24) { g.beginPath(); g.moveTo(x, s * 0.6); g.lineTo(x + 48, s); g.moveTo(x + 48, s * 0.6); g.lineTo(x, s); g.stroke(); }
    });
    const t = repeatTexture(normalFromHeight(h, 3)); t.repeat.set(4, 1); return t;
  });
}

/** Light greyscale maps multiplied by the finish colour, so any colour keeps the pattern. */
export function surfaceMap(kind: string): THREE.Texture | null {
  if (kind === 'wood') return once('wood', () => {
    const r = rng(11);
    const c = canvas(512, (g, s) => {
      g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y++) {
        const w = Math.sin(y * 0.045 + Math.sin(y * 0.011) * 3) * 0.5 + 0.5;
        g.fillStyle = `rgba(80,60,40,${0.05 + w * 0.12})`; g.fillRect(0, y, s, 1);
      }
      for (let n = 0; n < 60; n++) { g.fillStyle = `rgba(70,50,30,${0.05 + r() * 0.12})`; g.fillRect(0, r() * s, s, 1 + r() * 2); }
    });
    const t = repeatTexture(c, true); t.repeat.set(1.2, 1.2); return t;
  });
  if (kind === 'marble') return once('marble', () => {
    const r = rng(5);
    const c = canvas(1024, (g, s) => {
      g.fillStyle = '#f4f3f1'; g.fillRect(0, 0, s, s);
      g.lineCap = 'round';
      for (let v = 0; v < 26; v++) {
        let x = r() * s, y = r() * s, a = r() * Math.PI;
        const warm = r() > 0.6;
        g.strokeStyle = warm ? `rgba(176,140,92,${0.12 + r() * 0.3})` : `rgba(120,120,125,${0.08 + r() * 0.25})`;
        g.lineWidth = 0.6 + r() * (v < 4 ? 3 : 1.2);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 60; k++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
        g.stroke();
      }
    });
    const t = repeatTexture(c, true); t.repeat.set(0.8, 0.8); return t;
  });
  return null;
}

/** Cross-section of a citrus slice: rind, pith and segments. */
export function citrusTexture(rind: string, pulp: string): THREE.Texture {
  return once('citrus-' + rind + pulp, () => {
    const c = canvas(256, (g, s) => {
      const m = s / 2;
      g.fillStyle = rind; g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f7f3dc'; g.beginPath(); g.arc(m, m, m * 0.9, 0, Math.PI * 2); g.fill();
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + 0.05, a1 = ((i + 1) / n) * Math.PI * 2 - 0.05;
        const grad = g.createRadialGradient(m, m, m * 0.1, m, m, m * 0.84);
        grad.addColorStop(0, '#fbf5d8'); grad.addColorStop(0.35, pulp); grad.addColorStop(1, pulp);
        g.fillStyle = grad; g.beginPath(); g.moveTo(m, m); g.arc(m, m, m * 0.84, a0, a1); g.closePath(); g.fill();
      }
      g.fillStyle = '#f7f3dc'; g.beginPath(); g.arc(m, m, m * 0.08, 0, Math.PI * 2); g.fill();
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}

export function strawberryTexture(): THREE.Texture {
  return once('strawberry', () => {
    const r = rng(3);
    const c = canvas(256, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#d8222d'); grad.addColorStop(1, '#b0101e');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
      for (let y = 8; y < s; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) {
        g.fillStyle = '#f3d36b'; g.beginPath(); g.ellipse(x + r() * 2, y, 1.6, 2.4, 0, 0, Math.PI * 2); g.fill();
      }
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}

/** Vertical colour ramp for a drink, sampled by the liquid's height. */
export function gradientTexture(stops: { color: string; at: number }[], hard: boolean): THREE.Texture {
  const key = 'grad-' + (hard ? 'h' : 's') + stops.map(s => s.color + s.at).join();
  return once(key, () => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const g = c.getContext('2d')!;
    if (stops.length <= 1) { g.fillStyle = stops[0]?.color ?? '#f5a623'; g.fillRect(0, 0, 4, 128); }
    else {
      const grad = g.createLinearGradient(0, 128, 0, 0);
      for (const s of stops) grad.addColorStop(Math.min(1, Math.max(0, s.at)), s.color);
      g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    if (hard) t.magFilter = THREE.NearestFilter;
    return t;
  });
}

/** Blank card for signs: a soft paper with a thin border, until the operator adds an image. */
export function cardTexture(): THREE.Texture {
  return once('card', () => {
    const c = canvas(256, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c9b48a'; g.lineWidth = 2; g.strokeRect(14, 14, s - 28, s - 28);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}

/** Imported image textures, decoded once per asset. */
const imported = new Map<string, THREE.Texture>();
export function importedTexture(id: string, dataUrl: string, onLoad: () => void): THREE.Texture {
  let t = imported.get(id);
  if (!t) {
    const img = new Image();
    t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    img.onload = () => { t!.needsUpdate = true; onLoad(); };
    img.src = dataUrl;
    imported.set(id, t);
  }
  return t;
}
