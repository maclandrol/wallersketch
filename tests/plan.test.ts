import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSVG, inTableFrame } from '../src/plan';
import { createItem } from '../src/core/scene';
import { emptyState } from '../src/core/document';

test('plan positions come from geometry, in the table frame, including rotation', () => {
  const t = { ...createItem('rect-180', [2, 0, 1]), rotation: Math.PI / 2 };
  // A riser 30 cm from the left edge along the table's length and 20 cm from the back.
  const lx = -0.9 + 0.3, lz = -0.375 + 0.2;
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  const r = { ...createItem('cube-20', [2 + lx * c + lz * s, 0.75, 1 - lx * s + lz * c]), parentId: t.id, rotation: t.rotation };
  const [a, b] = inTableFrame(r, t);
  assert.ok(Math.abs(a - 0.3) < 1e-9 && Math.abs(b - 0.2) < 1e-9);
  const svg = planSVG({ ...emptyState('Test <&>'), items: [t, r, createItem('sunrise', [2, 0.95, 1])] }, new Date(2026, 10, 6));
  assert.match(svg, /180 × 75 cm · h 75/);
  assert.match(svg, /à 30 cm du bord gauche, 20 cm du fond/);
  assert.match(svg, /Cube 20 : 20 × 20 · h 20 cm/);
  assert.match(svg, /Test &lt;&amp;&gt;/);
  assert.ok(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>') && !/<script/i.test(svg));
});
