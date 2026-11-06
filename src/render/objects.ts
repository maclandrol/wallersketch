// Meshes for tables, risers and decor. Each builder returns a group with its origin at the
// centre of the object's footprint on its base, sized to `item.size`.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Finish, Item } from '../core/types';
import * as M from './materials';
import { cardTexture, citrusTexture, rng } from './textures';
import { buildDrink } from './drinks';
import { tierBoxes } from '../core/scene';

const geo = new Map<string, THREE.BufferGeometry>();
const shared = (key: string, make: () => THREE.BufferGeometry) => geo.get(key) ?? geo.set(key, make()).get(key)!;
const k = (v: number) => v.toFixed(3);

import { TAPER_SCALE as TAPER_TOP } from '../core/catalog';

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], part?: string, cast = true, receive = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast; o.receiveShadow = receive;
  if (part) o.userData.part = part;
  return o;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };
const fin = (i: Item, part: string, fallback: Finish = { color: '#ffffff' }) => i.finish[part] ?? fallback;

/** Planar UVs in metres for box-like geometry so wood and marble tile at a real scale. */
function metreUVs(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i)); else if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i)); else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

// ---------------------------------------------------------------- tables

function table(i: Item): THREE.Group {
  const [w, h, d] = i.size, g = new THREE.Group();
  const top = M.solid(fin(i, 'top')), legs = M.solid(fin(i, 'legs'));
  const t = 0.03;
  if (i.shape === 'round' || i.shape === 'highboy') {
    const r = w / 2;
    g.add(at(mesh(shared(`ttop-r-${k(r)}`, () => metreUVs(new THREE.CylinderGeometry(r, r, t, 72))), top, 'top'), 0, h - t / 2, 0));
    const pole = i.shape === 'highboy' ? 0.03 : 0.045;
    g.add(at(mesh(shared(`pole-${k(pole)}-${k(h)}`, () => new THREE.CylinderGeometry(pole, pole, h - t - 0.02, 20)), legs, 'legs'), 0, (h - t) / 2, 0));
    const base = Math.min(r * 0.8, i.shape === 'highboy' ? 0.26 : 0.3);
    g.add(at(mesh(shared(`base-${k(base)}`, () => new THREE.CylinderGeometry(base * 0.92, base, 0.025, 40)), legs, 'legs'), 0, 0.0125, 0));
  } else {
    g.add(at(mesh(shared(`ttop-${k(w)}-${k(d)}`, () => metreUVs(new RoundedBoxGeometry(w, t, d, 2, 0.006))), top, 'top'), 0, h - t / 2, 0));
    const leg = 0.04, inset = Math.min(0.08, w * 0.08, d * 0.08), lh = h - t;
    const lg = shared(`leg-${k(lh)}`, () => new THREE.BoxGeometry(leg, lh, leg));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(at(mesh(lg, legs, 'legs'), sx * (w / 2 - inset), lh / 2, sz * (d / 2 - inset)));
    // Apron under the top keeps the frame plausible when the table is lengthened.
    const ap = shared(`apron-${k(w)}-${k(d)}`, () => {
      const a = new THREE.BoxGeometry(w - inset * 2, 0.06, 0.02), b = new THREE.BoxGeometry(0.02, 0.06, d - inset * 2);
      return mergeGeometries([a.clone().translate(0, 0, d / 2 - inset), a.translate(0, 0, -d / 2 + inset), b.clone().translate(w / 2 - inset, 0, 0), b.translate(-w / 2 + inset, 0, 0)])!;
    });
    g.add(at(mesh(ap, legs, 'legs'), 0, h - t - 0.03, 0));
  }
  return g;
}

// ---------------------------------------------------------------- risers

export function taperGeometry(w: number, h: number, d: number) {
  return shared(`taper-${k(w)}-${k(h)}-${k(d)}`, () => {
    // Square frustum: a 4-sided cylinder turned 45°, scaled to the footprint.
    const s = Math.SQRT1_2;
    const c = new THREE.CylinderGeometry(s * TAPER_TOP, s, 1, 4, 1).rotateY(Math.PI / 4);
    c.scale(w, h, d).translate(0, h / 2, 0);
    // Non-indexed with recomputed normals gives flat faces instead of rounded cylinder shading.
    const flat = c.toNonIndexed();
    flat.computeVertexNormals();
    return metreUVs(flat);
  });
}

