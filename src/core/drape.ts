// Cloth settling by position-based dynamics. A finite piece of fabric is dropped flat from above
// its supports and settles under gravity with distance constraints (stretch, shear, bending),
// friction and collisions against the support solids and the floor. Material length is preserved
// by the constraints, so the size of the piece determines how far it falls.

export interface Collider {
  kind: 'box' | 'cylinder' | 'taper';
  x: number; z: number; yaw: number;
  bottom: number; top: number;
  /** Half extents in x/z at the bottom (box, taper) or radii (cylinder). */
  hx: number; hz: number;
  /** Taper: scale of the half extents at the top. */
  topScale?: number;
  /** Edge rounding, so cloth triangles wrap a corner instead of cutting through it. */
  round?: number;
}

export interface DrapeInput {
  shape: 'rect' | 'round';
  width: number; depth: number;
  x: number; z: number; yaw: number;
  colliders: Collider[];
  /** Extra clearance so stacked fabric pieces never share a surface. */
  clearance?: number;
  /** Upper bound on particle count, to trade quality for speed. */
  maxParticles?: number;
}

export interface DrapeResult {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Hem vertex loop, for outlines and plans. */
  steps: number;
  ms: number;
}

interface ClothMesh {
  local: Float32Array; // rest positions x, z in the fabric frame
  uvs: Float32Array;
  indices: number[];
  constraints: number[]; // a, b pairs
  rest: number[];
  stiffness: number[];
}

function buildRect(w: number, d: number, maxParticles: number): ClothMesh {
  const sp = Math.max(0.012, Math.sqrt((w * d) / maxParticles));
  const nx = Math.max(2, Math.round(w / sp)), nz = Math.max(2, Math.round(d / sp));
  const cols = nx + 1, rows = nz + 1, local = new Float32Array(cols * rows * 2), uvs = new Float32Array(cols * rows * 2);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    local[k * 2] = (i / nx - 0.5) * w; local[k * 2 + 1] = (j / nz - 0.5) * d;
    uvs[k * 2] = (i / nx) * w; uvs[k * 2 + 1] = (j / nz) * d;
  }
  const m: ClothMesh = { local, uvs, indices: [], constraints: [], rest: [], stiffness: [] };
  const idx = (i: number, j: number) => j * cols + i;
  const link = (a: number, b: number, k: number) => {
    m.constraints.push(a, b);
    m.rest.push(Math.hypot(local[a * 2] - local[b * 2], local[a * 2 + 1] - local[b * 2 + 1]));
    m.stiffness.push(k);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (i < nx) link(idx(i, j), idx(i + 1, j), 1);
    if (j < nz) link(idx(i, j), idx(i, j + 1), 1);
    if (i < nx && j < nz) {
      link(idx(i, j), idx(i + 1, j + 1), 0.6); link(idx(i + 1, j), idx(i, j + 1), 0.6);
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), e = idx(i, j + 1);
      if ((i + j) % 2) m.indices.push(a, e, b, b, e, c); else m.indices.push(a, e, c, a, c, b);
    }
    if (i < nx - 1) link(idx(i, j), idx(i + 2, j), 0.12);
    if (j < nz - 1) link(idx(i, j), idx(i, j + 2), 0.12);
  }
  return m;
}

