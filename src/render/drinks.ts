// Glasses, liquids and garnishes. Geometry is built once per glass profile / garnish and shared
// by every instance, so a grid of 200 identical cocktails costs no extra geometry memory.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DrinkSpec } from '../core/types';
import { glassProfile, glassHeight, innerOutline, liquidTop, radiusAt, type GlassProfile } from '../core/glassware';
import * as M from './materials';
import { citrusTexture, gradientTexture, rng, strawberryTexture } from './textures';

const SEG = 40;
const geo = new Map<string, THREE.BufferGeometry>();
const shared = (key: string, make: () => THREE.BufferGeometry) => geo.get(key) ?? geo.set(key, make()).get(key)!;

/** Closed shell: outer outline up to the rim, then the inner wall back down to the bowl. */
function glassGeometry(g: GlassProfile) {
  return shared('glass-' + g.id, () => {
    const rim = glassHeight(g);
    const outer = g.outline.map(([r, y]) => new THREE.Vector2(r, y));
    const inner = innerOutline(g, rim).slice(1).reverse().map(([r, y]) => new THREE.Vector2(r, y));
    // Rounded lip between outer and inner rim.
    const lip = new THREE.Vector2(radiusAt(g, rim) - g.wall / 2, rim + g.wall * 0.35);
    const pts = [...outer, lip, ...inner, new THREE.Vector2(0, g.bowl)];
    const l = new THREE.LatheGeometry(pts, SEG);
    l.computeVertexNormals();
    return l;
  });
}

function liquidGeometry(g: GlassProfile, fill: number) {
  const top = liquidTop(g, fill);
  return shared(`liquid-${g.id}-${top.toFixed(3)}`, () => {
    const inner = innerOutline(g, top).map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r - 0.0004), y));
    const pts = [...inner, new THREE.Vector2(0, top)];
    const l = new THREE.LatheGeometry(pts, SEG);
    // Height-based UVs so the colour ramp follows the liquid, not the outline's point spacing.
    const p = l.attributes.position, uv = l.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5, (p.getY(i) - g.bowl) / (top - g.bowl));
    l.computeVertexNormals();
    return l;
  });
}

// ------------------------------------------------------------------ garnish geometry

function leafGeometry() {
  return shared('leaf', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.bezierCurveTo(0.012, 0.006, 0.012, 0.022, 0, 0.032); s.bezierCurveTo(-0.012, 0.022, -0.012, 0.006, 0, 0);
    const g = new THREE.ShapeGeometry(s, 6);
    // Fold along the midrib and curl the tip, so leaves catch light like real mint.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.abs(x) * 0.5 + y * y * 4); }
    g.computeVertexNormals();
    return g;
  });
}

function sliceGeometry(radius: number) {
  return shared('slice' + radius, () => new THREE.CylinderGeometry(radius, radius, 0.005, 28));
}

function strawberryGeometry() {
  return shared('strawberry', () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 0.0135 * (0.55 + 0.45 * t) + 0.0005, t * 0.032)); }
    const g = new THREE.LatheGeometry(pts, 18);
    g.computeVertexNormals();
    return g;
  });
}

function calyxGeometry() {
  return shared('calyx', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const l = leafGeometry().clone();
      l.scale(0.45, 0.45, 0.3); l.rotateX(-Math.PI / 2 + 0.5); l.rotateY((i / 6) * Math.PI * 2);
      parts.push(l);
    }
    return mergeGeometries(parts)!;
  });
}

function berryCluster(seed: number, n: number, r: number) {
  return shared(`cluster-${seed}-${n}-${r}`, () => {
    const rand = rng(seed), parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.IcosahedronGeometry(r, 1);
      const a = rand() * Math.PI * 2, h = rand();
      s.translate(Math.cos(a) * r * 1.4 * Math.sqrt(1 - h * h), h * r * 1.6, Math.sin(a) * r * 1.4 * Math.sqrt(1 - h * h));
      parts.push(s);
    }
    return mergeGeometries(parts)!;
  });
}