function riser(i: Item): THREE.Group {
  const [w, h, d] = i.size, g = new THREE.Group(), f = fin(i, 'main'), m = M.solid(f);
  let body: THREE.BufferGeometry;
  if (i.shape === 'round') body = shared(`cyl-${k(w)}-${k(h)}`, () => new THREE.CylinderGeometry(w / 2, w / 2, h, 56).translate(0, h / 2, 0));
  else if (i.shape === 'tiers') body = shared(`tiers-${k(w)}-${k(h)}-${k(d)}-${i.steps ?? 3}`, () =>
    mergeGeometries(tierBoxes(i.size, i.steps ?? 3).map(b => metreUVs(new RoundedBoxGeometry(b.w, b.h, b.d, 2, 0.004)).translate(b.x, b.h / 2, b.z)))!);
  else if (i.shape === 'taper') body = taperGeometry(w, h, d);
  else body = shared(`box-${k(w)}-${k(h)}-${k(d)}`, () => metreUVs(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.004, h / 4))).translate(0, h / 2, 0));
  g.add(mesh(body, m, 'main'));
  return g;
}

// ---------------------------------------------------------------- decor

function lathe(key: string, pts: [number, number][], seg = 36) {
  return shared(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
}

function petalCluster(seed: number, count: number, radius: number, bloom: number, kind: 'floret' | 'rose') {
  return shared(`bloom-${seed}-${count}-${k(radius)}-${k(bloom)}-${kind}`, () => {
    const r = rng(seed), parts: THREE.BufferGeometry[] = [];
    const petal = new THREE.CircleGeometry(1, 7).scale(1, 0.75, 1);
    for (let n = 0; n < count; n++) {
      // Points on a dome make the bouquet head.
      const u = r(), v = r() * Math.PI * 2, phi = Math.acos(1 - u * 0.95);
      const cx = Math.sin(phi) * Math.cos(v) * radius, cy = Math.cos(phi) * radius * 0.75, cz = Math.sin(phi) * Math.sin(v) * radius;
      const normal = new THREE.Vector3(cx, cy + radius * 0.3, cz).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      const petals = kind === 'floret' ? 4 : 9;
      for (let p = 0; p < petals; p++) {
        const s = bloom * (kind === 'rose' ? 0.45 + (p / petals) * 0.55 : 0.5);
        const pg = petal.clone().scale(s, s, s);
        const a = (p / petals) * Math.PI * 2 + r();
        pg.translate(0, s * 0.8, 0).rotateX(kind === 'rose' ? -1.1 + (p / petals) * 0.9 : -0.35).rotateZ(a);
        pg.applyQuaternion(q).translate(cx, cy, cz);
        parts.push(pg);
      }
    }
    return mergeGeometries(parts)!;
  });
}

function leaves(seed: number, n: number, spread: number, y0: number, size = 1) {
  return shared(`leaves-${seed}-${n}-${k(spread)}-${k(y0)}-${size}`, () => {
    const r = rng(seed), parts: THREE.BufferGeometry[] = [];
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.bezierCurveTo(0.03, 0.02, 0.025, 0.07, 0, 0.09); s.bezierCurveTo(-0.025, 0.07, -0.03, 0.02, 0, 0);
    const base = new THREE.ShapeGeometry(s, 5).scale(size, size, size);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = spread * (0.6 + r() * 0.4);
      parts.push(base.clone().rotateX(-0.6 - r() * 0.6).rotateY(a + Math.PI / 2).translate(Math.cos(a) * rr * 0.3, y0 + r() * 0.04, Math.sin(a) * rr * 0.3));
    }
    return mergeGeometries(parts)!;
  });
}