/** Polar mesh for round cloths: a clean circular hem without a staircase edge. */
function buildRound(radius: number, maxParticles: number): ClothMesh {
  const rings = Math.max(6, Math.round(Math.sqrt(maxParticles / Math.PI)));
  const dr = radius / rings;
  const pts: number[] = [0, 0], ringStart: number[] = [0], ringCount: number[] = [1];
  for (let r = 1; r <= rings; r++) {
    const n = Math.max(8, Math.round((2 * Math.PI * r * dr) / dr));
    ringStart.push(pts.length / 2); ringCount.push(n);
    for (let s = 0; s < n; s++) { const a = (s / n) * Math.PI * 2; pts.push(Math.cos(a) * r * dr, Math.sin(a) * r * dr); }
  }
  const local = new Float32Array(pts), uvs = new Float32Array(local.length);
  for (let k = 0; k < local.length; k += 2) { uvs[k] = local[k] + radius; uvs[k + 1] = local[k + 1] + radius; }
  const m: ClothMesh = { local, uvs, indices: [], constraints: [], rest: [], stiffness: [] };
  const link = (a: number, b: number, k: number) => {
    m.constraints.push(a, b);
    m.rest.push(Math.hypot(local[a * 2] - local[b * 2], local[a * 2 + 1] - local[b * 2 + 1]));
    m.stiffness.push(k);
  };
  const angle = (k: number) => Math.atan2(local[k * 2 + 1], local[k * 2]);
  const nearest = (ring: number, a: number) => {
    const n = ringCount[ring];
    return ringStart[ring] + ((Math.round(((a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2)) * n) % n) + n) % n;
  };
  for (let r = 1; r <= rings; r++) {
    const s0 = ringStart[r], n = ringCount[r];
    for (let s = 0; s < n; s++) {
      const a = s0 + s, b = s0 + ((s + 1) % n);
      link(a, b, 1);
      link(a, s0 + ((s + 2) % n), 0.12);
      const inner = r === 1 ? 0 : nearest(r - 1, angle(a));
      link(a, inner, 1);
      if (r > 1) { link(a, nearest(r - 1, angle(b)), 0.6); }
      if (r > 1 && r - 2 >= 0) link(a, r === 2 ? 0 : nearest(r - 2, angle(a)), 0.12);
    }
    // Triangulate the strip between ring r-1 and r by walking both rings in angle order.
    if (r === 1) { for (let s = 0; s < n; s++) m.indices.push(0, s0 + ((s + 1) % n), s0 + s); continue; }
    const p0 = ringStart[r - 1], pn = ringCount[r - 1];
    let i = 0, o = 0;
    while (i < pn || o < n) {
      const ai = ((i + 0.5) / pn), ao = ((o + 0.5) / n);
      if (o < n && (i >= pn || ao <= ai)) { m.indices.push(p0 + (i % pn), s0 + ((o + 1) % n), s0 + (o % n)); o++; }
      else { m.indices.push(p0 + (i % pn), p0 + ((i + 1) % pn), s0 + (o % n)); i++; }
    }
  }
  return m;
}

// Signed distance to a collider in world space (negative inside).
function sdf(c: Collider, x: number, y: number, z: number): number {
  const r = c.round ?? 0;
  if (!(r > 0)) return sharp(c, x, y, z);
  // Tops stay exact; sides move out by r so the rounded edge still contains the real corner.
  const inner = (c as Collider & { _inner?: Collider })._inner ??= { ...c, round: 0, bottom: c.bottom + r, top: c.top - r };
  return sharp(inner, x, y, z) - r;
}

function sharp(c: Collider, x: number, y: number, z: number): number {
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), dx = x - c.x, dz = z - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const hy = (c.top - c.bottom) / 2, ly = y - (c.bottom + hy);
  const qy = Math.abs(ly) - hy;
  let q2: number;
  if (c.kind === 'cylinder') {
    const k = Math.hypot(lx / c.hx, lz / c.hz);
    q2 = (k - 1) * Math.min(c.hx, c.hz);
  } else {
    let hx = c.hx, hz = c.hz;
    if (c.kind === 'taper') {
      const t = Math.min(1, Math.max(0, (y - c.bottom) / (c.top - c.bottom)));
      const s = 1 + ((c.topScale ?? 1) - 1) * t;
      hx *= s; hz *= s;
    }
    const qx = Math.abs(lx) - hx, qz = Math.abs(lz) - hz;
    q2 = qx > 0 || qz > 0 ? Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) : Math.max(qx, qz);
  }
  return q2 > 0 || qy > 0 ? Math.hypot(Math.max(q2, 0), Math.max(qy, 0)) : Math.max(q2, qy);
}

export function maxTop(colliders: Collider[]) { return colliders.reduce((m, c) => Math.max(m, c.top), 0); }

