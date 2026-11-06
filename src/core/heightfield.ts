// Fast "what is the highest cloth point under (x, z)" for settled fabric meshes. Triangles are
// bucketed on a horizontal grid so one query tests a handful of triangles instead of thousands.

export class SurfaceIndex {
  private cells = new Map<number, number[]>();
  private x0: number; private z0: number; private cols: number;

  constructor(private pos: Float32Array, private idx: Uint32Array, private cell = 0.05) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity;
    for (let k = 0; k < pos.length; k += 3) { x0 = Math.min(x0, pos[k]); x1 = Math.max(x1, pos[k]); z0 = Math.min(z0, pos[k + 2]); }
    this.x0 = x0; this.z0 = z0; this.cols = Math.max(1, Math.ceil((x1 - x0) / cell) + 1);
    for (let t = 0; t < idx.length; t += 3) {
      let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity;
      for (let v = 0; v < 3; v++) { const k = idx[t + v] * 3; ax = Math.min(ax, pos[k]); bx = Math.max(bx, pos[k]); az = Math.min(az, pos[k + 2]); bz = Math.max(bz, pos[k + 2]); }
      for (let i = this.ci(ax); i <= this.ci(bx); i++) for (let j = this.cj(az); j <= this.cj(bz); j++) {
        const key = j * this.cols + i;
        (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push(t);
      }
    }
  }

  private ci(x: number) { return Math.floor((x - this.x0) / this.cell); }
  private cj(z: number) { return Math.floor((z - this.z0) / this.cell); }

  /** Highest surface height at local (x, z), or -Infinity outside the cloth. */
  heightAt(x: number, z: number): number {
    const list = this.cells.get(this.cj(z) * this.cols + this.ci(x));
    if (!list) return -Infinity;
    const p = this.pos, I = this.idx;
    let best = -Infinity;
    for (const t of list) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const x1 = p[a], z1 = p[a + 2], x2 = p[b], z2 = p[b + 2], x3 = p[c], z3 = p[c + 2];
      const d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / d;
      const l2 = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      best = Math.max(best, l1 * p[a + 1] + l2 * p[b + 1] + l3 * p[c + 1]);
    }
    return best;
  }
}