function bouquet(i: Item, kind: 'hydrangea' | 'peony' | 'rose' | 'gyps'): THREE.Group {
  const [w, h] = i.size, g = new THREE.Group();
  const vaseH = h * (kind === 'gyps' ? 0.5 : 0.48), vr = w * 0.3;
  const vaseMat = kind === 'gyps' ? M.glass(false) : M.solid(fin(i, 'vase'));
  // Fluted ceramic vase, like the white vases in the reference photos.
  g.add(mesh(lathe(`vase-${k(vr)}-${k(vaseH)}`, [[0, 0], [vr * 0.8, 0], [vr * 0.95, vaseH * 0.15], [vr, vaseH * 0.7], [vr * 0.85, vaseH * 0.95], [vr * 0.9, vaseH], [vr * 0.8, vaseH], [vr * 0.75, vaseH * 0.2], [0, vaseH * 0.2]], 48), vaseMat, 'vase'));
  const flowers = M.solid({ ...fin(i, 'flowers'), roughness: 0.8 }, { side: THREE.DoubleSide });
  const green = M.plain('#4e6e45', 0.7, { side: THREE.DoubleSide });
  const headR = w * 0.5;
  if (kind === 'gyps') {
    const stems = M.plain('#7f9b66', 0.7);
    for (let s = 0; s < 9; s++) {
      const a = s * 0.7, len = h * 0.55;
      const st = mesh(shared(`gstem-${k(len)}`, () => new THREE.CylinderGeometry(0.0015, 0.0015, len, 5).translate(0, len / 2, 0)), stems, undefined, false);
      st.position.set(0, vaseH * 0.6, 0); st.rotation.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35); g.add(st);
    }
    g.add(at(mesh(petalCluster(21, 160, headR, 0.006, 'floret'), flowers, 'flowers', true, false), 0, vaseH + h * 0.25, 0));
  } else {
    const count = kind === 'hydrangea' ? 420 : kind === 'peony' ? 9 : 13;
    const bloom = kind === 'hydrangea' ? 0.016 : kind === 'peony' ? 0.055 : 0.04;
    g.add(at(mesh(petalCluster(kind.length * 13, count, headR * 0.72, bloom, kind === 'hydrangea' ? 'floret' : 'rose'), flowers, 'flowers', true, false), 0, vaseH + headR * 0.25, 0));
    g.add(mesh(leaves(kind.length, 14, headR * 2, vaseH * 0.95, 1.2), green, undefined, true, false));
  }
  return g;
}

