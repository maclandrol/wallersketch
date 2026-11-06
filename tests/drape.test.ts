import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drape, colliderDistance, type Collider } from '../src/core/drape';

const table: Collider = { kind: 'box', x: 0, z: 0, yaw: 0, bottom: 0, top: 0.75, hx: 0.9, hz: 0.375 };

function check(colliders: Collider[], r: ReturnType<typeof drape>) {
  let minY = Infinity, worst = Infinity;
  for (let k = 0; k < r.positions.length; k += 3) {
    const [x, y, z] = [r.positions[k], r.positions[k + 1], r.positions[k + 2]];
    minY = Math.min(minY, y);
    for (const c of colliders) worst = Math.min(worst, colliderDistance(c, x, y, z));
  }
  return { minY, worst };
}

function strain(r: ReturnType<typeof drape>) {
  let worst = 0, sum = 0, n = 0;
  const p = r.positions, I = r.indices, u = r.uvs;
  for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]]]) {
    const l = Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
    const l0 = Math.hypot(u[a * 2] - u[b * 2], u[a * 2 + 1] - u[b * 2 + 1]);
    if (l0 > 0) { const s = l / l0; worst = Math.max(worst, s); sum += s; n++; }
  }
  return { worst, mean: sum / n };
}
function spread(r: ReturnType<typeof drape>) {
  // Max length of the outer hem vs. the cloth's width: fabric must not grow.
  let maxX = -Infinity, minX = Infinity;
  for (let k = 0; k < r.positions.length; k += 3) { maxX = Math.max(maxX, r.positions[k]); minX = Math.min(minX, r.positions[k]); }
  return maxX - minX;
}

test('rectangular cloth settles over a table and risers without penetration', () => {
  const risers: Collider[] = [
    { kind: 'box', x: -0.5, z: 0, yaw: 0, bottom: 0.75, top: 1.05, hx: 0.15, hz: 0.15 },
    { kind: 'cylinder', x: 0.2, z: 0.05, yaw: 0, bottom: 0.75, top: 0.95, hx: 0.15, hz: 0.15 },
    { kind: 'taper', x: 0.6, z: -0.1, yaw: 0.4, bottom: 0.75, top: 1.2, hx: 0.25, hz: 0.2, topScale: 0.7 },
  ];
  const cols = [table, ...risers];
  const r = drape({ shape: 'rect', width: 3.2, depth: 1.8, x: 0, z: 0, yaw: 0, colliders: cols });
  const { minY, worst } = check(cols, r);
  console.log('strain', strain(r));console.log('rect', r.steps, 'steps', r.ms.toFixed(0), 'ms', r.positions.length / 3, 'particles', 'minY', minY.toFixed(3), 'worst', worst.toFixed(4));
  assert.ok(minY > 0, 'stays above the floor');
  assert.ok(worst > 0, 'never inside a solid: ' + worst);
  // A 3.2 m cloth over a 1.8 m table cannot spread wider than 3.2 m.
  assert.ok(spread(r) <= 3.2 * 1.03);
});

test('long cloth reaches the floor and stops there', () => {
  const r = drape({ shape: 'rect', width: 4, depth: 2.2, x: 0, z: 0, yaw: 0.3, colliders: [table] });
  const { minY } = check([table], r);
  assert.ok(minY > 0.0 && minY < 0.02, 'touches the floor: ' + minY);
});

test('round cloth over a round table', () => {
  const t: Collider = { kind: 'cylinder', x: 0, z: 0, yaw: 0, bottom: 0, top: 0.75, hx: 0.6, hz: 0.6 };
  const r = drape({ shape: 'round', width: 2.4, depth: 2.4, x: 0, z: 0, yaw: 0, colliders: [t] });
  const { worst, minY } = check([t], r);
  console.log('strain', strain(r));console.log('round', r.steps, r.ms.toFixed(0), 'ms', 'minY', minY.toFixed(3));
  assert.ok(worst > 0, 'never inside: ' + worst);
  // Drop of a 2.4 m round cloth over a 1.2 m table is ~60 cm: hem ends ~15 cm above floor.
  assert.ok(minY > 0.05 && minY < 0.3, 'hem height ' + minY);
});