const sphere = (r: number, d = 2) => shared('sphere' + r + d, () => new THREE.IcosahedronGeometry(r, d));
const tube = (r: number, h: number, seg = 10) => shared(`tube-${r}-${h}`, () => new THREE.CylinderGeometry(r, r, h, seg, 1, true).translate(0, h / 2, 0));
const rod = (r: number, h: number) => shared(`rod-${r}-${h}`, () => new THREE.CylinderGeometry(r, r, h, 8).translate(0, h / 2, 0));
const cube = (s: number) => shared('icecube' + s, () => new THREE.BoxGeometry(s, s, s));

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast; o.receiveShadow = false;
  o.matrixAutoUpdate = false;
  return o;
}
function place(o: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) {
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.setScalar(s); o.updateMatrix();
  return o;
}

const LEAF = () => M.plain('#3f8a3a', 0.55, { side: THREE.DoubleSide });
const FRUIT = {
  'lime-wheel': ['#4c8f2a', '#b8d65a'], 'lemon-wheel': ['#e9c925', '#f6e27a'], 'orange-wheel': ['#e8761a', '#f6a43a'],
} as Record<string, [string, string]>;

/** Build the garnish meshes for one drink. `seed` varies small details between neighbours. */
function garnish(group: THREE.Group, g: GlassProfile, d: DrinkSpec, seed: number) {
  const rim = glassHeight(g), top = liquidTop(g, d.fill), rimR = radiusAt(g, rim);
  const rand = rng(seed);
  const has = (k: string) => d.garnish.includes(k);
  for (const k of d.garnish) {
    switch (k) {
      case 'lime-wheel': case 'lemon-wheel': case 'orange-wheel': {
        const r = k === 'orange-wheel' ? 0.03 : 0.024, [rind, pulp] = FRUIT[k];
        const mat = M.plain('#ffffff', 0.45, { map: citrusTexture(rind, pulp) });
        // Slotted onto the rim, standing slightly outward.
        group.add(place(mesh(sliceGeometry(r), mat), rimR + r * 0.35, rim - r * 0.25, 0, 0, 0, Math.PI / 2 - 0.25));
        break;
      }
      case 'lime-inside': {
        const mat = M.plain('#ffffff', 0.45, { map: citrusTexture('#4c8f2a', '#b8d65a') });
        for (let i = 0; i < 3; i++) {
          const y = g.bowl + (top - g.bowl) * (0.25 + i * 0.25), r = Math.min(0.02, radiusAt(g, y) - g.wall - 0.004);
          if (r > 0.006) group.add(place(mesh(sliceGeometry(r), mat), (rand() - 0.5) * 0.004, y, (rand() - 0.5) * 0.004, Math.PI / 2 - 0.3 + rand() * 0.6, rand() * 6, 0));
        }
        break;
      }
      case 'lime-wedge': {
        const mat = M.plain('#ffffff', 0.45, { map: citrusTexture('#4c8f2a', '#b8d65a') });
        const w = shared('wedge', () => new THREE.CylinderGeometry(0.022, 0.022, 0.014, 16, 1, false, 0, Math.PI * 0.5));
        group.add(place(mesh(w, mat), rimR - 0.005, rim, 0, Math.PI / 2, 0, -0.4));
        break;
      }
      case 'mint': {
        const leaf = LEAF();
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(), lift = has('straw-black') || has('straw-paper') ? 0.012 : 0.004;
          group.add(place(mesh(leafGeometry(), leaf), Math.cos(a) * 0.008, top + lift + rand() * 0.012, Math.sin(a) * 0.008, -0.5 - rand() * 0.6, a + Math.PI / 2, 0, 0.9 + rand() * 0.4));
        }
        // Leaves suspended in the drink, visible through the glass.
        for (let i = 0; i < 4; i++) {
          const y = g.bowl + (top - g.bowl) * (0.2 + rand() * 0.6), r = radiusAt(g, y) - g.wall - 0.01;
          if (r > 0.004) group.add(place(mesh(leafGeometry(), leaf), Math.cos(i * 1.7) * r, y, Math.sin(i * 1.7) * r, rand() * 3, rand() * 6, rand() * 3, 0.8));
        }
        break;
      }
      case 'mango': {
        const m = M.plain('#f3a414', 0.5);
        for (let i = 0; i < 6; i++) {
          const y = g.bowl + 0.006 + i * 0.012, r = radiusAt(g, y) - g.wall - 0.01;
          if (r > 0.004) group.add(place(mesh(cube(0.011), m), Math.cos(i * 2.3) * r * 0.6, y, Math.sin(i * 2.3) * r * 0.6, rand(), rand(), rand()));
        }
        break;
      }
      case 'cherry': {
        const m = M.plain('#a4071c', 0.18, { metalness: 0 });
        group.add(place(mesh(sphere(0.009), m), rimR * 0.3, top + 0.008, -rimR * 0.2));
        group.add(place(mesh(rod(0.0007, 0.03), M.plain('#5a3a1a', 0.7)), rimR * 0.3, top + 0.016, -rimR * 0.2, 0.3, 0, 0.3));
        break;
      }
      case 'strawberry': case 'strawberry-rim': {
        const sm = M.plain('#ffffff', 0.35, { map: strawberryTexture() });
        const s = mesh(strawberryGeometry(), sm);
        // Cut and slotted on the rim, tip down.
        group.add(place(s, rimR + 0.004, rim + 0.03, 0, Math.PI, 0, 0.25));
        group.add(place(mesh(calyxGeometry(), LEAF()), rimR + 0.012, rim + 0.031, 0, 0, 0, 0.25));
        break;
      }
      case 'berries-skewer': {
        // Gold pick across the rim with a strawberry and blueberries, as in real installations.
        const gold = M.metal('#e2c27a', 0.32);
        const len = rimR * 2 + 0.05;
        group.add(place(mesh(rod(0.0012, len), gold), -len / 2, rim + 0.012, 0, 0, 0, -Math.PI / 2 + 0.12));
        const blue = M.plain('#1d2346', 0.35);
        for (let i = 0; i < 3; i++) group.add(place(mesh(sphere(0.0065), blue), -rimR + 0.012 + i * 0.015, rim + 0.012 + (i * 0.015 - rimR) * 0.12 + 0.013, 0));
        const sm = M.plain('#ffffff', 0.35, { map: strawberryTexture() });
        group.add(place(mesh(strawberryGeometry(), sm), rimR + 0.012, rim + 0.03, 0, 0, 0, Math.PI / 2 + 0.12, 0.9));
        group.add(place(mesh(calyxGeometry(), LEAF()), rimR - 0.004, rim + 0.024, 0, 0, 0, Math.PI / 2, 0.8));
        break;
      }
      case 'raspberries': {
        const m = M.plain('#b3123a', 0.55);
        for (let i = 0; i < 5; i++) {
          const y = g.bowl + (top - g.bowl) * (0.15 + i * 0.18), r = radiusAt(g, y) - g.wall - 0.012;
          if (r > 0.002) group.add(place(mesh(berryCluster(7, 14, 0.0035), m), Math.cos(i * 2.1) * r * 0.7, y, Math.sin(i * 2.1) * r * 0.7, rand() * 3, rand() * 3, 0));
        }
        break;
      }
      case 'blueberries': {
        const m = M.plain('#252a52', 0.4);
        for (let i = 0; i < 6; i++) group.add(place(mesh(sphere(0.0055), m), (rand() - 0.5) * rimR, top + 0.002, (rand() - 0.5) * rimR));
        break;
      }
      case 'pineapple': {
        const m = M.plain('#f2cf4a', 0.6), leaf = M.plain('#4f7a35', 0.6, { side: THREE.DoubleSide });
        const w = shared('pine', () => new THREE.CylinderGeometry(0.035, 0.035, 0.012, 18, 1, false, 0, Math.PI * 0.35));
        group.add(place(mesh(w, m), rimR - 0.005, rim - 0.005, 0, Math.PI / 2, 0, -0.3));
        for (let i = 0; i < 3; i++) group.add(place(mesh(leafGeometry(), leaf), rimR + 0.02, rim + 0.02, 0, 0, i - 1, -0.4, 1.4));
        break;
      }
      case 'rock-candy': {
        // Wooden stick with a crystallised sugar sleeve, resting diagonally across the glass.
        const crystal = shared('candy', () => {
          const c = new THREE.CylinderGeometry(0.009, 0.009, 0.08, 9, 8);
          const p = c.attributes.position, r = rng(9);
          for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.5; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
          c.computeVertexNormals();
          return c.translate(0, 0.04, 0);
        });
        const grp = new THREE.Group();
        grp.add(mesh(rod(0.0018, 0.2), M.plain('#d8b98a', 0.7)));
        grp.add(place(mesh(crystal, M.plain('#fbfbf8', 0.25, { flatShading: true })), 0, 0.1, 0));
        place(grp, -rimR * 0.5, g.bowl + 0.02, 0, 0, 0, -0.55);
        grp.matrixAutoUpdate = false;
        group.add(grp);
        break;
      }
      case 'gypsophila': {
        const m = M.plain('#fbf8f6', 0.8), stem = M.plain('#86a36c', 0.7);
        group.add(place(mesh(rod(0.0008, 0.05), stem), 0, rim - 0.01, 0, 0.15, 0, 0.1));
        group.add(place(mesh(berryCluster(4, 18, 0.0028), m), 0.004, rim + 0.035, 0.002));
        break;
      }
      case 'bow': {
        const satin = M.plain('#fbf6ec', 0.35, { side: THREE.DoubleSide });
        const loop = shared('bowloop', () => new THREE.TorusGeometry(0.012, 0.004, 6, 16).scale(1, 0.55, 0.35));
        const y = g.outline.find(p => p[1] > 0.02 && p[0] < 0.006)?.[1] ?? g.bowl - 0.01;
        if (g.bowl > 0.05) {
          group.add(place(mesh(loop, satin), -0.01, y + 0.03, 0.006, 0, 0, 0.3));
          group.add(place(mesh(loop, satin), 0.01, y + 0.03, 0.006, 0, 0, -0.3));
          group.add(place(mesh(rod(0.002, 0.035), satin), -0.004, y - 0.003, 0.008, 0, 0, 0.25));
          group.add(place(mesh(rod(0.002, 0.035), satin), 0.004, y - 0.003, 0.008, 0, 0, -0.25));
        }
        break;
      }
      case 'gold-rim': {
        const ring = shared('goldrim-' + g.id, () => new THREE.TorusGeometry(radiusAt(g, rim) - g.wall / 2, g.wall * 0.7, 6, SEG).scale(1, 1, 2.5).rotateX(Math.PI / 2));
        group.add(place(mesh(ring, M.metal('#e0bd6c', 0.2), false), 0, rim - 0.001, 0));
        break;
      }
      case 'sugar-rim': case 'salt-rim': case 'pink-rim': {
        const ring = shared('rim-' + g.id, () => new THREE.TorusGeometry(radiusAt(g, rim) - g.wall / 2, 0.0016, 5, SEG).scale(1, 1, 2.2).rotateX(Math.PI / 2));
        group.add(place(mesh(ring, M.plain(k === 'pink-rim' ? '#f19ab9' : '#f8f8f4', 0.95, { flatShading: true }), false), 0, rim - 0.002, 0));
        break;
      }
      case 'orange-peel': {
        const peel = shared('peel', () => new THREE.TorusGeometry(0.012, 0.0025, 5, 14, Math.PI * 1.4).scale(1, 1, 0.4));
        group.add(place(mesh(peel, M.plain('#e9781e', 0.5)), rimR - 0.006, rim + 0.002, 0, Math.PI / 2, 0, 0));
        break;
      }
      case 'coffee-beans': {
        const bean = shared('bean', () => new THREE.SphereGeometry(0.0045, 10, 6).scale(1, 0.55, 0.75));
        for (let i = 0; i < 3; i++) group.add(place(mesh(bean, M.plain('#2d170b', 0.35), false), Math.cos(i * 2.1) * 0.007, top + 0.0015, Math.sin(i * 2.1) * 0.007, 0, i, 0));
        break;
      }
      case 'pearls': {
        const m = M.plain('#1d120c', 0.15);
        for (let i = 0; i < 26; i++) {
          const y = g.bowl + 0.006 + Math.floor(i / 9) * 0.008, r = radiusAt(g, y) - g.wall - 0.006;
          group.add(place(mesh(sphere(0.0045, 1), m, false), Math.cos(i * 0.7) * r * (0.3 + rand() * 0.7), y, Math.sin(i * 0.7) * r * (0.3 + rand() * 0.7)));
        }
        break;
      }
      case 'big-ice': {
        const s = Math.min(0.045, (radiusAt(g, top) - g.wall) * 1.3);
        group.add(place(mesh(cube(s), M.ice(), false), 0, top - s * 0.35, 0, 0.1, 0.4, 0.05));
        break;
      }
      case 'gold-stirrer': {
        const gold = M.metal('#e2c27a', 0.32);
        group.add(place(mesh(rod(0.0015, rim + 0.06 - g.bowl), gold), 0.006, g.bowl, 0, 0, 0, -0.08));
        const disc = shared('stirtop', () => new THREE.CylinderGeometry(0.009, 0.009, 0.003, 16).rotateX(Math.PI / 2));
        group.add(place(mesh(disc, gold), 0.006 + Math.sin(0.08) * (rim + 0.06 - g.bowl), rim + 0.065, 0));
        break;
      }
      case 'straw-black': case 'straw-paper': case 'straw-wide': {
        const wide = k === 'straw-wide', r = wide ? 0.0055 : 0.0032, len = rim - g.bowl + (wide ? 0.08 : 0.065);
        const color = k === 'straw-paper' ? '#e7d9c9' : k === 'straw-wide' ? '#1a1a1c' : '#121214';
        const tilt = Math.min(0.25, Math.atan2(radiusAt(g, rim) - g.wall - r * 2, len));
        group.add(place(mesh(tube(r, len), M.plain(color, 0.4, { side: THREE.DoubleSide })), -0.004, g.bowl + 0.003, 0.004, 0.06, 0, -tilt));
        break;
      }
      case 'dome': {
        const dome = shared('dome', () => new THREE.SphereGeometry(rimR, 28, 8, 0, Math.PI * 2, 0, Math.PI * 0.42));
        group.add(place(mesh(dome, M.glass(true), false), 0, rim - rimR * 0.25 + 0.002, 0, 0, 0, 0, 1));
        break;
      }
    }
  }
  // Ice cubes rise to the surface; only the top shows above the liquid.
  for (let i = 0; i < (d.ice ?? 0); i++) {
    // Just below the surface: seen through the drink, never poking out as flat white shapes.
    const y = top - 0.016 - Math.floor(i / 3) * 0.022, r = radiusAt(g, y) - g.wall - 0.013;
    if (r < 0.003 || y < g.bowl + 0.01) break;
    const a = i * 2.4 + rand();
    group.add(place(mesh(cube(0.021), M.ice(), false), Math.cos(a) * r * 0.75, y, Math.sin(a) * r * 0.75, rand(), rand(), rand()));
  }
}

/** Complete glass, with its drink when the spec has liquid. Origin at the centre of the foot. */
export function buildDrink(d: DrinkSpec, seed: number, glassFinish?: { color: string; roughness?: number; texture?: string }): THREE.Group {
  const g = glassProfile(d.glass);
  const group = new THREE.Group();
  const shell = mesh(glassGeometry(g), M.glass(g.plastic, glassFinish?.color ?? '#ffffff', glassFinish?.roughness ?? 0.03, glassFinish?.texture === 'cut'));
  shell.castShadow = true;
  shell.userData.part = 'glass';
  group.add(shell);
  if (d.fill > 0 && d.layers.length) {
    const key = (d.layered ? 'h' : 's') + d.layers.map(l => l.color + l.at).join();
    const liq = mesh(liquidGeometry(g, d.fill), M.liquid(gradientTexture(d.layers, !!d.layered), key));
    liq.userData.part = 'liquid';
    group.add(liq);
    garnish(group, g, d, seed);
  }
  return group;
}