function dispenser(i: Item): THREE.Group {
  const [w, h] = i.size, g = new THREE.Group(), r = w * 0.42;
  const stand = M.solid(fin(i, 'stand'));
  const standH = h * 0.14, jarH = h * 0.72;
  // Metal stand
  g.add(at(mesh(shared(`dring-${k(r)}`, () => new THREE.TorusGeometry(r * 1.02, 0.004, 8, 48).rotateX(Math.PI / 2)), stand), 0, standH, 0));
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(at(mesh(shared(`dleg-${k(standH)}`, () => new THREE.CylinderGeometry(0.004, 0.004, standH, 8).translate(0, standH / 2, 0)), stand), Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const base = standH + 0.004;
  const jar = lathe(`jar-${k(r)}-${k(jarH)}`, [[0, 0], [r * 0.95, 0], [r, 0.01], [r, jarH * 0.92], [r * 0.9, jarH], [r * 0.85, jarH], [r * 0.85, jarH * 0.94], [r - 0.004, jarH * 0.9], [r - 0.004, 0.012], [0, 0.012]], 48);
  g.add(at(mesh(jar, M.glass(false)), 0, base, 0));
  const liq = lathe(`jarliq-${k(r)}-${k(jarH)}`, [[0, 0.013], [r - 0.006, 0.013], [r - 0.006, jarH * 0.7], [0, jarH * 0.7]], 40);
  const lf = fin(i, 'liquid', { color: '#f5c542' });
  g.add(at(mesh(liq, M.plain(lf.color, 0.15, { emissive: lf.color, emissiveIntensity: 0.18 }), 'liquid'), 0, base, 0));
  const slice = M.plain('#ffffff', 0.45, { map: citrusTexture('#e9c925', '#f6e27a') });
  const sg = shared('dslice', () => new THREE.CylinderGeometry(0.03, 0.03, 0.005, 24));
  const rand = rng(4);
  for (let n = 0; n < 7; n++) {
    const s = mesh(sg, slice, undefined, false, false), a = n * 2.1, rr = (r - 0.04) * (0.3 + rand() * 0.7);
    s.position.set(Math.cos(a) * rr, base + 0.04 + (n / 7) * jarH * 0.6, Math.sin(a) * rr); s.rotation.set(Math.PI / 2 + rand() - 0.5, rand() * 3, 0); g.add(s);
  }
  // Lid with knob, and the tap
  g.add(at(mesh(lathe(`jarlid-${k(r)}`, [[0, 0], [r * 0.88, 0], [r * 0.85, 0.02], [0.012, 0.03], [0.016, 0.045], [0, 0.05]], 40), M.glass(false)), 0, base + jarH, 0));
  const tap = new THREE.Group();
  tap.add(mesh(shared('tapbody', () => new THREE.CylinderGeometry(0.01, 0.01, 0.04, 14).rotateX(Math.PI / 2)), M.metal('#d8dadd', 0.2)));
  tap.add(at(mesh(shared('tapspout', () => new THREE.CylinderGeometry(0.006, 0.006, 0.03, 12)), M.metal('#d8dadd', 0.2)), 0, -0.015, 0.016));
  g.add(at(tap, 0, base + 0.035, r + 0.015));
  return g;
}

function sign(i: Item, frame: boolean): THREE.Group {
  const [w, h, d] = i.size, g = new THREE.Group();
  const face = fin(i, 'main');
  const card = face.texture ? M.solid(face) : M.plain('#ffffff', 0.7, { map: cardTexture(), color: face.color });
  const border = frame ? 0.025 : 0.006;
  const lean = frame ? 0.18 : 0;
  const board = new THREE.Group();
  if (frame) {
    board.add(at(mesh(shared(`frame-${k(w)}-${k(h)}`, () => new RoundedBoxGeometry(w, h, 0.02, 2, 0.003).translate(0, h / 2, 0)), M.solid(fin(i, 'frame')), 'frame'), 0, 0, 0));
    board.add(at(mesh(shared(`card-${k(w)}-${k(h)}`, () => new THREE.PlaneGeometry(w - border * 2, h - border * 2).translate(0, h / 2, 0)), card, 'main', false), 0, 0, 0.0105));
    board.rotation.x = -lean;
    g.add(board);
    // Easel leg behind
    const leg = mesh(shared(`easel-${k(h)}`, () => new THREE.BoxGeometry(0.02, h * 0.9, 0.01).translate(0, h * 0.45, 0)), M.solid(fin(i, 'frame')));
    leg.position.set(0, 0, -d * 0.55); leg.rotation.x = 0.35; g.add(leg);
  } else {
    // Acrylic table-tent with a gold base, like the per-cocktail signs on the reference bar.
    const base = mesh(shared(`signbase-${k(w)}-${k(d)}`, () => new RoundedBoxGeometry(w, 0.02, d, 2, 0.004).translate(0, 0.01, 0)), M.solid(fin(i, 'frame')), 'frame');
    g.add(base);
    g.add(at(mesh(shared(`signcard-${k(w)}-${k(h)}`, () => new THREE.PlaneGeometry(w - 0.02, h - 0.04).translate(0, (h - 0.04) / 2 + 0.03, 0)), card, 'main', false), 0, 0, 0.0025));
    g.add(at(mesh(shared(`acrylic-${k(w)}-${k(h)}`, () => new THREE.BoxGeometry(w, h - 0.02, 0.004).translate(0, (h - 0.02) / 2 + 0.02, 0)), M.glass(false)), 0, 0, 0));
  }
  return g;
}

function curtain(i: Item): THREE.Group {
  const [w, h, d] = i.size, g = new THREE.Group();
  // Pleats: sinusoidal folds with a slight random sway, hanging from a rod.
  const geom = shared(`curtain-${k(w)}-${k(h)}-${k(d)}`, () => {
    const pg = new THREE.PlaneGeometry(w, h, Math.round(w * 60), 24);
    const p = pg.attributes.position, uv = pg.attributes.uv, r = rng(2);
    const phase = Array.from({ length: 64 }, () => r() * 0.4);
    for (let n = 0; n < p.count; n++) {
      const x = p.getX(n), y = p.getY(n), t = (y + h / 2) / h;
      const pleat = Math.sin(x * 44 + phase[Math.floor((x / w + 0.5) * 63)] * 6) * (d * 0.32) * (0.75 + 0.25 * (1 - t));
      p.setZ(n, pleat); p.setY(n, y + h / 2);
      uv.setXY(n, x + w / 2, y + h / 2);
    }
    pg.computeVertexNormals();
    return pg;
  });
  g.add(at(mesh(geom, M.fabric({ ...fin(i, 'main'), texture: fin(i, 'main').texture ?? 'satin' }), 'main', false, true), 0, 0, 0));
  g.add(at(mesh(shared(`rod-${k(w)}`, () => new THREE.CylinderGeometry(0.012, 0.012, w + 0.1, 12).rotateZ(Math.PI / 2)), M.metal('#c4a062', 0.3)), 0, h + 0.01, 0));
  return g;
}

function wall(i: Item, arch: boolean): THREE.Group {
  const [w, h, d] = i.size, g = new THREE.Group();
  let geom: THREE.BufferGeometry;
  if (arch) geom = shared(`arch-${k(w)}-${k(h)}-${k(d)}`, () => {
    const s = new THREE.Shape(), r = w / 2;
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
    return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, -d / 2);
  });
  else geom = shared(`wall-${k(w)}-${k(h)}-${k(d)}`, () => metreUVs(new THREE.BoxGeometry(w, h, d)).translate(0, h / 2, 0));
  g.add(mesh(geom, M.solid(fin(i, 'main')), 'main', true, true));
  return g;
}

function garland(i: Item): THREE.Group {
  const [w] = i.size, g = new THREE.Group();
  const geom = shared(`garland-${k(w)}`, () => {
    const r = rng(8), parts: THREE.BufferGeometry[] = [];
    const s = new THREE.Shape();
    // Round eucalyptus leaves
    s.absellipse(0, 0.02, 0.016, 0.02, 0, Math.PI * 2, false, 0);
    const leaf = new THREE.ShapeGeometry(s, 10);
    const n = Math.round(w * 90);
    for (let j = 0; j < n; j++) {
      const x = (j / n - 0.5) * w, z = Math.sin(x * 6) * 0.04;
      parts.push(leaf.clone().scale(0.7 + r() * 0.6, 0.7 + r() * 0.6, 1).rotateX(-Math.PI / 2 + (r() - 0.5) * 1.6).rotateY(r() * Math.PI * 2).translate(x, 0.004 + r() * 0.03, z + (r() - 0.5) * 0.08));
    }
    return mergeGeometries(parts)!;
  });
  g.add(mesh(geom, M.solid({ ...fin(i, 'leaves'), roughness: 0.7 }, { side: THREE.DoubleSide }), 'leaves', true, false));
  return g;
}

function strawHolder(i: Item): THREE.Group {
  const [w, h] = i.size, g = new THREE.Group(), r = w / 2;
  g.add(mesh(lathe(`spot-${k(r)}-${k(h)}`, [[0, 0], [r, 0], [r, h * 0.55], [r - 0.003, h * 0.55], [r - 0.003, 0.004], [0, 0.004]], 32), M.solid(fin(i, 'main')), 'main'));
  const straw = shared(`straws-${k(r)}-${k(h)}`, () => {
    const parts: THREE.BufferGeometry[] = [], rr = rng(6);
    for (let n = 0; n < 14; n++) {
      const a = n * 2.39, d = Math.sqrt(n / 14) * (r - 0.008);
      parts.push(new THREE.CylinderGeometry(0.003, 0.003, h, 6).translate(0, h / 2, 0).rotateX((rr() - 0.5) * 0.15).rotateZ((rr() - 0.5) * 0.15).translate(Math.cos(a) * d, 0.004, Math.sin(a) * d));
    }
    return mergeGeometries(parts)!;
  });
  g.add(mesh(straw, M.plain('#111113', 0.4)));
  return g;
}

function napkinBox(i: Item): THREE.Group {
  const [w, h, d] = i.size, g = new THREE.Group();
  g.add(mesh(shared(`nbox-${k(w)}-${k(h)}-${k(d)}`, () => new RoundedBoxGeometry(w, h, d, 2, 0.004).translate(0, h / 2, 0)), M.solid(fin(i, 'main')), 'main'));
  g.add(at(mesh(shared(`napk-${k(w)}-${k(d)}`, () => new THREE.BoxGeometry(w - 0.012, 0.012, d - 0.012)), M.solid(fin(i, 'napkins')), 'napkins'), 0, h + 0.004, 0));
  return g;
}

function candle(i: Item): THREE.Group {
  const [w, h] = i.size, g = new THREE.Group(), r = w / 2;
  g.add(mesh(lathe(`photo-${k(r)}-${k(h)}`, [[0, 0], [r, 0], [r, h], [r - 0.003, h], [r - 0.003, 0.006], [0, 0.006]], 32), M.glass(false)));
  g.add(at(mesh(shared(`wax-${k(r)}`, () => new THREE.CylinderGeometry(r * 0.6, r * 0.6, h * 0.45, 24).translate(0, h * 0.225, 0)), M.solid(fin(i, 'main')), 'main'), 0, 0.006, 0));
  const flame = mesh(shared('flame', () => new THREE.SphereGeometry(0.006, 10, 8).scale(1, 2.2, 1)), M.plain('#ffcf7a', 1, { emissive: '#ffb347', emissiveIntensity: 3 }), undefined, false, false);
  g.add(at(flame, 0, h * 0.45 + 0.02, 0));
  return g;
}

/**
 * Champagne tower: square levels of coupes, each resting on the rims below. Every coupe part is
 * merged into one mesh per material, so a 55-glass tower costs three draw calls.
 */
function tower(i: Item): THREE.Group {
  const levels = i.steps ?? 4, g = new THREE.Group();
  const liquid = fin(i, 'liquid', { color: '#ecd489' }).color;
  const coupe = buildDrink({ glass: 'coupe', fill: 0.8, layers: [{ color: liquid, at: 0 }, { color: '#f6e7b0', at: 1 }], garnish: ['gold-rim'] }, 1, fin(i, 'glass'));
  coupe.updateMatrixWorld(true);
  const parts: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
  coupe.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) parts.push({ mesh: m, matrix: m.matrixWorld.clone() }); });
  const pitch = 0.113, rise = 0.128;
  const placements: THREE.Matrix4[] = [];
  for (let l = 0; l < levels; l++) {
    const n = levels - l;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) placements.push(new THREE.Matrix4().makeTranslation((a - (n - 1) / 2) * pitch, l * rise, (b - (n - 1) / 2) * pitch));
  }
  const key = `tower-${levels}-${liquid}`;
  parts.forEach((p, idx) => {
    const geom = shared(key + '-' + idx, () => mergeGeometries(placements.map(m => p.mesh.geometry.clone().applyMatrix4(m.clone().multiply(p.matrix))))!);
    const m = mesh(geom, p.mesh.material, idx === 0 ? 'glass' : 'liquid', idx < 2, false);
    g.add(m);
  });
  return g;
}

