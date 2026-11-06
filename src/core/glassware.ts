// Glass profiles as revolved outlines. Points are [radius, height] in metres, from the
// centre of the foot to the rim. `bowl` is the height of the inner bottom where liquid starts.

export interface GlassProfile {
  id: string;
  name: string;
  outline: [number, number][];
  bowl: number;
  wall: number;
  /** Plastic cups are thinner and less reflective. */
  plastic?: boolean;
}

const stemmed = (foot: number, stemTop: number, bowl: [number, number][]): [number, number][] => [
  [0, 0], [foot, 0], [foot + 0.001, 0.003], [0.007, 0.006], [0.0038, 0.013], [0.0038, stemTop], ...bowl,
];

export const GLASSES: GlassProfile[] = [
  { id: 'highball', name: 'Highball', bowl: 0.009, wall: 0.0022,
    outline: [[0, 0], [0.034, 0], [0.0355, 0.004], [0.0375, 0.15]] },
  { id: 'collins', name: 'Collins', bowl: 0.011, wall: 0.002,
    outline: [[0, 0], [0.03, 0], [0.0315, 0.004], [0.0325, 0.185]] },
  { id: 'tumbler', name: 'Tumbler', bowl: 0.014, wall: 0.0028,
    outline: [[0, 0], [0.04, 0], [0.0415, 0.004], [0.0425, 0.092]] },
  { id: 'flute', name: 'Flûte', bowl: 0.098, wall: 0.0016,
    outline: stemmed(0.034, 0.086, [[0.009, 0.096], [0.02, 0.11], [0.028, 0.135], [0.031, 0.17], [0.03, 0.21], [0.0285, 0.235]]) },
  { id: 'stemless-flute', name: 'Flûte sans pied', bowl: 0.012, wall: 0.0018,
    outline: [[0, 0], [0.021, 0], [0.024, 0.008], [0.029, 0.05], [0.0315, 0.12], [0.0305, 0.2]] },
  { id: 'coupe', name: 'Coupe', bowl: 0.099, wall: 0.0016,
    outline: stemmed(0.04, 0.088, [[0.012, 0.096], [0.034, 0.106], [0.05, 0.12], [0.056, 0.137]]) },
  { id: 'martini', name: 'Martini', bowl: 0.102, wall: 0.0016,
    outline: stemmed(0.042, 0.095, [[0.007, 0.101], [0.058, 0.166]]) },
  { id: 'wine', name: 'Verre à vin', bowl: 0.094, wall: 0.0016,
    outline: stemmed(0.039, 0.082, [[0.013, 0.091], [0.034, 0.11], [0.0425, 0.14], [0.0415, 0.176], [0.0355, 0.212]]) },
  { id: 'goblet', name: 'Ballon', bowl: 0.084, wall: 0.0018,
    outline: stemmed(0.04, 0.072, [[0.016, 0.081], [0.04, 0.1], [0.05, 0.13], [0.049, 0.162], [0.045, 0.19]]) },
  { id: 'margarita', name: 'Margarita', bowl: 0.079, wall: 0.0017,
    outline: stemmed(0.04, 0.07, [[0.013, 0.076], [0.025, 0.085], [0.028, 0.096], [0.036, 0.104], [0.06, 0.117], [0.066, 0.142]]) },
  { id: 'hurricane', name: 'Hurricane', bowl: 0.032, wall: 0.002,
    outline: [[0, 0], [0.04, 0], [0.041, 0.004], [0.013, 0.009], [0.01, 0.02], [0.014, 0.03], [0.035, 0.07], [0.042, 0.108], [0.034, 0.158], [0.032, 0.19], [0.041, 0.228]] },
  { id: 'shot', name: 'Shot', bowl: 0.013, wall: 0.0022,
    outline: [[0, 0], [0.02, 0], [0.0215, 0.003], [0.0235, 0.066]] },
  { id: 'bubble-cup', name: 'Gobelet bubble tea', bowl: 0.002, wall: 0.0008, plastic: true,
    outline: [[0, 0], [0.032, 0], [0.033, 0.003], [0.045, 0.14]] },
];

const byId = new Map(GLASSES.map(g => [g.id, g]));
export const glassProfile = (id: string): GlassProfile => byId.get(id) ?? GLASSES[0];
export const hasGlass = (id: string) => byId.has(id);
/** Custom profiles (drink builder, assistant recipes, opened projects). */
export function registerGlass(g: GlassProfile) { byId.set(g.id, g); }
export const customGlasses = () => [...byId.values()].filter(g => !GLASSES.includes(g));

export function glassHeight(g: GlassProfile): number { return g.outline[g.outline.length - 1][1]; }
export function glassRadius(g: GlassProfile): number { return Math.max(...g.outline.map(p => p[0])); }
export function glassFootRadius(g: GlassProfile): number { return g.outline[1][0]; }

/** Outer radius of the glass at height y (piecewise linear). */
export function radiusAt(g: GlassProfile, y: number): number {
  const o = g.outline;
  for (let i = 1; i < o.length; i++) {
    const [r0, y0] = o[i - 1], [r1, y1] = o[i];
    if (y >= y0 && y <= y1 && y1 > y0) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return o[o.length - 1][0];
}

/** Inner outline from the bowl bottom up to `top`, used for the liquid volume. */
export function innerOutline(g: GlassProfile, top: number): [number, number][] {
  const pts: [number, number][] = [[0, g.bowl]];
  const ys = g.outline.map(p => p[1]).filter(y => y > g.bowl && y < top);
  for (const y of [g.bowl, ...ys, top]) pts.push([Math.max(0.0005, radiusAt(g, y) - g.wall), y]);
  return pts;
}

/** Height of the liquid surface for a fill fraction. */
export function liquidTop(g: GlassProfile, fill: number): number {
  const rim = glassHeight(g);
  return g.bowl + Math.min(1, Math.max(0.02, fill)) * (rim - g.bowl - 0.004);
}

export function glassSize(id: string): [number, number, number] {
  const g = glassProfile(id), r = glassRadius(g) * 2;
  return [r, glassHeight(g), r];
}