export function drape(input: DrapeInput): DrapeResult {
  const t0 = performance.now();
  const clearance = 0.004 + (input.clearance ?? 0);
  const mesh = input.shape === 'round'
    ? buildRound(input.width / 2, input.maxParticles ?? 5000)
    : buildRect(input.width, input.depth, input.maxParticles ?? 5000);
  const n = mesh.local.length / 2;
  // Round collider edges by about one particle spacing. Triangles then wrap the edge instead of
  // cutting across it, which would let the solid's corner show through the cloth.
  const spacing = Math.sqrt((input.width * input.depth) / n);
  input = { ...input, colliders: input.colliders.map(c => ({ ...c, round: Math.min(spacing * 0.9, (c.top - c.bottom) * 0.4) })) };
  const pos = new Float32Array(n * 3), prev = new Float32Array(n * 3);
  const cs = Math.cos(input.yaw), sn = Math.sin(input.yaw);
  const startY = maxTop(input.colliders) + 0.02 + clearance;
  for (let k = 0; k < n; k++) {
    const lx = mesh.local[k * 2], lz = mesh.local[k * 2 + 1];
    pos[k * 3] = prev[k * 3] = input.x + lx * cs + lz * sn;
    pos[k * 3 + 1] = prev[k * 3 + 1] = startY;
    pos[k * 3 + 2] = prev[k * 3 + 2] = input.z - lx * sn + lz * cs;
  }
  const cons = Int32Array.from(mesh.constraints), rest = Float32Array.from(mesh.rest), stiff = Float32Array.from(mesh.stiffness);
  const m = rest.length;
  // Broad phase: expanded bounds of each collider in world xz.
  const cols = input.colliders.map(c => {
    const r = Math.hypot(c.hx, c.hz) * Math.max(1, c.topScale ?? 1) + (c.round ?? 0) + clearance + 0.02;
    return { c, x0: c.x - r, x1: c.x + r, z0: c.z - r, z1: c.z + r, top: c.top + clearance + 0.02 };
  });

  const dt = 1 / 240, g = 9.81 * dt * dt, damping = 0.985, eps = 0.0008, passes = 5;
  const maxSteps = 700, minSteps = 200;
  let step = 0;
  for (; step < maxSteps; step++) {
    // Integrate.
    let motion = 0;
    for (let k = 0; k < n * 3; k += 3) {
      for (let a = 0; a < 3; a++) {
        const p = pos[k + a], v = (p - prev[k + a]) * damping;
        prev[k + a] = p;
        pos[k + a] = p + v - (a === 1 ? g : 0);
        motion = Math.max(motion, Math.abs(v));
      }
    }
    // Constraints (Gauss-Seidel). Stretch links get extra passes to limit sagging strain.
    for (let pass = 0; pass < passes; pass++) for (let e = 0; e < m; e++) {
      if (pass > 0 && stiff[e] < 1) continue;
      const a = cons[e * 2] * 3, b = cons[e * 2 + 1] * 3;
      const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      let diff = (len - rest[e]) / len;
      // Bending and shear links only resist compression weakly, so folds can form.
      if (stiff[e] < 1 && diff < 0) diff *= 0.5;
      const f = 0.5 * stiff[e] * diff;
      pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
      pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
    }
    // Collisions with friction.
    for (let k = 0; k < n * 3; k += 3) {
      const x = pos[k], z = pos[k + 2];
      let y = pos[k + 1];
      if (y < clearance) {
        pos[k + 1] = y = clearance;
        prev[k] += (x - prev[k]) * 0.8; prev[k + 2] += (z - prev[k + 2]) * 0.8; prev[k + 1] = y;
      }
      for (const b of cols) {
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y > b.top) continue;
        const d = sdf(b.c, x, y, z);
        if (d >= clearance) continue;
        const gx = sdf(b.c, x + eps, y, z) - sdf(b.c, x - eps, y, z);
        const gy = sdf(b.c, x, y + eps, z) - sdf(b.c, x, y - eps, z);
        const gz = sdf(b.c, x, y, z + eps) - sdf(b.c, x, y, z - eps);
        const gl = Math.hypot(gx, gy, gz) || 1;
        const push = clearance - d, nx = gx / gl, ny = gy / gl, nz = gz / gl;
        pos[k] += nx * push; pos[k + 1] += ny * push; pos[k + 2] += nz * push;
        // Strong static friction on tops, light friction on sides.
        const mu = ny > 0.6 ? 0.9 : 0.25;
        prev[k] += (pos[k] - prev[k]) * mu; prev[k + 2] += (pos[k + 2] - prev[k + 2]) * mu;
        if (ny > 0.6) prev[k + 1] = pos[k + 1];
      }
    }
    if (step > minSteps && motion < 1e-5) break;
  }
  // Final projection so nothing renders inside a solid.
  for (let k = 0; k < n * 3; k += 3) {
    if (pos[k + 1] < clearance) pos[k + 1] = clearance;
    for (const b of cols) {
      const d = sdf(b.c, pos[k], pos[k + 1], pos[k + 2]);
      if (d < clearance * 0.75) {
        const gy = sdf(b.c, pos[k], pos[k + 1] + eps, pos[k + 2]) - sdf(b.c, pos[k], pos[k + 1] - eps, pos[k + 2]);
        const gx = sdf(b.c, pos[k] + eps, pos[k + 1], pos[k + 2]) - sdf(b.c, pos[k] - eps, pos[k + 1], pos[k + 2]);
        const gz = sdf(b.c, pos[k], pos[k + 1], pos[k + 2] + eps) - sdf(b.c, pos[k], pos[k + 1], pos[k + 2] - eps);
        const gl = Math.hypot(gx, gy, gz) || 1, push = clearance - d;
        pos[k] += gx / gl * push; pos[k + 1] += gy / gl * push; pos[k + 2] += gz / gl * push;
      }
    }
  }
  return { positions: pos, uvs: mesh.uvs, indices: Uint32Array.from(mesh.indices), steps: step, ms: performance.now() - t0 };
}

export { sdf as colliderDistance };