function candelabra(i: Item): THREE.Group {
  const [w, h] = i.size, g = new THREE.Group(), gold = M.solid(fin(i, 'main'));
  const armH = h * 0.62, reach = w / 2 - 0.03;
  g.add(mesh(lathe(`cand-base-${k(h)}`, [[0, 0], [0.07, 0], [0.072, 0.012], [0.03, 0.03], [0.018, 0.06], [0.012, armH], [0.03, armH + 0.01], [0, armH + 0.02]], 32), gold, 'main'));
  const cups: [number, number][] = [[0, armH + 0.02]];
  for (const side of [-1, 1]) for (const [r, lift] of [[reach * 0.5, 0.03], [reach, -0.01]] as const) {
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, armH * 0.72, 0), new THREE.Vector3(side * r * 0.2, armH * 0.55, 0), new THREE.Vector3(side * r, armH * 0.6, 0), new THREE.Vector3(side * r, armH + lift, 0));
    g.add(mesh(shared(`arm-${side}-${k(r)}-${k(armH)}`, () => new THREE.TubeGeometry(curve, 24, 0.006, 8)), gold, 'main'));
    cups.push([side * r, armH + lift]);
  }
  const candleH = h - armH - 0.06;
  for (const [x, y] of cups) {
    g.add(at(mesh(lathe('cand-cup', [[0, 0], [0.012, 0], [0.024, 0.02], [0.022, 0.024], [0, 0.024]], 24), gold, 'main'), x, y, 0));
    g.add(at(mesh(shared(`candle-${k(candleH)}`, () => new THREE.CylinderGeometry(0.011, 0.011, candleH, 16).translate(0, candleH / 2, 0)), M.solid(fin(i, 'candles')), 'candles'), x, y + 0.02, 0));
    g.add(at(mesh(shared('flame', () => new THREE.SphereGeometry(0.006, 10, 8).scale(1, 2.2, 1)), M.plain('#ffcf7a', 1, { emissive: '#ffb347', emissiveIntensity: 3 }), undefined, false, false), x, y + 0.03 + candleH, 0));
  }
  return g;
}

function iceBucket(i: Item): THREE.Group {
  const [w, h] = i.size, g = new THREE.Group(), r = w / 2;
  const steel = M.solid(fin(i, 'main'));
  g.add(mesh(lathe(`bucket-${k(r)}-${k(h)}`, [[0, 0], [r * 0.78, 0], [r * 0.8, h * 0.05], [r * 0.95, h * 0.9], [r, h * 0.93], [r * 0.97, h * 0.96], [r * 0.93, h * 0.96], [r * 0.9, h * 0.1], [0, h * 0.1]], 48), steel, 'main'));
  // Champagne bottle, tilted in the ice, with a gold foil neck.
  const bottle = new THREE.Group();
  bottle.add(mesh(lathe('bottle', [[0, 0], [0.037, 0], [0.038, 0.2], [0.03, 0.24], [0.014, 0.28], [0.014, 0.31], [0, 0.31]], 32), M.plain('#173322', 0.15, { metalness: 0.2 })));
  bottle.add(at(mesh(lathe('foil', [[0.0145, 0], [0.0155, 0.06], [0.009, 0.075], [0, 0.077]], 24), M.metal('#d9b766', 0.3)), 0, 0.25, 0));
  bottle.position.set(-r * 0.15, h * 0.12, 0); bottle.rotation.z = 0.22;
  g.add(bottle);
  const ice = M.ice(), cube = shared('bucket-ice', () => new THREE.BoxGeometry(0.03, 0.03, 0.03)), rand = rng(17);
  for (let n = 0; n < 16; n++) { const a = n * 2.4, d = r * (0.35 + rand() * 0.45); const c = at(mesh(cube, ice, undefined, false, false), Math.cos(a) * d, h * 0.82 + rand() * 0.04, Math.sin(a) * d); c.rotation.set(rand() * 3, rand() * 3, 0); g.add(c); }
  return g;
}

export function buildObject(i: Item): THREE.Group {
  switch (i.type) {
    case 'table': return table(i);
    case 'riser': return riser(i);
    case 'decor':
      switch (i.ref) {
        case 'bouquet-hydrangea': return bouquet(i, 'hydrangea');
        case 'bouquet-peony': return bouquet(i, 'peony');
        case 'bouquet-rose': return bouquet(i, 'rose');
        case 'gypsophila': return bouquet(i, 'gyps');
        case 'dispenser': return dispenser(i);
        case 'sign-a5': return sign(i, false);
        case 'frame-a3': return sign(i, true);
        case 'backdrop-curtain': return curtain(i);
        case 'backdrop-wall': return wall(i, false);
        case 'backdrop-arch': return wall(i, true);
        case 'garland': return garland(i);
        case 'straw-holder': return strawHolder(i);
        case 'napkin-box': return napkinBox(i);
        case 'candle': return candle(i);
        case 'tower-3': case 'tower-5': return tower(i);
        case 'candelabra': return candelabra(i);
        case 'ice-bucket': return iceBucket(i);
      }
  }
  // Unknown or migrated objects: a plain block of the stored size.
  const [w, h, d] = i.size, g = new THREE.Group();
  g.add(mesh(shared(`plain-${k(w)}-${k(h)}-${k(d)}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)), M.solid(fin(i, 'main', { color: '#cccccc' })), 'main'));
  return g;
}
